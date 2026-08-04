"""Helpers shared by contract-first API routers."""

from typing import Annotated
from fastapi import Depends
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.schemas.common import ErrorResponse

# Swagger 문서에 표시될 토큰 인증 스키마를 정의
bearer_scheme = HTTPBearer(description="로그인 시 발급된 Access Token")


# FastAPI의 의존성 추가를 활용하여 HTTP 요청 헤더에서 토큰을 추출하고 검증하는 함수
# 현재는 계약 단계이므로 추출한 인증 정보를 그대로 반환
def require_auth(credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)]) -> HTTPAuthorizationCredentials:
    return credentials

# 다른 라우터 엔드포인트에서 `dependencies=AUTH_REQUIRED` 형태로 간편하게 인증을 적용하기 위한 공통 변수
AUTH_REQUIRED = [Depends(require_auth)]

# API 전역에서 공통으로 사용되는 HTTP 상태 코드와 그에 따른 오류 응답 스키마의 매핑 딕셔너리
ERROR_RESPONSES = {
    400: {"model": ErrorResponse, "description": "요청 규칙 위반"},
    401: {"model": ErrorResponse, "description": "인증 필요"},
    403: {"model": ErrorResponse, "description": "권한 없음"},
    404: {"model": ErrorResponse, "description": "리소스 없음"},
    409: {"model": ErrorResponse, "description": "현재 상태와 요청 충돌"},
    422: {"model": ErrorResponse, "description": "입력값 검증 실패"},
    501: {"model": ErrorResponse, "description": "계약만 정의된 미구현 API"},
}

# 아직 비즈니스 로직이 작성되지 않은 엔드포인트가 반환할 기본 501 상태 응답
# 프론트엔드 팀과 병렬 작업을 할 때, 명세(인터페이스)만 먼저 맞추기 위한 목적으로 사용
def not_implemented() -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content={
            "code": "NOT_IMPLEMENTED",
            "message": (
                "API 계약만 정의되었으며 비즈니스 로직은 아직 구현되지 않았습니다."
            ),
            "details": None
        }
    )
