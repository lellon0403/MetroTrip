"""모집 게시판 API 라우터."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db_failover import get_db, get_read_db
from app.routers.contract import (
    ADMIN_REQUIRED,
    AUTH_REQUIRED,
    ERROR_RESPONSES,
    CurrentUserId,
)
from app.schemas.community import (
    ParticipantCancelRequest,
    ParticipantDecisionRequest,
    ParticipantListResponse,
    ParticipantResponse,
    ParticipantStatus,
    PostCreateRequest,
    PostDetailResponse,
    PostListResponse,
    PostUpdateRequest,
    RecruitStatus,
)
from app.services import community as community_service

router = APIRouter(prefix="/posts", tags=["게시판"])
admin_router = APIRouter(
    prefix="/admin/posts",
    tags=["관리자"],
    dependencies=ADMIN_REQUIRED,
)
DatabaseSession = Annotated[Session, Depends(get_db)]
ReadDatabaseSession = Annotated[Session, Depends(get_read_db)]


@router.get(
    "",
    response_model=PostListResponse,
    summary="게시글 목록 조회",
    description="인원 모집 글을 조회합니다. 좋아요와 정렬 옵션은 제외합니다.",
    responses=ERROR_RESPONSES,
)
def list_posts(
    db: ReadDatabaseSession,
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    recruit_status: Annotated[RecruitStatus | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PostListResponse:
    """게시글 목록을 조회한다."""
    return community_service.list_posts(
        db,
        keyword=keyword,
        recruit_status=recruit_status,
        page=page,
        size=size,
    )


@router.post(
    "",
    response_model=PostDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="게시글 작성",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def create_post(
    request: PostCreateRequest,
    db: DatabaseSession,
    user_id: CurrentUserId,
) -> PostDetailResponse:
    """새 게시글을 작성한다."""
    return community_service.create_post(db, user_id, request)


@router.get(
    "/{post_id}",
    response_model=PostDetailResponse,
    summary="게시글 상세 조회",
    responses=ERROR_RESPONSES,
)
def get_post(post_id: int, db: ReadDatabaseSession) -> PostDetailResponse:
    """게시글 상세를 조회한다."""
    return community_service.get_post(db, post_id)


@router.patch(
    "/{post_id}",
    response_model=PostDetailResponse,
    summary="게시글 수정",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def update_post(
    post_id: int,
    request: PostUpdateRequest,
    db: DatabaseSession,
    user_id: CurrentUserId,
) -> PostDetailResponse:
    """본인이 작성한 게시글을 수정한다."""
    return community_service.update_post(db, post_id, user_id, request)


@router.delete(
    "/{post_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="게시글 삭제",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def delete_post(
    post_id: int,
    db: DatabaseSession,
    user_id: CurrentUserId,
) -> None:
    """본인이 작성한 게시글을 삭제한다."""
    community_service.delete_post(db, post_id, user_id)


@admin_router.delete(
    "/{post_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="관리자 모집 게시글 삭제",
    responses=ERROR_RESPONSES,
)
def delete_post_as_admin(post_id: int, db: DatabaseSession) -> None:
    """관리자가 작성자와 관계없이 모집 게시글을 삭제한다."""
    community_service.delete_post_as_admin(db, post_id)


@router.post(
    "/{post_id}/participants",
    response_model=ParticipantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="모집 참여 신청",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def apply_to_post(
    post_id: int,
    db: DatabaseSession,
    user_id: CurrentUserId,
) -> ParticipantResponse:
    """모집 글에 참여를 신청한다."""
    return community_service.apply_to_post(db, post_id, user_id)


@router.patch(
    "/{post_id}/participants/me",
    response_model=ParticipantResponse,
    summary="내 참여 신청 취소",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def cancel_my_application(
    post_id: int,
    request: ParticipantCancelRequest,
    db: DatabaseSession,
    user_id: CurrentUserId,
) -> ParticipantResponse:
    """본인의 참여 신청을 취소한다."""
    return community_service.cancel_my_application(db, post_id, user_id, request)


@router.get(
    "/{post_id}/participants",
    response_model=ParticipantListResponse,
    summary="참여 신청 목록 조회",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def list_participants(
    post_id: int,
    db: ReadDatabaseSession,
    user_id: CurrentUserId,
    participant_status: Annotated[
        ParticipantStatus | None,
        Query(alias="status"),
    ] = None,
) -> ParticipantListResponse:
    """게시글 작성자가 참여 신청 목록을 조회한다."""
    return community_service.list_participants(db, post_id, user_id, participant_status)


@router.patch(
    "/{post_id}/participants/{participant_id}",
    response_model=ParticipantResponse,
    summary="참여 신청 수락 또는 거절",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def decide_participant(
    post_id: int,
    participant_id: int,
    request: ParticipantDecisionRequest,
    db: DatabaseSession,
    user_id: CurrentUserId,
) -> ParticipantResponse:
    """게시글 작성자가 참여 신청을 수락하거나 거절한다."""
    return community_service.decide_participant(
        db, post_id, participant_id, user_id, request
    )
