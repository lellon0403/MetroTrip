from datetime import date, datetime, time
from uuid import UUID

from pydantic import Field, model_validator

from app.core.schemas import ApiModel
from app.planning.models import PlanItemType, PlanStatus, PlanVisibility


class PlanItemInput(ApiModel):
    item_type: PlanItemType
    station_id: UUID | None = None
    place_id: UUID | None = None
    route_snapshot: dict | None = None
    note: str | None = Field(default=None, max_length=2000)
    scheduled_time: time | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)

    @model_validator(mode="after")
    def validate_context(self) -> "PlanItemInput":
        references = [
            self.station_id is not None,
            self.place_id is not None,
            self.route_snapshot is not None,
        ]
        if sum(references) > 1:
            raise ValueError("plan item accepts only one travel context")
        required = {
            PlanItemType.STATION: self.station_id,
            PlanItemType.PLACE: self.place_id,
            PlanItemType.ROUTE: self.route_snapshot,
            PlanItemType.NOTE: self.note,
        }
        if required[self.item_type] is None:
            raise ValueError(f"{self.item_type.value} item context is required")
        return self


class PlanDayInput(ApiModel):
    day_date: date
    title: str | None = Field(default=None, max_length=120)
    items: list[PlanItemInput] = Field(default_factory=list, max_length=100)


class PlanWriteRequest(ApiModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    start_date: date
    end_date: date
    status: PlanStatus = PlanStatus.DRAFT
    days: list[PlanDayInput] = Field(min_length=1, max_length=31)

    @model_validator(mode="after")
    def validate_dates(self) -> "PlanWriteRequest":
        if self.start_date > self.end_date:
            raise ValueError("plan start date must not be after end date")
        dates = [day.day_date for day in self.days]
        if len(dates) != len(set(dates)):
            raise ValueError("plan day dates must be unique")
        if any(day_date < self.start_date or day_date > self.end_date for day_date in dates):
            raise ValueError("plan day must be within plan range")
        return self


class PlanItemView(PlanItemInput):
    id: UUID
    position: int


class PlanDayView(ApiModel):
    id: UUID
    day_date: date
    title: str | None
    position: int
    items: list[PlanItemView]


class PlanView(ApiModel):
    id: UUID
    owner_id: UUID
    title: str
    description: str | None
    start_date: date
    end_date: date
    visibility: PlanVisibility
    status: PlanStatus
    version: int
    days: list[PlanDayView]
    created_at: datetime
    updated_at: datetime


class PlanSummary(ApiModel):
    id: UUID
    title: str
    start_date: date
    end_date: date
    status: PlanStatus
    version: int
    updated_at: datetime


class PlanPage(ApiModel):
    items: list[PlanSummary]
    next_cursor: str | None = None


class DeletedPlanSummary(PlanSummary):
    deleted_at: datetime
    expires_at: datetime


class DeletedPlanPage(ApiModel):
    items: list[DeletedPlanSummary]


class ShareLinkRequest(ApiModel):
    expires_in_days: int | None = Field(default=7, ge=1, le=90)
    max_uses: int | None = Field(default=None, ge=1, le=10000)


class ShareLinkResponse(ApiModel):
    id: UUID
    token: str
    url_path: str
    expires_at: datetime | None
    max_uses: int | None
