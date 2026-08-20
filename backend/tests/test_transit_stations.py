"""역 상세, 시간표, 주변 장소 API 통합 테스트."""

import asyncio
from collections.abc import Iterator
from datetime import time, timedelta

import httpx
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.dialects.mysql.pymysql import MySQLDialect_pymysql
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.db_failover import get_db, get_read_db
from app.main import app
from app.models.transit import (
    LineStation,
    Place,
    PlaceImage,
    PlaceStation,
    Station,
    SubwayLine,
    TrainTimetable,
    _ExtendedTime,
)
from app.services.transit import _format_timetable_time


@pytest.fixture
def db() -> Iterator[Session]:
    """역 API 테스트용 SQLite 세션과 노선·역·장소 데이터를 제공한다."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(connection, _record):
        """SQLite 연결에서 외래키 제약조건을 활성화한다."""
        connection.execute("PRAGMA foreign_keys = ON")

    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )
    Base.metadata.create_all(engine)
    session = session_factory()
    session.add_all(
        [
            SubwayLine(
                line_id=1,
                line_name="1호선 (인천)",
                line_number="1",
                display_order=2,
            ),
            SubwayLine(
                line_id=2,
                line_name="1호선 (신창)",
                line_number="1",
                display_order=1,
            ),
            Station(
                station_id=1,
                station_name="공유역",
                latitude=36.8102380,
                longitude=127.1464170,
                address="충청남도 천안시",
            ),
            Station(
                station_id=2,
                station_name="신창",
                latitude=36.7692020,
                longitude=126.9516500,
                address="충청남도 아산시",
            ),
            Station(
                station_id=3,
                station_name="다른노선역",
                latitude=37.0000000,
                longitude=127.0000000,
                address=None,
            ),
        ]
    )
    session.flush()
    session.add_all(
        [
            LineStation(line_id=1, station_id=1, station_order=1),
            LineStation(line_id=2, station_id=1, station_order=1),
            LineStation(line_id=2, station_id=2, station_order=2),
        ]
    )
    session.add_all(
        [
            TrainTimetable(
                timetable_id=1,
                train_no="K603",
                line_id=2,
                station_id=1,
                day_type="WEEKDAY",
                direction="DOWN",
                arrival_time=None,
                departure_time=time(5, 25),
                destination_station_id=2,
            ),
            TrainTimetable(
                timetable_id=2,
                train_no=None,
                line_id=2,
                station_id=1,
                day_type="WEEKDAY",
                direction="DOWN",
                arrival_time=time(4, 0),
                departure_time=time(4, 1),
                destination_station_id=None,
            ),
        ]
    )
    session.add_all(
        [
            Place(
                place_id=1,
                place_name="천안역전카페",
                category="CAFE",
                description=None,
                address="충청남도 천안시 동남구",
                latitude=36.8100000,
                longitude=127.1470000,
                phone=None,
            ),
            Place(
                place_id=2,
                place_name="천안역전시장",
                category="SHOPPING",
                description="역 주변 시장",
                address="충청남도 천안시 동남구 대흥로",
                latitude=36.8099560,
                longitude=127.1489240,
                phone="041-000-0000",
            ),
        ]
    )
    session.flush()
    session.add_all(
        [
            PlaceStation(place_id=1, station_id=1),
            PlaceStation(place_id=1, station_id=1),
            PlaceStation(place_id=2, station_id=1),
            PlaceImage(place_id=1, image_url="second.jpg", sort_order=2),
            PlaceImage(place_id=1, image_url="first.jpg", sort_order=1),
        ]
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _override_database(db: Session):
    """FastAPI 요청에 테스트 DB 세션을 주입하는 함수를 만든다."""

    def override_get_db() -> Iterator[Session]:
        """현재 테스트의 SQLite 세션을 반환한다."""
        yield db

    return override_get_db


def test_list_stations_searches_filters_and_paginates(db: Session) -> None:
    """역 목록에 이름 검색, 노선 필터, 페이지네이션을 적용한다."""

    async def request_station_lists() -> tuple[
        httpx.Response,
        httpx.Response,
        httpx.Response,
        httpx.Response,
    ]:
        """기본 목록·이름 검색·노선 필터·빈 결과를 각각 요청한다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            first_page = await client.get(
                "/api/v1/stations",
                params={"page": 1, "size": 2},
            )
            searched = await client.get(
                "/api/v1/stations",
                params={"keyword": "  공유  ", "page": 1, "size": 20},
            )
            filtered = await client.get(
                "/api/v1/stations",
                params={"line_id": 2, "page": 1, "size": 20},
            )
            unknown_line = await client.get(
                "/api/v1/stations",
                params={"line_id": 999, "page": 1, "size": 20},
            )
            return first_page, searched, filtered, unknown_line

    app.dependency_overrides[get_db] = _override_database(db)
    app.dependency_overrides[get_read_db] = _override_database(db)
    try:
        first_page, searched, filtered, unknown_line = asyncio.run(
            request_station_lists()
        )
    finally:
        app.dependency_overrides.clear()

    assert first_page.status_code == 200
    assert first_page.json()["totalElements"] == 3
    assert first_page.json()["totalPages"] == 2
    assert [item["stationId"] for item in first_page.json()["items"]] == [1, 3]
    assert [
        line["lineId"] for line in first_page.json()["items"][0]["lines"]
    ] == [2, 1]
    assert searched.status_code == 200
    assert [item["stationId"] for item in searched.json()["items"]] == [1]
    assert filtered.status_code == 200
    assert [item["stationId"] for item in filtered.json()["items"]] == [1, 2]
    assert unknown_line.status_code == 200
    assert unknown_line.json()["items"] == []
    assert unknown_line.json()["totalElements"] == 0


