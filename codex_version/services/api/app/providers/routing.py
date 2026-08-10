from dataclasses import dataclass

import httpx

from app.routing.repository import ResolvedPoint


class KakaoRoutingError(RuntimeError):
    """도보 경로 공급자의 실패를 인증 정보 없이 표현한다."""


@dataclass(frozen=True)
class WalkingRoute:
    distance_meters: int
    duration_seconds: int
    path: list[tuple[float, float]]


class KakaoRoutingProvider:
    """사전 제휴 계약이 있는 경우에만 사용하는 Kakao Mobility 도보 경로 공급자."""

    endpoint = "https://apis-navi.kakaomobility.com/affiliate/walking/v1/directions"

    def __init__(
        self,
        rest_api_key: str,
        service_name: str,
        timeout_seconds: float = 5.0,
    ) -> None:
        if not rest_api_key:
            raise ValueError("Kakao REST API key is required")
        self.authorization = f"KakaoAK {rest_api_key}"
        self.service_name = service_name
        self.timeout_seconds = timeout_seconds

    def walking(self, origin: ResolvedPoint, destination: ResolvedPoint) -> WalkingRoute:
        try:
            response = httpx.get(
                self.endpoint,
                headers={
                    "Authorization": self.authorization,
                    "service": self.service_name,
                    "Content-Type": "application/json",
                },
                params={
                    "origin": f"{origin.longitude},{origin.latitude}",
                    "destination": f"{destination.longitude},{destination.latitude}",
                    "priority": "DISTANCE",
                    "summary": "false",
                },
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
            route = payload["routes"][0]
            if int(route["result_code"]) != 0:
                raise KakaoRoutingError(str(route.get("result_message") or "UNKNOWN"))
            summary = route["summary"]
            path: list[tuple[float, float]] = []
            for section in route.get("sections", []):
                for road in section.get("roads", []):
                    vertices = road.get("vertexes", [])
                    for index in range(0, len(vertices), 2):
                        coordinate = (float(vertices[index + 1]), float(vertices[index]))
                        if not path or path[-1] != coordinate:
                            path.append(coordinate)
            return WalkingRoute(
                distance_meters=int(summary["distance"]),
                duration_seconds=int(summary["duration"]),
                path=path,
            )
        except KakaoRoutingError:
            raise
        except (httpx.HTTPError, IndexError, KeyError, TypeError, ValueError) as exc:
            raise KakaoRoutingError("도보 경로 정보를 불러오지 못했습니다.") from exc