"""Current user and favorite API contracts."""

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from app.routers.contract import AUTH_REQUIRED, ERROR_RESPONSES, not_implemented
from app.schemas.common import MessageResponse
from app.schemas.reviews import ReviewListResponse
from app.schemas.users import (
    FavoriteListResponse,
    FavoriteResponse,
    UserProfileResponse,
    UserProfileUpdateRequest,
    WithdrawRequest,
)

# 이 라우터의 모든 요청은 로그인된 사용자(me)를 기준으로 동작하도록 구조화되어 있음
router = APIRouter(prefix="/users/me", tags=["사용자"], dependencies=AUTH_REQUIRED)

# 내 회원 정보 조회
@router.get(
    "",
    response_model=UserProfileResponse,
    summary="내 회원 정보 조회",
    responses=ERROR_RESPONSES,
)
# JWT 토큰을 통해 식별된 사용자의 정보를 서비스 계층에서 조회
# URL에 user_id를 노출하지 않아 안전
def get_my_profile() -> JSONResponse:
    return not_implemented()

# 내 회원 정보 수정
@router.patch(
    "",
    response_model=UserProfileResponse,
    summary="내 회원 정보 수정",
    responses=ERROR_RESPONSES,
)
def update_my_profile(_: UserProfileUpdateRequest) -> JSONResponse:
    return not_implemented()

# 회원 탈퇴
@router.delete(
    "",
    response_model=MessageResponse,
    summary="회원 탈퇴",
    responses=ERROR_RESPONSES,
)
# 계정 상태를 비활성화 또는 영구 삭제로 전이
def withdraw(_: WithdrawRequest) -> JSONResponse:
    return not_implemented()

# 즐겨찾기한 역 목록 조회
@router.get(
    "/favorites",
    response_model=FavoriteListResponse,
    summary="즐겨찾기한 역 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_favorites() -> JSONResponse:
    return not_implemented()

# 역 즐겨찾기 추가
@router.post(
    "/favorites/{station_id}",
    response_model=FavoriteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="역 즐겨찾기 추가",
    responses=ERROR_RESPONSES,
)
# 사용자와 지하철역 간의 다대다 관계 테이블에 데이터를 삽입
def add_favorite(station_id: int) -> JSONResponse:
    return not_implemented()

# 역 즐겨찾기 삭제
@router.delete(
    "/favorites/{station_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="역 즐겨찾기 삭제",
    responses=ERROR_RESPONSES,
)
def delete_favorite(station_id: int) -> JSONResponse:
    return not_implemented()

# 내가 작성한 후기 목록 조회
@router.get(
    "/reviews",
    response_model=ReviewListResponse,
    summary="내가 작성한 후기 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_my_reviews() -> JSONResponse:
    return not_implemented()