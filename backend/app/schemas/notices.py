"""Notice API contract models."""

from datetime import datetime
from enum import Enum

from pydantic import Field

from app.schemas.common import ApiSchema, Pagination


class NoticeType(str, Enum):
    ALARM = "ALARM"
    BOARD = "BOARD"


class NoticeUpsertRequest(ApiSchema):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    notice_type: NoticeType = NoticeType.BOARD


class NoticeUpdateRequest(ApiSchema):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, min_length=1)
    notice_type: NoticeType | None = None


class NoticeResponse(ApiSchema):
    notice_id: int
    admin_id: int | None
    title: str
    content: str
    notice_type: NoticeType
    created_at: datetime
    updated_at: datetime


class NoticeListResponse(Pagination):
    items: list[NoticeResponse]
