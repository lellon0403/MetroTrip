"""노선, 역, 시간표, 장소 API 요청 및 응답 모델."""

from datetime import datetime
from enum import Enum
from typing import Annotated

from pydantic import Field, model_validator

from app.schemas.common import ApiSchema, Pagination


class DayType(str, Enum):
    """열차 시간표의 평일·주말 구분."""

    WEEKDAY = "WEEKDAY"
    WEEKEND = "WEEKEND"


class Direction(str, Enum):
    """열차의 상행·하행 방향 구분."""

    UP = "UP"
    DOWN = "DOWN"


class PlaceCategory(str, Enum):
    """추천 장소의 분류."""

    TOUR = "TOUR"
    RESTAURANT = "RESTAURANT"
    CAFE = "CAFE"
    SHOPPING = "SHOPPING"
    ETC = "ETC"


class LineResponse(ApiSchema):
    """지하철 노선 정보 응답."""

    line_id: int
    line_name: str
    line_number: str | None
    display_order: int


class LineListResponse(ApiSchema):
    """지하철 노선 목록 응답."""

    items: list[LineResponse]


class LineSuggestionResponse(ApiSchema):
    """최근 조회 기록을 기준으로 한 추천 노선 목록 응답."""

    items: list[LineResponse]
    basis: str = Field(examples=["RECENT_VIEWS"])


class StationSummary(ApiSchema):
    """소속 노선을 포함한 지하철 역 요약 정보."""

    station_id: int
    station_name: str
    latitude: float
    longitude: float
    lines: list[LineResponse]


class StationListResponse(Pagination):
    """페이지네이션이 적용된 지하철 역 목록 응답."""

    items: list[StationSummary]


class StationDetailResponse(StationSummary):
    """주소를 포함한 지하철 역 상세 정보 응답."""

    address: str | None


class LineStationResponse(ApiSchema):
    """한 노선 안에서의 역 순서 정보. 노선도를 실제 순서대로 그릴 때 사용한다."""

    station_id: int
    station_name: str
    station_order: int
    latitude: float
    longitude: float


class LineStationListResponse(ApiSchema):
    """한 노선에 속한 역을 station_order 순서대로 담은 응답."""

    line_id: int
    items: list[LineStationResponse]


class TimetableResponse(ApiSchema):
    """역과 노선에 해당하는 열차 시간표 정보 응답."""

    timetable_id: int
    train_no: str | None = Field(max_length=20)
    line_id: int
    station_id: int
    day_type: DayType
    direction: Direction
    arrival_time: str | None = Field(
        pattern=r"^-?\d{2,3}:[0-5]\d:[0-5]\d$",
    )
    departure_time: str | None = Field(
        pattern=r"^-?\d{2,3}:[0-5]\d:[0-5]\d$",
    )
    destination_station_id: int | None
    destination_station_name: str | None


class TimetableListResponse(ApiSchema):
    """열차 시간표 목록 응답."""

    items: list[TimetableResponse]


class PlaceImageResponse(ApiSchema):
    """추천 장소 이미지 정보 응답."""

    image_url: str = Field(max_length=500)
    sort_order: int = Field(ge=1)


class PlaceResponse(ApiSchema):
    """이미지를 포함한 추천 장소 정보 응답."""

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
    """페이지네이션이 적용된 추천 장소 목록 응답."""

    items: list[PlaceResponse]


StationId = Annotated[int, Field(gt=0)]
ImageUrl = Annotated[str, Field(min_length=1, max_length=500)]


class PlaceUpsertRequest(ApiSchema):
    """추천 장소 생성 요청."""

    place_name: str = Field(min_length=1, max_length=100)
    category: PlaceCategory
    description: str | None = None
    address: str = Field(min_length=1, max_length=255)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    phone: str | None = Field(default=None, max_length=20)
    station_ids: list[StationId] = Field(min_length=1)
    image_urls: list[ImageUrl] = Field(default_factory=list)


class PlaceUpdateRequest(ApiSchema):
    """추천 장소 부분 수정 요청."""

    place_name: str | None = Field(default=None, min_length=1, max_length=100)
    category: PlaceCategory | None = None
    description: str | None = None
    address: str | None = Field(default=None, min_length=1, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    phone: str | None = Field(default=None, max_length=20)
    station_ids: list[StationId] | None = Field(default=None, min_length=1)
    image_urls: list[ImageUrl] | None = None

    @model_validator(mode="after")
    def validate_changes(self) -> "PlaceUpdateRequest":
        """빈 요청과 필수 장소 정보의 명시적 null 수정을 거부한다."""
        if not self.model_fields_set:
            raise ValueError("변경할 장소 정보를 입력해야 합니다.")

        nullable_fields = {"description", "phone"}
        null_fields = [
            field_name
            for field_name in self.model_fields_set - nullable_fields
            if getattr(self, field_name) is None
        ]
        if null_fields:
            raise ValueError(
                "수정 필드를 null로 변경할 수 없습니다: "
                + ", ".join(sorted(null_fields))
            )
        return self


class PlaceAdminResponse(PlaceResponse):
    """관리자용 생성·수정 정보를 포함한 추천 장소 응답."""

    station_ids: list[int]
    created_by: int | None
    created_at: datetime
    updated_at: datetime


class PlaceAdminListResponse(Pagination):
    """관리자용 역별 장소 목록 응답."""

    items: list[PlaceAdminResponse]
