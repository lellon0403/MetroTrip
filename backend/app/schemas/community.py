"""Recruitment board API contract models.

V1.10 개정으로 일반 게시판 기능이 빠지고 board_posts는 인원 모집 전용이 되었다.
"""

from datetime import date, datetime
from enum import Enum

from pydantic import Field

from app.schemas.common import ApiSchema, Pagination


class RecruitStatus(str, Enum):
    RECRUITING = "RECRUITING"
    CLOSED = "CLOSED"


class ParticipantStatus(str, Enum):
    APPLIED = "APPLIED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    CANCELED = "CANCELED"


class ParticipatingPostStatus(str, Enum):
    APPLIED = "APPLIED"
    ACCEPTED = "ACCEPTED"


class AuthorResponse(ApiSchema):
    user_id: int | None
    nickname: str


class RecruitmentResponse(ApiSchema):
    capacity: int
    accepted_count: int
    deadline: date
    status: RecruitStatus
    meeting_date: date | None


class PostCreateRequest(ApiSchema):
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1)
    recruit_capacity: int = Field(ge=1)
    recruit_deadline: date
    meeting_date: date | None = None
    plan_id: int | None = None


class PostUpdateRequest(ApiSchema):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    content: str | None = Field(default=None, min_length=1)
    recruit_capacity: int | None = Field(default=None, ge=1)
    recruit_deadline: date | None = None
    meeting_date: date | None = None
    recruit_status: RecruitStatus | None = None
    plan_id: int | None = None


class PostSummaryResponse(ApiSchema):
    post_id: int
    title: str
    author: AuthorResponse
    view_count: int
    recruitment: RecruitmentResponse
    created_at: datetime


class PostDetailResponse(PostSummaryResponse):
    content: str
    plan_id: int | None
    updated_at: datetime


class PostListResponse(Pagination):
    items: list[PostSummaryResponse]


class MyParticipationResponse(ApiSchema):
    participant_id: int
    status: ParticipatingPostStatus
    applied_at: datetime
    responded_at: datetime | None


class ParticipatingPostResponse(PostSummaryResponse):
    participation: MyParticipationResponse


class ParticipatingPostListResponse(Pagination):
    items: list[ParticipatingPostResponse]


class ParticipantResponse(ApiSchema):
    participant_id: int
    post_id: int
    user: AuthorResponse | None = None
    status: ParticipantStatus
    applied_at: datetime
    responded_at: datetime | None


class ParticipantListResponse(ApiSchema):
    items: list[ParticipantResponse]


class ParticipantCancelRequest(ApiSchema):
    status: ParticipantStatus = Field(
        default=ParticipantStatus.CANCELED,
        description="CANCELED만 허용됩니다.",
    )


class ParticipantDecisionRequest(ApiSchema):
    status: ParticipantStatus = Field(
        description="ACCEPTED 또는 REJECTED만 허용됩니다.",
    )
