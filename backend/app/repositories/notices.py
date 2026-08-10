"""공지사항 데이터 조회와 저장."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.notices import Notice


class NoticeRepository:
    """공지사항 관련 SQLAlchemy 작업을 담당한다."""

    def __init__(self, session: Session) -> None:
        """DB 세션을 저장한다."""
        self.session = session

    def find_notice_by_id(self, notice_id: int) -> Notice | None:
        """식별자로 공지사항을 조회한다."""
        return self.session.get(Notice, notice_id)

    def list_notices(
        self,
        *,
        notice_type: str | None,
        page: int,
        size: int,
    ) -> tuple[list[Notice], int]:
        """공지 유형별로 공지사항을 최신순으로 페이지 조회한다."""
        statement = select(Notice)
        if notice_type:
            statement = statement.where(Notice.notice_type == notice_type)

        total = (
            self.session.scalar(select(func.count()).select_from(statement.subquery()))
            or 0
        )
        items = self.session.scalars(
            statement.order_by(Notice.created_at.desc(), Notice.notice_id.desc())
            .offset((page - 1) * size)
            .limit(size)
        ).all()
        return list(items), total

    def create_notice(
        self,
        *,
        admin_id: int,
        title: str,
        content: str,
        notice_type: str,
    ) -> Notice:
        """새 공지사항을 추가하고 식별자를 할당한다."""
        notice = Notice(
            admin_id=admin_id,
            title=title,
            content=content,
            notice_type=notice_type,
        )
        self.session.add(notice)
        self.session.flush()
        return notice

    def delete_notice(self, notice: Notice) -> None:
        """공지사항을 삭제한다."""
        self.session.delete(notice)
