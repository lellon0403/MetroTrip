"""지하철 노선 목록, 추천, 조회 기록 API 통합 테스트."""

import asyncio
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.database import Base
from app.db_failover import get_db, get_read_db
from app.integrations.security import sign_token
from app.main import app
from app.models.auth import User
from app.models.transit import LineStation, LineViewLog, Station, SubwayLine


@pytest.fixture
def db() -> Iterator[Session]:
    """노선 API 테스트용 SQLite 세션과 회원·노선 데이터를 제공한다."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(connection, _record):
        """SQLite 연결에서 외래키 제약조건을 활성화한다."""
        connection.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(engine)
    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )
    session = session_factory()
    session.add(
        User(
            user_id=1,
            email="transit@example.com",
            password="hashed",
            name="노선 사용자",
            nickname="노선유저",
        )
    )
    session.add_all(
        [
            SubwayLine(
                line_id=1,
                line_name="1호선 (인천)",
                line_number="1",
                display_order=3,
            ),
            SubwayLine(
                line_id=2,
                line_name="1호선 (신창)",
                line_number="1",
                display_order=2,
            ),
            SubwayLine(
                line_id=3,
                line_name="2호선",
                line_number="2",
                display_order=1,
            ),
            SubwayLine(
                line_id=4,
                line_name="3호선",
                line_number="3",
                display_order=4,
            ),
            SubwayLine(
                line_id=5,
                line_name="공항철도",
                line_number=None,
                display_order=5,
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


def _override_database(db: Session):
    """FastAPI 요청에 테스트용 DB 세션을 주입하는 함수를 만든다."""

    def override_get_db() -> Iterator[Session]:
        """현재 테스트의 SQLite 세션을 반환한다."""
        yield db

    return override_get_db


def test_list_lines_returns_display_order(db: Session) -> None:
    """노선 목록을 display_order와 line_id 오름차순으로 반환한다."""

    async def request_lines() -> httpx.Response:
        """ASGI 애플리케이션에 노선 목록 조회를 요청한다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get("/api/v1/lines")

    app.dependency_overrides[get_db] = _override_database(db)
    app.dependency_overrides[get_read_db] = _override_database(db)
    try:
        response = asyncio.run(request_lines())
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert [item["lineId"] for item in response.json()["items"]] == [3, 2, 1, 4, 5]
    assert response.json()["items"][-1]["lineNumber"] is None


def test_record_line_view_supports_guest_and_member(db: Session) -> None:
    """비회원은 NULL, 회원은 사용자 ID로 노선 조회 기록을 저장한다."""

    async def request_views() -> tuple[httpx.Response, httpx.Response]:
        """비회원과 회원으로 각각 노선 조회 기록을 요청한다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            guest = await client.post("/api/v1/lines/1/views")
            member = await client.post(
                "/api/v1/lines/2/views",
                headers={"Authorization": f"Bearer {_access_token(1)}"},
            )
            return guest, member

    app.dependency_overrides[get_db] = _override_database(db)
    app.dependency_overrides[get_read_db] = _override_database(db)
    try:
        guest, member = asyncio.run(request_views())
    finally:
        app.dependency_overrides.clear()

    assert guest.status_code == 201
    assert member.status_code == 201
    logs = list(db.scalars(select(LineViewLog).order_by(LineViewLog.log_id)))
    assert [(log.line_id, log.user_id) for log in logs] == [(1, None), (2, 1)]


def test_record_line_view_rejects_unknown_line_and_invalid_token(
    db: Session,
) -> None:
    """없는 노선은 404, 잘못된 선택적 인증 토큰은 401로 거절한다."""

    async def request_invalid_views() -> tuple[
        httpx.Response,
        httpx.Response,
        httpx.Response,
    ]:
        """없는 노선과 잘못된 토큰으로 조회 기록을 요청한다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            unknown = await client.post("/api/v1/lines/999/views")
            invalid_token = await client.post(
                "/api/v1/lines/1/views",
                headers={"Authorization": "Bearer invalid"},
            )
            invalid_scheme = await client.post(
                "/api/v1/lines/1/views",
                headers={"Authorization": "Basic invalid"},
            )
            return unknown, invalid_token, invalid_scheme

    app.dependency_overrides[get_db] = _override_database(db)
    app.dependency_overrides[get_read_db] = _override_database(db)
    try:
        unknown, invalid_token, invalid_scheme = asyncio.run(request_invalid_views())
    finally:
        app.dependency_overrides.clear()

    assert unknown.status_code == 404
    assert unknown.json()["code"] == "LINE_NOT_FOUND"
    assert invalid_token.status_code == 401
    assert invalid_token.json()["code"] == "INVALID_TOKEN"
    assert invalid_scheme.status_code == 401
    assert invalid_scheme.json()["code"] == "INVALID_TOKEN"


