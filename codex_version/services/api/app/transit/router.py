from datetime import datetime
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.infrastructure.database import get_db
from app.transit.repository import TransitRepository, decode_station_cursor, encode_station_cursor
from app.transit.schemas import (
    Departure,
    DepartureList,
    LineSummary,
    StationDetail,
    StationPage,
    StationSummary,
)

router = APIRouter(tags=["transit"])
SEOUL = ZoneInfo("Asia/Seoul")


@router.get("/lines", operation_id="listLines", response_model=list[LineSummary])
def list_lines(db: Annotated[Session, Depends(get_db)]) -> list[LineSummary]:
    return [LineSummary.model_validate(line) for line in TransitRepository(db).list_lines()]


@router.get("/stations", operation_id="listStations", response_model=StationPage)
def list_stations(
    db: Annotated[Session, Depends(get_db)],
    line_id: Annotated[UUID | None, Query()] = None,
    query: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
    cursor: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> StationPage:
    try:
        decoded_cursor = decode_station_cursor(cursor) if cursor else None
    except (ValueError, UnicodeDecodeError) as exc:
        raise ApiError(400, "INVALID_CURSOR", "목록 커서가 올바르지 않습니다.") from exc
    rows = TransitRepository(db).list_stations(
        line_id=line_id, query=query, cursor=decoded_cursor, limit=limit
    )
    has_more = len(rows) > limit
    visible = rows[:limit]
    items = [
        StationSummary(
            id=station.id,
            line_id=station.line_id,
            name=station.name,
            code=station.code,
            sequence=station.sequence,
            latitude=latitude,
            longitude=longitude,
        )
        for station, latitude, longitude in visible
    ]
    next_cursor = None
    if has_more and visible:
        last = visible[-1][0]
        next_cursor = encode_station_cursor(last.sequence, last.id)
    return StationPage(items=items, next_cursor=next_cursor)


@router.get("/stations/{station_id}", operation_id="getStation", response_model=StationDetail)
def get_station(station_id: UUID, db: Annotated[Session, Depends(get_db)]) -> StationDetail:
    row = TransitRepository(db).get_station(station_id)
    if not row:
        raise ApiError(404, "STATION_NOT_FOUND", "역을 찾을 수 없습니다.")
    station, latitude, longitude = row
    return StationDetail(
        id=station.id,
        line_id=station.line_id,
        name=station.name,
        code=station.code,
        sequence=station.sequence,
        latitude=latitude,
        longitude=longitude,
        address=station.address,
        line=LineSummary.model_validate(station.line),
    )


@router.get(
    "/stations/{station_id}/departures",
    operation_id="listStationDepartures",
    response_model=DepartureList,
)
def list_station_departures(
    station_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    at: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=30)] = 10,
) -> DepartureList:
    repository = TransitRepository(db)
    if not repository.get_station(station_id):
        raise ApiError(404, "STATION_NOT_FOUND", "역을 찾을 수 없습니다.")
    requested_at = at or datetime.now(SEOUL)
    if requested_at.tzinfo is None:
        requested_at = requested_at.replace(tzinfo=SEOUL)
    departures = repository.list_departures(station_id, requested_at, limit)
    return DepartureList(
        station_id=station_id,
        items=[
            Departure(
                trip_id=trip.id,
                headsign=trip.headsign,
                direction=trip.direction,
                service_date=service_date,
                scheduled_at=scheduled_at,
                data_basis="fixture timetable; not realtime",
            )
            for trip, service_date, scheduled_at in departures
        ],
        last_imported_at=repository.last_successful_import(),
    )
