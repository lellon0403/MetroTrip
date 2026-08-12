"""여행 계획과 읽기 전용 공유 API 계약 모델."""

from datetime import datetime, time

from pydantic import Field, model_validator

from app.schemas.common import ApiSchema, Pagination


class PlanItemCreateInput(ApiSchema):
    """새 여행 일정 항목 입력값."""

    place_id: int
    station_id: int | None = None
    visit_time: time
    memo: str | None = Field(default=None, max_length=255)


class PlanItemUpdateInput(PlanItemCreateInput):
    """기존 항목 식별자를 선택적으로 포함하는 일정 수정 입력값."""

    plan_item_id: int | None = None


class PlanCreateRequest(ApiSchema):
    """여행 계획 작성 요청."""

    plan_title: str = Field(min_length=1, max_length=100)
    start_station_id: int
    end_station_id: int
    items: list[PlanItemCreateInput] = Field(default_factory=list)


class PlanUpdateRequest(ApiSchema):
    """여행 계획 부분 수정 요청."""

    plan_title: str | None = Field(default=None, min_length=1, max_length=100)
    start_station_id: int | None = None
    end_station_id: int | None = None
    items: list[PlanItemUpdateInput] | None = None

    @model_validator(mode="after")
    def reject_explicit_null(self) -> "PlanUpdateRequest":
        """생략과 명시적 null을 구분하여 null 수정 요청을 거부한다."""
        null_fields = [
            field_name
            for field_name in self.model_fields_set
            if getattr(self, field_name) is None
        ]
        if null_fields:
            raise ValueError(
                "수정 필드는 null일 수 없습니다: " + ", ".join(sorted(null_fields))
            )
        return self


class PlanItemResponse(PlanItemCreateInput):
    """장소와 접근역 이름을 포함한 일정 항목 응답."""

    plan_item_id: int
    place_name: str
    station_name: str | None


class PlanResponse(ApiSchema):
    """여행 계획 상세 응답."""

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
    """페이지 정보가 포함된 내 여행 계획 목록 응답."""

    items: list[PlanResponse]


class ShareLinkResponse(ApiSchema):
    """읽기 전용 공유 링크 발급 응답."""

    share_token: str
    share_url: str
    expires_at: datetime
    read_only: bool = True


class SharedPlanResponse(ApiSchema):
    """로그인 없이 조회하는 공유 여행 계획 응답."""

    plan_title: str
    start_station_id: int
    start_station_name: str
    end_station_id: int
    end_station_name: str
    items: list[PlanItemResponse]
    read_only: bool = True
