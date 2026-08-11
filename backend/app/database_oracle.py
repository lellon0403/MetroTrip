"""Oracle 읽기 전용(RO) 엔진과 세션 팩토리.

docs/DB-FAILOVER.md §4 참고. DB 계정(metrotrip_ro)이 SELECT만 가진 것이
1차 방어선이고, 여기서는 애플리케이션 코드가 실수로 flush/commit을 호출해도
즉시 예외를 던지는 2차 방어를 추가한다.
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

settings = get_settings()

oracle_engine = (
    create_engine(
        settings.oracle_ro_url,
        pool_size=2,
        max_overflow=1,
        pool_pre_ping=True,
        connect_args=settings.oracle_connect_args(),
    )
    if settings.oracle_ro_url
    else None
)


class ReadOnlySession(Session):
    """flush/commit 시도를 즉시 예외로 막는 세션."""

    def flush(self, *args, **kwargs):
        raise RuntimeError("Oracle 세션은 읽기 전용입니다. flush를 호출할 수 없습니다.")

    def commit(self):
        raise RuntimeError("Oracle 세션은 읽기 전용입니다. commit을 호출할 수 없습니다.")


OracleReadSessionLocal = (
    sessionmaker(
        bind=oracle_engine,
        class_=ReadOnlySession,
        autoflush=False,
        expire_on_commit=False,
    )
    if oracle_engine is not None
    else None
)


def get_oracle_read_session() -> Generator[Session, None, None]:
    """Oracle RO 세션을 생성한다. db_failover.get_read_db()에서만 사용한다."""
    if OracleReadSessionLocal is None:
        raise RuntimeError(
            "METROTRIP_ORACLE_RO_URL이 설정되지 않아 Oracle 폴백을 사용할 수 없습니다."
        )
    database = OracleReadSessionLocal()
    try:
        yield database
    finally:
        database.close()
