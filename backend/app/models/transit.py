"""DB 명세서 V1.10 기반 노선, 역, 시간표, 장소 모델."""

from datetime import datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from app.database import Base

# SQLite는 BIGINT PK를 rowid 별칭으로 취급하지 않아 자동 증가가 되지 않는다.
# MySQL(BIGINT)에는 영향 없이 SQLite 테스트에서만 INTEGER로 치환한다.
_PrimaryKeyId = BigInteger().with_variant(Integer, "sqlite")


class _ExtendedTime(TypeDecorator[time]):
    """MySQL TIME의 24시 이후 값을 timedelta 상태로 보존한다."""

    impl = Time
    cache_ok = True

    def result_processor(self, dialect, coltype):
        """MySQL에서 기본 TIME 변환을 건너뛰어 시간 유실을 방지한다."""
        if dialect.name == "mysql":
            return None
        return self.impl_instance.result_processor(dialect, coltype)


class SubwayLine(Base):
    """지하철 노선 정보를 subway_lines 테이블에 매핑한다."""

    __tablename__ = "subway_lines"

    line_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    line_name: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
    )
    line_number: Mapped[str | None] = mapped_column(String(10))
    display_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )


class Station(Base):
    """지하철 역 정보를 stations 테이블에 매핑한다."""

    __tablename__ = "stations"

    station_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    station_name: Mapped[str] = mapped_column(String(100), nullable=False)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    address: Mapped[str | None] = mapped_column(String(255))


class LineStation(Base):
    """노선과 역의 소속 및 순서를 line_stations 테이블에 매핑한다."""

    __tablename__ = "line_stations"
    __table_args__ = (
        UniqueConstraint("line_id", "station_id", name="uk_line_stations"),
        CheckConstraint(
            "station_order >= 1",
            name="ck_line_stations_station_order",
        ),
    )

    line_station_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    line_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("subway_lines.line_id", ondelete="RESTRICT"),
        nullable=False,
    )
    station_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("stations.station_id", ondelete="RESTRICT"),
        nullable=False,
    )
    station_order: Mapped[int] = mapped_column(Integer, nullable=False)


class TrainTimetable(Base):
    """역별 열차 시간표를 train_timetables 테이블에 매핑한다."""

    __tablename__ = "train_timetables"
    __table_args__ = (
        CheckConstraint(
            "day_type IN ('WEEKDAY', 'WEEKEND')",
            name="ck_train_timetables_day_type",
        ),
        CheckConstraint(
            "direction IN ('UP', 'DOWN')",
            name="ck_train_timetables_direction",
        ),
        CheckConstraint(
            "arrival_time IS NOT NULL OR departure_time IS NOT NULL",
            name="ck_train_timetables_time",
        ),
    )

    timetable_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    train_no: Mapped[str | None] = mapped_column(String(20))
    line_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("subway_lines.line_id", ondelete="RESTRICT"),
        nullable=False,
    )
    station_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("stations.station_id", ondelete="RESTRICT"),
        nullable=False,
    )
    day_type: Mapped[str] = mapped_column(String(10), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    arrival_time: Mapped[time | timedelta | None] = mapped_column(_ExtendedTime)
    departure_time: Mapped[time | timedelta | None] = mapped_column(_ExtendedTime)
    destination_station_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("stations.station_id", ondelete="SET NULL"),
    )


class Place(Base):
    """추천 장소 정보를 places 테이블에 매핑한다."""

    __tablename__ = "places"
    __table_args__ = (
        CheckConstraint(
            "category IN ('TOUR', 'RESTAURANT', 'CAFE', 'SHOPPING', 'ETC')",
            name="ck_places_category",
        ),
    )

    place_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    place_name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    created_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="SET NULL"),
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


class PlaceStation(Base):
    """추천 장소와 반경 1km 내 역의 관계를 매핑한다."""

    __tablename__ = "place_stations"

    place_station_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    place_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("places.place_id", ondelete="CASCADE"),
        nullable=False,
    )
    station_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("stations.station_id", ondelete="RESTRICT"),
        nullable=False,
    )


class PlaceImage(Base):
    """추천 장소의 이미지와 표시 순서를 place_images 테이블에 매핑한다."""

    __tablename__ = "place_images"
    __table_args__ = (
        UniqueConstraint(
            "place_id",
            "sort_order",
            name="uk_place_images_order",
        ),
        CheckConstraint("sort_order >= 1", name="ck_place_images_sort_order"),
    )

    place_image_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    place_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("places.place_id", ondelete="CASCADE"),
        nullable=False,
    )
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)


class LineViewLog(Base):
    """노선 조회 기록을 line_view_logs 테이블에 매핑한다."""

    __tablename__ = "line_view_logs"

    log_id: Mapped[int] = mapped_column(_PrimaryKeyId, primary_key=True)
    line_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("subway_lines.line_id", ondelete="RESTRICT"),
        nullable=False,
    )
    user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="SET NULL"),
    )
    viewed_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        nullable=False,
    )
