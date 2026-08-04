"""Helpers shared by contract-first API routers."""

from typing import Annotated

from fastapi import Depends
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings
from app.schemas.common import ErrorResponse
from app.services import auth as auth_service

bearer_scheme = HTTPBearer(description="로그인 시 발급된 Access Token")


def require_auth(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> HTTPAuthorizationCredentials:
    return credentials

""" 
공통 인프라
get_current_user_id 의존성 추가
"""
def get_current_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> int:
    """Bearer 토큰을 검증하고 현재 로그인한 사용자의 ID를 반환한다."""
    return auth_service.authenticate_access(credentials.credentials, get_settings())


AUTH_REQUIRED = [Depends(require_auth)]
CurrentUserId = Annotated[int, Depends(get_current_user_id)]

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
