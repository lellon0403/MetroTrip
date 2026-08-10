from dataclasses import dataclass
from uuid import UUID

from geoalchemy2 import Geography, Geometry
from geoalchemy2.functions import ST_X, ST_Y, ST_Distance
from sqlalchemy import cast, func, select
from sqlalchemy.orm import Session

from app.discovery.models import Place
from app.routing.schemas import RoutePointInput, RoutePointType
from app.transit.models import Line, Station


@dataclass(frozen=True)
class ResolvedPoint:
    label: str
    latitude: float
    longitude: float
    station_id: UUID | None = None
    station_sequence: int | None = None
    line_name: str | None = None


class RoutingRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def _geometry(location):
        return cast(location, Geometry(geometry_type="POINT", srid=4326))

    @staticmethod
    def _geography(latitude: float, longitude: float):
        return cast(
            func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326),
            Geography(geometry_type="POINT", srid=4326),
        )

    def resolve(self, point: RoutePointInput) -> ResolvedPoint | None:
        if point.type is RoutePointType.COORDINATE:
            return ResolvedPoint(
                label=point.label or "선택한 위치",
                latitude=float(point.latitude),
                longitude=float(point.longitude),
            )
        if point.type is RoutePointType.STATION:
            geometry = self._geometry(Station.location)
            row = self.db.execute(
                select(Station, Line, ST_Y(geometry), ST_X(geometry))
                .join(Line, Line.id == Station.line_id)
                .where(Station.id == point.id)
            ).first()
            if not row:
                return None
            station, line, latitude, longitude = row
            return ResolvedPoint(
                label=station.name,
                latitude=float(latitude),
                longitude=float(longitude),
                station_id=station.id,
                station_sequence=station.sequence,
                line_name=line.name,
            )
        geometry = self._geometry(Place.location)
        row = self.db.execute(
            select(Place, ST_Y(geometry), ST_X(geometry)).where(Place.id == point.id)
        ).first()
        if not row:
            return None
        place, latitude, longitude = row
        return ResolvedPoint(
            label=place.name,
            latitude=float(latitude),
            longitude=float(longitude),
        )

    def nearest_station(self, point: ResolvedPoint) -> tuple[ResolvedPoint, float] | None:
        if point.station_id:
            return point, 0.0
        center = self._geography(point.latitude, point.longitude)
        distance = ST_Distance(Station.location, center)
        geometry = self._geometry(Station.location)
        row = self.db.execute(
            select(Station, Line, ST_Y(geometry), ST_X(geometry), distance)
            .join(Line, Line.id == Station.line_id)
            .where(Station.is_active.is_(True))
            .order_by(distance)
            .limit(1)
        ).first()
        if not row:
            return None
        station, line, latitude, longitude, meters = row
        return (
            ResolvedPoint(
                label=station.name,
                latitude=float(latitude),
                longitude=float(longitude),
                station_id=station.id,
                station_sequence=station.sequence,
                line_name=line.name,
            ),
            float(meters),
        )
