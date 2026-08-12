"""공통 인증 의존성(contract.py) 테스트."""

from collections.abc import Iterator

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.models.auth import User
from app.routers import contract


@pytest.fixture
def db() -> Iterator[Session]:
    """SQLite 인메모리 세션에 관리자·일반 회원을 채워 반환한다."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = session_factory()
    try:
        session.add_all(
            [
                User(
                    user_id=1,
                    email="admin@example.com",
                    password="hashed",
                    name="관리자",
                    nickname="관리자닉",
                    role="ADMIN",
                ),
                User(
                    user_id=2,
                    email="member@example.com",
                    password="hashed",
                    name="회원",
                    nickname="회원닉",
                    role="USER",
                ),
            ]
        )
        session.commit()
        yield session
    finally:
        session.close()


def test_get_current_admin_id_allows_admin(db: Session) -> None:
    assert contract.get_current_admin_id(1, db) == 1


def test_get_current_admin_id_rejects_regular_user(db: Session) -> None:
    with pytest.raises(HTTPException) as exc_info:
        contract.get_current_admin_id(2, db)

    assert exc_info.value.status_code == 403
    assert exc_info.value.headers["X-Error-Code"] == "ADMIN_ONLY"


def test_get_current_admin_id_rejects_unknown_user(db: Session) -> None:
    with pytest.raises(HTTPException) as exc_info:
        contract.get_current_admin_id(999, db)

    assert exc_info.value.status_code == 403
    assert exc_info.value.headers["X-Error-Code"] == "ADMIN_ONLY"
