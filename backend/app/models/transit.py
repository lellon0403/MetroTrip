"""DB 명세서 V1.10 기반 지하철 역 모델."""

from decimal import Decimal

from sqlalchemy import BigInteger, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# SQLite는 BIGINT PK를 rowid 별칭으로 취급하지 않아 자동 증가가 되지 않는다.
# MySQL(BIGINT)에는 영향 없이 SQLite 테스트에서만 INTEGER로 치환한다.
_PrimaryKeyId = BigInteger().with_variant(Integer, "sqlite")


class Station(Base):
    """지하철 역 정보를 stations 테이블에 매핑한다."""

    __tablename__ = "stations"

    station_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    station_name: Mapped[str] = mapped_column(String(100), nullable=False)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    address: Mapped[str | None] = mapped_column(String(255))
