import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.schemas import ApiModel
from app.discovery.models import Place, PlaceCategory
from app.discovery.repository import DiscoveryRepository, decode_place_cursor, encode_place_cursor
from app.discovery.schemas import (
    FavoriteCollection,
    FavoriteMutation,
    PlaceDetail,
    PlacePage,
    PlaceSummary,
)
from app.identity.dependencies import CurrentUser
from app.infrastructure.database import get_db
from app.providers.map import DevelopmentMapProvider, KakaoMapProvider
from app.providers.place import KakaoPlaceProvider, PlaceProviderError
from app.transit.repository import TransitRepository
from app.transit.schemas import StationSummary

router = APIRouter(tags=["discovery"])


class ProviderStatus(ApiModel):
    map_provider: str
    map_mode: str
    place_provider: str
    place_mode: str
    realtime_transit: bool


def _place_summary(
    place: Place,
    latitude: float,
    longitude: float,
    distance: float | None = None,
    favorite_count: int = 0,
) -> PlaceSummary:
    return PlaceSummary(
        id=place.id,
        name=place.name,
        category=place.category,
        address=place.address,
        latitude=latitude,
        longitude=longitude,
        favorite_count=favorite_count,
        distance_meters=round(distance, 1) if distance is not None else None,
        data_status=place.data_status,
    )


@router.get("/providers/status", operation_id="getProviderStatus", response_model=ProviderStatus)
def get_provider_status() -> ProviderStatus:
    settings = get_settings()
    map_config = (
        KakaoMapProvider().configuration()
        if settings.provider_mode == "kakao"
        else DevelopmentMapProvider().configuration()
    )
    return ProviderStatus(
        map_provider=map_config.provider,
        map_mode=map_config.mode,
        place_provider="kakao-local" if settings.provider_mode == "kakao" else "fixture-db",
        place_mode="REAL" if settings.provider_mode == "kakao" else "MOCKED",
        realtime_transit=False,
    )


