from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.identity.dependencies import CurrentUser, OptionalUser
from app.infrastructure.database import get_db
from app.reviews.repository import decode_review_cursor, encode_review_cursor
from app.reviews.schemas import (
    MediaClaimRequest,
    MediaClaimResponse,
    MediaCompleteResponse,
    ReviewDetail,
    ReviewLikeResponse,
    ReviewPage,
    ReviewWriteRequest,
)
from app.reviews.service import ReviewService

router = APIRouter(tags=["reviews"])


def _etag(version: int) -> str:
    return f'W/"{version}"'


def _expected_version(value: str | None) -> int:
    if not value:
        raise ApiError(428, "IF_MATCH_REQUIRED", "최신 후기 버전을 확인하는 If-Match가 필요합니다.")
    normalized = value.strip().removeprefix("W/").strip('"')
    try:
        version = int(normalized)
    except ValueError as exc:
        raise ApiError(400, "INVALID_IF_MATCH", "If-Match 값이 올바르지 않습니다.") from exc
    if version <= 0:
        raise ApiError(400, "INVALID_IF_MATCH", "If-Match 값이 올바르지 않습니다.")
    return version


@router.get("/reviews", operation_id="listReviews", response_model=ReviewPage)
def list_reviews(
    db: Annotated[Session, Depends(get_db)],
    query: Annotated[str | None, Query(max_length=100)] = None,
    tag: Annotated[str | None, Query(max_length=50)] = None,
    sort: Annotated[Literal["latest", "popular"], Query()] = "latest",
    cursor: Annotated[str | None, Query(max_length=300)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> ReviewPage:
    try:
        decoded_cursor = decode_review_cursor(cursor) if cursor else None
    except (ValueError, UnicodeDecodeError) as exc:
        raise ApiError(400, "INVALID_CURSOR", "후기 목록 커서가 올바르지 않습니다.") from exc
    service = ReviewService(db)
    reviews = service.repository.list(
        query=query, tag=tag, cursor=decoded_cursor, limit=limit, sort=sort
    )
    visible = reviews[:limit]
    next_cursor = None
    if len(reviews) > limit and visible:
        last = visible[-1]
        next_cursor = encode_review_cursor(last.created_at, last.id)
    return ReviewPage(
        items=[service.summary(review) for review in visible], next_cursor=next_cursor
    )


@router.get("/me/reviews", operation_id="listMyReviews", response_model=ReviewPage)
def list_my_reviews(
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> ReviewPage:
    service = ReviewService(db)
    reviews = service.repository.list_owned(user.id)
    return ReviewPage(items=[service.summary(review) for review in reviews])


@router.get("/reviews/{review_id}", operation_id="getReview", response_model=ReviewDetail)
def get_review(
    review_id: UUID,
    response: Response,
    user: OptionalUser,
    db: Annotated[Session, Depends(get_db)],
) -> ReviewDetail:
    detail = ReviewService(db).detail(review_id, user.id if user else None)
    response.headers["ETag"] = _etag(detail.version)
    return detail


@router.post("/reviews", operation_id="createReview", response_model=ReviewDetail, status_code=201)
def create_review(
    body: ReviewWriteRequest,
    response: Response,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> ReviewDetail:
    service = ReviewService(db)
    review = service.create(user.id, body)
    response.headers["ETag"] = _etag(review.version)
    return service.detail(review.id, user.id, increment_view=False)


@router.put("/reviews/{review_id}", operation_id="updateReview", response_model=ReviewDetail)
def update_review(
    review_id: UUID,
    body: ReviewWriteRequest,
    response: Response,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> ReviewDetail:
    service = ReviewService(db)
    review = service.update(review_id, user.id, _expected_version(if_match), body)
    response.headers["ETag"] = _etag(review.version)
    return service.detail(review.id, user.id, increment_view=False)


@router.delete("/reviews/{review_id}", operation_id="deleteReview", status_code=204)
def delete_review(
    review_id: UUID,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    ReviewService(db).delete(review_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/media/claims",
    operation_id="claimReviewMedia",
    response_model=MediaClaimResponse,
    status_code=201,
)
def claim_review_media(
    body: MediaClaimRequest,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> MediaClaimResponse:
    return ReviewService(db).claim_media(user.id, body)


@router.post(
    "/media/claims/{media_id}/complete",
    operation_id="completeReviewMedia",
    response_model=MediaCompleteResponse,
)
def complete_review_media(
    media_id: UUID,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> MediaCompleteResponse:
    return ReviewService(db).complete_media(media_id, user.id)


@router.put(
    "/reviews/{review_id}/like", operation_id="likeReview", response_model=ReviewLikeResponse
)
def like_review(
    review_id: UUID,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> ReviewLikeResponse:
    count = ReviewService(db).set_like(review_id, user.id, True)
    return ReviewLikeResponse(liked=True, like_count=count)


@router.delete(
    "/reviews/{review_id}/like", operation_id="unlikeReview", response_model=ReviewLikeResponse
)
def unlike_review(
    review_id: UUID,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> ReviewLikeResponse:
    count = ReviewService(db).set_like(review_id, user.id, False)
    return ReviewLikeResponse(liked=False, like_count=count)
