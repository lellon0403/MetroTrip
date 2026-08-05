"""Travel review API contracts."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.contract import (
    AUTH_REQUIRED,
    ERROR_RESPONSES,
    CurrentUserId,
    not_implemented,
)
from app.schemas.reviews import (
    MediaUploadRequest,
    MediaUploadResponse,
    ReviewCreateRequest,
    ReviewListResponse,
    ReviewResponse,
    ReviewUpdateRequest,
)
from app.services import reviews as review_service

router = APIRouter(prefix="/reviews", tags=["여행 후기"])
media_router = APIRouter(
    prefix="/review-media",
    tags=["여행 후기"],
    dependencies=AUTH_REQUIRED,
)
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.get(
    "",
    response_model=ReviewListResponse,
    summary="후기 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_reviews(
    db: DatabaseSession,
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    station_id: Annotated[int | None, Query()] = None,
    tag: Annotated[str | None, Query(max_length=30)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ReviewListResponse:
    """후기 목록을 조회한다."""
    return review_service.list_reviews(
        db,
        keyword=keyword,
        station_id=station_id,
        tag=tag,
        page=page,
        size=size,
    )


@router.post(
    "",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="후기 작성",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def create_review(
    request: ReviewCreateRequest,
    db: DatabaseSession,
    user_id: CurrentUserId,
) -> ReviewResponse:
    """새 후기를 작성한다."""
    return review_service.create_review(db, user_id, request)


@router.get(
    "/{review_id}",
    response_model=ReviewResponse,
    summary="후기 상세 조회",
    responses=ERROR_RESPONSES,
)
def get_review(review_id: int, db: DatabaseSession) -> ReviewResponse:
    """후기 상세를 조회한다."""
    return review_service.get_review(db, review_id)


@router.patch(
    "/{review_id}",
    response_model=ReviewResponse,
    summary="후기 수정",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def update_review(
    review_id: int,
    request: ReviewUpdateRequest,
    db: DatabaseSession,
    user_id: CurrentUserId,
) -> ReviewResponse:
    """본인이 작성한 후기를 수정한다."""
    return review_service.update_review(db, review_id, user_id, request)


@router.delete(
    "/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="후기 삭제",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def delete_review(
    review_id: int,
    db: DatabaseSession,
    user_id: CurrentUserId,
) -> None:
    """본인이 작성한 후기를 삭제한다."""
    review_service.delete_review(db, review_id, user_id)


@media_router.post(
    "",
    response_model=MediaUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="후기 미디어 업로드 URL 발급",
    description="파일 URI를 경로 변수로 받지 않고 업로드용 URL을 발급합니다.",
    responses=ERROR_RESPONSES,
)
def create_media_upload(_: MediaUploadRequest) -> JSONResponse:
    """오브젝트 스토리지 연동 전까지는 계약만 정의한다."""
    return not_implemented()