@router.get("/places/nearby", operation_id="searchNearbyPlaces", response_model=PlacePage)
def search_nearby_places(
    db: Annotated[Session, Depends(get_db)],
    station_id: Annotated[UUID | None, Query()] = None,
    latitude: Annotated[float | None, Query(ge=-90, le=90)] = None,
    longitude: Annotated[float | None, Query(ge=-180, le=180)] = None,
    radius_meters: Annotated[int, Query(ge=100, le=5000)] = 1000,
    category: Annotated[list[PlaceCategory] | None, Query()] = None,
    query: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
    south: Annotated[float | None, Query(ge=-90, le=90)] = None,
    west: Annotated[float | None, Query(ge=-180, le=180)] = None,
    north: Annotated[float | None, Query(ge=-90, le=90)] = None,
    east: Annotated[float | None, Query(ge=-180, le=180)] = None,
    cursor: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> PlacePage:
    repository = DiscoveryRepository(db)
    if station_id:
        coordinates = repository.station_coordinates(station_id)
        if not coordinates:
            raise ApiError(404, "STATION_NOT_FOUND", "역을 찾을 수 없습니다.")
        latitude, longitude = coordinates
    if latitude is None or longitude is None:
        raise ApiError(422, "SEARCH_CENTER_REQUIRED", "역 또는 위도·경도를 선택해 주세요.")
    bounds_values = (south, west, north, east)
    bounds = None
    if any(value is not None for value in bounds_values):
        if not all(value is not None for value in bounds_values):
            raise ApiError(422, "INVALID_BOUNDS", "지도 경계 네 값을 모두 입력해 주세요.")
        bounds = (float(south), float(west), float(north), float(east))
        if bounds[0] >= bounds[2] or bounds[1] >= bounds[3]:
            raise ApiError(422, "INVALID_BOUNDS", "지도 경계 순서가 올바르지 않습니다.")
    try:
        decoded_cursor = decode_place_cursor(cursor) if cursor else None
    except (ValueError, UnicodeDecodeError) as exc:
        raise ApiError(400, "INVALID_CURSOR", "목록 커서가 올바르지 않습니다.") from exc
    settings = get_settings()
    source_name = None
    source_mode = "MOCKED"
    categories = list(dict.fromkeys(category or []))
    cache_payload = json.dumps(
        {
            "latitude": round(latitude, 5),
            "longitude": round(longitude, 5),
            "radius": radius_meters,
            "categories": sorted(item.value for item in categories),
            "query": (query or "").strip().casefold(),
        },
        sort_keys=True,
    )
    cache_key = hashlib.sha256(cache_payload.encode()).hexdigest()
    provider_failed = False
    if settings.provider_mode == "kakao":
        source_name = KakaoPlaceProvider.name
        source_mode = "REAL"
        if decoded_cursor is None:
            synced_after = datetime.now(UTC) - timedelta(seconds=settings.kakao_sync_ttl_seconds)
            cache_is_fresh = repository.has_recent_search(cache_key, synced_after)
            if not cache_is_fresh:
                provider = KakaoPlaceProvider(
                    settings.kakao_rest_api_key.get_secret_value()
                    if settings.kakao_rest_api_key
                    else ""
                )
                try:
                    provider_places = [
                        place
                        for requested_category in categories or [None]
                        for place in provider.search(
                            latitude=latitude,
                            longitude=longitude,
                            radius_meters=radius_meters,
                            category=requested_category,
                            query=query,
                            max_pages=settings.kakao_place_max_pages,
                        )
                    ]
                    synced_at = datetime.now(UTC)
                    repository.record_search_sync(
                        cache_key, provider.name, len(provider_places), synced_at
                    )
                    repository.upsert_provider_places(
                        provider.name,
                        provider_places,
                        synced_at,
                    )
                except PlaceProviderError:
                    provider_failed = True
                    source_mode = "STALE"
                    for requested_category in categories or [None]:
                        repository.mark_provider_places_stale(
                            source_name=source_name,
                            latitude=latitude,
                            longitude=longitude,
                            radius_meters=radius_meters,
                            category=requested_category,
                            query=query,
                        )

    rows = repository.nearby_places(
        latitude=latitude,
        longitude=longitude,
        radius_meters=radius_meters,
        categories=categories or None,
        query=query,
        bounds=bounds,
        cursor=decoded_cursor,
        limit=limit,
        source_name=source_name,
    )
    if provider_failed and not rows:
        raise ApiError(
            502,
            "PLACE_PROVIDER_UNAVAILABLE",
            "Kakao 장소 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        )
    has_more = len(rows) > limit
    visible = rows[:limit]
    next_cursor = None
    if has_more and visible:
        last_place, last_distance, _, _ = visible[-1]
        next_cursor = encode_place_cursor(last_distance, last_place.id)
    return PlacePage(
        items=[
            _place_summary(place, place_latitude, place_longitude, distance)
            for place, distance, place_latitude, place_longitude in visible
        ],
        next_cursor=next_cursor,
        radius_meters=radius_meters,
        source_mode=source_mode,
    )


@router.get("/places/{place_id}", operation_id="getPlace", response_model=PlaceDetail)
def get_place(place_id: UUID, db: Annotated[Session, Depends(get_db)]) -> PlaceDetail:
    row = DiscoveryRepository(db).get_place(place_id)
    if not row:
        raise ApiError(404, "PLACE_NOT_FOUND", "장소를 찾을 수 없습니다.")
    place, latitude, longitude = row
    return PlaceDetail(
        **_place_summary(place, latitude, longitude).model_dump(),
        summary=place.summary,
        phone=place.phone,
        website_url=place.website_url,
        source_name=place.source_name,
        last_synced_at=place.last_synced_at,
    )


@router.get("/me/favorites", operation_id="getMyFavorites", response_model=FavoriteCollection)
def get_my_favorites(
    user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> FavoriteCollection:
    repository = DiscoveryRepository(db)
    stations = [
        StationSummary(
            id=station.id,
            line_id=station.line_id,
            name=station.name,
            code=station.code,
            sequence=station.sequence,
            latitude=latitude,
            longitude=longitude,
        )
        for station, latitude, longitude in repository.favorite_stations(user.id)
    ]
    places = [
        _place_summary(place, latitude, longitude)
        for place, latitude, longitude in repository.favorite_places(user.id)
    ]
    return FavoriteCollection(stations=stations, places=places)


@router.put(
    "/me/favorites/stations/{station_id}",
    operation_id="favoriteStation",
    response_model=FavoriteMutation,
)
def favorite_station(
    station_id: UUID,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> FavoriteMutation:
    if not TransitRepository(db).get_station(station_id):
        raise ApiError(404, "STATION_NOT_FOUND", "역을 찾을 수 없습니다.")
    DiscoveryRepository(db).add_favorite_station(user.id, station_id)
    return FavoriteMutation(favorited=True)


@router.delete(
    "/me/favorites/stations/{station_id}",
    operation_id="unfavoriteStation",
    response_model=FavoriteMutation,
)
def unfavorite_station(
    station_id: UUID,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> FavoriteMutation:
    DiscoveryRepository(db).remove_favorite_station(user.id, station_id)
    return FavoriteMutation(favorited=False)


@router.put(
    "/me/favorites/places/{place_id}",
    operation_id="favoritePlace",
    response_model=FavoriteMutation,
)
def favorite_place(
    place_id: UUID,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> FavoriteMutation:
    if not DiscoveryRepository(db).get_place(place_id):
        raise ApiError(404, "PLACE_NOT_FOUND", "장소를 찾을 수 없습니다.")
    DiscoveryRepository(db).add_favorite_place(user.id, place_id)
    return FavoriteMutation(favorited=True)


@router.delete(
    "/me/favorites/places/{place_id}",
    operation_id="unfavoritePlace",
    response_model=FavoriteMutation,
)
def unfavorite_place(
    place_id: UUID,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> FavoriteMutation:
    DiscoveryRepository(db).remove_favorite_place(user.id, place_id)
    return FavoriteMutation(favorited=False)
