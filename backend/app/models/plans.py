"""여행 계획과 공유 링크 모델."""

from datetime import datetime, time

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# SQLite는 BIGINT PK를 rowid 별칭으로 취급하지 않아 자동 증가가 되지 않는다.
# MySQL(BIGINT)에는 영향 없이 SQLite 테스트에서만 INTEGER로 치환한다.
_PrimaryKeyId = BigInteger().with_variant(Integer, "sqlite")


class TravelPlan(Base):
    """사용자가 작성한 여행 동선 계획을 travel_plans 테이블에 매핑한다."""

    __tablename__ = "travel_plans"

    plan_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    plan_title: Mapped[str] = mapped_column(String(100), nullable=False)
    start_station_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("stations.station_id", ondelete="RESTRICT"),
        nullable=False,
    )
    end_station_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("stations.station_id", ondelete="RESTRICT"),
        nullable=False,
    )
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


class TravelPlanItem(Base):
    """여행 계획의 방문 장소와 시간을 travel_plan_items에 매핑한다."""

    __tablename__ = "travel_plan_items"

    plan_item_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("travel_plans.plan_id", ondelete="CASCADE"),
        nullable=False,
    )
    item_type: Mapped[str] = mapped_column(String(10), nullable=False, default="PLACE")
    place_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("places.place_id", ondelete="RESTRICT"),
    )
    station_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("stations.station_id", ondelete="SET NULL"),
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    visit_time: Mapped[time | None] = mapped_column(Time)
    memo: Mapped[str | None] = mapped_column(String(255))


class TravelPlanShareLink(Base):
    """여행 계획의 읽기 전용 공유 링크를 전용 테이블에 매핑한다."""

    __tablename__ = "travel_plan_share_links"
    __table_args__ = (
        UniqueConstraint(
            "token_hash",
            name="uk_travel_plan_share_links_token_hash",
        ),
        CheckConstraint(
            "expires_at > created_at",
            name="ck_travel_plan_share_links_expires_at",
        ),
        CheckConstraint(
            "revoked_at IS NULL OR revoked_at >= created_at",
            name="ck_travel_plan_share_links_revoked_at",
        ),
    )

    share_link_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("travel_plans.plan_id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)
