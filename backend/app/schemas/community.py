"""General board and recruitment API contract models."""

from datetime import date, datetime
from enum import Enum
from pydantic import Field, model_validator
from app.schemas.common import ApiSchema, Pagination

# 상태 패턴을 적용하기 위해 가능한 상태값들을 Enum으로 제한
class PostType(str, Enum):
    GENERAL = "GENERAL"
    RECRUIT = "RECRUIT"

class RecruitStatus(str, Enum):
    RECRUITING = "RECRUITING"
    CLOSED = "CLOSED"

class ParticipantStatus(str, Enum):
    APPLIED = "APPLIED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    CANCELED = "CANCELED"

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
    post_type: PostType
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1)
    recruit_capacity: int | None = Field(default=None, ge=1)
    recruit_deadline: date | None = None
    meeting_date: date | None = None
    plan_id: int | None = None

    # 객체가 생성된 후 실행되는 교차 필드 검증기임
    # post_type의 값에 따라 다른 필드들의 필수 여부를 동적으로 체크하는 비즈니스 규칙을 캡슐화
    @model_validator(mode="after")
    def validate_recruitment_fields(self) -> "PostCreateRequest":
        required = (self.recruit_capacity, self.recruit_deadline)
        if self.post_type is PostType.RECRUIT and None in required:
            raise ValueError("모집 글에는 정원과 마감일이 필요합니다.")
        if self.post_type is PostType.GENERAL and any(
            value is not None
            for value in (*required, self.meeting_date, self.plan_id)
        ):
            raise ValueError("일반 글에는 모집 관련 필드를 설정할 수 없습니다.")
        return self

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
    post_type: PostType
    title: str
    author: AuthorResponse
    view_count: int
    recruitment: RecruitmentResponse | None
    created_at: datetime

class PostDetailResponse(PostSummaryResponse):
    content: str
    plan_id: int | None
    updated_at: datetime

class PostListResponse(Pagination):
    items: list[PostSummaryResponse]

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