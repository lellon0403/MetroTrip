import base64
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from geoalchemy2 import Geometry
from geoalchemy2.functions import ST_X, ST_Y
from sqlalchemy import cast, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.transit.models import (
    ImportRun,
    ImportStatus,
    Line,
    ServiceCalendar,
    ServiceException,
    ServiceExceptionKind,
    Station,
    StopTime,
    Trip,
)


def encode_station_cursor(sequence: int, station_id: UUID) -> str:
    raw = f"{sequence}:{station_id}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_station_cursor(cursor: str) -> tuple[int, UUID]:
    padded = cursor + "=" * (-len(cursor) % 4)
    sequence, station_id = base64.urlsafe_b64decode(padded).decode().split(":", 1)
    return int(sequence), UUID(station_id)


class TransitRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_lines(self) -> list[Line]:
        return list(
            self.db.scalars(
                select(Line).where(Line.is_active.is_(True)).order_by(Line.sort_order, Line.name)
            )
        )

    def list_stations(
        self,
        *,
        line_id: UUID | None,
        query: str | None,
        cursor: tuple[int, UUID] | None,
        limit: int,
    ) -> list[tuple[Station, float, float]]:
        geometry = cast(Station.location, Geometry(geometry_type="POINT", srid=4326))
        statement = (
            select(
                Station,
                ST_Y(geometry).label("latitude"),
                ST_X(geometry).label("longitude"),
            )
            .where(Station.is_active.is_(True))
            .order_by(Station.sequence, Station.id)
            .limit(limit + 1)
        )
        if line_id:
            statement = statement.where(Station.line_id == line_id)
        if query:
            statement = statement.where(Station.name.ilike(f"%{query.strip()}%"))
        if cursor:
            sequence, station_id = cursor
            statement = statement.where(
                or_(
                    Station.sequence > sequence,
                    (Station.sequence == sequence) & (Station.id > station_id),
                )
            )
        return [(row[0], float(row[1]), float(row[2])) for row in self.db.execute(statement)]

    def get_station(self, station_id: UUID) -> tuple[Station, float, float] | None:
        geometry = cast(Station.location, Geometry(geometry_type="POINT", srid=4326))
        row = self.db.execute(
            select(
                Station,
                ST_Y(geometry).label("latitude"),
                ST_X(geometry).label("longitude"),
            )
            .options(joinedload(Station.line))
            .where(Station.id == station_id, Station.is_active.is_(True))
        ).first()
        if not row:
            return None
        return row[0], float(row[1]), float(row[2])

    def _service_active(self, calendar: ServiceCalendar, service_date: date) -> bool:
        exception = self.db.scalar(
            select(ServiceException).where(
                ServiceException.calendar_id == calendar.id,
                ServiceException.service_date == service_date,
            )
        )
        if exception:
            return exception.kind is ServiceExceptionKind.ADDED
        if not (calendar.start_date <= service_date <= calendar.end_date):
            return False
        weekday_fields = (
            calendar.monday,
            calendar.tuesday,
            calendar.wednesday,
            calendar.thursday,
            calendar.friday,
            calendar.saturday,
            calendar.sunday,
        )
        return weekday_fields[service_date.weekday()]

    def list_departures(
        self, station_id: UUID, requested_at: datetime, limit: int
    ) -> list[tuple[Trip, date, datetime]]:
        rows = self.db.execute(
            select(StopTime, Trip, ServiceCalendar)
            .join(Trip, Trip.id == StopTime.trip_id)
            .join(ServiceCalendar, ServiceCalendar.id == Trip.calendar_id)
            .where(StopTime.station_id == station_id)
            .order_by(StopTime.departure_offset_seconds)
        ).all()
        tz = requested_at.tzinfo or UTC
        candidates: list[tuple[Trip, date, datetime]] = []
        for service_date in (requested_at.date() - timedelta(days=1), requested_at.date()):
            midnight = datetime.combine(service_date, time.min, tzinfo=tz)
            for stop_time, trip, calendar in rows:
                if not self._service_active(calendar, service_date):
                    continue
                scheduled_at = midnight + timedelta(seconds=stop_time.departure_offset_seconds)
                if scheduled_at >= requested_at:
                    candidates.append((trip, service_date, scheduled_at))
        candidates.sort(key=lambda item: item[2])
        return candidates[:limit]

    def last_successful_import(self) -> datetime | None:
        return self.db.scalar(
            select(func.max(ImportRun.imported_at)).where(
                ImportRun.status == ImportStatus.SUCCEEDED
            )
        )
