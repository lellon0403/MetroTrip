from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database import Base


class RecruitmentStatus(StrEnum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    CANCELED = "CANCELED"


class ApplicationStatus(StrEnum):
    APPLIED = "APPLIED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    CANCELED = "CANCELED"


class RecruitmentCommentKind(StrEnum):
    QUESTION = "QUESTION"
    APPLICATION = "APPLICATION"


class Recruitment(Base):
    __tablename__ = "recruitments"
    __table_args__ = (
        CheckConstraint("capacity > 0 AND capacity <= 50", name="ck_recruitment_capacity"),
        CheckConstraint(
            "accepted_count >= 0 AND accepted_count <= capacity", name="ck_recruitment_accepted"
        ),
        CheckConstraint("version > 0", name="ck_recruitment_version"),
        Index("ix_recruitment_status_meeting", "status", "meeting_at"),
        Index("ix_recruitment_owner_created", "owner_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    plan_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("plans.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    accepted_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    meeting_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[RecruitmentStatus] = mapped_column(
        Enum(RecruitmentStatus, name="recruitment_status", native_enum=True),
        nullable=False,
        default=RecruitmentStatus.OPEN,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    applications: Mapped[list["RecruitmentApplication"]] = relationship(
        back_populates="recruitment", cascade="all, delete-orphan"
    )
    comments: Mapped[list["RecruitmentComment"]] = relationship(
        back_populates="recruitment", cascade="all, delete-orphan", order_by="RecruitmentComment.created_at"
    )


class RecruitmentApplication(Base):
    __tablename__ = "recruitment_applications"
    __table_args__ = (
        UniqueConstraint("recruitment_id", "applicant_id", name="uq_recruitment_applicant"),
        Index("ix_application_applicant_status", "applicant_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    recruitment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("recruitments.id", ondelete="CASCADE"), nullable=False
    )
    applicant_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    message: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus, name="application_status", native_enum=True),
        nullable=False,
        default=ApplicationStatus.APPLIED,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    recruitment: Mapped[Recruitment] = relationship(back_populates="applications")


class RecruitmentComment(Base):
    __tablename__ = "recruitment_comments"
    __table_args__ = (Index("ix_recruitment_comment_created", "recruitment_id", "created_at"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    recruitment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("recruitments.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    kind: Mapped[RecruitmentCommentKind] = mapped_column(
        Enum(RecruitmentCommentKind, name="recruitment_comment_kind", native_enum=True), nullable=False
    )
    body: Mapped[str] = mapped_column(String(1000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    recruitment: Mapped[Recruitment] = relationship(back_populates="comments")


class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    __table_args__ = (
        CheckConstraint("schema_version > 0", name="ck_outbox_schema_version"),
        CheckConstraint("attempts >= 0", name="ck_outbox_attempts"),
        Index(
            "ix_outbox_pending",
            "available_at",
            "occurred_at",
            postgresql_where=text("processed_at IS NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    aggregate_type: Mapped[str] = mapped_column(String(80), nullable=False)
    aggregate_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
