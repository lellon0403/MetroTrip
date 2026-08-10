from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import Field, model_validator

from app.core.schemas import ApiModel


class RoutePointType(StrEnum):
    STATION = "STATION"
    PLACE = "PLACE"
    COORDINATE = "COORDINATE"


class TravelMode(StrEnum):
    WALK = "WALK"
    TRANSIT = "TRANSIT"


class RoutePointInput(ApiModel):
    type: RoutePointType
    id: UUID | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    label: str | None = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def validate_reference(self) -> "RoutePointInput":
        if self.type in {RoutePointType.STATION, RoutePointType.PLACE} and self.id is None:
            raise ValueError("station/place route point requires id")
        if self.type is RoutePointType.COORDINATE and (
            self.latitude is None or self.longitude is None
        ):
            raise ValueError("coordinate route point requires latitude and longitude")
        return self


class RouteCompareRequest(ApiModel):
    origin: RoutePointInput
    destination: RoutePointInput
    departure_at: datetime | None = None
    modes: list[TravelMode] = Field(default_factory=lambda: [TravelMode.WALK])


class RouteSegment(ApiModel):
    mode: TravelMode
    from_label: str
    to_label: str
    duration_minutes: int
    distance_meters: int
    line_name: str | None = None
    stops: int | None = None
class RouteCoordinate(ApiModel):
    latitude: float
    longitude: float




class RouteOption(ApiModel):
    id: str
    mode: TravelMode
    duration_minutes: int
    distance_meters: int
    transfers: int
    segments: list[RouteSegment]
    data_basis: str
    estimated: bool
    algorithm_version: str

    path: list[RouteCoordinate] = Field(default_factory=list)

class RouteComparison(ApiModel):
    origin_label: str
    destination_label: str
    options: list[RouteOption]
    generated_at: datetime
    realtime: bool = False
