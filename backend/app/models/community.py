"""모집 게시판 모델."""

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
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


class BoardPost(Base):
    """인원 모집 게시글을 board_posts 테이블에 매핑한다.

    plan_id는 DB 삭제 정책에 따라 travel_plans를 선택적으로 참조한다.
    """

    __tablename__ = "board_posts"
    __table_args__ = (
        CheckConstraint("view_count >= 0", name="ck_board_posts_view_count"),
        CheckConstraint(
            "recruit_capacity >= 1", name="ck_board_posts_recruit_capacity"
        ),
        CheckConstraint(
            "recruit_status IN ('RECRUITING', 'CLOSED')",
            name="ck_board_posts_recruit_status",
        ),
    )

    post_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    recruit_capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    recruit_deadline: Mapped[date] = mapped_column(Date, nullable=False)
    recruit_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="RECRUITING",
    )
    meeting_date: Mapped[date | None] = mapped_column(Date)
    plan_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("travel_plans.plan_id", ondelete="SET NULL"),
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


class PostParticipant(Base):
    """모집 참여 신청을 post_participants 테이블에 매핑한다."""

    __tablename__ = "post_participants"
    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uk_post_participants"),
        CheckConstraint(
            "status IN ('APPLIED', 'ACCEPTED', 'REJECTED', 'CANCELED')",
            name="ck_post_participants_status",
        ),
    )

    participant_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    post_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("board_posts.post_id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(20), default="APPLIED", nullable=False)
    applied_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        nullable=False,
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime)
