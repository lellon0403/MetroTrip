"""관리자 장소 추가·수정·삭제 API와 서비스 통합 테스트."""

import asyncio
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.database import Base
from app.db_failover import get_db
from app.integrations.security import sign_token
from app.main import app
from app.models.auth import User
from app.models.plans import TravelPlan, TravelPlanItem
from app.models.transit import Place, PlaceImage, PlaceStation, Station
from app.schemas.transit import PlaceUpdateRequest, PlaceUpsertRequest
from app.services import transit as transit_service


@pytest.fixture
def db() -> Iterator[Session]:
    """관리자·회원·역 데이터가 있는 SQLite 테스트 세션을 제공한다."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(connection, _record) -> None:
        """SQLite에서도 운영 DB와 동일하게 외래 키 제약을 활성화한다."""
        connection.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(engine)
    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )
    session = session_factory()
    session.add_all(
        [
            User(
                user_id=1,
                email="admin@example.com",
                password="hashed",
                name="관리자",
                nickname="관리자닉",
                role="ADMIN",
            ),
            User(
                user_id=2,
                email="member@example.com",
                password="hashed",
                name="회원",
                nickname="회원닉",
                role="USER",
            ),
            Station(
                station_id=1,
                station_name="첫 번째 역",
                latitude=36.8000000,
                longitude=127.1000000,
                address=None,
            ),
            Station(
                station_id=2,
                station_name="두 번째 역",
                latitude=36.8100000,
                longitude=127.1100000,
                address=None,
            ),
            Station(
                station_id=3,
                station_name="세 번째 역",
                latitude=36.8200000,
                longitude=127.1200000,
                address=None,
            ),
        ]
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _access_token(user_id: int) -> str:
    """테스트 사용자 ID를 포함한 단기 Access Token을 발급한다."""
    now = datetime.now(timezone.utc)
    return sign_token(
        {
            "sub": str(user_id),
            "type": "access",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=5)).timestamp()),
        },
        get_settings().jwt_secret,
    )


def _create_request(**changes: object) -> PlaceUpsertRequest:
    """기본 장소 생성 요청에 필요한 값만 덮어써 테스트 요청을 만든다."""
    values = {
        "place_name": "테스트 장소",
        "category": "TOUR",
        "description": "장소 설명",
        "address": "충청남도 테스트시",
        "latitude": 36.805,
        "longitude": 127.105,
        "phone": "041-000-0000",
        "station_ids": [2, 1, 2],
        "image_urls": ["first.jpg", "second.jpg"],
    }
    values.update(changes)
    return PlaceUpsertRequest(**values)


def test_place_update_request_rejects_invalid_partial_changes() -> None:
    """빈 수정, 필수 필드 null, 빈 접근역 목록을 요청 검증에서 거부한다."""
    with pytest.raises(ValidationError):
        PlaceUpdateRequest()
    with pytest.raises(ValidationError):
        PlaceUpdateRequest(address=None)
    with pytest.raises(ValidationError):
        PlaceUpdateRequest(station_ids=[])


def test_list_admin_places_by_station_returns_editable_fields(db: Session) -> None:
    """관리자 역별 목록은 수정 폼에 필요한 연결 역과 이미지를 함께 반환한다."""
    created = transit_service.create_place(db, 1, _create_request())

    result = transit_service.list_admin_places_by_station(
        db,
        1,
        page=1,
        size=100,
    )

    assert result.total_elements == 1
    assert result.items[0].place_id == created.place_id
    assert result.items[0].station_ids == [1, 2]
    assert [image.image_url for image in result.items[0].images] == [
        "first.jpg",
        "second.jpg",
    ]


def test_list_admin_places_loads_children_in_batches(db: Session) -> None:
    """장소 수가 늘어도 이미지와 연결 역 조회 횟수가 증가하지 않는다."""
    for index in range(3):
        transit_service.create_place(
            db,
            1,
            _create_request(place_name=f"테스트 장소 {index}"),
        )

    statements: list[str] = []

    def record_statement(
        _connection: object,
        _cursor: object,
        statement: str,
        _parameters: object,
        _context: object,
        _executemany: bool,
    ) -> None:
        statements.append(statement)

    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", record_statement)
    try:
        result = transit_service.list_admin_places_by_station(
            db,
            1,
            page=1,
            size=100,
        )
    finally:
        event.remove(engine, "before_cursor_execute", record_statement)

    assert len(result.items) == 3
    assert len(statements) <= 6


def test_create_and_update_place_replaces_children(db: Session) -> None:
    """장소 생성과 수정이 역 중복을 제거하고 이미지·역 목록을 교체한다."""
    created = transit_service.create_place(db, 1, _create_request())

    assert created.created_by == 1
    assert created.station_ids == [1, 2]
    assert [image.sort_order for image in created.images] == [1, 2]
    assert db.scalar(select(func.count()).select_from(PlaceStation)) == 2

    updated = transit_service.update_place(
        db,
        created.place_id,
        PlaceUpdateRequest(
            description=None,
            phone=None,
            station_ids=[3],
            image_urls=[],
        ),
    )

    assert updated.description is None
    assert updated.phone is None
    assert updated.station_ids == [3]
    assert updated.images == []
    assert db.scalar(select(func.count()).select_from(PlaceStation)) == 1
    assert db.scalar(select(func.count()).select_from(PlaceImage)) == 0


def test_create_place_rejects_unknown_station_without_partial_write(
    db: Session,
) -> None:
    """존재하지 않는 역이 포함되면 장소와 종속 데이터를 전혀 저장하지 않는다."""
    with pytest.raises(HTTPException) as exc_info:
        transit_service.create_place(
            db,
            1,
            _create_request(station_ids=[1, 999]),
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.headers["X-Error-Code"] == "STATION_NOT_FOUND"
    assert db.scalar(select(func.count()).select_from(Place)) == 0
    assert db.scalar(select(func.count()).select_from(PlaceStation)) == 0


def test_delete_place_removes_plan_items_and_keeps_plan(db: Session) -> None:
    """장소 삭제가 참조 계획 항목만 제거하고 여행 계획 자체는 유지한다."""
    created = transit_service.create_place(db, 1, _create_request())
    old_updated_at = datetime(2000, 1, 1)
    plan = TravelPlan(
        user_id=2,
        plan_title="장소가 포함된 계획",
        start_station_id=1,
        end_station_id=2,
        updated_at=old_updated_at,
    )
    db.add(plan)
    db.flush()
    db.add(
        TravelPlanItem(
            plan_id=plan.plan_id,
            place_id=created.place_id,
            station_id=1,
            visit_time=datetime.strptime("10:00", "%H:%M").time(),
            memo=None,
        )
    )
    db.commit()

    transit_service.delete_place(db, created.place_id)
    db.refresh(plan)

    assert db.get(Place, created.place_id) is None
    assert db.get(TravelPlan, plan.plan_id) is not None
    assert db.scalar(select(func.count()).select_from(TravelPlanItem)) == 0
    assert db.scalar(select(func.count()).select_from(PlaceStation)) == 0
    assert db.scalar(select(func.count()).select_from(PlaceImage)) == 0
    assert plan.updated_at > old_updated_at


def test_admin_place_api_requires_admin_and_completes_cud(db: Session) -> None:
    """일반 회원을 거부하고 관리자의 장소 추가·수정·삭제 흐름을 처리한다."""

    def override_get_db() -> Iterator[Session]:
        """HTTP 요청에 현재 SQLite 테스트 세션을 주입한다."""
        yield db

    async def request_flow() -> tuple[
        httpx.Response,
        httpx.Response,
        httpx.Response,
        httpx.Response,
        httpx.Response,
    ]:
        """미인증·회원·관리자 요청과 수정·삭제를 차례로 전송한다."""
        transport = httpx.ASGITransport(app=app)
        member_headers = {"Authorization": f"Bearer {_access_token(2)}"}
        admin_headers = {"Authorization": f"Bearer {_access_token(1)}"}
        payload = _create_request().model_dump(mode="json", by_alias=True)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            unauthenticated = await client.post(
                "/api/v1/admin/places",
                json=payload,
            )
            member = await client.post(
                "/api/v1/admin/places",
                headers=member_headers,
                json=payload,
            )
            created = await client.post(
                "/api/v1/admin/places",
                headers=admin_headers,
                json=payload,
            )
            place_id = created.json()["placeId"]
            updated = await client.patch(
                f"/api/v1/admin/places/{place_id}",
                headers=admin_headers,
                json={"placeName": "수정된 장소", "stationIds": [3]},
            )
            deleted = await client.delete(
                f"/api/v1/admin/places/{place_id}",
                headers=admin_headers,
            )
            return unauthenticated, member, created, updated, deleted

    app.dependency_overrides[get_db] = override_get_db
    try:
        unauthenticated, member, created, updated, deleted = asyncio.run(
            request_flow()
        )
    finally:
        app.dependency_overrides.clear()

    assert unauthenticated.status_code == 401
    assert member.status_code == 403
    assert member.json()["code"] == "ADMIN_ONLY"
    assert created.status_code == 201
    assert created.json()["stationIds"] == [1, 2]
    assert created.json()["createdBy"] == 1
    assert updated.status_code == 200
    assert updated.json()["placeName"] == "수정된 장소"
    assert updated.json()["stationIds"] == [3]
    assert deleted.status_code == 204
    assert deleted.content == b""
