"""General board and recruitment API contracts."""

from typing import Annotated

from fastapi import APIRouter, Query, status
from fastapi.responses import JSONResponse

from app.routers.contract import AUTH_REQUIRED, ERROR_RESPONSES, not_implemented
from app.schemas.community import (
    ParticipantCancelRequest,
    ParticipantDecisionRequest,
    ParticipantListResponse,
    ParticipantResponse,
    ParticipantStatus,
    PostCreateRequest,
    PostDetailResponse,
    PostListResponse,
    PostType,
    PostUpdateRequest,
    RecruitStatus,
)

router = APIRouter(prefix="/posts", tags=["게시판"])


@router.get(
    "",
    response_model=PostListResponse,
    summary="게시글 목록 조회",
    description="일반 글과 인원 모집 글을 조회합니다. 좋아요와 정렬 옵션은 제외합니다.",
    responses=ERROR_RESPONSES,
)
def list_posts(
    post_type: Annotated[PostType | None, Query()] = None,
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    recruit_status: Annotated[RecruitStatus | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> JSONResponse:
    return not_implemented()


@router.post(
    "",
    response_model=PostDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="게시글 작성",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def create_post(_: PostCreateRequest) -> JSONResponse:
    return not_implemented()


@router.get(
    "/{post_id}",
    response_model=PostDetailResponse,
    summary="게시글 상세 조회",
    responses=ERROR_RESPONSES,
)
def get_post(post_id: int) -> JSONResponse:
    return not_implemented()


@router.patch(
    "/{post_id}",
    response_model=PostDetailResponse,
    summary="게시글 수정",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def update_post(post_id: int, _: PostUpdateRequest) -> JSONResponse:
    return not_implemented()


@router.delete(
    "/{post_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="게시글 삭제",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def delete_post(post_id: int) -> JSONResponse:
    return not_implemented()


@router.post(
    "/{post_id}/participants",
    response_model=ParticipantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="모집 참여 신청",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def apply_to_post(post_id: int) -> JSONResponse:
    return not_implemented()


@router.patch(
    "/{post_id}/participants/me",
    response_model=ParticipantResponse,
    summary="내 참여 신청 취소",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def cancel_my_application(
    post_id: int,
    _: ParticipantCancelRequest,
) -> JSONResponse:
    return not_implemented()


@router.get(
    "/{post_id}/participants",
    response_model=ParticipantListResponse,
    summary="참여 신청 목록 조회",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def list_participants(
    post_id: int,
    participant_status: Annotated[
        ParticipantStatus | None,
        Query(alias="status"),
    ] = None,
) -> JSONResponse:
    return not_implemented()


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
    _: ParticipantDecisionRequest,
) -> JSONResponse:
    return not_implemented()
