"""회원 정보 API."""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.contract import (
    AUTH_REQUIRED,
    ERROR_RESPONSES,
    CurrentUserId,
    PasswordChangeUserId,
    ProfileUpdateUserId,
    WithdrawalUserId,
    not_implemented,
)
from app.schemas.common import MessageResponse
from app.schemas.reviews import ReviewListResponse
from app.schemas.users import (
    FavoriteListResponse,
    FavoriteResponse,
    PasswordChangeRequest,
    UserProfileResponse,
    UserProfileUpdateRequest,
)
from app.services import users

router = APIRouter(
    prefix="/users/me",
    tags=["사용자"],
    dependencies=AUTH_REQUIRED,
)
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.get(
    "",
    response_model=UserProfileResponse,
    summary="내 회원 정보 조회",
    responses=ERROR_RESPONSES,
)
def get_my_profile(
    current_user_id: CurrentUserId,
    db: DatabaseSession,
) -> UserProfileResponse:
    """JWT로 식별한 현재 사용자의 회원 정보를 반환한다."""
    return users.get_profile(db, current_user_id)


@router.patch(
    "",
    response_model=UserProfileResponse,
    summary="내 회원 정보 수정",
    responses=ERROR_RESPONSES,
)
def update_my_profile(
    request: UserProfileUpdateRequest,
    current_user_id: ProfileUpdateUserId,
    db: DatabaseSession,
) -> UserProfileResponse:
    """재인증을 마친 현재 사용자의 이름과 닉네임을 수정한다."""
    return users.update_profile(db, current_user_id, request)


@router.patch(
    "/password",
    response_model=MessageResponse,
    summary="내 비밀번호 변경",
    responses=ERROR_RESPONSES,
)
def change_my_password(
    request: PasswordChangeRequest,
    current_user_id: PasswordChangeUserId,
    db: DatabaseSession,
) -> MessageResponse:
    """재인증을 마친 현재 사용자의 비밀번호를 변경한다."""
    users.change_password(db, current_user_id, request)
    return MessageResponse(message="비밀번호가 변경되었습니다. 다시 로그인해주세요.")


@router.delete(
    "",
    response_model=MessageResponse,
    summary="회원 탈퇴",
    responses=ERROR_RESPONSES,
)
def withdraw(
    current_user_id: WithdrawalUserId,
    db: DatabaseSession,
) -> MessageResponse:
    """탈퇴 목적의 재인증을 마친 현재 사용자와 소유 데이터를 삭제한다."""
    users.withdraw(db, current_user_id)
    return MessageResponse(message="회원 탈퇴가 완료되었습니다.")


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
