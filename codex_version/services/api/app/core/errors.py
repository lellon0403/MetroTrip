from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.schemas import ErrorBody, ErrorDetail, ErrorEnvelope


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: list[ErrorDetail] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    body = ErrorEnvelope(
        error=ErrorBody(
            code=exc.code,
            message=exc.message,
            request_id=_request_id(request),
            details=exc.details,
        )
    )
    return JSONResponse(status_code=exc.status_code, content=body.model_dump(by_alias=True))


def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details = [
        ErrorDetail(
            field=".".join(str(item) for item in error["loc"]),
            reason=str(error["msg"]),
        )
        for error in exc.errors()
    ]
    body = ErrorEnvelope(
        error=ErrorBody(
            code="VALIDATION_ERROR",
            message="요청 값을 확인해 주세요.",
            request_id=_request_id(request),
            details=details,
        )
    )
    return JSONResponse(status_code=422, content=body.model_dump(by_alias=True))


def unexpected_error_handler(request: Request, _exc: Any) -> JSONResponse:
    body = ErrorEnvelope(
        error=ErrorBody(
            code="INTERNAL_ERROR",
            message="요청을 처리하지 못했습니다.",
            request_id=_request_id(request),
        )
    )
    return JSONResponse(status_code=500, content=body.model_dump(by_alias=True))
