from datetime import datetime
from uuid import UUID

from pydantic import Field, model_validator

from app.core.schemas import ApiModel
from app.discovery.schemas import PlaceSummary
from app.operations.models import NoticeKind, PublicationStatus, ReportStatus
from app.recruitments.schemas import RecruitmentSummary


class NoticeWrite(ApiModel):
    title: str = Field(min_length=2, max_length=180)
    body: str = Field(min_length=2, max_length=20_000)
    status: PublicationStatus = PublicationStatus.DRAFT
    kind: NoticeKind = NoticeKind.NOTICE
    banner_url: str | None = Field(default=None, max_length=2000)
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @model_validator(mode="after")
    def validate_event_period(self) -> "NoticeWrite":
        if self.starts_at and self.ends_at and self.starts_at > self.ends_at:
            raise ValueError("이벤트 종료 시각은 시작 시각 이후여야 합니다.")
        return self


class NoticeView(ApiModel):
    id: UUID
    title: str
    body: str
    status: PublicationStatus
    published_at: datetime | None
    kind: NoticeKind
    banner_url: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    created_at: datetime
    updated_at: datetime


class NoticePage(ApiModel):
    items: list[NoticeView]


class HomeResponse(ApiModel):
    recommended_places: list[PlaceSummary]
    popular_places: list[PlaceSummary]
    latest_recruitments: list[RecruitmentSummary]
    popular_recruitments: list[RecruitmentSummary]
    active_events: list[NoticeView]
    notices: list[NoticeView]




class ReportCreate(ApiModel):
    reason: str = Field(min_length=2, max_length=80)
    detail: str | None = Field(default=None, max_length=1000)


class ReportAction(ApiModel):
    status: ReportStatus
    reason: str = Field(min_length=2, max_length=500)
    hide_content: bool = False


class ReportView(ApiModel):
    id: UUID
    reporter_id: UUID
    resource_type: str
    resource_id: UUID
    reason: str
    detail: str | None
    status: ReportStatus
    created_at: datetime
    resolved_at: datetime | None


class ReportPage(ApiModel):
    items: list[ReportView]


class DataSyncRequest(ApiModel):
    source: str = Field(pattern=r"^[a-z0-9_-]{2,50}$")
    dry_run: bool = True


class DataSyncResult(ApiModel):
    job_id: UUID
    source: str
    dry_run: bool
    status: str
    message: str


class DeviceRegister(ApiModel):
    platform: str = Field(pattern=r"^(ios|android)$")
    push_token: str = Field(min_length=20, max_length=500)
    locale: str = Field(default="ko-KR", max_length=20)
    app_version: str = Field(max_length=30)


class DeviceView(ApiModel):
    id: UUID
    platform: str
    locale: str
    app_version: str
    created_at: datetime
    last_seen_at: datetime
