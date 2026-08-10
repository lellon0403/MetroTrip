from datetime import date, datetime, time
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database import Base


class PlanVisibility(StrEnum):
    PRIVATE = "PRIVATE"
    UNLISTED = "UNLISTED"


class PlanStatus(StrEnum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


class PlanItemType(StrEnum):
    STATION = "STATION"
    PLACE = "PLACE"
    ROUTE = "ROUTE"
    NOTE = "NOTE"


class Plan(Base):
    __tablename__ = "plans"
    __table_args__ = (
        CheckConstraint("start_date <= end_date", name="ck_plan_date_range"),
        CheckConstraint("version > 0", name="ck_plan_version_positive"),
        Index("ix_plan_owner_updated", "owner_id", "updated_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    visibility: Mapped[PlanVisibility] = mapped_column(
        Enum(PlanVisibility, name="plan_visibility", native_enum=True),
        default=PlanVisibility.PRIVATE,
        nullable=False,
    )
    status: Mapped[PlanStatus] = mapped_column(
        Enum(PlanStatus, name="plan_status", native_enum=True),
        default=PlanStatus.DRAFT,
        nullable=False,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    days: Mapped[list["PlanDay"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="PlanDay.position"
    )


class PlanDay(Base):
    __tablename__ = "plan_days"
    __table_args__ = (
        UniqueConstraint("plan_id", "position", name="uq_plan_day_position"),
        UniqueConstraint("plan_id", "day_date", name="uq_plan_day_date"),
        CheckConstraint("position > 0", name="ck_plan_day_position_positive"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    plan_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False
    )
    day_date: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str | None] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    plan: Mapped[Plan] = relationship(back_populates="days")
    items: Mapped[list["PlanItem"]] = relationship(
        back_populates="day", cascade="all, delete-orphan", order_by="PlanItem.position"
    )


class PlanItem(Base):
    __tablename__ = "plan_items"
    __table_args__ = (
        UniqueConstraint("day_id", "position", name="uq_plan_item_position"),
        CheckConstraint("position > 0", name="ck_plan_item_position_positive"),
        CheckConstraint(
            "num_nonnulls(station_id, place_id, route_snapshot) <= 1",
            name="ck_plan_item_single_context",
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    day_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("plan_days.id", ondelete="CASCADE"), nullable=False
    )
    item_type: Mapped[PlanItemType] = mapped_column(
        Enum(PlanItemType, name="plan_item_type", native_enum=True), nullable=False
    )
    station_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("transit_stations.id", ondelete="RESTRICT")
    )
    place_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("places.id", ondelete="RESTRICT")
    )
    route_snapshot: Mapped[dict | None] = mapped_column(JSONB(none_as_null=True))
    note: Mapped[str | None] = mapped_column(Text)
    scheduled_time: Mapped[time | None] = mapped_column(Time)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    day: Mapped[PlanDay] = relationship(back_populates="items")


class PlanShareLink(Base):
    __tablename__ = "plan_share_links"
    __table_args__ = (
        Index("ix_plan_share_plan_active", "plan_id", "revoked_at"),
        CheckConstraint("use_count >= 0", name="ck_share_use_count_nonnegative"),
        CheckConstraint("max_uses IS NULL OR max_uses > 0", name="ck_share_max_uses_positive"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    plan_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    max_uses: Mapped[int | None] = mapped_column(Integer)
    use_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
