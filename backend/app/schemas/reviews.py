"""Travel review API contract models."""

from datetime import datetime
from enum import Enum

from pydantic import Field

from app.schemas.common import ApiSchema, Pagination


class MediaType(str, Enum):
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"


class ReviewMediaInput(ApiSchema):
    media_url: str = Field(max_length=500)
    media_type: MediaType


class ReviewCreateRequest(ApiSchema):
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
    media_id: int


class ReviewResponse(ApiSchema):
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
    items: list[ReviewResponse]


class MediaUploadRequest(ApiSchema):
    file_name: str = Field(min_length=1, max_length=255)
    content_type: str = Field(examples=["image/jpeg"])


class MediaUploadResponse(ApiSchema):
    upload_url: str
    media_url: str
    expires_in: int = Field(gt=0)
