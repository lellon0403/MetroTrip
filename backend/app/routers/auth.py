"""회원가입, 로그인, 이메일 인증 API."""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db_failover import get_db
from app.routers.contract import ERROR_RESPONSES, CurrentUserId, bearer_scheme
from app.schemas.auth import (
    EmailVerificationConfirmRequest,
    EmailVerificationConfirmResponse,
    EmailVerificationRequest,
    LoginRequest,
    PasswordResetConfirmRequest,
    ReauthenticationRequest,
    ReauthenticationResponse,
    RefreshRequest,
    RegisteredUserResponse,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.common import MessageResponse
from app.services import auth

router = APIRouter(prefix="/auth", tags=["인증"])
DatabaseSession = Annotated[Session, Depends(get_db)]
BearerCredentials = Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)]


@router.post(
    "/register",
    response_model=RegisteredUserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="회원가입",
    responses=ERROR_RESPONSES,
)
def register(request: RegisterRequest, db: DatabaseSession) -> RegisteredUserResponse:
    """이메일 인증을 완료한 사용자를 가입시킨다."""
    return auth.register(db, request, get_settings())


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="로그인",
    responses=ERROR_RESPONSES,
)
def login(request: LoginRequest, db: DatabaseSession) -> TokenResponse:
    """이메일과 비밀번호로 로그인한다."""
    return auth.login(db, request.email, request.password, get_settings())


@router.post(
    "/reauthenticate",
    response_model=ReauthenticationResponse,
    summary="회원 정보 수정 전 비밀번호 재인증",
    responses=ERROR_RESPONSES,
)
def reauthenticate(
    request: ReauthenticationRequest,
    current_user_id: CurrentUserId,
    db: DatabaseSession,
) -> ReauthenticationResponse:
    """현재 비밀번호를 확인하고 단기 재인증 토큰을 발급한다."""
    return auth.reauthenticate(
        db,
        current_user_id,
        request.password,
        request.purpose,
        get_settings(),
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Access Token 갱신",
    responses=ERROR_RESPONSES,
)
def refresh_token(request: RefreshRequest, db: DatabaseSession) -> TokenResponse:
    """리프레시 토큰으로 인증 토큰을 재발급한다."""
    return auth.refresh(db, request.refresh_token, get_settings())


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="로그아웃",
    responses=ERROR_RESPONSES,
)
def logout(
    credentials: BearerCredentials,
    db: DatabaseSession,
) -> MessageResponse:
    """현재 사용자의 모든 로그인 세션을 종료한다."""
    user_id = auth.authenticate_access(credentials.credentials, get_settings())
    auth.logout(db, user_id)
    return MessageResponse(message="로그아웃되었습니다.")


@router.post(
    "/email-verifications",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="이메일 인증 코드 요청",
    responses=ERROR_RESPONSES,
)
def request_email_verification(
    request: EmailVerificationRequest,
    db: DatabaseSession,
) -> MessageResponse:
    """회원가입 등에 사용할 이메일 인증 코드를 발송한다."""
    auth.request_verification(
        db,
        request.email,
        request.purpose,
        get_settings(),
    )
    return MessageResponse(message="인증 코드 발송 요청을 처리했습니다.")


@router.post(
    "/email-verifications/confirm",
    response_model=EmailVerificationConfirmResponse,
    summary="이메일 인증 코드 확인",
    responses=ERROR_RESPONSES,
)
def confirm_email_verification(
    request: EmailVerificationConfirmRequest,
    db: DatabaseSession,
) -> EmailVerificationConfirmResponse:
    """인증 코드를 확인하고 이메일 인증 토큰을 발급한다."""
    token = auth.confirm_verification(db, request, get_settings())
    return EmailVerificationConfirmResponse(verification_token=token)


@router.post(
    "/password-reset/requests",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="비밀번호 재설정 인증 코드 요청",
    responses=ERROR_RESPONSES,
)
def request_password_reset(
    request: EmailVerificationRequest,
    db: DatabaseSession,
) -> MessageResponse:
    """비밀번호 재설정에 사용할 인증 코드를 발송한다."""
    auth.request_verification(
        db,
        request.email,
        "PASSWORD_RESET",
        get_settings(),
    )
    return MessageResponse(message="비밀번호 재설정 요청을 처리했습니다.")


@router.post(
    "/password-reset/confirm",
    response_model=MessageResponse,
    summary="비밀번호 재설정",
    responses=ERROR_RESPONSES,
)
def confirm_password_reset(
    request: PasswordResetConfirmRequest,
    db: DatabaseSession,
) -> MessageResponse:
    """인증 코드를 확인하고 새 비밀번호를 저장한다."""
    auth.reset_password(db, request, get_settings())
    return MessageResponse(message="비밀번호가 변경되었습니다.")
