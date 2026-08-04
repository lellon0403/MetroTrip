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

# PATCH 요청을 위한 모델이므로 모든 필드를 Optional(None 허용)로 두어 부분 수정이 가능하게 함.
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

# 제네릭 타입 힌팅을 통해 리스트 내부에 담길 객체 타입을 명시
class NoticeListResponse(Pagination):
    items: list[NoticeResponse]