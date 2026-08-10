import base64
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from geoalchemy2 import Geography, Geometry
from geoalchemy2.elements import WKTElement
from geoalchemy2.functions import ST_X, ST_Y, ST_Distance
from sqlalchemy import and_, case, cast, delete, func, or_, select
from sqlalchemy.orm import Session

from app.discovery.models import (
    FavoritePlace,
    FavoriteStation,
    Place,
    PlaceCategory,
    PlaceDataStatus,
    PlaceSearchSync,
)
from app.transit.models import Station

if TYPE_CHECKING:
    from app.providers.place import ProviderPlace


def encode_place_cursor(distance: float, place_id: UUID) -> str:
    raw = f"{distance:.3f}:{place_id}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_place_cursor(cursor: str) -> tuple[float, UUID]:
    padded = cursor + "=" * (-len(cursor) % 4)
    distance, place_id = base64.urlsafe_b64decode(padded).decode().split(":", 1)
    return float(distance), UUID(place_id)


class DiscoveryRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def _point(latitude: float, longitude: float):
        return cast(
            func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326),
            Geography(geometry_type="POINT", srid=4326),
        )

    def station_coordinates(self, station_id: UUID) -> tuple[float, float] | None:
        geometry = cast(Station.location, Geometry(geometry_type="POINT", srid=4326))
        row = self.db.execute(
            select(ST_Y(geometry), ST_X(geometry)).where(Station.id == station_id)
        ).first()
        return (float(row[0]), float(row[1])) if row else None

    def nearby_places(
        self,
        *,
        latitude: float,
        longitude: float,
        radius_meters: int,
        categories: list[PlaceCategory] | None,
        query: str | None,
        bounds: tuple[float, float, float, float] | None,
        cursor: tuple[float, UUID] | None,
        limit: int,
        source_name: str | None = None,
    ) -> list[tuple[Place, float, float, float]]:
        center = self._point(latitude, longitude)
        distance = ST_Distance(Place.location, center)
        geometry = cast(Place.location, Geometry(geometry_type="POINT", srid=4326))
        statement = (
            select(Place, distance.label("distance"), ST_Y(geometry), ST_X(geometry))
            .where(func.ST_DWithin(Place.location, center, radius_meters))
            .order_by(distance, Place.id)
            .limit(limit + 1)
        )
        if source_name:
            statement = statement.where(Place.source_name == source_name)
        if categories:
            statement = statement.where(Place.category.in_(categories))
        if query:
            statement = statement.where(Place.name.ilike(f"%{query.strip()}%"))
        if bounds:
            south, west, north, east = bounds
            envelope = func.ST_MakeEnvelope(west, south, east, north, 4326)
            statement = statement.where(func.ST_Intersects(geometry, envelope))
        if cursor:
            cursor_distance, cursor_id = cursor
            statement = statement.where(
                or_(
                    distance > cursor_distance,
                    and_(distance == cursor_distance, Place.id > cursor_id),
                )
            )
        return [
            (row[0], float(row[1]), float(row[2]), float(row[3]))
            for row in self.db.execute(statement)
        ]

    def has_recent_provider_places(
        self,
        *,
        source_name: str,
        latitude: float,
        longitude: float,
        radius_meters: int,
        category: PlaceCategory | None,
        synced_after: datetime,
    ) -> bool:
        center = self._point(latitude, longitude)
        statement = select(Place.id).where(
            Place.source_name == source_name,
            Place.last_synced_at >= synced_after,
            func.ST_DWithin(Place.location, center, radius_meters),
        )
        if category:
            statement = statement.where(Place.category == category)
        return self.db.scalar(statement.limit(1)) is not None

    def has_recent_search(self, cache_key: str, synced_after: datetime) -> bool:
        return (
            self.db.scalar(
                select(PlaceSearchSync.cache_key).where(
                    PlaceSearchSync.cache_key == cache_key,
                    PlaceSearchSync.synced_at >= synced_after,
                )
            )
            is not None
        )

    def record_search_sync(
        self, cache_key: str, source_name: str, result_count: int, synced_at: datetime
    ) -> None:
        item = self.db.get(PlaceSearchSync, cache_key)
        if item is None:
            item = PlaceSearchSync(cache_key=cache_key, source_name=source_name)
            self.db.add(item)
        item.result_count = result_count
        item.synced_at = synced_at

    def upsert_provider_places(
        self,
        source_name: str,
        places: list["ProviderPlace"],
        synced_at: datetime,
    ) -> None:
        for provider_place in places:
            place = self.db.scalar(
                select(Place).where(
                    Place.source_name == source_name,
                    Place.external_id == provider_place.external_id,
                )
            )
            location = WKTElement(
                f"POINT({provider_place.longitude} {provider_place.latitude})",
                srid=4326,
            )
            if place is None:
                place = Place(
                    source_name=source_name,
                    external_id=provider_place.external_id,
                    name=provider_place.name,
                    category=provider_place.category,
                    address=provider_place.address,
                    location=location,
                    summary=provider_place.summary,
                    phone=provider_place.phone,
                    website_url=provider_place.website_url,
                    provider_payload=provider_place.payload,
                    data_status=PlaceDataStatus.VERIFIED,
                    last_synced_at=synced_at,
                )
                self.db.add(place)
                continue
            place.name = provider_place.name
            place.category = provider_place.category
            place.address = provider_place.address
            place.location = location
            place.summary = provider_place.summary
            place.phone = provider_place.phone
            place.website_url = provider_place.website_url
            place.provider_payload = provider_place.payload
            place.data_status = PlaceDataStatus.VERIFIED
            place.last_synced_at = synced_at
        self.db.commit()

    def mark_provider_places_stale(
        self,
        *,
        source_name: str,
        latitude: float,
        longitude: float,
        radius_meters: int,
        category: PlaceCategory | None,
        query: str | None,
    ) -> None:
        center = self._point(latitude, longitude)
        rows = self.db.scalars(
            select(Place).where(
                Place.source_name == source_name,
                func.ST_DWithin(Place.location, center, radius_meters),
            )
        )
        changed = False
        normalized_query = query.strip().lower() if query else None
        for place in rows:
            if category and place.category != category:
                continue
            if normalized_query and normalized_query not in place.name.lower():
                continue
            place.data_status = PlaceDataStatus.STALE
            changed = True
        if changed:
            self.db.commit()

    def featured_places(
        self, *, limit: int, popular: bool
    ) -> list[tuple[Place, float, float, int]]:
        geometry = cast(Place.location, Geometry(geometry_type="POINT", srid=4326))
        favorite_count = func.count(FavoritePlace.id)
        statement = (
            select(Place, ST_Y(geometry), ST_X(geometry), favorite_count)
            .outerjoin(FavoritePlace, FavoritePlace.place_id == Place.id)
            .group_by(Place.id)
        )
        if popular:
            statement = statement.order_by(
                favorite_count.desc(), Place.updated_at.desc(), Place.id
            )
        else:
            statement = statement.order_by(
                case(
                    (Place.data_status == PlaceDataStatus.VERIFIED, 0),
                    (Place.data_status == PlaceDataStatus.FIXTURE, 1),
                    else_=2,
                ),
                Place.updated_at.desc(),
                Place.id,
            )
        return [
            (row[0], float(row[1]), float(row[2]), int(row[3]))
            for row in self.db.execute(statement.limit(limit))
        ]

    def get_place(self, place_id: UUID) -> tuple[Place, float, float] | None:
        geometry = cast(Place.location, Geometry(geometry_type="POINT", srid=4326))
        row = self.db.execute(
            select(Place, ST_Y(geometry), ST_X(geometry)).where(Place.id == place_id)
        ).first()
        if not row:
            return None
        return row[0], float(row[1]), float(row[2])

    def add_favorite_station(self, user_id: UUID, station_id: UUID) -> None:
        exists = self.db.scalar(
            select(FavoriteStation.id).where(
                FavoriteStation.user_id == user_id, FavoriteStation.station_id == station_id
            )
        )
        if not exists:
            self.db.add(FavoriteStation(id=uuid4(), user_id=user_id, station_id=station_id))
            self.db.commit()

    def remove_favorite_station(self, user_id: UUID, station_id: UUID) -> None:
        self.db.execute(
            delete(FavoriteStation).where(
                FavoriteStation.user_id == user_id, FavoriteStation.station_id == station_id
            )
        )
        self.db.commit()

    def add_favorite_place(self, user_id: UUID, place_id: UUID) -> None:
        exists = self.db.scalar(
            select(FavoritePlace.id).where(
                FavoritePlace.user_id == user_id, FavoritePlace.place_id == place_id
            )
        )
        if not exists:
            self.db.add(FavoritePlace(id=uuid4(), user_id=user_id, place_id=place_id))
            self.db.commit()

    def remove_favorite_place(self, user_id: UUID, place_id: UUID) -> None:
        self.db.execute(
            delete(FavoritePlace).where(
                FavoritePlace.user_id == user_id, FavoritePlace.place_id == place_id
            )
        )
        self.db.commit()

    def favorite_stations(self, user_id: UUID) -> list[tuple[Station, float, float]]:
        geometry = cast(Station.location, Geometry(geometry_type="POINT", srid=4326))
        rows = self.db.execute(
            select(Station, ST_Y(geometry), ST_X(geometry))
            .join(FavoriteStation, FavoriteStation.station_id == Station.id)
            .where(FavoriteStation.user_id == user_id)
            .order_by(FavoriteStation.created_at.desc())
        )
        return [(row[0], float(row[1]), float(row[2])) for row in rows]

    def favorite_places(self, user_id: UUID) -> list[tuple[Place, float, float]]:
        geometry = cast(Place.location, Geometry(geometry_type="POINT", srid=4326))
        rows = self.db.execute(
            select(Place, ST_Y(geometry), ST_X(geometry))
            .join(FavoritePlace, FavoritePlace.place_id == Place.id)
            .where(FavoritePlace.user_id == user_id)
            .order_by(FavoritePlace.created_at.desc())
        )
        return [(row[0], float(row[1]), float(row[2])) for row in rows]