def test_get_station_returns_detail_and_ordered_lines(db: Session) -> None:
    """역 상세에 좌표·주소와 정렬된 소속 노선을 반환한다."""

    async def request_station() -> httpx.Response:
        """ASGI 애플리케이션에 역 상세 조회를 요청한다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get("/api/v1/stations/1")

    app.dependency_overrides[get_db] = _override_database(db)
    app.dependency_overrides[get_read_db] = _override_database(db)
    try:
        response = asyncio.run(request_station())
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["stationName"] == "공유역"
    assert response.json()["latitude"] == pytest.approx(36.810238)
    assert [line["lineId"] for line in response.json()["lines"]] == [2, 1]


def test_list_timetables_returns_train_number_and_ordered_times(
    db: Session,
) -> None:
    """시간표를 DB 정렬 기준으로 조회하고 열차번호와 문자열 시각을 반환한다."""

    async def request_timetables() -> httpx.Response:
        """ASGI 애플리케이션에 역 시간표 조회를 요청한다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get(
                "/api/v1/stations/1/timetables",
                params={
                    "line_id": 2,
                    "day_type": "WEEKDAY",
                    "direction": "DOWN",
                },
            )

    app.dependency_overrides[get_db] = _override_database(db)
    app.dependency_overrides[get_read_db] = _override_database(db)
    try:
        response = asyncio.run(request_timetables())
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["timetableId"] for item in items] == [2, 1]
    assert items[0]["trainNo"] is None
    assert items[0]["arrivalTime"] == "04:00:00"
    assert items[1]["trainNo"] == "K603"
    assert items[1]["arrivalTime"] is None
    assert items[1]["departureTime"] == "05:25:00"
    assert items[1]["destinationStationName"] == "신창"


def test_timetable_time_preserves_hours_after_midnight() -> None:
    """MySQL TIME의 24시 이후 값을 시간 유실 없이 문자열로 변환한다."""
    processor = _ExtendedTime().result_processor(
        MySQLDialect_pymysql(),
        None,
    )
    raw_value = timedelta(days=1, minutes=1)

    assert processor is None
    assert _format_timetable_time(raw_value) == "24:01:00"


def test_timetable_time_accepts_oracle_string() -> None:
    """Oracle VARCHAR2 시간표 값은 변환 중 예외 없이 그대로 반환한다."""
    assert _format_timetable_time("24:05:00") == "24:05:00"


