from datetime import date, datetime
from uuid import UUID

from app.core.schemas import ApiModel


class LineSummary(ApiModel):
    id: UUID
    name: str
    short_name: str
    color: str
    text_color: str


class StationSummary(ApiModel):
    id: UUID
    line_id: UUID
    name: str
    code: str
    sequence: int
    latitude: float
    longitude: float


class StationDetail(StationSummary):
    address: str | None
    line: LineSummary


class StationPage(ApiModel):
    items: list[StationSummary]
    next_cursor: str | None = None


class Departure(ApiModel):
    trip_id: UUID
    headsign: str
    direction: int
    service_date: date
    scheduled_at: datetime
    data_basis: str


class DepartureList(ApiModel):
    station_id: UUID
    items: list[Departure]
    last_imported_at: datetime | None
    realtime: bool = False
