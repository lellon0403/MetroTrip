"""Travel review API contracts."""

from typing import Annotated

from fastapi import APIRouter, Query, status
from fastapi.responses import JSONResponse

from app.routers.contract import AUTH_REQUIRED, ERROR_RESPONSES, not_implemented
from app.schemas.reviews import (
    MediaUploadRequest,
    MediaUploadResponse,
    ReviewCreateRequest,
    ReviewListResponse,
    ReviewResponse,
    ReviewUpdateRequest,
)

router = APIRouter(prefix="/reviews", tags=["여행 후기"])
media_router = APIRouter(
    prefix="/review-media",
    tags=["여행 후기"],
    dependencies=AUTH_REQUIRED,
)


@router.get(
    "",
    response_model=ReviewListResponse,
    summary="후기 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_reviews(
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    station_id: Annotated[int | None, Query()] = None,
    tag: Annotated[str | None, Query(max_length=30)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> JSONResponse:
    return not_implemented()


@router.post(
    "",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="후기 작성",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def create_review(_: ReviewCreateRequest) -> JSONResponse:
    return not_implemented()


@router.get(
    "/{review_id}",
    response_model=ReviewResponse,
    summary="후기 상세 조회",
    responses=ERROR_RESPONSES,
)
def get_review(review_id: int) -> JSONResponse:
    return not_implemented()


@router.patch(
    "/{review_id}",
    response_model=ReviewResponse,
    summary="후기 수정",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def update_review(review_id: int, _: ReviewUpdateRequest) -> JSONResponse:
    return not_implemented()


@router.delete(
    "/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="후기 삭제",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def delete_review(review_id: int) -> JSONResponse:
    return not_implemented()


@media_router.post(
    "",
    response_model=MediaUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="후기 미디어 업로드 URL 발급",
    description="파일 URI를 경로 변수로 받지 않고 업로드용 URL을 발급합니다.",
    responses=ERROR_RESPONSES,
)
def create_media_upload(_: MediaUploadRequest) -> JSONResponse:
    return not_implemented()
