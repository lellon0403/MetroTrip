"""회원 부가 기능 모델."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# SQLite는 BIGINT PK를 rowid 별칭으로 취급하지 않아 자동 증가가 되지 않는다.
# MySQL(BIGINT)에는 영향 없이 SQLite 테스트에서만 INTEGER로 치환한다.
_PrimaryKeyId = BigInteger().with_variant(Integer, "sqlite")


class StationFavorite(Base):
    """사용자와 즐겨찾기한 역의 관계를 station_favorites 테이블에 매핑한다."""

    __tablename__ = "station_favorites"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "station_id",
            name="uk_favorites_user_station",
        ),
    )

    favorite_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    station_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("stations.station_id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        nullable=False,
    )
