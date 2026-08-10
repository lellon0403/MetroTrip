from datetime import timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.identity.dependencies import CurrentUser
from app.infrastructure.database import get_db
from app.planning.repository import decode_plan_cursor, encode_plan_cursor
from app.planning.schemas import (
    DeletedPlanPage,
    DeletedPlanSummary,
    PlanPage,
    PlanSummary,
    PlanView,
    PlanWriteRequest,
    ShareLinkRequest,
    ShareLinkResponse,
)
from app.planning.service import PlanningService

router = APIRouter(tags=["planning"])


def _etag(version: int) -> str:
    return f'W/"{version}"'


def _expected_version(value: str | None) -> int:
    if not value:
        raise ApiError(428, "IF_MATCH_REQUIRED", "최신 일정 버전을 확인하는 If-Match가 필요합니다.")
    normalized = value.strip().removeprefix("W/").strip('"')
    try:
        version = int(normalized)
    except ValueError as exc:
        raise ApiError(400, "INVALID_IF_MATCH", "If-Match 값이 올바르지 않습니다.") from exc
    if version <= 0:
        raise ApiError(400, "INVALID_IF_MATCH", "If-Match 값이 올바르지 않습니다.")
    return version


@router.get("/plans", operation_id="listMyPlans", response_model=PlanPage)
def list_my_plans(
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    cursor: Annotated[str | None, Query(max_length=300)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> PlanPage:
    try:
        decoded_cursor = decode_plan_cursor(cursor) if cursor else None
    except (ValueError, UnicodeDecodeError) as exc:
        raise ApiError(400, "INVALID_CURSOR", "목록 커서가 올바르지 않습니다.") from exc
    plans = PlanningService(db).repository.list_owned(user.id, decoded_cursor, limit)
    visible = plans[:limit]
    next_cursor = None
    if len(plans) > limit and visible:
        last = visible[-1]
        next_cursor = encode_plan_cursor(last.updated_at, last.id)
    return PlanPage(
        items=[PlanSummary.model_validate(plan) for plan in visible], next_cursor=next_cursor
    )


@router.get("/plans/deleted", operation_id="listDeletedPlans", response_model=DeletedPlanPage)
def list_deleted_plans(
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> DeletedPlanPage:
    plans = PlanningService(db).list_deleted(user.id)
    return DeletedPlanPage(
        items=[
            DeletedPlanSummary(
                **PlanSummary.model_validate(plan).model_dump(),
                deleted_at=plan.deleted_at,
                expires_at=plan.deleted_at + timedelta(days=3),
            )
            for plan in plans
            if plan.deleted_at is not None
        ]
    )


@router.post("/plans", operation_id="createPlan", response_model=PlanView, status_code=201)
def create_plan(
    body: PlanWriteRequest,
    response: Response,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> PlanView:
    plan = PlanningService(db).create(user.id, body)
    response.headers["ETag"] = _etag(plan.version)
    return PlanView.model_validate(plan)


@router.get("/plans/{plan_id}", operation_id="getPlan", response_model=PlanView)
def get_plan(
    plan_id: UUID,
    response: Response,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> PlanView:
    plan = PlanningService(db).get_owned(plan_id, user.id)
    response.headers["ETag"] = _etag(plan.version)
    return PlanView.model_validate(plan)


@router.put("/plans/{plan_id}", operation_id="updatePlan", response_model=PlanView)
def update_plan(
    plan_id: UUID,
    body: PlanWriteRequest,
    response: Response,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> PlanView:
    plan = PlanningService(db).update(plan_id, user.id, _expected_version(if_match), body)
    response.headers["ETag"] = _etag(plan.version)
    return PlanView.model_validate(plan)


@router.delete("/plans/{plan_id}", operation_id="deletePlan", status_code=204)
def delete_plan(
    plan_id: UUID, user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> Response:
    PlanningService(db).delete(plan_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/plans/{plan_id}/restore", operation_id="restoreDeletedPlan", response_model=PlanView)
def restore_deleted_plan(
    plan_id: UUID,
    response: Response,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> PlanView:
    plan = PlanningService(db).restore(plan_id, user.id)
    response.headers["ETag"] = _etag(plan.version)
    return PlanView.model_validate(plan)


@router.post(
    "/plans/{plan_id}/share-links",
    operation_id="createPlanShareLink",
    response_model=ShareLinkResponse,
    status_code=201,
)
def create_plan_share_link(
    plan_id: UUID,
    body: ShareLinkRequest,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> ShareLinkResponse:
    token, link = PlanningService(db).create_share_link(
        plan_id, user.id, body.expires_in_days, body.max_uses
    )
    return ShareLinkResponse(
        id=link.id,
        token=token,
        url_path=f"/shared/plans/{token}",
        expires_at=link.expires_at,
        max_uses=link.max_uses,
    )


@router.delete(
    "/plans/{plan_id}/share-links/{link_id}",
    operation_id="revokePlanShareLink",
    status_code=204,
)
def revoke_plan_share_link(
    plan_id: UUID,
    link_id: UUID,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    PlanningService(db).revoke_share_link(plan_id, link_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/shared/plans/{share_token}", operation_id="getSharedPlan", response_model=PlanView)
def get_shared_plan(share_token: str, db: Annotated[Session, Depends(get_db)]) -> PlanView:
    return PlanView.model_validate(PlanningService(db).get_shared(share_token))


@router.post(
    "/plans/{plan_id}/copies", operation_id="copyPlan", response_model=PlanView, status_code=201
)
def copy_plan(
    plan_id: UUID, user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> PlanView:
    plan = PlanningService(db).copy(plan_id, user.id, user.id)
    return PlanView.model_validate(plan)


@router.post(
    "/shared/plans/{share_token}/copies",
    operation_id="copySharedPlan",
    response_model=PlanView,
    status_code=201,
)
def copy_shared_plan(
    share_token: str,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> PlanView:
    return PlanView.model_validate(PlanningService(db).copy_shared(share_token, user.id))
