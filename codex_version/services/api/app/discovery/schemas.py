from datetime import datetime
from uuid import UUID

from pydantic import Field, HttpUrl

from app.core.schemas import ApiModel
from app.discovery.models import PlaceCategory, PlaceDataStatus
from app.transit.schemas import StationSummary


class Coordinates(ApiModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class PlaceSummary(ApiModel):
    id: UUID
    name: str
    category: PlaceCategory
    address: str
    latitude: float
    longitude: float
    distance_meters: float | None = None
    data_status: PlaceDataStatus
    favorite_count: int = 0


class PlaceDetail(PlaceSummary):
    summary: str | None
    phone: str | None
    website_url: HttpUrl | None
    source_name: str
    last_synced_at: datetime


class PlacePage(ApiModel):
    items: list[PlaceSummary]
    next_cursor: str | None = None
    radius_meters: int
    source_mode: str


class FavoriteCollection(ApiModel):
    stations: list[StationSummary]
    places: list[PlaceSummary]


class FavoriteMutation(ApiModel):
    favorited: bool
