import math
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError
from app.providers.routing import KakaoRoutingError, KakaoRoutingProvider
from app.routing.repository import ResolvedPoint, RoutingRepository
from app.routing.schemas import (
    RouteCompareRequest,
    RouteComparison,
    RouteCoordinate,
    RouteOption,
    RouteSegment,
    TravelMode,
)


def haversine_meters(origin: ResolvedPoint, destination: ResolvedPoint) -> float:
    radius = 6_371_000
    lat1, lat2 = math.radians(origin.latitude), math.radians(destination.latitude)
    delta_lat = math.radians(destination.latitude - origin.latitude)
    delta_lon = math.radians(destination.longitude - origin.longitude)
    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


class RoutingService:
    def __init__(self, db: Session) -> None:
        self.repository = RoutingRepository(db)

    @staticmethod
    def _walk_minutes(distance: float) -> int:
        return max(1, math.ceil(distance / 75))

    def _walking_option(
        self, origin: ResolvedPoint, destination: ResolvedPoint, direct_distance: float
    ) -> RouteOption:
        settings = get_settings()
        if (
            settings.kakao_walking_enabled
            and settings.provider_mode == "kakao"
            and settings.kakao_rest_api_key
        ):
            try:
                result = KakaoRoutingProvider(
                    settings.kakao_rest_api_key.get_secret_value()
                ).walking(origin, destination)
                duration = max(1, math.ceil(result.duration_seconds / 60))
                return RouteOption(
                    id="walk-kakao",
                    mode=TravelMode.WALK,
                    duration_minutes=duration,
                    distance_meters=result.distance_meters,
                    transfers=0,
                    segments=[
                        RouteSegment(
                            mode=TravelMode.WALK,
                            from_label=origin.label,
                            to_label=destination.label,
                            duration_minutes=duration,
                            distance_meters=result.distance_meters,
                        )
                    ],
                    data_basis="Kakao walking route",
                    estimated=False,
                    algorithm_version="kakao-walk-v1",
                    path=[
                        RouteCoordinate(latitude=latitude, longitude=longitude)
                        for latitude, longitude in result.path
                    ],
                )
            except KakaoRoutingError:
                pass
        walk_distance = round(direct_distance * 1.15)
        duration = self._walk_minutes(walk_distance)
        return RouteOption(
            id="walk-estimate",
            mode=TravelMode.WALK,
            duration_minutes=duration,
            distance_meters=walk_distance,
            transfers=0,
            segments=[
                RouteSegment(
                    mode=TravelMode.WALK,
                    from_label=origin.label,
                    to_label=destination.label,
                    duration_minutes=duration,
                    distance_meters=walk_distance,
                )
            ],
            data_basis="geodesic distance × 1.15 walking factor",
            estimated=True,
            algorithm_version="estimate-walk-v2",
            path=[
                RouteCoordinate(latitude=origin.latitude, longitude=origin.longitude),
                RouteCoordinate(latitude=destination.latitude, longitude=destination.longitude),
            ],
        )

    def compare(self, request: RouteCompareRequest) -> RouteComparison:
        origin = self.repository.resolve(request.origin)
        destination = self.repository.resolve(request.destination)
        if not origin or not destination:
            raise ApiError(404, "ROUTE_POINT_NOT_FOUND", "출발지 또는 도착지를 찾을 수 없습니다.")
        direct_distance = haversine_meters(origin, destination)
        if direct_distance < 5:
            raise ApiError(422, "SAME_ROUTE_POINT", "서로 다른 출발지와 도착지를 선택해 주세요.")
        if direct_distance > 80_000:
            raise ApiError(422, "ROUTE_OUT_OF_RANGE", "파일럿 지역을 벗어난 경로입니다.")
        options: list[RouteOption] = []
        if TravelMode.WALK in request.modes:
            options.append(self._walking_option(origin, destination, direct_distance))
        if TravelMode.TRANSIT in request.modes:
            origin_station = self.repository.nearest_station(origin)
            destination_station = self.repository.nearest_station(destination)
            if origin_station and destination_station:
                start_station, access_distance = origin_station
                end_station, egress_distance = destination_station
                if start_station.line_name == end_station.line_name:
                    stops = abs(
                        int(start_station.station_sequence) - int(end_station.station_sequence)
                    )
                    rail_minutes = max(2, stops * 6)
                    segments: list[RouteSegment] = []
                    if access_distance >= 5:
                        segments.append(
                            RouteSegment(
                                mode=TravelMode.WALK,
                                from_label=origin.label,
                                to_label=start_station.label,
                                duration_minutes=self._walk_minutes(access_distance),
                                distance_meters=round(access_distance),
                            )
                        )
                    segments.append(
                        RouteSegment(
                            mode=TravelMode.TRANSIT,
                            from_label=start_station.label,
                            to_label=end_station.label,
                            duration_minutes=rail_minutes,
                            distance_meters=round(haversine_meters(start_station, end_station)),
                            line_name=start_station.line_name,
                            stops=stops,
                        )
                    )
                    if egress_distance >= 5:
                        segments.append(
                            RouteSegment(
                                mode=TravelMode.WALK,
                                from_label=end_station.label,
                                to_label=destination.label,
                                duration_minutes=self._walk_minutes(egress_distance),
                                distance_meters=round(egress_distance),
                            )
                        )
                    duration = 5 + sum(segment.duration_minutes for segment in segments)
                    distance = sum(segment.distance_meters for segment in segments)
                    options.append(
                        RouteOption(
                            id="transit-pilot-line",
                            mode=TravelMode.TRANSIT,
                            duration_minutes=duration,
                            distance_meters=distance,
                            transfers=0,
                            segments=segments,
                            data_basis="fixture timetable; includes estimated 5 minute wait",
                            estimated=True,
                            algorithm_version="fixture-routing-v1",
                        )
                    )
        if not options:
            raise ApiError(422, "ROUTE_UNAVAILABLE", "선택한 조건의 경로를 만들 수 없습니다.")
        options.sort(key=lambda option: option.duration_minutes)
        return RouteComparison(
            origin_label=origin.label,
            destination_label=destination.label,
            options=options,
            realtime=any(not option.estimated for option in options),
            generated_at=datetime.now(UTC),
        )
