from __future__ import annotations

import base64
from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.orm import Session, selectinload

from app.reviews.models import (
    MediaAsset,
    Review,
    ReviewLike,
    ReviewMedia,
    ReviewPlaceRating,
    ReviewStatus,
    ReviewTag,
    Tag,
)


def encode_review_cursor(created_at: datetime, review_id: UUID) -> str:
    raw = f"{created_at.isoformat()}|{review_id}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_review_cursor(cursor: str) -> tuple[datetime, UUID]:
    padded = cursor + "=" * (-len(cursor) % 4)
    created_at, review_id = base64.urlsafe_b64decode(padded).decode().split("|", 1)
    return datetime.fromisoformat(created_at), UUID(review_id)


class ReviewRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def _with_relations():
        return (
            selectinload(Review.tags).selectinload(ReviewTag.tag),
            selectinload(Review.media).selectinload(ReviewMedia.asset),
            selectinload(Review.place_ratings).selectinload(ReviewPlaceRating.place),
        )

    def get(self, review_id: UUID, *, for_update: bool = False) -> Review | None:
        statement = (
            select(Review)
            .options(*self._with_relations())
            .where(Review.id == review_id, Review.deleted_at.is_(None))
        )
        if for_update:
            statement = statement.with_for_update()
        return self.db.scalar(statement)

    def list(
        self,
        *,
        query: str | None,
        tag: str | None,
        cursor: tuple[datetime, UUID] | None,
        limit: int,
        sort: str,
    ) -> list[Review]:
        statement = (
            select(Review)
            .options(*self._with_relations())
            .where(Review.status == ReviewStatus.PUBLISHED, Review.deleted_at.is_(None))
        )
        if query:
            pattern = f"%{query.strip()}%"
            statement = statement.where(
                or_(Review.title.ilike(pattern), Review.excerpt.ilike(pattern))
            )
        if tag:
            statement = statement.where(
                Review.tags.any(ReviewTag.tag.has(Tag.slug == tag.casefold()))
            )
        if cursor:
            created_at, review_id = cursor
            statement = statement.where(
                or_(
                    Review.created_at < created_at,
                    and_(Review.created_at == created_at, Review.id < review_id),
                )
            )
        if sort == "popular":
            like_count = (
                select(func.count(ReviewLike.id))
                .where(ReviewLike.review_id == Review.id)
                .correlate(Review)
                .scalar_subquery()
            )
            statement = statement.order_by(
                like_count.desc(), Review.created_at.desc(), Review.id.desc()
            )
        else:
            statement = statement.order_by(Review.created_at.desc(), Review.id.desc())
        return list(self.db.scalars(statement.limit(limit + 1)).unique())

    def list_owned(self, author_id: UUID, limit: int = 100) -> list[Review]:
        statement = (
            select(Review)
            .options(*self._with_relations())
            .where(Review.author_id == author_id, Review.deleted_at.is_(None))
            .order_by(Review.created_at.desc(), Review.id.desc())
            .limit(limit)
        )
        return list(self.db.scalars(statement).unique())

    def increment_view(self, review_id: UUID) -> None:
        self.db.execute(
            update(Review).where(Review.id == review_id).values(view_count=Review.view_count + 1)
        )

    def like_count(self, review_id: UUID) -> int:
        return int(
            self.db.scalar(
                select(func.count(ReviewLike.id)).where(ReviewLike.review_id == review_id)
            )
            or 0
        )

    def liked(self, review_id: UUID, user_id: UUID | None) -> bool:
        if user_id is None:
            return False
        return (
            self.db.scalar(
                select(ReviewLike.id).where(
                    ReviewLike.review_id == review_id, ReviewLike.user_id == user_id
                )
            )
            is not None
        )

    def add_like(self, review_id: UUID, user_id: UUID) -> None:
        if not self.liked(review_id, user_id):
            self.db.add(ReviewLike(review_id=review_id, user_id=user_id))

    def remove_like(self, review_id: UUID, user_id: UUID) -> None:
        self.db.execute(
            delete(ReviewLike).where(
                ReviewLike.review_id == review_id, ReviewLike.user_id == user_id
            )
        )

    def get_media_for_update(self, media_id: UUID) -> MediaAsset | None:
        return self.db.scalar(select(MediaAsset).where(MediaAsset.id == media_id).with_for_update())
