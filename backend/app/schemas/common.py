"""Shared API contract models."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class ApiSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class ErrorResponse(ApiSchema):
    code: str = Field(examples=["RESOURCE_NOT_FOUND"])
    message: str = Field(examples=["요청한 리소스를 찾을 수 없습니다."])
    details: dict[str, Any] | None = None


class MessageResponse(ApiSchema):
    message: str


class Pagination(ApiSchema):
    page: int = Field(ge=1)
    size: int = Field(ge=1, le=100)
    total_elements: int = Field(ge=0)
    total_pages: int = Field(ge=0)

