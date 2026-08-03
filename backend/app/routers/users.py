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

router = APIRouter(
    prefix="/users/me",
    tags=["사용자"],
    dependencies=AUTH_REQUIRED,
)


@router.get(
    "",
    response_model=UserProfileResponse,
    summary="내 회원 정보 조회",
    responses=ERROR_RESPONSES,
)
def get_my_profile() -> JSONResponse:
    return not_implemented()


@router.patch(
    "",
    response_model=UserProfileResponse,
    summary="내 회원 정보 수정",
    responses=ERROR_RESPONSES,
)
def update_my_profile(_: UserProfileUpdateRequest) -> JSONResponse:
    return not_implemented()


@router.delete(
    "",
    response_model=MessageResponse,
    summary="회원 탈퇴",
    responses=ERROR_RESPONSES,
)
def withdraw(_: WithdrawRequest) -> JSONResponse:
    return not_implemented()


@router.get(
    "/favorites",
    response_model=FavoriteListResponse,
    summary="즐겨찾기한 역 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_favorites() -> JSONResponse:
    return not_implemented()


@router.post(
    "/favorites/{station_id}",
    response_model=FavoriteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="역 즐겨찾기 추가",
    responses=ERROR_RESPONSES,
)
def add_favorite(station_id: int) -> JSONResponse:
    return not_implemented()


@router.delete(
    "/favorites/{station_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="역 즐겨찾기 삭제",
    responses=ERROR_RESPONSES,
)
def delete_favorite(station_id: int) -> JSONResponse:
    return not_implemented()


@router.get(
    "/reviews",
    response_model=ReviewListResponse,
    summary="내가 작성한 후기 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_my_reviews() -> JSONResponse:
    return not_implemented()
