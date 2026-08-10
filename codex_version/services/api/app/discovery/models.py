from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import (
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
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database import Base


class PlaceCategory(StrEnum):
    FOOD = "FOOD"
    CAFE = "CAFE"
    CULTURE = "CULTURE"
    SHOPPING = "SHOPPING"
    NATURE = "NATURE"
    STAY = "STAY"


class PlaceDataStatus(StrEnum):
    FIXTURE = "FIXTURE"
    VERIFIED = "VERIFIED"
    STALE = "STALE"


class Place(Base):
    __tablename__ = "places"
    __table_args__ = (
        UniqueConstraint("source_name", "external_id", name="uq_place_source_id"),
        Index("ix_place_location_gist", "location", postgresql_using="gist"),
        Index("ix_place_category_name", "category", "name"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    source_name: Mapped[str] = mapped_column(String(120), nullable=False)
    external_id: Mapped[str] = mapped_column(String(160), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[PlaceCategory] = mapped_column(
        Enum(PlaceCategory, name="place_category", native_enum=True), nullable=False
    )
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    location: Mapped[object] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False
    )
    summary: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(40))
    website_url: Mapped[str | None] = mapped_column(Text)
    provider_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    data_status: Mapped[PlaceDataStatus] = mapped_column(
        Enum(PlaceDataStatus, name="place_data_status", native_enum=True), nullable=False
    )
    last_synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class FavoriteStation(Base):
    __tablename__ = "favorite_stations"
    __table_args__ = (UniqueConstraint("user_id", "station_id", name="uq_favorite_station_user"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    station_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("transit_stations.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class FavoritePlace(Base):
    __tablename__ = "favorite_places"
    __table_args__ = (UniqueConstraint("user_id", "place_id", name="uq_favorite_place_user"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    place_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("places.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PlaceSearchSync(Base):
    __tablename__ = "place_search_syncs"
    __table_args__ = (Index("ix_place_search_sync_freshness", "source_name", "synced_at"),)

    cache_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_name: Mapped[str] = mapped_column(String(120), nullable=False)
    result_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

