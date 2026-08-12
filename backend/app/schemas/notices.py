"""공지사항 API 요청 및 응답 모델."""

from datetime import datetime
from enum import Enum

from pydantic import Field

from app.schemas.common import ApiSchema, Pagination


class NoticeType(str, Enum):
    """공지사항의 게시 목적 구분."""

    ALARM = "ALARM"
    BOARD = "BOARD"


class NoticeUpsertRequest(ApiSchema):
    """공지사항 생성에 필요한 입력값."""

    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    notice_type: NoticeType = NoticeType.BOARD


class NoticeUpdateRequest(ApiSchema):
    """공지사항의 제목과 내용을 부분 수정하는 요청."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, min_length=1)
    notice_type: NoticeType | None = None


class NoticeResponse(ApiSchema):
    """작성자와 작성 시각을 포함한 공지사항 응답."""

    notice_id: int
    admin_id: int | None
    title: str
    content: str
    notice_type: NoticeType
    created_at: datetime
    updated_at: datetime


class NoticeListResponse(Pagination):
    """페이지 정보가 포함된 공지사항 목록 응답."""

    items: list[NoticeResponse]
