"""여행 후기 API 요청 및 응답 모델."""

from datetime import datetime
from enum import Enum

from pydantic import Field

from app.schemas.common import ApiSchema, Pagination


class MediaType(str, Enum):
    """후기에 첨부할 수 있는 미디어 유형."""

    IMAGE = "IMAGE"
    VIDEO = "VIDEO"


class ReviewSearchField(str, Enum):
    """후기 목록에서 키워드를 검색할 대상 필드."""

    TITLE = "TITLE"
    CONTENT = "CONTENT"
    TITLE_CONTENT = "TITLE_CONTENT"


class ReviewMediaInput(ApiSchema):
    """후기 첨부 미디어의 유형과 접근 주소 입력값."""

    media_url: str = Field(max_length=500)
    media_type: MediaType


class ReviewCreateRequest(ApiSchema):
    """새 여행 후기와 첨부 정보를 작성하는 요청."""

    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1)
    start_station_id: int
    end_station_id: int
    rating: int = Field(ge=1, le=10)
    travel_cost: int | None = Field(default=None, ge=0)
    plan_id: int | None = None
    tags: list[str] = Field(default_factory=list)
    media: list[ReviewMediaInput] = Field(default_factory=list)


class ReviewUpdateRequest(ApiSchema):
    """여행 후기와 첨부 정보를 부분 수정하는 요청."""

    title: str | None = Field(default=None, min_length=1, max_length=100)
    content: str | None = Field(default=None, min_length=1)
    start_station_id: int | None = None
    end_station_id: int | None = None
    rating: int | None = Field(default=None, ge=1, le=10)
    travel_cost: int | None = Field(default=None, ge=0)
    plan_id: int | None = None
    tags: list[str] | None = None
    media: list[ReviewMediaInput] | None = None


class ReviewMediaResponse(ReviewMediaInput):
    """식별자를 포함한 후기 첨부 미디어 응답."""

    media_id: int


class ReviewResponse(ApiSchema):
    """작성자·역·태그·미디어를 포함한 여행 후기 상세 응답."""

    review_id: int
    user_id: int
    author_nickname: str
    title: str
    content: str
    start_station_id: int
    start_station_name: str
    end_station_id: int
    end_station_name: str
    rating: int
    travel_cost: int | None
    plan_id: int | None
    view_count: int
    tags: list[str]
    media: list[ReviewMediaResponse]
    created_at: datetime
    updated_at: datetime


class ReviewListResponse(Pagination):
    """페이지 정보가 포함된 여행 후기 목록 응답."""

    items: list[ReviewResponse]


class MediaUploadRequest(ApiSchema):
    """후기 미디어 업로드 주소 발급 요청."""

    file_name: str = Field(min_length=1, max_length=255)
    content_type: str = Field(examples=["image/jpeg"])


class MediaUploadResponse(ApiSchema):
    """업로드 주소와 최종 미디어 주소 발급 응답."""

    upload_url: str
    media_url: str
    expires_in: int = Field(gt=0)
