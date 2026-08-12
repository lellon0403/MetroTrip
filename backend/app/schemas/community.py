"""모집 게시판 API 요청 및 응답 모델."""

from datetime import date, datetime
from enum import Enum

from pydantic import Field

from app.schemas.common import ApiSchema, Pagination


class RecruitStatus(str, Enum):
    """게시글의 모집 진행 상태."""

    RECRUITING = "RECRUITING"
    CLOSED = "CLOSED"


class ParticipantStatus(str, Enum):
    """모집 참여 신청의 처리 상태."""

    APPLIED = "APPLIED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    CANCELED = "CANCELED"


class ParticipatingPostStatus(str, Enum):
    """내가 참여한 모집 글 목록에서 조회할 신청 상태."""

    APPLIED = "APPLIED"
    ACCEPTED = "ACCEPTED"


class AuthorResponse(ApiSchema):
    """모집 게시글 작성자의 공개 정보 응답."""

    user_id: int | None
    nickname: str


class RecruitmentResponse(ApiSchema):
    """정원과 마감일을 포함한 모집 현황 응답."""

    capacity: int
    accepted_count: int
    deadline: date
    status: RecruitStatus
    meeting_date: date | None


class PostCreateRequest(ApiSchema):
    """새 모집 게시글을 작성하는 요청."""

    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1)
    recruit_capacity: int = Field(ge=1)
    recruit_deadline: date
    meeting_date: date | None = None
    plan_id: int | None = None


class PostUpdateRequest(ApiSchema):
    """모집 게시글과 모집 정보를 부분 수정하는 요청."""

    title: str | None = Field(default=None, min_length=1, max_length=100)
    content: str | None = Field(default=None, min_length=1)
    recruit_capacity: int | None = Field(default=None, ge=1)
    recruit_deadline: date | None = None
    meeting_date: date | None = None
    recruit_status: RecruitStatus | None = None
    plan_id: int | None = None


class PostSummaryResponse(ApiSchema):
    """목록에 표시할 모집 게시글 요약 응답."""

    post_id: int
    title: str
    author: AuthorResponse
    view_count: int
    recruitment: RecruitmentResponse
    created_at: datetime


class PostDetailResponse(PostSummaryResponse):
    """본문과 연결 계획을 포함한 모집 게시글 상세 응답."""

    content: str
    plan_id: int | None
    updated_at: datetime


class PostListResponse(Pagination):
    """페이지 정보가 포함된 모집 게시글 목록 응답."""

    items: list[PostSummaryResponse]


class MyParticipationResponse(ApiSchema):
    """현재 사용자의 모집 참여 신청 상태 응답."""

    participant_id: int
    status: ParticipatingPostStatus
    applied_at: datetime
    responded_at: datetime | None


class ParticipatingPostResponse(PostSummaryResponse):
    """현재 사용자가 신청한 모집 게시글 응답."""

    participation: MyParticipationResponse


class ParticipatingPostListResponse(Pagination):
    """페이지 정보가 포함된 내 참여 모집 글 목록 응답."""

    items: list[ParticipatingPostResponse]


class ParticipantResponse(ApiSchema):
    """모집 참여 신청자와 처리 상태 응답."""

    participant_id: int
    post_id: int
    user: AuthorResponse | None = None
    status: ParticipantStatus
    applied_at: datetime
    responded_at: datetime | None


class ParticipantListResponse(ApiSchema):
    """특정 모집 게시글의 참여 신청자 목록 응답."""

    items: list[ParticipantResponse]


class ParticipantCancelRequest(ApiSchema):
    """현재 사용자의 모집 참여 신청 취소 요청."""

    status: ParticipantStatus = Field(
        default=ParticipantStatus.CANCELED,
        description="CANCELED만 허용됩니다.",
    )


class ParticipantDecisionRequest(ApiSchema):
    """게시글 작성자의 참여 신청 수락 또는 거절 요청."""

    status: ParticipantStatus = Field(
        description="ACCEPTED 또는 REJECTED만 허용됩니다.",
    )
