from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class HealthResponse(ApiModel):
    status: str
    service: str
    environment: str


class DependencyHealth(ApiModel):
    name: str
    status: str
    detail: str | None = None


class ReadinessResponse(ApiModel):
    status: str
    dependencies: list[DependencyHealth]


class MetaResponse(ApiModel):
    api_version: str
    pilot_region: str
    provider_mode: str


class ErrorDetail(ApiModel):
    field: str | None = None
    reason: str


class ErrorBody(ApiModel):
    code: str
    message: str
    request_id: str
    details: list[ErrorDetail] = Field(default_factory=list)


class ErrorEnvelope(ApiModel):
    error: ErrorBody
