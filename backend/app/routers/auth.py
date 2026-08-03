"""Authentication API contracts."""

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.routers.contract import AUTH_REQUIRED, ERROR_RESPONSES, not_implemented
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisteredUserResponse,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/auth", tags=["인증"])


@router.post(
    "/register",
    response_model=RegisteredUserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="회원가입",
    responses=ERROR_RESPONSES,
)
def register(_: RegisterRequest) -> JSONResponse:
    return not_implemented()


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="로그인",
    responses=ERROR_RESPONSES,
)
def login(_: LoginRequest) -> JSONResponse:
    return not_implemented()


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Access Token 갱신",
    responses=ERROR_RESPONSES,
)
def refresh_token(_: RefreshRequest) -> JSONResponse:
    return not_implemented()


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="로그아웃",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def logout() -> JSONResponse:
    return not_implemented()