def test_timetable_returns_empty_list_for_valid_conditions(db: Session) -> None:
    """유효한 역–노선 조합에 시간표가 없으면 빈 목록을 반환한다."""

    async def request_empty_timetables() -> httpx.Response:
        """시간표가 없는 유효한 조건으로 조회를 요청한다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get(
                "/api/v1/stations/2/timetables",
                params={
                    "line_id": 2,
                    "day_type": "WEEKEND",
                    "direction": "UP",
                },
            )

    app.dependency_overrides[get_db] = _override_database(db)
    app.dependency_overrides[get_read_db] = _override_database(db)
    try:
        response = asyncio.run(request_empty_timetables())
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"items": []}


def test_timetable_rejects_unknown_relationships(db: Session) -> None:
    """없는 역과 유효하지 않은 역–노선 조합을 404로 거절한다."""

    async def request_invalid_timetables() -> tuple[
        httpx.Response,
        httpx.Response,
    ]:
        """없는 역과 다른 노선의 시간표를 각각 요청한다."""
        transport = httpx.ASGITransport(app=app)
        params = {
            "line_id": 1,
            "day_type": "WEEKDAY",
            "direction": "DOWN",
        }
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            unknown_station = await client.get(
                "/api/v1/stations/999/timetables",
                params=params,
            )
            invalid_relation = await client.get(
                "/api/v1/stations/2/timetables",
                params=params,
            )
            return unknown_station, invalid_relation

    app.dependency_overrides[get_db] = _override_database(db)
    app.dependency_overrides[get_read_db] = _override_database(db)
    try:
        unknown_station, invalid_relation = asyncio.run(
            request_invalid_timetables()
        )
    finally:
        app.dependency_overrides.clear()

    assert unknown_station.status_code == 404
    assert unknown_station.json()["code"] == "STATION_NOT_FOUND"
    assert invalid_relation.status_code == 404
    assert invalid_relation.json()["code"] == "STATION_LINE_NOT_FOUND"


def test_station_detail_and_places_reject_unknown_station(db: Session) -> None:
    """없는 역의 상세와 주변 장소 요청을 404로 거절한다."""

    async def request_unknown_station() -> tuple[
        httpx.Response,
        httpx.Response,
    ]:
        """없는 역의 상세와 주변 장소를 각각 요청한다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            detail = await client.get("/api/v1/stations/999")
            places = await client.get("/api/v1/stations/999/places")
            return detail, places

    app.dependency_overrides[get_db] = _override_database(db)
    app.dependency_overrides[get_read_db] = _override_database(db)
    try:
        detail, places = asyncio.run(request_unknown_station())
    finally:
        app.dependency_overrides.clear()

    assert detail.status_code == 404
    assert detail.json()["code"] == "STATION_NOT_FOUND"
    assert places.status_code == 404
    assert places.json()["code"] == "STATION_NOT_FOUND"


def test_list_station_places_filters_paginates_and_deduplicates(
    db: Session,
) -> None:
    """주변 장소를 중복 제거하고 카테고리·페이지와 정렬된 이미지를 반영한다."""

    async def request_places() -> tuple[httpx.Response, httpx.Response]:
        """전체 장소와 카테고리 필터 결과를 각각 요청한다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            all_places = await client.get(
                "/api/v1/stations/1/places",
                params={"page": 1, "size": 1},
            )
            cafes = await client.get(
                "/api/v1/stations/1/places",
                params={"category": "CAFE", "page": 1, "size": 20},
            )
            return all_places, cafes

    app.dependency_overrides[get_db] = _override_database(db)
    app.dependency_overrides[get_read_db] = _override_database(db)
    try:
        all_places, cafes = asyncio.run(request_places())
    finally:
        app.dependency_overrides.clear()

    assert all_places.status_code == 200
    assert all_places.json()["totalElements"] == 2
    assert all_places.json()["totalPages"] == 2
    assert len(all_places.json()["items"]) == 1
    assert cafes.status_code == 200
    assert cafes.json()["totalElements"] == 1
    cafe = cafes.json()["items"][0]
    assert cafe["placeId"] == 1
    assert [image["sortOrder"] for image in cafe["images"]] == [1, 2]
