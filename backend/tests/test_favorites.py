"""역 즐겨찾기 API 통합 테스트."""

import asyncio
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.database import Base, get_db
from app.integrations.security import sign_token
from app.main import app
from app.models.auth import User
from app.models.transit import Station
from app.models.users import StationFavorite


@pytest.fixture
def db() -> Iterator[Session]:
    """즐겨찾기 API 테스트용 SQLite 세션과 회원·역 데이터를 제공한다."""
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
            email="favorite@example.com",
            password="hashed",
            name="즐겨찾기 사용자",
            nickname="즐겨찾기유저",
        )
    )
    session.add_all(
        [
            Station(
                station_id=1,
                station_name="탕정역",
                latitude=36.7882500,
                longitude=127.0844170,
                address="충청남도 아산시 탕정면",
            ),
            Station(
                station_id=2,
                station_name="온양온천역",
                latitude=36.7804830,
                longitude=127.0032490,
                address="충청남도 아산시 온천동",
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


def test_favorite_api_flow(db: Session) -> None:
    """즐겨찾기 조회·추가·중복 거절·삭제의 전체 HTTP 흐름을 검증한다."""

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
        """ASGI 애플리케이션에 즐겨찾기 요청을 순서대로 전송한다."""
        headers = {"Authorization": f"Bearer {_access_token(1)}"}
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            empty = await client.get("/api/v1/users/me/favorites", headers=headers)
            created = await client.post(
                "/api/v1/users/me/favorites/1",
                headers=headers,
            )
            listed = await client.get(
                "/api/v1/users/me/favorites",
                headers=headers,
            )
            duplicate = await client.post(
                "/api/v1/users/me/favorites/1",
                headers=headers,
            )
            deleted = await client.delete(
                "/api/v1/users/me/favorites/1",
                headers=headers,
            )
            deleted_again = await client.delete(
                "/api/v1/users/me/favorites/1",
                headers=headers,
            )
            return empty, created, listed, duplicate, deleted, deleted_again

    app.dependency_overrides[get_db] = override_get_db
    try:
        empty, created, listed, duplicate, deleted, deleted_again = asyncio.run(
            request_flow()
        )
    finally:
        app.dependency_overrides.clear()

    assert empty.status_code == 200
    assert empty.json() == {"items": []}
    assert created.status_code == 201
    assert created.json()["stationName"] == "탕정역"
    assert listed.status_code == 200
    assert listed.json()["items"][0]["stationId"] == 1
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "FAVORITE_ALREADY_EXISTS"
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert deleted_again.status_code == 204
    assert db.scalar(select(StationFavorite.favorite_id)) is None


def test_add_favorite_rejects_unknown_station(db: Session) -> None:
    """존재하지 않는 역을 즐겨찾기에 추가하면 404를 반환한다."""

    def override_get_db() -> Iterator[Session]:
        """FastAPI 요청에 테스트용 DB 세션을 주입한다."""
        yield db

    async def request_unknown_station() -> httpx.Response:
        """존재하지 않는 역 ID로 즐겨찾기 추가를 요청한다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.post(
                "/api/v1/users/me/favorites/999",
                headers={"Authorization": f"Bearer {_access_token(1)}"},
            )

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = asyncio.run(request_unknown_station())
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["code"] == "STATION_NOT_FOUND"
