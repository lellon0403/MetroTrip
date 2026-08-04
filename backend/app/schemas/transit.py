"""Line, station, timetable, and place API contract models."""

from datetime import datetime, time
from enum import Enum
from pydantic import Field
from app.schemas.common import ApiSchema, Pagination


class DayType(str, Enum):
    WEEKDAY = "WEEKDAY"
    SATURDAY = "SATURDAY"
    HOLIDAY = "HOLIDAY"


class Direction(str, Enum):
    UP = "UP"
    DOWN = "DOWN"


class PlaceCategory(str, Enum):
    TOUR = "TOUR"
    RESTAURANT = "RESTAURANT"
    CAFE = "CAFE"
    SHOPPING = "SHOPPING"
    ETC = "ETC"


class LineResponse(ApiSchema):
    line_id: int
    line_name: str
    line_number: str | None
    display_order: int


class LineListResponse(ApiSchema):
    items: list[LineResponse]


class LineSuggestionResponse(ApiSchema):
    items: list[LineResponse]
    basis: str = Field(examples=["RECENT_VIEWS"])


class StationSummary(ApiSchema):
    station_id: int
    station_name: str
    station_code: str | None
    latitude: float
    longitude: float
    lines: list[LineResponse]


class StationListResponse(Pagination):
    items: list[StationSummary]


class StationDetailResponse(StationSummary):
    address: str | None


class TimetableResponse(ApiSchema):
    timetable_id: int
    line_id: int
    station_id: int
    day_type: DayType
    direction: Direction
    arrival_time: time
    destination_station_id: int | None
    destination_station_name: str | None


class TimetableListResponse(ApiSchema):
    items: list[TimetableResponse]


class PlaceImageResponse(ApiSchema):
    image_url: str = Field(max_length=500)
    sort_order: int = Field(ge=1)


class PlaceResponse(ApiSchema):
    place_id: int
    place_name: str
    category: PlaceCategory
    description: str | None
    address: str
    latitude: float
    longitude: float
    phone: str | None
    images: list[PlaceImageResponse]


class PlaceListResponse(Pagination):
    items: list[PlaceResponse]

# 위도와 경도의 실제 지리적 범위를 Pydantic 레벨에서 제한하여 잘못된 좌표계의 삽입을 방지
class PlaceUpsertRequest(ApiSchema):
    place_name: str = Field(min_length=1, max_length=100)
    category: PlaceCategory
    description: str | None = None
    address: str = Field(min_length=1, max_length=255)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    phone: str | None = Field(default=None, max_length=20)
    station_ids: list[int] = Field(min_length=1)
    image_urls: list[str] = Field(default_factory=list)

class PlaceUpdateRequest(ApiSchema):
    place_name: str | None = Field(default=None, min_length=1, max_length=100)
    category: PlaceCategory | None = None
    description: str | None = None
    address: str | None = Field(default=None, min_length=1, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    phone: str | None = Field(default=None, max_length=20)
    station_ids: list[int] | None = None
    image_urls: list[str] | None = None


class PlaceAdminResponse(PlaceResponse):
    created_by: int | None
    created_at: datetime
    updated_at: datetime
