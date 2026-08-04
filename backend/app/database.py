from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()

connect_args = {}

if settings.ssl_ca_path:
    connect_args["ssl"] = {
        "ca": settings.ssl_ca_path,
    }

engine = create_engine(
      settings.database_url,
      connect_args=connect_args,
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
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()
