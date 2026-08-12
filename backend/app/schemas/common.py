"""여러 API에서 공통으로 사용하는 계약 모델."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    """snake_case 문자열을 camelCase로 변환한다."""

    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class ApiSchema(BaseModel):
    """camelCase 별칭과 ORM 변환을 지원하는 공통 API 스키마."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class ErrorResponse(ApiSchema):
    """오류 코드와 상세 정보를 포함하는 공통 오류 응답."""

    code: str = Field(examples=["RESOURCE_NOT_FOUND"])
    message: str = Field(examples=["요청한 리소스를 찾을 수 없습니다."])
    details: dict[str, Any] | None = None


class MessageResponse(ApiSchema):
    """단일 안내 메시지를 반환하는 공통 응답."""

    message: str


class Pagination(ApiSchema):
    """페이지 번호와 전체 건수를 포함하는 공통 페이지 정보."""

    page: int = Field(ge=1)
    size: int = Field(ge=1, le=100)
    total_elements: int = Field(ge=0)
    total_pages: int = Field(ge=0)
