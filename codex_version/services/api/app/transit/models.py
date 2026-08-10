from datetime import date, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database import Base


class ImportStatus(StrEnum):
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class ServiceExceptionKind(StrEnum):
    ADDED = "ADDED"
    REMOVED = "REMOVED"


class ImportRun(Base):
    __tablename__ = "transit_import_runs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    source_name: Mapped[str] = mapped_column(String(120), nullable=False)
    source_version: Mapped[str] = mapped_column(String(120), nullable=False)
    source_uri: Mapped[str | None] = mapped_column(Text)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[ImportStatus] = mapped_column(
        Enum(ImportStatus, name="transit_import_status", native_enum=True), nullable=False
    )
    validation_result: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    imported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Line(Base):
    __tablename__ = "transit_lines"
    __table_args__ = (UniqueConstraint("source_name", "external_id", name="uq_line_source_id"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    source_name: Mapped[str] = mapped_column(String(120), nullable=False)
    external_id: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    short_name: Mapped[str] = mapped_column(String(40), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False)
    text_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#FFFFFF")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    stations: Mapped[list["Station"]] = relationship(back_populates="line")


class Station(Base):
    __tablename__ = "transit_stations"
    __table_args__ = (
        UniqueConstraint("source_name", "external_id", name="uq_station_source_id"),
        UniqueConstraint("line_id", "sequence", name="uq_station_line_sequence"),
        CheckConstraint("sequence > 0", name="ck_station_sequence_positive"),
        Index("ix_station_location_gist", "location", postgresql_using="gist"),
        Index("ix_station_name", "name"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    line_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("transit_lines.id", ondelete="RESTRICT"), nullable=False
    )
    source_name: Mapped[str] = mapped_column(String(120), nullable=False)
    external_id: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    location: Mapped[object] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    line: Mapped[Line] = relationship(back_populates="stations")
    stop_times: Mapped[list["StopTime"]] = relationship(back_populates="station")


class ServiceCalendar(Base):
    __tablename__ = "service_calendars"
    __table_args__ = (
        UniqueConstraint("source_name", "external_id", name="uq_calendar_source_id"),
        CheckConstraint("start_date <= end_date", name="ck_calendar_date_range"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    source_name: Mapped[str] = mapped_column(String(120), nullable=False)
    external_id: Mapped[str] = mapped_column(String(120), nullable=False)
    monday: Mapped[bool] = mapped_column(Boolean, nullable=False)
    tuesday: Mapped[bool] = mapped_column(Boolean, nullable=False)
    wednesday: Mapped[bool] = mapped_column(Boolean, nullable=False)
    thursday: Mapped[bool] = mapped_column(Boolean, nullable=False)
    friday: Mapped[bool] = mapped_column(Boolean, nullable=False)
    saturday: Mapped[bool] = mapped_column(Boolean, nullable=False)
    sunday: Mapped[bool] = mapped_column(Boolean, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)


class ServiceException(Base):
    __tablename__ = "service_exceptions"
    __table_args__ = (
        UniqueConstraint("calendar_id", "service_date", name="uq_service_exception_date"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    calendar_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("service_calendars.id", ondelete="CASCADE"), nullable=False
    )
    service_date: Mapped[date] = mapped_column(Date, nullable=False)
    kind: Mapped[ServiceExceptionKind] = mapped_column(
        Enum(ServiceExceptionKind, name="service_exception_kind", native_enum=True),
        nullable=False,
    )


class Trip(Base):
    __tablename__ = "transit_trips"
    __table_args__ = (
        UniqueConstraint("source_name", "external_id", name="uq_trip_source_id"),
        CheckConstraint("direction IN (0, 1)", name="ck_trip_direction"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    line_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("transit_lines.id", ondelete="RESTRICT"), nullable=False
    )
    calendar_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("service_calendars.id", ondelete="RESTRICT"),
        nullable=False,
    )
    source_name: Mapped[str] = mapped_column(String(120), nullable=False)
    external_id: Mapped[str] = mapped_column(String(120), nullable=False)
    headsign: Mapped[str] = mapped_column(String(120), nullable=False)
    direction: Mapped[int] = mapped_column(Integer, nullable=False)

    stop_times: Mapped[list["StopTime"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )


class StopTime(Base):
    __tablename__ = "transit_stop_times"
    __table_args__ = (
        UniqueConstraint("trip_id", "stop_sequence", name="uq_stop_time_trip_sequence"),
        CheckConstraint("stop_sequence > 0", name="ck_stop_time_sequence_positive"),
        CheckConstraint("arrival_offset_seconds >= 0", name="ck_arrival_offset_nonnegative"),
        CheckConstraint(
            "departure_offset_seconds >= arrival_offset_seconds", name="ck_departure_offset"
        ),
        Index("ix_stop_time_station_departure", "station_id", "departure_offset_seconds"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    trip_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("transit_trips.id", ondelete="CASCADE"), nullable=False
    )
    station_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("transit_stations.id", ondelete="RESTRICT"), nullable=False
    )
    stop_sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    arrival_offset_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    departure_offset_seconds: Mapped[int] = mapped_column(Integer, nullable=False)

    trip: Mapped[Trip] = relationship(back_populates="stop_times")
    station: Mapped[Station] = relationship(back_populates="stop_times")
