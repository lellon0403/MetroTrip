"""여행 계획 비즈니스 로직."""

import math
import re
import secrets
from collections import Counter
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import Settings
from app.integrations.security import hash_value
from app.models.plans import TravelPlan, TravelPlanItem
from app.repositories.plans import PlanRepository
from app.schemas.plans import (
    PlanCreateRequest,
    PlanItemCreateInput,
    PlanItemResponse,
    PlanItemUpdateInput,
    PlanListResponse,
    PlanResponse,
    PlanUpdateRequest,
    SharedPlanResponse,
    ShareLinkResponse,
)

_SHARE_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,64}$")


def _error(code: str, message: str, status_code: int) -> HTTPException:
    """여행 계획 오류를 공통 API 오류 형식으로 만든다."""
    return HTTPException(status_code, detail=message, headers={"X-Error-Code": code})


def _now() -> datetime:
    """현재 UTC 시각을 타임존 없는 datetime으로 반환한다."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _find_owned_plan(
    repository: PlanRepository,
    plan_id: int,
    user_id: int,
) -> TravelPlan:
    """계획을 조회하고 요청자가 작성자인지 확인한다."""
    plan = repository.find_plan_by_id(plan_id)
    if not plan:
        raise _error("PLAN_NOT_FOUND", "여행 계획을 찾을 수 없습니다.", 404)
    if plan.user_id != user_id:
        raise _error(
            "PLAN_FORBIDDEN",
            "본인이 작성한 여행 계획만 처리할 수 있습니다.",
            403,
        )
    return plan


def _require_references(
    repository: PlanRepository,
    *,
    station_ids: set[int],
    items: Sequence[PlanItemCreateInput],
) -> None:
    """역·장소 존재 여부와 장소-접근역 매핑을 검증한다."""
    item_station_ids = {
        item.station_id for item in items if item.station_id is not None
    }
    all_station_ids = station_ids | item_station_ids
    missing_stations = all_station_ids - repository.existing_station_ids(
        all_station_ids
    )
    if missing_stations:
        raise _error(
            "STATION_NOT_FOUND",
            f"존재하지 않는 역입니다: {sorted(missing_stations)}",
            400,
        )

    place_ids = {item.place_id for item in items if item.place_id is not None}
    missing_places = place_ids - repository.existing_place_ids(place_ids)
    if missing_places:
        raise _error(
            "PLACE_NOT_FOUND",
            f"존재하지 않는 장소입니다: {sorted(missing_places)}",
            400,
        )

    requested_pairs = {
        (item.place_id, item.station_id)
        for item in items
        if item.item_type == "PLACE"
        and item.place_id is not None
        and item.station_id is not None
    }
    missing_pairs = requested_pairs - repository.existing_place_station_pairs(
        requested_pairs
    )
    if missing_pairs:
        formatted_pairs = [
            {"placeId": place_id, "stationId": station_id}
            for place_id, station_id in sorted(missing_pairs)
        ]
        raise _error(
            "PLACE_STATION_MISMATCH",
            f"장소의 접근역으로 등록되지 않은 조합입니다: {formatted_pairs}",
            400,
        )


def _to_response(
    plan: TravelPlan,
    *,
    items: list[TravelPlanItem],
    station_names: dict[int, str],
    place_names: dict[int, str],
) -> PlanResponse:
    """계획 엔티티와 이름 정보를 상세 응답으로 조립한다."""
    return PlanResponse(
        plan_id=plan.plan_id,
        user_id=plan.user_id,
        plan_title=plan.plan_title,
        start_station_id=plan.start_station_id,
        start_station_name=station_names.get(plan.start_station_id, ""),
        end_station_id=plan.end_station_id,
        end_station_name=station_names.get(plan.end_station_id, ""),
        items=[
            PlanItemResponse(
                plan_item_id=item.plan_item_id,
                item_type=item.item_type,
                place_id=item.place_id,
                place_name=(
                    place_names.get(item.place_id, "")
                    if item.place_id is not None
                    else None
                ),
                station_id=item.station_id,
                station_name=(
                    station_names.get(item.station_id)
                    if item.station_id is not None
                    else None
                ),
                position=item.position,
                visit_time=item.visit_time,
                memo=item.memo,
            )
            for item in items
        ],
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


def _build_responses(
    repository: PlanRepository,
    plans: list[TravelPlan],
) -> list[PlanResponse]:
    """여러 계획을 일정, 역 이름, 장소 이름과 함께 일괄 조립한다."""
    if not plans:
        return []

    plan_ids = [plan.plan_id for plan in plans]
    items_by_plan = repository.list_plan_items(plan_ids)
    all_items = [
        item for plan_items in items_by_plan.values() for item in plan_items
    ]
    station_ids = {
        station_id
        for plan in plans
        for station_id in (plan.start_station_id, plan.end_station_id)
    } | {
        item.station_id for item in all_items if item.station_id is not None
    }
    place_ids = {item.place_id for item in all_items if item.place_id is not None}
    station_names = repository.get_station_names(station_ids)
    place_names = repository.get_place_names(place_ids)

    return [
        _to_response(
            plan,
            items=items_by_plan.get(plan.plan_id, []),
            station_names=station_names,
            place_names=place_names,
        )
        for plan in plans
    ]


def _sync_plan_items(
    repository: PlanRepository,
    plan_id: int,
    requested_items: list[PlanItemUpdateInput],
) -> None:
    """수정 요청 스냅샷과 계획의 기존 일정 항목을 동기화한다."""
    requested_ids = [
        item.plan_item_id
        for item in requested_items
        if item.plan_item_id is not None
    ]
    duplicate_ids = sorted(
        plan_item_id
        for plan_item_id, count in Counter(requested_ids).items()
        if count > 1
    )
    if duplicate_ids:
        raise _error(
            "DUPLICATE_PLAN_ITEM_ID",
            f"중복된 일정 항목 식별자입니다: {duplicate_ids}",
            400,
        )

    existing_items = repository.list_plan_items([plan_id]).get(plan_id, [])
    existing_by_id = {item.plan_item_id: item for item in existing_items}
    unknown_ids = set(requested_ids) - set(existing_by_id)
    if unknown_ids:
        raise _error(
            "PLAN_ITEM_NOT_FOUND",
            f"이 계획에 속하지 않는 일정 항목입니다: {sorted(unknown_ids)}",
            400,
        )

    for index, requested in enumerate(requested_items, start=1):
        position = requested.position or index
        if requested.plan_item_id is None:
            repository.add_plan_item(
                plan_id=plan_id,
                item_type=requested.item_type,
                place_id=requested.place_id,
                station_id=requested.station_id,
                position=position,
                visit_time=requested.visit_time,
                memo=requested.memo,
            )
            continue

        existing = existing_by_id[requested.plan_item_id]
        existing.item_type = requested.item_type
        existing.place_id = requested.place_id
        existing.station_id = requested.station_id
        existing.position = position
        existing.visit_time = requested.visit_time
        existing.memo = requested.memo

    repository.flush()
    repository.delete_plan_items(set(existing_by_id) - set(requested_ids))


def list_plans(
    db: Session,
    user_id: int,
    *,
    page: int,
    size: int,
) -> PlanListResponse:
    """현재 사용자의 여행 계획을 생성 최신순으로 페이지 조회한다."""
    repository = PlanRepository(db)
    plans, total = repository.list_plans_by_user_id(
        user_id=user_id,
        page=page,
        size=size,
    )
    return PlanListResponse(
        items=_build_responses(repository, plans),
        page=page,
        size=size,
        total_elements=total,
        total_pages=math.ceil(total / size) if total else 0,
    )


def create_plan(
    db: Session,
    user_id: int,
    request: PlanCreateRequest,
) -> PlanResponse:
    """현재 사용자의 새 여행 계획과 일정 항목을 생성한다."""
    repository = PlanRepository(db)
    _require_references(
        repository,
        station_ids={request.start_station_id, request.end_station_id},
        items=request.items,
    )
    plan = repository.create_plan(
        user_id=user_id,
        plan_title=request.plan_title,
        start_station_id=request.start_station_id,
        end_station_id=request.end_station_id,
    )
    for index, item in enumerate(request.items, start=1):
        repository.add_plan_item(
            plan_id=plan.plan_id,
            item_type=item.item_type,
            place_id=item.place_id,
            station_id=item.station_id,
            position=item.position or index,
            visit_time=item.visit_time,
            memo=item.memo,
        )

    db.commit()
    db.refresh(plan)
    return _build_responses(repository, [plan])[0]


def get_plan(db: Session, plan_id: int, user_id: int) -> PlanResponse:
    """본인이 작성한 여행 계획의 상세 정보를 조회한다."""
    repository = PlanRepository(db)
    plan = _find_owned_plan(repository, plan_id, user_id)
    return _build_responses(repository, [plan])[0]


def update_plan(
    db: Session,
    plan_id: int,
    user_id: int,
    request: PlanUpdateRequest,
) -> PlanResponse:
    """본인의 여행 계획 기본 정보와 일정 스냅샷을 수정한다."""
    repository = PlanRepository(db)
    plan = _find_owned_plan(repository, plan_id, user_id)
    fields = request.model_dump(exclude_unset=True, exclude={"items"})
    requested_items = request.items

    if fields or requested_items is not None:
        _require_references(
            repository,
            station_ids={
                fields.get("start_station_id", plan.start_station_id),
                fields.get("end_station_id", plan.end_station_id),
            },
            items=requested_items or [],
        )

    for name, value in fields.items():
        setattr(plan, name, value)

    if requested_items is not None:
        _sync_plan_items(repository, plan_id, requested_items)

    if fields or requested_items is not None:
        plan.updated_at = _now()

    db.commit()
    db.refresh(plan)
    return _build_responses(repository, [plan])[0]


def delete_plan(db: Session, plan_id: int, user_id: int) -> None:
    """본인이 작성한 여행 계획을 삭제한다."""
    repository = PlanRepository(db)
    plan = _find_owned_plan(repository, plan_id, user_id)
    repository.delete_plan(plan)
    db.commit()


def create_share_link(
    db: Session,
    plan_id: int,
    user_id: int,
    settings: Settings,
) -> ShareLinkResponse:
    """본인 계획에 설정된 기간 동안 유효한 읽기 전용 공유 링크를 발급한다."""
    repository = PlanRepository(db)
    plan = _find_owned_plan(repository, plan_id, user_id)
    share_token = secrets.token_urlsafe(16)
    expires_at = _now() + timedelta(days=settings.share_link_expire_days)
    share_link = repository.create_share_link(
        plan_id=plan.plan_id,
        token_hash=hash_value(share_token),
        expires_at=expires_at,
    )
    db.commit()
    db.refresh(share_link)
    return ShareLinkResponse(
        share_token=share_token,
        share_url=(
            f"{settings.public_frontend_url.rstrip('/')}/shared-plans/{share_token}"
        ),
        expires_at=share_link.expires_at,
    )


def get_shared_plan(db: Session, share_token: str) -> SharedPlanResponse:
    """유효한 공유 토큰으로 로그인 없이 최신 여행 계획을 조회한다."""
    if not _SHARE_TOKEN_PATTERN.fullmatch(share_token):
        raise _error(
            "SHARED_PLAN_NOT_FOUND",
            "공유 링크가 만료되었거나 존재하지 않습니다.",
            404,
        )

    repository = PlanRepository(db)
    share_link = repository.find_active_share_link_by_token_hash(
        hash_value(share_token),
        _now(),
    )
    if not share_link:
        raise _error(
            "SHARED_PLAN_NOT_FOUND",
            "공유 링크가 만료되었거나 존재하지 않습니다.",
            404,
        )

    plan = repository.find_plan_by_id(share_link.plan_id)
    if not plan:
        raise _error(
            "SHARED_PLAN_NOT_FOUND",
            "공유 링크가 만료되었거나 존재하지 않습니다.",
            404,
        )

    detail = _build_responses(repository, [plan])[0]
    return SharedPlanResponse(
        plan_title=detail.plan_title,
        start_station_id=detail.start_station_id,
        start_station_name=detail.start_station_name,
        end_station_id=detail.end_station_id,
        end_station_name=detail.end_station_name,
        items=detail.items,
    )


def get_public_plan_by_id(db: Session, plan_id: int) -> SharedPlanResponse:
    """공개 게시글에 연결된 계획을 수정 권한 없는 응답으로 조회한다."""
    repository = PlanRepository(db)
    plan = repository.find_plan_by_id(plan_id)
    if not plan:
        raise _error("SHARED_PLAN_NOT_FOUND", "연결된 일정을 찾을 수 없습니다.", 404)
    detail = _build_responses(repository, [plan])[0]
    return SharedPlanResponse(
        plan_title=detail.plan_title,
        start_station_id=detail.start_station_id,
        start_station_name=detail.start_station_name,
        end_station_id=detail.end_station_id,
        end_station_name=detail.end_station_name,
        items=detail.items,
    )
