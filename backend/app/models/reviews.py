"""DB 명세서 V1.8 기반 여행 후기 모델."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# SQLite는 BIGINT PK를 rowid 별칭으로 취급하지 않아 자동 증가가 되지 않는다.
# MySQL(BIGINT)에는 영향 없이 SQLite 테스트에서만 INTEGER로 치환한다.
_PrimaryKeyId = BigInteger().with_variant(Integer, "sqlite")


class Review(Base):
    """여행 후기를 reviews 테이블에 매핑한다.

    start_station_id/end_station_id/plan_id는 각각 stations, travel_plans를
    참조하지만 해당 도메인의 모델이 아직 없으므로 ORM 레벨 FK는 선언하지 않는다.
    실제 참조 무결성은 DB 스키마(schema_V1.8.sql)의 FK 제약이 담당한다.
    """

    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 10", name="ck_reviews_rating"),
        CheckConstraint("travel_cost >= 0", name="ck_reviews_travel_cost"),
        CheckConstraint("view_count >= 0", name="ck_reviews_view_count"),
    )

    review_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    start_station_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    end_station_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    travel_cost: Mapped[int | None] = mapped_column(Integer)
    plan_id: Mapped[int | None] = mapped_column(BigInteger)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
        nullable=False,
    )


class ReviewMedia(Base):
    """후기 첨부 미디어를 review_media 테이블에 매핑한다."""

    __tablename__ = "review_media"
    __table_args__ = (
        CheckConstraint(
            "media_type IN ('IMAGE', 'VIDEO')",
            name="ck_review_media_media_type",
        ),
    )

    media_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    review_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("reviews.review_id", ondelete="CASCADE"),
        nullable=False,
    )
    media_url: Mapped[str] = mapped_column(String(500), nullable=False)
    media_type: Mapped[str] = mapped_column(String(10), nullable=False)


class ReviewTag(Base):
    """후기 태그를 review_tags 테이블에 매핑한다."""

    __tablename__ = "review_tags"
    __table_args__ = (UniqueConstraint("review_id", "tag_name", name="uk_review_tags"),)

    review_tag_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    review_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("reviews.review_id", ondelete="CASCADE"),
        nullable=False,
    )
    tag_name: Mapped[str] = mapped_column(String(30), nullable=False)
