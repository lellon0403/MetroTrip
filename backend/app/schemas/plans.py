"""Travel plan and read-only share API contract models."""

from datetime import datetime, time
from pydantic import Field
from app.schemas.common import ApiSchema, Pagination


class PlanItemInput(ApiSchema):
    place_id: int
    station_id: int | None = None
    visit_time: time
    memo: str | None = Field(default=None, max_length=255)

# 일대다 관계를 표현하기 위해 하위 아이템(PlanItemInput)을 리스트 형태로 포함
class PlanCreateRequest(ApiSchema):
    plan_title: str = Field(min_length=1, max_length=100)
    start_station_id: int
    end_station_id: int
    items: list[PlanItemInput] = Field(default_factory=list)


class PlanUpdateRequest(ApiSchema):
    plan_title: str | None = Field(default=None, min_length=1, max_length=100)
    start_station_id: int | None = None
    end_station_id: int | None = None
    items: list[PlanItemInput] | None = None

# 상속을 통해 Input 모델의 필드를 재사용하고 응답 전용 필드를 추가
class PlanItemResponse(PlanItemInput):
    plan_item_id: int
    place_name: str
    station_name: str | None

class PlanResponse(ApiSchema):
    plan_id: int
    user_id: int
    plan_title: str
    start_station_id: int
    start_station_name: str
    end_station_id: int
    end_station_name: str
    items: list[PlanItemResponse]
    created_at: datetime
    updated_at: datetime

class PlanListResponse(Pagination):
    items: list[PlanResponse]

class ShareLinkResponse(ApiSchema):
    share_token: str
    share_url: str
    read_only: bool = True

class SharedPlanResponse(ApiSchema):
    plan_title: str
    start_station_name: str
    end_station_name: str
    items: list[PlanItemResponse]
    read_only: bool = True