from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.core.schemas import ApiModel
from app.reviews.models import MediaStatus, ReviewStatus


class ReviewBlockKind(StrEnum):
    PARAGRAPH = "PARAGRAPH"
    IMAGE = "IMAGE"


class ReviewBlock(ApiModel):
    kind: ReviewBlockKind
    text: str | None = Field(default=None, max_length=5000)
    media_id: UUID | None = None
    alt_text: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def validate_block(self) -> "ReviewBlock":
        if self.kind is ReviewBlockKind.PARAGRAPH and not self.text:
            raise ValueError("paragraph block requires text")
        if self.kind is ReviewBlockKind.IMAGE and (not self.media_id or not self.alt_text):
            raise ValueError("image block requires media ID and alt text")
        return self


class ReviewWriteRequest(ApiModel):
    title: str = Field(min_length=2, max_length=160)
    plan_id: UUID | None = None
    cover_media_id: UUID | None = None
    origin_station_id: UUID
    destination_station_id: UUID | None = None
    rating: Decimal = Field(ge=1, le=5, decimal_places=1)
    travel_date: date
    cost_won: int | None = Field(default=None, ge=0, le=100_000_000)
    status: ReviewStatus = ReviewStatus.PUBLISHED
    blocks: list[ReviewBlock] = Field(min_length=1, max_length=100)
    tags: list[str] = Field(default_factory=list, max_length=5)
    place_ratings: list["ReviewPlaceRatingWrite"] = Field(default_factory=list, max_length=30)

    @field_validator("rating")
    @classmethod
    def validate_rating_step(cls, value: Decimal) -> Decimal:
        if value * 2 != (value * 2).to_integral_value():
            raise ValueError("rating must use 0.5 increments")
        return value

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            tag = " ".join(value.strip().lstrip("#").split())
            if not 1 <= len(tag) <= 30:
                raise ValueError("tag length must be between 1 and 30")
            if tag.casefold() not in {existing.casefold() for existing in normalized}:
                normalized.append(tag)
        return normalized

    @model_validator(mode="after")
    def validate_route(self) -> "ReviewWriteRequest":
        if not any(block.kind is ReviewBlockKind.PARAGRAPH for block in self.blocks):
            raise ValueError("review requires at least one paragraph")
        return self


class ReviewPlaceRatingWrite(ApiModel):
    place_id: UUID
    rating: Decimal = Field(ge=1, le=5, decimal_places=1)

    @field_validator("rating")
    @classmethod
    def validate_rating_step(cls, value: Decimal) -> Decimal:
        if value * 2 != (value * 2).to_integral_value():
            raise ValueError("rating must use 0.5 increments")
        return value


class ReviewPlaceRatingView(ReviewPlaceRatingWrite):
    place_name: str


class ReviewMediaView(ApiModel):
    id: UUID
    url: str
    mime_type: str
    width: int | None = None
    height: int | None = None
    alt_text: str
    position: int


class ReviewSummary(ApiModel):
    id: UUID
    author_id: UUID
    author_name: str
    title: str
    excerpt: str
    origin_station_id: UUID
    origin_station_name: str
    destination_station_id: UUID | None
    destination_station_name: str | None
    rating: Decimal
    travel_date: date
    cost_won: int | None
    status: ReviewStatus
    view_count: int
    like_count: int
    tags: list[str]
    cover_url: str | None
    cover_width: int | None = None
    cover_height: int | None = None
    created_at: datetime
    version: int


class ReviewDetail(ReviewSummary):
    plan_id: UUID | None
    blocks: list[ReviewBlock]
    media: list[ReviewMediaView]
    updated_at: datetime
    liked_by_me: bool = False
    place_ratings: list[ReviewPlaceRatingView] = Field(default_factory=list)


class ReviewPage(ApiModel):
    items: list[ReviewSummary]
    next_cursor: str | None = None


class MediaClaimRequest(ApiModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(max_length=100)
    size_bytes: int = Field(gt=0, le=10 * 1024 * 1024)
    checksum_sha256: str | None = Field(default=None, pattern=r"^[0-9a-fA-F]{64}$")

    width: int | None = Field(default=None, ge=1, le=20_000)
    height: int | None = Field(default=None, ge=1, le=20_000)

class MediaClaimResponse(ApiModel):
    id: UUID
    object_key: str
    upload_url: str
    upload_headers: dict[str, str]
    expires_in: int
    status: MediaStatus


class MediaCompleteResponse(ApiModel):
    id: UUID
    status: MediaStatus
    public_url: str


class ReviewLikeResponse(ApiModel):
    liked: bool
    like_count: int
