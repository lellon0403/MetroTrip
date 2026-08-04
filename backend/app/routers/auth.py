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

# '/auth' 경로를 공통으로 가지며, Swagger에 "인증" 태그로 묶이는 라우터 인스턴스를 생성
router = APIRouter(prefix="/auth", tags=["인증"])

# 회원가입
@router.post(
    "/register",                                # API 헤더
    response_model=RegisteredUserResponse,      # 응답 스키마 정의 (회원가입 완료 정보)
    status_code=status.HTTP_201_CREATED,        # 리소스 생성 성공을 의미하는 201 상태 코드 명시
    summary="회원가입",                           # 요약
    responses=ERROR_RESPONSES,                  # 공통 오류 응답 규격 적용
)
# 클라이언트로부터 RegisterRequest 객체를 받아 회원가입을 처리
def register(_: RegisterRequest) -> JSONResponse:
    return not_implemented()

# 로그인
@router.post(
    "/login",
    response_model=TokenResponse,
    summary="로그인",
    responses=ERROR_RESPONSES,
)
# 인증 성공 시 Access Token 및 Refresh Token 등을 포함한 TokenResponse를 반환
def login(_: LoginRequest) -> JSONResponse:
    return not_implemented()

# 토큰 갱신
@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Access Token 갱신",
    responses=ERROR_RESPONSES,
)
# 만료된 Access Token을 Refresh Token을 통해 재발급받는 엔드포인트
def refresh_token(_: RefreshRequest) -> JSONResponse:
    return not_implemented()

# 로그아웃
@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="로그아웃",
    dependencies=AUTH_REQUIRED,         # 로그아웃은 로그인된 사용자만 가능하므로 인증 의존성을 추가
    responses=ERROR_RESPONSES,
)
def logout() -> JSONResponse:
    return not_implemented()