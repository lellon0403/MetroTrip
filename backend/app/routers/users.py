"""회원 정보 API."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.db_failover import get_db, get_read_db
from app.routers.contract import (
    AUTH_REQUIRED,
    ERROR_RESPONSES,
    CurrentUserId,
    PasswordChangeUserId,
    ProfileUpdateUserId,
    WithdrawalUserId,
)
from app.schemas.common import MessageResponse
from app.schemas.community import (
    ParticipatingPostListResponse,
    ParticipatingPostStatus,
    PostListResponse,
)
from app.schemas.reviews import ReviewListResponse
from app.schemas.users import (
    FavoriteListResponse,
    FavoriteResponse,
    PasswordChangeRequest,
    UserProfileResponse,
    UserProfileUpdateRequest,
)
from app.services import community as community_service
from app.services import reviews as review_service
from app.services import users

router = APIRouter(
    prefix="/users/me",
    tags=["사용자"],
    dependencies=AUTH_REQUIRED,
)
DatabaseSession = Annotated[Session, Depends(get_db)]
ReadDatabaseSession = Annotated[Session, Depends(get_read_db)]


@router.get(
    "",
    response_model=UserProfileResponse,
    summary="내 회원 정보 조회",
    responses=ERROR_RESPONSES,
)
def get_my_profile(
    current_user_id: CurrentUserId,
    db: ReadDatabaseSession,
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
def list_favorites(
    current_user_id: CurrentUserId,
    db: ReadDatabaseSession,
) -> FavoriteListResponse:
    """현재 사용자가 즐겨찾기한 역 목록을 반환한다."""
    return users.list_favorites(db, current_user_id)


@router.post(
    "/favorites/{station_id}",
    response_model=FavoriteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="역 즐겨찾기 추가",
    responses=ERROR_RESPONSES,
)
def add_favorite(
    station_id: int,
    current_user_id: CurrentUserId,
    db: DatabaseSession,
) -> FavoriteResponse:
    """현재 사용자의 즐겨찾기에 역을 추가한다."""
    return users.add_favorite(db, current_user_id, station_id)


@router.delete(
    "/favorites/{station_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="역 즐겨찾기 삭제",
    responses=ERROR_RESPONSES,
)
def delete_favorite(
    station_id: int,
    current_user_id: CurrentUserId,
    db: DatabaseSession,
) -> Response:
    """현재 사용자의 즐겨찾기에서 역을 멱등적으로 삭제한다."""
    users.delete_favorite(db, current_user_id, station_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/reviews",
    response_model=ReviewListResponse,
    summary="내가 작성한 후기 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_my_reviews(
    current_user_id: CurrentUserId,
    db: ReadDatabaseSession,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> ReviewListResponse:
    """현재 사용자가 작성한 후기를 최근 작성순으로 조회한다."""
    return review_service.list_my_reviews(
        db,
        current_user_id,
        page=page,
        size=size,
    )


@router.get(
    "/posts",
    response_model=PostListResponse,
    summary="내가 작성한 모집 글 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_my_posts(
    current_user_id: CurrentUserId,
    db: ReadDatabaseSession,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> PostListResponse:
    """현재 사용자가 작성한 모집 글을 최근 작성순으로 조회한다."""
    return community_service.list_my_posts(
        db,
        current_user_id,
        page=page,
        size=size,
    )


@router.get(
    "/participating-posts",
    response_model=ParticipatingPostListResponse,
    summary="내가 참여한 모집 글 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_my_participating_posts(
    current_user_id: CurrentUserId,
    db: ReadDatabaseSession,
    participant_status: Annotated[
        ParticipatingPostStatus,
        Query(alias="status"),
    ],
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> ParticipatingPostListResponse:
    """현재 사용자의 신청 중 또는 수락된 모집 글을 상태별로 조회한다."""
    return community_service.list_my_participating_posts(
        db,
        current_user_id,
        status=participant_status,
        page=page,
        size=size,
    )
