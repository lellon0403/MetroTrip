from datetime import datetime
from uuid import UUID

from pydantic import Field, model_validator

from app.core.schemas import ApiModel
from app.recruitments.models import ApplicationStatus, RecruitmentCommentKind, RecruitmentStatus


class RecruitmentWriteRequest(ApiModel):
    plan_id: UUID
    title: str = Field(min_length=2, max_length=160)
    body: str = Field(min_length=10, max_length=10_000)
    capacity: int = Field(ge=1, le=50)
    deadline: datetime
    meeting_at: datetime

    @model_validator(mode="after")
    def validate_dates(self) -> "RecruitmentWriteRequest":
        if self.deadline >= self.meeting_at:
            raise ValueError("deadline must precede meeting time")
        return self


class RecruitmentSummary(ApiModel):
    id: UUID
    owner_id: UUID
    owner_name: str
    plan_id: UUID | None
    route_label: str
    title: str
    body: str
    capacity: int
    accepted_count: int
    deadline: datetime
    meeting_at: datetime
    status: RecruitmentStatus
    version: int
    created_at: datetime

    view_count: int

class RecruitmentDetail(RecruitmentSummary):
    my_application_status: ApplicationStatus | None = None
    comments: list["RecruitmentCommentView"] = Field(default_factory=list)


class RecruitmentPage(ApiModel):
    items: list[RecruitmentSummary]
    next_cursor: str | None = None


class ApplicationCreateRequest(ApiModel):
    message: str | None = Field(default=None, max_length=500)


class ApplicationDecisionRequest(ApiModel):
    status: ApplicationStatus


class ApplicationView(ApiModel):
    id: UUID
    recruitment_id: UUID
    applicant_id: UUID
    applicant_name: str
    message: str | None
    status: ApplicationStatus
    created_at: datetime
    updated_at: datetime


class ApplicationPage(ApiModel):
    items: list[ApplicationView]


class RecruitmentCommentCreateRequest(ApiModel):
    kind: RecruitmentCommentKind = RecruitmentCommentKind.QUESTION
    body: str = Field(min_length=1, max_length=1000)


class RecruitmentCommentView(ApiModel):
    id: UUID
    recruitment_id: UUID
    author_id: UUID
    author_name: str
    kind: RecruitmentCommentKind
    body: str
    created_at: datetime


class RecruitmentCommentPage(ApiModel):
    items: list[RecruitmentCommentView]
