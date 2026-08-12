"""공지사항 서비스 계층 테스트."""

from collections.abc import Iterator

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.models.auth import User
from app.schemas.notices import NoticeType, NoticeUpdateRequest, NoticeUpsertRequest
from app.services import notices as notice_service


@pytest.fixture
def db() -> Iterator[Session]:
    """SQLite 인메모리 세션에 관리자 두 명을 채워 반환한다."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = session_factory()
    try:
        session.add_all(
            [
                User(
                    user_id=1,
                    email="admin1@example.com",
                    password="hashed",
                    name="관리자1",
                    nickname="관리자1닉",
                    role="ADMIN",
                ),
                User(
                    user_id=2,
                    email="admin2@example.com",
                    password="hashed",
                    name="관리자2",
                    nickname="관리자2닉",
                    role="ADMIN",
                ),
            ]
        )
        session.commit()
        yield session
    finally:
        session.close()


def _create_request(**overrides: object) -> NoticeUpsertRequest:
    payload = {
        "title": "정기 점검 안내",
        "content": "오늘 새벽 2시부터 4시까지 점검이 진행됩니다.",
        "notice_type": NoticeType.BOARD,
    }
    payload.update(overrides)
    return NoticeUpsertRequest(**payload)


def test_create_notice_persists_admin_and_fields(db: Session) -> None:
    created = notice_service.create_notice(db, 1, _create_request())

    assert created.admin_id == 1
    assert created.title == "정기 점검 안내"
    assert created.notice_type is NoticeType.BOARD


def test_get_notice_returns_created_notice(db: Session) -> None:
    created = notice_service.create_notice(db, 1, _create_request())

    fetched = notice_service.get_notice(db, created.notice_id)

    assert fetched.notice_id == created.notice_id
    assert fetched.content == created.content


def test_get_notice_missing_raises_404(db: Session) -> None:
    with pytest.raises(HTTPException) as exc_info:
        notice_service.get_notice(db, 999)

    assert exc_info.value.status_code == 404
    assert exc_info.value.headers["X-Error-Code"] == "NOTICE_NOT_FOUND"


def test_list_notices_filters_by_type(db: Session) -> None:
    notice_service.create_notice(
        db, 1, _create_request(title="알림형 공지", notice_type=NoticeType.ALARM)
    )
    notice_service.create_notice(
        db, 1, _create_request(title="게시판형 공지", notice_type=NoticeType.BOARD)
    )

    result = notice_service.list_notices(
        db, notice_type=NoticeType.ALARM, page=1, size=20
    )

    assert result.total_elements == 1
    assert result.items[0].title == "알림형 공지"


def test_list_notices_orders_by_latest_first(db: Session) -> None:
    first = notice_service.create_notice(db, 1, _create_request(title="첫 공지"))
    second = notice_service.create_notice(db, 1, _create_request(title="둘째 공지"))

    result = notice_service.list_notices(db, notice_type=None, page=1, size=20)

    assert [item.notice_id for item in result.items] == [
        second.notice_id,
        first.notice_id,
    ]


def test_update_notice_by_different_admin_succeeds(db: Session) -> None:
    """관리자면 작성자가 아니어도 공지를 수정할 수 있다."""
    created = notice_service.create_notice(db, 1, _create_request())

    updated = notice_service.update_notice(
        db, created.notice_id, NoticeUpdateRequest(title="수정된 제목")
    )

    assert updated.title == "수정된 제목"
    assert updated.admin_id == 1


def test_delete_notice_by_different_admin_succeeds(db: Session) -> None:
    """관리자면 작성자가 아니어도 공지를 삭제할 수 있다."""
    created = notice_service.create_notice(db, 1, _create_request())

    notice_service.delete_notice(db, created.notice_id)

    with pytest.raises(HTTPException) as exc_info:
        notice_service.get_notice(db, created.notice_id)
    assert exc_info.value.status_code == 404
