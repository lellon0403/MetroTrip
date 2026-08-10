from typing import Annotated, Literal

from fastapi import APIRouter, Cookie, Depends, Header, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError
from app.identity.dependencies import CurrentUser
from app.identity.models import User
from app.identity.schemas import (
    AccountDeleteRequest,
    AuthResponse,
    LoginRequest,
    MessageResponse,
    PasswordResetConfirm,
    PasswordResetRequest,
    PasswordResetRequested,
    ProfileUpdate,
    RefreshRequest,
    RegisterRequest,
    UserProfile,
)
from app.identity.service import IdentityService, IssuedTokens
from app.infrastructure.database import get_db

router = APIRouter(prefix="/auth", tags=["identity"])
profile_router = APIRouter(prefix="/me", tags=["identity"])
settings = get_settings()


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _write_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        settings.refresh_cookie_name,
        refresh_token,
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api/v1/auth",
    )


def _auth_response(
    response: Response,
    user: User,
    tokens: IssuedTokens,
    platform: Literal["web", "mobile"],
) -> AuthResponse:
    _write_refresh_cookie(response, tokens.refresh_token)
    response.headers["Cache-Control"] = "no-store"
    return AuthResponse(
        access_token=tokens.access_token,
        expires_in=tokens.expires_in,
        refresh_token=tokens.refresh_token if platform == "mobile" else None,
        user=UserProfile.model_validate(user),
    )


@router.post("/register", operation_id="register", response_model=AuthResponse, status_code=201)
def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    platform: Annotated[Literal["web", "mobile"], Header(alias="X-Client-Platform")] = "web",
) -> AuthResponse:
    user, tokens = IdentityService(db).register(
        body.email,
        body.password.get_secret_value(),
        body.display_name,
        request.headers.get("user-agent"),
        _client_ip(request),
    )
    return _auth_response(response, user, tokens, platform)


@router.post("/login", operation_id="login", response_model=AuthResponse)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    platform: Annotated[Literal["web", "mobile"], Header(alias="X-Client-Platform")] = "web",
) -> AuthResponse:
    user, tokens = IdentityService(db).login(
        body.email,
        body.password.get_secret_value(),
        request.headers.get("user-agent"),
        _client_ip(request),
    )
    return _auth_response(response, user, tokens, platform)


@router.post("/refresh", operation_id="refreshSession", response_model=AuthResponse)
def refresh_session(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    body: RefreshRequest | None = None,
    cookie_token: Annotated[str | None, Cookie(alias=settings.refresh_cookie_name)] = None,
    platform: Annotated[Literal["web", "mobile"], Header(alias="X-Client-Platform")] = "web",
) -> AuthResponse:
    raw_token = body.refresh_token if body and body.refresh_token else cookie_token
    if not raw_token:
        raise ApiError(401, "REFRESH_TOKEN_REQUIRED", "갱신 세션이 없습니다.")
    user, tokens = IdentityService(db).refresh(
        raw_token, request.headers.get("user-agent"), _client_ip(request)
    )
    return _auth_response(response, user, tokens, platform)


@router.post("/logout", operation_id="logout", response_model=MessageResponse)
def logout(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    body: RefreshRequest | None = None,
    cookie_token: Annotated[str | None, Cookie(alias=settings.refresh_cookie_name)] = None,
) -> MessageResponse:
    raw_token = body.refresh_token if body and body.refresh_token else cookie_token
    IdentityService(db).logout(raw_token)
    response.delete_cookie(settings.refresh_cookie_name, path="/api/v1/auth")
    return MessageResponse(message="로그아웃되었습니다.")


@router.post(
    "/password-reset/request",
    operation_id="requestPasswordReset",
    response_model=PasswordResetRequested,
)
def request_password_reset(
    body: PasswordResetRequest, db: Annotated[Session, Depends(get_db)]
) -> PasswordResetRequested:
    code = IdentityService(db).request_password_reset(body.email)
    return PasswordResetRequested(
        message="가입된 계정이라면 인증 코드를 전송했습니다.",
        debug_code=code if settings.is_local else None,
    )


@router.post(
    "/password-reset/confirm",
    operation_id="confirmPasswordReset",
    response_model=MessageResponse,
)
def confirm_password_reset(
    body: PasswordResetConfirm, db: Annotated[Session, Depends(get_db)]
) -> MessageResponse:
    IdentityService(db).confirm_password_reset(
        body.email, body.code, body.new_password.get_secret_value()
    )
    return MessageResponse(message="비밀번호가 변경되었습니다. 다시 로그인해 주세요.")


@profile_router.get("", operation_id="getMyProfile", response_model=UserProfile)
def get_my_profile(user: CurrentUser) -> UserProfile:
    return UserProfile.model_validate(user)


@profile_router.patch("", operation_id="updateMyProfile", response_model=UserProfile)
def update_my_profile(
    body: ProfileUpdate,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> UserProfile:
    updated = IdentityService(db).update_profile(user, body.display_name)
    return UserProfile.model_validate(updated)


@profile_router.delete("", operation_id="deleteMyAccount", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_account(
    body: AccountDeleteRequest,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    IdentityService(db).delete_account(user, body.password.get_secret_value())
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(settings.refresh_cookie_name, path="/api/v1/auth")
    return response
