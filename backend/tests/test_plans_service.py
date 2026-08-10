"""여행 계획 서비스 계층 테스트."""

import asyncio
import datetime as dt
from collections.abc import Iterator

import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.database import Base, get_db
from app.integrations.security import hash_value, sign_token
from app.main import app
from app.models.auth import User
from app.models.community import BoardPost
from app.models.plans import TravelPlanItem, TravelPlanShareLink
from app.models.reviews import Review
from app.models.transit import Place, PlaceStation, Station
from app.schemas.plans import PlanCreateRequest, PlanUpdateRequest
from app.services import plans as plan_service


@pytest.fixture
def db() -> Iterator[Session]:
    """DB V1.10 FK를 활성화한 SQLite 세션과 계획용 기준 데이터를 만든다."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(connection, _record) -> None:
        """SQLite 연결마다 외래키 삭제 정책을 활성화한다."""
        connection.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = session_factory()
    try:
        session.add_all(
            [
                User(
                    user_id=1,
                    email="owner@example.com",
                    password="hashed",
                    name="계획 작성자",
                    nickname="작성자",
                ),
                User(
                    user_id=2,
                    email="other@example.com",
                    password="hashed",
                    name="다른 사용자",
                    nickname="타인",
                ),
                Station(
                    station_id=1,
                    station_name="탕정역",
                    latitude=36.7882500,
                    longitude=127.0844170,
                ),
                Station(
                    station_id=2,
                    station_name="온양온천역",
                    latitude=36.7804830,
                    longitude=127.0032490,
                ),
                Station(
                    station_id=3,
                    station_name="신창역",
                    latitude=36.7695020,
                    longitude=126.9511080,
                ),
                Place(
                    place_id=10,
                    place_name="지중해마을",
                    category="TOUR",
                    address="충남 아산시 탕정면",
                    latitude=36.8000000,
                    longitude=127.0600000,
                ),
                Place(
                    place_id=20,
                    place_name="온양민속박물관",
                    category="TOUR",
                    address="충남 아산시 권곡동",
                    latitude=36.7900000,
                    longitude=127.0100000,
                ),
            ]
        )
        session.commit()
        session.add_all(
            [
                PlaceStation(place_id=10, station_id=1),
                PlaceStation(place_id=20, station_id=2),
            ]
        )
        session.commit()
        yield session
    finally:
        session.close()
        engine.dispose()


def _access_token(user_id: int) -> str:
    """테스트 사용자 ID를 포함한 단기 Access Token을 발급한다."""
    now = dt.datetime.now(dt.timezone.utc)
    return sign_token(
        {
            "sub": str(user_id),
            "type": "access",
            "iat": int(now.timestamp()),
            "exp": int((now + dt.timedelta(minutes=5)).timestamp()),
        },
        get_settings().jwt_secret,
    )


def _share_settings():
    """공유 링크 테스트용 공개 프론트 주소와 만료 기간을 반환한다."""
    return get_settings().model_copy(
        update={
            "public_frontend_url": "http://frontend.test",
            "share_link_expire_days": 7,
        }
    )


def _create_request(**overrides: object) -> PlanCreateRequest:
    """기본 여행 계획 작성 요청에 필요한 값만 덮어쓴다."""
    payload = {
        "plan_title": "아산 당일치기",
        "start_station_id": 1,
        "end_station_id": 2,
        "items": [
            {
                "place_id": 10,
                "station_id": 1,
                "visit_time": dt.time(10, 30),
                "memo": "첫 장소",
            },
            {
                "place_id": 20,
                "station_id": 2,
                "visit_time": dt.time(13, 0),
                "memo": "두 번째 장소",
            },
        ],
    }
    payload.update(overrides)
    return PlanCreateRequest(**payload)


def test_create_plan_returns_names_and_ordered_items(db: Session) -> None:
    """계획 작성 응답이 역·장소 이름과 안정적인 방문 순서를 포함하는지 확인한다."""
    request = _create_request(
        items=[
            {
                "place_id": 10,
                "station_id": 1,
                "visit_time": dt.time(10, 30),
                "memo": "먼저 생성",
            },
            {
                "place_id": 20,
                "station_id": 2,
                "visit_time": dt.time(10, 30),
                "memo": "나중 생성",
            },
        ]
    )

    created = plan_service.create_plan(db, 1, request)

    assert created.start_station_name == "탕정역"
    assert created.end_station_name == "온양온천역"
    assert [item.place_name for item in created.items] == [
        "지중해마을",
        "온양민속박물관",
    ]
    assert created.items[0].plan_item_id < created.items[1].plan_item_id


@pytest.mark.parametrize(
    ("plan_request", "error_code"),
    [
        (_create_request(start_station_id=999), "STATION_NOT_FOUND"),
        (
            _create_request(
                items=[
                    {
                        "place_id": 999,
                        "station_id": None,
                        "visit_time": dt.time(10),
                    }
                ]
            ),
            "PLACE_NOT_FOUND",
        ),
        (
            _create_request(
                items=[
                    {
                        "place_id": 10,
                        "station_id": 2,
                        "visit_time": dt.time(10),
                    }
                ]
            ),
            "PLACE_STATION_MISMATCH",
        ),
    ],
)
def test_create_plan_rejects_invalid_references(
    db: Session,
    plan_request: PlanCreateRequest,
    error_code: str,
) -> None:
    """존재하지 않거나 매핑되지 않은 역·장소 참조를 거부하는지 확인한다."""
    with pytest.raises(HTTPException) as exc_info:
        plan_service.create_plan(db, 1, plan_request)

    assert exc_info.value.status_code == 400
    assert exc_info.value.headers["X-Error-Code"] == error_code


def test_list_plans_filters_owner_and_paginates_in_recent_order(db: Session) -> None:
    """내 계획 목록이 소유자를 필터링하고 생성 최신순으로 페이지 처리되는지 확인한다."""
    first = plan_service.create_plan(db, 1, _create_request(plan_title="첫 계획"))
    plan_service.create_plan(db, 2, _create_request(plan_title="타인 계획"))
    second = plan_service.create_plan(db, 1, _create_request(plan_title="두 번째 계획"))

    result = plan_service.list_plans(db, 1, page=1, size=1)

    assert [plan.plan_id for plan in result.items] == [second.plan_id]
    assert result.items[0].plan_id != first.plan_id
    assert result.total_elements == 2
    assert result.total_pages == 2


def test_get_plan_distinguishes_missing_and_other_owner(db: Session) -> None:
    """상세 조회가 없는 계획과 타인의 계획을 각각 404와 403으로 처리하는지 확인한다."""
    created = plan_service.create_plan(db, 1, _create_request())

    with pytest.raises(HTTPException) as forbidden:
        plan_service.get_plan(db, created.plan_id, 2)
    with pytest.raises(HTTPException) as missing:
        plan_service.get_plan(db, 999, 1)

    assert forbidden.value.status_code == 403
    assert forbidden.value.headers["X-Error-Code"] == "PLAN_FORBIDDEN"
    assert missing.value.status_code == 404


def test_update_plan_preserves_updates_adds_and_deletes_item_ids(db: Session) -> None:
    """일정 스냅샷 수정이 기존 ID 보존·신규 추가·누락 삭제를 함께 수행하는지 확인한다."""
    created = plan_service.create_plan(db, 1, _create_request())
    retained = created.items[0]
    removed = created.items[1]

    updated = plan_service.update_plan(
        db,
        created.plan_id,
        1,
        PlanUpdateRequest(
            plan_title="수정된 계획",
            items=[
                {
                    "plan_item_id": retained.plan_item_id,
                    "place_id": 10,
                    "station_id": 1,
                    "visit_time": dt.time(11, 0),
                    "memo": "시간 변경",
                },
                {
                    "place_id": 20,
                    "station_id": 2,
                    "visit_time": dt.time(14, 0),
                    "memo": "새 항목",
                },
            ],
        ),
    )

    updated_ids = {item.plan_item_id for item in updated.items}
    assert updated.plan_title == "수정된 계획"
    assert retained.plan_item_id in updated_ids
    assert removed.plan_item_id not in updated_ids
    assert len(updated_ids) == 2
    assert next(
        item for item in updated.items if item.plan_item_id == retained.plan_item_id
    ).memo == "시간 변경"


def test_update_plan_rejects_duplicate_and_foreign_item_ids(db: Session) -> None:
    """수정 요청의 중복 ID와 다른 계획에 속한 항목 ID를 거부하는지 확인한다."""
    first = plan_service.create_plan(db, 1, _create_request())
    second = plan_service.create_plan(db, 1, _create_request())
    item = first.items[0]

    duplicate_payload = {
        "plan_item_id": item.plan_item_id,
        "place_id": 10,
        "station_id": 1,
        "visit_time": dt.time(10),
    }
    with pytest.raises(HTTPException) as duplicate:
        plan_service.update_plan(
            db,
            first.plan_id,
            1,
            PlanUpdateRequest(items=[duplicate_payload, duplicate_payload]),
        )
    with pytest.raises(HTTPException) as foreign:
        plan_service.update_plan(
            db,
            second.plan_id,
            1,
            PlanUpdateRequest(items=[duplicate_payload]),
        )

    assert duplicate.value.headers["X-Error-Code"] == "DUPLICATE_PLAN_ITEM_ID"
    assert foreign.value.headers["X-Error-Code"] == "PLAN_ITEM_NOT_FOUND"


def test_update_plan_empty_items_clears_schedule_and_touches_plan(db: Session) -> None:
    """빈 일정 스냅샷이 항목을 모두 삭제하고 계획 수정 시각을 갱신하는지 확인한다."""
    created = plan_service.create_plan(db, 1, _create_request())

    updated = plan_service.update_plan(
        db,
        created.plan_id,
        1,
        PlanUpdateRequest(items=[]),
    )

    assert updated.items == []
    assert updated.updated_at >= created.updated_at


def test_update_request_rejects_explicit_null() -> None:
    """PATCH에서 생략 대신 명시적으로 전달한 null을 거부하는지 확인한다."""
    with pytest.raises(ValidationError):
        PlanUpdateRequest(plan_title=None)
    with pytest.raises(ValidationError):
        PlanUpdateRequest(items=None)


def test_delete_plan_cascades_items_and_nulls_linked_resources(db: Session) -> None:
    """계획 삭제 시 일정은 삭제되고 후기·모집글 연결은 null이 되는지 확인한다."""
    created = plan_service.create_plan(db, 1, _create_request())
    shared = plan_service.create_share_link(
        db,
        created.plan_id,
        1,
        _share_settings(),
    )
    item_ids = [item.plan_item_id for item in created.items]
    review = Review(
        user_id=1,
        title="계획 후기",
        content="본문",
        start_station_id=1,
        end_station_id=2,
        rating=10,
        plan_id=created.plan_id,
    )
    post = BoardPost(
        user_id=1,
        title="계획 모집",
        content="본문",
        recruit_capacity=2,
        recruit_deadline=dt.date.today() + dt.timedelta(days=1),
        plan_id=created.plan_id,
    )
    db.add_all([review, post])
    db.commit()

    plan_service.delete_plan(db, created.plan_id, 1)

    remaining_items = db.scalars(
        select(TravelPlanItem).where(TravelPlanItem.plan_item_id.in_(item_ids))
    ).all()
    db.refresh(review)
    db.refresh(post)
    assert remaining_items == []
    assert review.plan_id is None
    assert post.plan_id is None
    assert db.scalar(select(TravelPlanShareLink)) is None
    with pytest.raises(HTTPException) as missing_share:
        plan_service.get_shared_plan(db, shared.share_token)
    assert missing_share.value.headers["X-Error-Code"] == "SHARED_PLAN_NOT_FOUND"


def test_create_share_link_stores_hash_and_returns_short_frontend_url(
    db: Session,
) -> None:
    """공유 링크가 22자 토큰과 프론트 URL을 반환하고 DB에는 해시만 저장하는지 확인한다."""
    created = plan_service.create_plan(db, 1, _create_request())

    shared = plan_service.create_share_link(
        db,
        created.plan_id,
        1,
        _share_settings(),
    )

    stored = db.scalar(select(TravelPlanShareLink))
    assert stored is not None
    assert len(shared.share_token) == 22
    assert shared.share_url == (
        f"http://frontend.test/shared-plans/{shared.share_token}"
    )
    assert shared.expires_at == stored.expires_at
    assert stored.token_hash == hash_value(shared.share_token)
    assert stored.token_hash != shared.share_token


def test_create_share_link_requires_plan_owner(db: Session) -> None:
    """존재하지 않는 계획과 타인의 계획에 대한 공유 링크 발급을 거부하는지 확인한다."""
    created = plan_service.create_plan(db, 1, _create_request())

    with pytest.raises(HTTPException) as forbidden:
        plan_service.create_share_link(
            db,
            created.plan_id,
            2,
            _share_settings(),
        )
    with pytest.raises(HTTPException) as missing:
        plan_service.create_share_link(db, 999, 1, _share_settings())

    assert forbidden.value.status_code == 403
    assert missing.value.status_code == 404


def test_get_shared_plan_returns_latest_plan_without_owner_fields(db: Session) -> None:
    """공유 조회가 최신 계획 내용만 읽기 전용 응답으로 반환하는지 확인한다."""
    created = plan_service.create_plan(db, 1, _create_request())
    shared = plan_service.create_share_link(
        db,
        created.plan_id,
        1,
        _share_settings(),
    )
    plan_service.update_plan(
        db,
        created.plan_id,
        1,
        PlanUpdateRequest(plan_title="공유 후 수정한 계획"),
    )

    result = plan_service.get_shared_plan(db, shared.share_token)

    assert result.plan_title == "공유 후 수정한 계획"
    assert result.start_station_name == "탕정역"
    assert result.items[0].place_name == "지중해마을"
    assert result.read_only is True
    assert "user_id" not in result.model_dump()


def test_get_shared_plan_hides_invalid_revoked_and_expired_links(db: Session) -> None:
    """변조·폐기·만료된 공유 링크를 모두 동일한 404 오류로 숨기는지 확인한다."""
    created = plan_service.create_plan(db, 1, _create_request())
    first = plan_service.create_share_link(
        db,
        created.plan_id,
        1,
        _share_settings(),
    )
    tampered_token = first.share_token[:-1] + (
        "A" if first.share_token[-1] != "A" else "B"
    )
    with pytest.raises(HTTPException) as tampered:
        plan_service.get_shared_plan(db, tampered_token)

    first_row = db.scalar(
        select(TravelPlanShareLink).where(
            TravelPlanShareLink.token_hash == hash_value(first.share_token)
        )
    )
    assert first_row is not None
    first_row.revoked_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    db.commit()
    with pytest.raises(HTTPException) as revoked:
        plan_service.get_shared_plan(db, first.share_token)

    second = plan_service.create_share_link(
        db,
        created.plan_id,
        1,
        _share_settings(),
    )
    second_row = db.scalar(
        select(TravelPlanShareLink).where(
            TravelPlanShareLink.token_hash == hash_value(second.share_token)
        )
    )
    assert second_row is not None
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    second_row.created_at = now - dt.timedelta(days=2)
    second_row.expires_at = now - dt.timedelta(days=1)
    db.commit()
    with pytest.raises(HTTPException) as expired:
        plan_service.get_shared_plan(db, second.share_token)

    for exception in (tampered, revoked, expired):
        assert exception.value.status_code == 404
        assert exception.value.headers["X-Error-Code"] == "SHARED_PLAN_NOT_FOUND"


def test_plan_api_crud_flow_uses_camel_case_contract(db: Session) -> None:
    """실제 HTTP 라우터가 camelCase 계약으로 계획 CRUD를 처리하는지 확인한다."""

    def override_get_db() -> Iterator[Session]:
        """FastAPI 요청에 테스트용 DB 세션을 주입한다."""
        yield db

    async def request_flow() -> tuple[
        httpx.Response,
        httpx.Response,
        httpx.Response,
        httpx.Response,
        httpx.Response,
        httpx.Response,
    ]:
        """계획 작성부터 삭제 후 조회까지 HTTP 요청을 순서대로 보낸다."""
        headers = {"Authorization": f"Bearer {_access_token(1)}"}
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            created = await client.post(
                "/api/v1/plans",
                headers=headers,
                json={
                    "planTitle": "HTTP 계획",
                    "startStationId": 1,
                    "endStationId": 2,
                    "items": [
                        {
                            "placeId": 10,
                            "stationId": 1,
                            "visitTime": "10:30:00",
                            "memo": "HTTP 항목",
                        }
                    ],
                },
            )
            plan_id = created.json()["planId"]
            item_id = created.json()["items"][0]["planItemId"]
            listed = await client.get("/api/v1/plans", headers=headers)
            detail = await client.get(
                f"/api/v1/plans/{plan_id}",
                headers=headers,
            )
            updated = await client.patch(
                f"/api/v1/plans/{plan_id}",
                headers=headers,
                json={
                    "planTitle": "HTTP 수정 계획",
                    "items": [
                        {
                            "planItemId": item_id,
                            "placeId": 10,
                            "stationId": 1,
                            "visitTime": "11:00:00",
                            "memo": "HTTP 수정 항목",
                        }
                    ],
                },
            )
            deleted = await client.delete(
                f"/api/v1/plans/{plan_id}",
                headers=headers,
            )
            missing = await client.get(
                f"/api/v1/plans/{plan_id}",
                headers=headers,
            )
            return created, listed, detail, updated, deleted, missing

    app.dependency_overrides[get_db] = override_get_db
    try:
        created, listed, detail, updated, deleted, missing = asyncio.run(
            request_flow()
        )
    finally:
        app.dependency_overrides.clear()

    assert created.status_code == 201
    assert created.json()["startStationName"] == "탕정역"
    assert listed.status_code == 200
    assert listed.json()["totalElements"] == 1
    assert detail.status_code == 200
    assert updated.status_code == 200
    assert updated.json()["planTitle"] == "HTTP 수정 계획"
    assert updated.json()["items"][0]["planItemId"] == created.json()["items"][0][
        "planItemId"
    ]
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert missing.status_code == 404
    assert missing.json()["code"] == "PLAN_NOT_FOUND"


def test_share_api_issues_link_and_allows_public_read(db: Session) -> None:
    """HTTP 공유 API가 소유자에게 링크를 발급하고 비회원 조회를 허용하는지 확인한다."""
    created = plan_service.create_plan(db, 1, _create_request())

    def override_get_db() -> Iterator[Session]:
        """FastAPI 요청에 테스트용 DB 세션을 주입한다."""
        yield db

    async def request_flow() -> tuple[
        httpx.Response,
        httpx.Response,
        httpx.Response,
    ]:
        """인증된 링크 발급과 비회원 공유 조회 요청을 순서대로 보낸다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            issued = await client.post(
                f"/api/v1/plans/{created.plan_id}/share-links",
                headers={"Authorization": f"Bearer {_access_token(1)}"},
            )
            share_token = issued.json()["shareToken"]
            public = await client.get(f"/api/v1/shared-plans/{share_token}")
            invalid_token = share_token[:-1] + (
                "A" if share_token[-1] != "A" else "B"
            )
            invalid = await client.get(
                f"/api/v1/shared-plans/{invalid_token}"
            )
            return issued, public, invalid

    app.dependency_overrides[get_db] = override_get_db
    try:
        issued, public, invalid = asyncio.run(request_flow())
    finally:
        app.dependency_overrides.clear()

    assert issued.status_code == 201
    assert len(issued.json()["shareToken"]) == 22
    assert "expiresAt" in issued.json()
    assert public.status_code == 200
    assert public.json()["planTitle"] == "아산 당일치기"
    assert public.json()["readOnly"] is True
    assert invalid.status_code == 404
    assert invalid.json()["code"] == "SHARED_PLAN_NOT_FOUND"
