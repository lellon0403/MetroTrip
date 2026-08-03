"""Helpers shared by contract-first API routers."""

from typing import Annotated

from fastapi import Depends
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.schemas.common import ErrorResponse

bearer_scheme = HTTPBearer(description="로그인 시 발급된 Access Token")


def require_auth(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> HTTPAuthorizationCredentials:
    return credentials


AUTH_REQUIRED = [Depends(require_auth)]

ERROR_RESPONSES = {
    400: {"model": ErrorResponse, "description": "요청 규칙 위반"},
    401: {"model": ErrorResponse, "description": "인증 필요"},
    403: {"model": ErrorResponse, "description": "권한 없음"},
    404: {"model": ErrorResponse, "description": "리소스 없음"},
    409: {"model": ErrorResponse, "description": "현재 상태와 요청 충돌"},
    422: {"model": ErrorResponse, "description": "입력값 검증 실패"},
    501: {"model": ErrorResponse, "description": "계약만 정의된 미구현 API"},
}


def not_implemented() -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content={
            "code": "NOT_IMPLEMENTED",
            "message": (
                "API 계약만 정의되었으며 비즈니스 로직은 아직 구현되지 않았습니다."
            ),
            "details": None,
        },
    )