def test_suggest_lines_returns_top_three_recent_views(db: Session) -> None:
    """최근 1시간 조회수와 동률 정렬 기준에 따라 상위 세 노선을 반환한다."""
    recent = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=10)
    old = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=2)
    for line_id, count in ((1, 4), (2, 3), (3, 3), (4, 2)):
        db.add_all(
            [
                LineViewLog(line_id=line_id, viewed_at=recent)
                for _ in range(count)
            ]
        )
    db.add_all([LineViewLog(line_id=5, viewed_at=old) for _ in range(10)])
    db.commit()

    async def request_suggestions() -> httpx.Response:
        """ASGI 애플리케이션에 추천 노선 조회를 요청한다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get("/api/v1/lines/suggestions")

    app.dependency_overrides[get_db] = _override_database(db)
    app.dependency_overrides[get_read_db] = _override_database(db)
    try:
        response = asyncio.run(request_suggestions())
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["basis"] == "RECENT_VIEWS"
    assert [item["lineId"] for item in response.json()["items"]] == [1, 3, 2]


def test_list_line_stations_returns_station_order(db: Session) -> None:
    """노선의 역을 station_order 오름차순으로 반환하며 다른 노선 역은 섞이지 않는다."""
    db.add_all(
        [
            Station(
                station_id=1,
                station_name="소요산",
                latitude=37.9,
                longitude=127.06,
            ),
            Station(
                station_id=2,
                station_name="동두천",
                latitude=37.9,
                longitude=127.05,
            ),
            Station(
                station_id=3,
                station_name="가능",
                latitude=37.7,
                longitude=127.04,
            ),
        ]
    )
    db.flush()
    db.add_all(
        [
            # 순서를 뒤섞어 넣어서 응답이 삽입 순서가 아니라
            # station_order 기준으로 정렬되는지 확인한다.
            LineStation(line_id=1, station_id=2, station_order=2),
            LineStation(line_id=1, station_id=1, station_order=1),
            LineStation(line_id=1, station_id=3, station_order=3),
            # 다른 노선(2호선)의 역은 결과에 섞이면 안 된다.
            LineStation(line_id=3, station_id=3, station_order=1),
        ]
    )
    db.commit()

    async def request_line_stations() -> httpx.Response:
        """ASGI 애플리케이션에 1호선 역 순서 조회를 요청한다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get("/api/v1/lines/1/stations")

    app.dependency_overrides[get_db] = _override_database(db)
    app.dependency_overrides[get_read_db] = _override_database(db)
    try:
        response = asyncio.run(request_line_stations())
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["lineId"] == 1
    assert [item["stationName"] for item in body["items"]] == ["소요산", "동두천", "가능"]
    assert [item["stationOrder"] for item in body["items"]] == [1, 2, 3]


def test_list_line_stations_rejects_unknown_line(db: Session) -> None:
    """없는 노선을 조회하면 404를 반환한다."""

    async def request_unknown_line() -> httpx.Response:
        """ASGI 애플리케이션에 없는 노선의 역 목록을 요청한다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get("/api/v1/lines/999/stations")

    app.dependency_overrides[get_db] = _override_database(db)
    app.dependency_overrides[get_read_db] = _override_database(db)
    try:
        response = asyncio.run(request_unknown_line())
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["code"] == "LINE_NOT_FOUND"
