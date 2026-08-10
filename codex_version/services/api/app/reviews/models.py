from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database import Base


class ReviewStatus(StrEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    HIDDEN = "HIDDEN"


class MediaStatus(StrEnum):
    CLAIMED = "CLAIMED"
    UPLOADED = "UPLOADED"
    ATTACHED = "ATTACHED"
    REJECTED = "REJECTED"


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint("rating_twice >= 2 AND rating_twice <= 10", name="ck_review_rating_range"),
        CheckConstraint("version > 0", name="ck_review_version_positive"),
        CheckConstraint("view_count >= 0", name="ck_review_views_nonnegative"),
        Index("ix_review_status_created", "status", "created_at"),
        Index("ix_review_author_created", "author_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    author_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    plan_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("plans.id", ondelete="SET NULL")
    )
    cover_media_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("media_assets.id", ondelete="SET NULL")
    )
    origin_station_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("transit_stations.id", ondelete="RESTRICT"), nullable=False
    )
    destination_station_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("transit_stations.id", ondelete="RESTRICT"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    excerpt: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[list[dict]] = mapped_column(JSONB, nullable=False)
    rating_twice: Mapped[int] = mapped_column(Integer, nullable=False)
    travel_date: Mapped[date] = mapped_column(Date, nullable=False)
    cost_won: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[ReviewStatus] = mapped_column(
        Enum(ReviewStatus, name="review_status", native_enum=True),
        default=ReviewStatus.PUBLISHED,
        nullable=False,
    )
    view_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    tags: Mapped[list["ReviewTag"]] = relationship(
        back_populates="review", cascade="all, delete-orphan"
    )
    media: Mapped[list["ReviewMedia"]] = relationship(
        back_populates="review", cascade="all, delete-orphan", order_by="ReviewMedia.position"
    )
    place_ratings: Mapped[list["ReviewPlaceRating"]] = relationship(
        back_populates="review", cascade="all, delete-orphan"
    )

    @property
    def rating(self) -> Decimal:
        return Decimal(self.rating_twice) / 2

    @rating.setter
    def rating(self, value: Decimal) -> None:
        self.rating_twice = int(value * 2)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ReviewTag(Base):
    __tablename__ = "review_tags"

    review_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("reviews.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )

    review: Mapped[Review] = relationship(back_populates="tags")
    tag: Mapped[Tag] = relationship()


class MediaAsset(Base):
    __tablename__ = "media_assets"
    __table_args__ = (
        CheckConstraint("size_bytes > 0", name="ck_media_size_positive"),
        Index("ix_media_owner_status", "owner_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    object_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum_sha256: Mapped[str | None] = mapped_column(String(64))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[MediaStatus] = mapped_column(
        Enum(MediaStatus, name="media_status", native_enum=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReviewMedia(Base):
    __tablename__ = "review_media"
    __table_args__ = (
        UniqueConstraint("review_id", "position", name="uq_review_media_position"),
        UniqueConstraint("media_id", name="uq_review_media_asset"),
        CheckConstraint("position > 0", name="ck_review_media_position_positive"),
    )

    review_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("reviews.id", ondelete="CASCADE"), primary_key=True
    )
    media_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("media_assets.id", ondelete="RESTRICT"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    alt_text: Mapped[str] = mapped_column(String(300), nullable=False)

    review: Mapped[Review] = relationship(back_populates="media")
    asset: Mapped[MediaAsset] = relationship()


class ReviewPlaceRating(Base):
    __tablename__ = "review_place_ratings"
    __table_args__ = (
        CheckConstraint("rating_twice >= 2 AND rating_twice <= 10", name="ck_review_place_rating_range"),
    )

    review_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("reviews.id", ondelete="CASCADE"), primary_key=True
    )
    place_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("places.id", ondelete="RESTRICT"), primary_key=True
    )
    rating_twice: Mapped[int] = mapped_column(Integer, nullable=False)

    review: Mapped[Review] = relationship(back_populates="place_ratings")
    place: Mapped["Place"] = relationship()


class ReviewLike(Base):
    __tablename__ = "review_likes"
    __table_args__ = (UniqueConstraint("review_id", "user_id", name="uq_review_like_user"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    review_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
