"""여행 후기 비즈니스 로직."""

import math

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.reviews import Review, ReviewMedia
from app.repositories.reviews import ReviewRepository
from app.schemas.reviews import (
    ReviewCreateRequest,
    ReviewListResponse,
    ReviewMediaResponse,
    ReviewResponse,
    ReviewUpdateRequest,
)


def _error(code: str, message: str, status_code: int) -> HTTPException:
    """후기 오류를 공통 API 오류 형식으로 만든다."""
    return HTTPException(status_code, detail=message, headers={"X-Error-Code": code})


def _require_stations(repository: ReviewRepository, station_ids: set[int]) -> None:
    """전달한 역 ID가 모두 존재하는지 확인한다."""
    missing = station_ids - repository.existing_station_ids(station_ids)
    if missing:
        raise _error(
            "STATION_NOT_FOUND",
            f"존재하지 않는 역입니다: {sorted(missing)}",
            400,
        )


def _require_plan(repository: ReviewRepository, plan_id: int | None) -> None:
    """여행 계획 ID가 존재하는지 확인한다. None이면 검사하지 않는다."""
    if plan_id is not None and not repository.plan_exists(plan_id):
        raise _error("PLAN_NOT_FOUND", "존재하지 않는 여행 계획입니다.", 400)


def _find_owned_review(
    repository: ReviewRepository,
    review_id: int,
    user_id: int,
) -> Review:
    """후기를 조회하고 요청자가 작성자인지 확인한다."""
    review = repository.find_review_by_id(review_id)
    if not review:
        raise _error("REVIEW_NOT_FOUND", "후기를 찾을 수 없습니다.", 404)
    if review.user_id != user_id:
        raise _error(
            "REVIEW_FORBIDDEN",
            "본인이 작성한 후기만 처리할 수 있습니다.",
            403,
        )
    return review


def _to_response(
    review: Review,
    *,
    author_nickname: str,
    start_station_name: str,
    end_station_name: str,
    tags: list[str],
    media: list[ReviewMedia],
) -> ReviewResponse:
    """Review 엔티티와 부가 정보를 응답 스키마로 조립한다."""
    return ReviewResponse(
        review_id=review.review_id,
        user_id=review.user_id,
        author_nickname=author_nickname,
        title=review.title,
        content=review.content,
        start_station_id=review.start_station_id,
        start_station_name=start_station_name,
        end_station_id=review.end_station_id,
        end_station_name=end_station_name,
        rating=review.rating,
        travel_cost=review.travel_cost,
        plan_id=review.plan_id,
        view_count=review.view_count,
        tags=tags,
        media=[
            ReviewMediaResponse(
                media_id=item.media_id,
                media_url=item.media_url,
                media_type=item.media_type,
            )
            for item in media
        ],
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


def _build_responses(
    repository: ReviewRepository,
    reviews: list[Review],
) -> list[ReviewResponse]:
    """여러 후기를 작성자 닉네임, 역 이름, 태그, 미디어와 함께 일괄 조립한다."""
    if not reviews:
        return []

    review_ids = [review.review_id for review in reviews]
    user_ids = {review.user_id for review in reviews}
    station_ids = {review.start_station_id for review in reviews} | {
        review.end_station_id for review in reviews
    }
    nicknames = repository.get_user_nicknames(user_ids)
    station_names = repository.get_station_names(station_ids)
    tags_by_review = repository.list_tags(review_ids)
    media_by_review = repository.list_media(review_ids)

    return [
        _to_response(
            review,
            author_nickname=nicknames.get(review.user_id, ""),
            start_station_name=station_names.get(review.start_station_id, ""),
            end_station_name=station_names.get(review.end_station_id, ""),
            tags=tags_by_review.get(review.review_id, []),
            media=media_by_review.get(review.review_id, []),
        )
        for review in reviews
    ]


def list_reviews(
    db: Session,
    *,
    keyword: str | None,
    station_id: int | None,
    tag: str | None,
    page: int,
    size: int,
) -> ReviewListResponse:
    """검색 조건에 맞는 후기 목록을 페이지 단위로 조회한다."""
    repository = ReviewRepository(db)
    reviews, total = repository.list_reviews(
        keyword=keyword,
        station_id=station_id,
        tag=tag,
        page=page,
        size=size,
    )
    return ReviewListResponse(
        items=_build_responses(repository, reviews),
        page=page,
        size=size,
        total_elements=total,
        total_pages=math.ceil(total / size) if total else 0,
    )


def list_my_reviews(
    db: Session,
    user_id: int,
    *,
    page: int,
    size: int,
) -> ReviewListResponse:
    """현재 사용자가 작성한 후기를 최근 작성순으로 페이지 조회한다."""
    repository = ReviewRepository(db)
    reviews, total = repository.list_reviews_by_user_id(
        user_id=user_id,
        page=page,
        size=size,
    )
    return ReviewListResponse(
        items=_build_responses(repository, reviews),
        page=page,
        size=size,
        total_elements=total,
        total_pages=math.ceil(total / size) if total else 0,
    )


def create_review(
    db: Session,
    user_id: int,
    request: ReviewCreateRequest,
) -> ReviewResponse:
    """새 여행 후기를 작성한다."""
    repository = ReviewRepository(db)
    _require_stations(repository, {request.start_station_id, request.end_station_id})
    _require_plan(repository, request.plan_id)

    review = repository.create_review(
        user_id=user_id,
        title=request.title,
        content=request.content,
        start_station_id=request.start_station_id,
        end_station_id=request.end_station_id,
        rating=request.rating,
        travel_cost=request.travel_cost,
        plan_id=request.plan_id,
    )
    repository.add_tags(review.review_id, request.tags)
    repository.add_media(
        review.review_id,
        [(item.media_url, item.media_type.value) for item in request.media],
    )
    db.commit()
    db.refresh(review)
    return _build_responses(repository, [review])[0]


def get_review(db: Session, review_id: int) -> ReviewResponse:
    """후기 상세를 조회하고 조회수를 1 증가시킨다."""
    repository = ReviewRepository(db)
    review = repository.find_review_by_id(review_id)
    if not review:
        raise _error("REVIEW_NOT_FOUND", "후기를 찾을 수 없습니다.", 404)

    repository.increment_view_count(review)
    db.commit()
    db.refresh(review)
    return _build_responses(repository, [review])[0]


def update_review(
    db: Session,
    review_id: int,
    user_id: int,
    request: ReviewUpdateRequest,
) -> ReviewResponse:
    """본인이 작성한 후기를 수정한다."""
    repository = ReviewRepository(db)
    review = _find_owned_review(repository, review_id, user_id)

    fields = request.model_dump(exclude_unset=True, exclude={"tags", "media"})
    if "start_station_id" in fields or "end_station_id" in fields:
        _require_stations(
            repository,
            {
                fields.get("start_station_id", review.start_station_id),
                fields.get("end_station_id", review.end_station_id),
            },
        )
    if "plan_id" in fields:
        _require_plan(repository, fields["plan_id"])

    for name, value in fields.items():
        setattr(review, name, value)

    if request.tags is not None:
        repository.replace_tags(review_id, request.tags)
    if request.media is not None:
        repository.replace_media(
            review_id,
            [(item.media_url, item.media_type.value) for item in request.media],
        )

    db.commit()
    db.refresh(review)
    return _build_responses(repository, [review])[0]


def delete_review(db: Session, review_id: int, user_id: int) -> None:
    """본인이 작성한 후기를 삭제한다."""
    repository = ReviewRepository(db)
    review = _find_owned_review(repository, review_id, user_id)
    repository.delete_review(review)
    db.commit()
