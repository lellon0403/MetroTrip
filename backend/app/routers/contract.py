"""API Router에서 공통으로 사용하는 계약과 인증 의존성."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings
from app.schemas.auth import ReauthenticationPurpose
from app.schemas.common import ErrorResponse
from app.services import auth

bearer_scheme = HTTPBearer(description="로그인 시 발급된 Access Token")

""" 
공통 인프라
get_current_user_id 의존성 추가
"""
def get_current_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> int:
    """Bearer 토큰을 검증하고 현재 로그인한 사용자의 ID를 반환한다."""
    return auth.authenticate_access(credentials.credentials, get_settings())

AUTH_REQUIRED = [Depends(get_current_user_id)]
CurrentUserId = Annotated[int, Depends(get_current_user_id)]


def get_optional_current_user_id(
    request: Request,
) -> int | None:
    """토큰이 있으면 사용자를 인증하고 없으면 비회원으로 처리한다."""
    authorization = request.headers.get("Authorization")
    if authorization is None:
        return None
    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token:
        raise HTTPException(
            401,
            detail="유효하지 않은 액세스 토큰입니다.",
            headers={"X-Error-Code": "INVALID_TOKEN"},
        )
    return auth.authenticate_access(token, get_settings())


OptionalCurrentUserId = Annotated[int | None, Depends(get_optional_current_user_id)]


def _get_reauthenticated_user_id(
    current_user_id: CurrentUserId,
    verification_token: str,
    purpose: ReauthenticationPurpose,
) -> int:
    """재인증 토큰의 목적과 사용자가 현재 요청의 사용자와 일치하는지 확인한다."""
    verified_user_id = auth.authenticate_reauthentication(
        verification_token,
        purpose,
        get_settings(),
    )
    if verified_user_id != current_user_id:
        raise HTTPException(
            403,
            detail="현재 사용자와 재인증 사용자가 일치하지 않습니다.",
            headers={"X-Error-Code": "REAUTHENTICATION_USER_MISMATCH"},
        )
    return current_user_id


ReauthenticationToken = Annotated[
    str,
    Header(alias="X-Reauthentication-Token"),
]


def get_profile_update_user_id(
    current_user_id: CurrentUserId,
    verification_token: ReauthenticationToken,
) -> int:
    """프로필 수정 목적의 재인증을 마친 사용자 ID를 반환한다."""
    return _get_reauthenticated_user_id(
        current_user_id,
        verification_token,
        "PROFILE_UPDATE",
    )


def get_password_change_user_id(
    current_user_id: CurrentUserId,
    verification_token: ReauthenticationToken,
) -> int:
    """비밀번호 변경 목적의 재인증을 마친 사용자 ID를 반환한다."""
    return _get_reauthenticated_user_id(
        current_user_id,
        verification_token,
        "PASSWORD_CHANGE",
    )


def get_withdrawal_user_id(
    current_user_id: CurrentUserId,
    verification_token: ReauthenticationToken,
) -> int:
    """회원 탈퇴 목적의 재인증을 마친 사용자 ID를 반환한다."""
    return _get_reauthenticated_user_id(
        current_user_id,
        verification_token,
        "WITHDRAWAL",
    )


ProfileUpdateUserId = Annotated[int, Depends(get_profile_update_user_id)]
PasswordChangeUserId = Annotated[int, Depends(get_password_change_user_id)]
WithdrawalUserId = Annotated[int, Depends(get_withdrawal_user_id)]

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
