"""기본 데이터베이스 엔진과 요청 단위 세션 관리."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    """모든 SQLAlchemy ORM 모델이 상속하는 선언형 기본 클래스."""

    pass


settings = get_settings()

engine = create_engine(
      settings.database_url,
      connect_args=settings.mysql_connect_args(),
      pool_size=3,
      max_overflow=2,
      pool_pre_ping=True,
  )
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    """요청에 데이터베이스 세션을 제공하고 사용 후 닫는다."""

    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()
