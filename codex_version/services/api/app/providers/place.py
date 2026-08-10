from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.discovery.models import PlaceCategory


@dataclass(frozen=True)
class ProviderPlace:
    external_id: str
    name: str
    category: PlaceCategory
    address: str
    latitude: float
    longitude: float
    phone: str | None
    website_url: str | None
    summary: str | None
    payload: dict[str, Any]


class PlaceProviderError(RuntimeError):
    """외부 장소 공급자 호출 실패를 키나 원문 응답 노출 없이 표현한다."""


class PlaceProvider(Protocol):
    name: str
    mode: str

    def search(
        self,
        latitude: float,
        longitude: float,
        radius_meters: int,
        category: PlaceCategory | None = None,
        query: str | None = None,
        max_pages: int = 3,
    ) -> list[ProviderPlace]: ...


class FixturePlaceProvider:
    name = "metrotrip-development-fixture"
    mode = "MOCKED"

    def search(
        self,
        latitude: float,
        longitude: float,
        radius_meters: int,
        category: PlaceCategory | None = None,
        query: str | None = None,
        max_pages: int = 3,
    ) -> list[ProviderPlace]:
        del latitude, longitude, radius_meters, category, query, max_pages
        return []


class KakaoPlaceProvider:
    name = "kakao-local"
    mode = "REAL"
    category_codes: dict[PlaceCategory, tuple[str, ...]] = {
        PlaceCategory.FOOD: ("FD6",),
        PlaceCategory.CAFE: ("CE7",),
        PlaceCategory.CULTURE: ("AT4", "CT1"),
        PlaceCategory.SHOPPING: ("MT1",),
        PlaceCategory.STAY: ("AD5",),
    }
    kakao_categories: dict[str, PlaceCategory] = {
        code: category for category, codes in category_codes.items() for code in codes
    }

    def __init__(self, rest_api_key: str, timeout_seconds: float = 4.0) -> None:
        if not rest_api_key:
            raise ValueError("Kakao REST API key is required")
        self._authorization = f"KakaoAK {rest_api_key}"
        self.timeout_seconds = timeout_seconds

    def _request(
        self,
        endpoint: str,
        params: dict[str, str | int | float],
        fallback_category: PlaceCategory | None,
    ) -> tuple[list[ProviderPlace], bool]:
        try:
            response = httpx.get(
                f"https://dapi.kakao.com/v2/local/search/{endpoint}.json",
                headers={"Authorization": self._authorization},
                params=params,
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
            documents = payload.get("documents", [])
            return (
                [self._to_place(item, fallback_category) for item in documents],
                bool(payload.get("meta", {}).get("is_end", True)),
            )
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
            raise PlaceProviderError("Kakao Local 장소 조회에 실패했습니다.") from exc

    def _to_place(
        self, item: dict[str, Any], fallback_category: PlaceCategory | None
    ) -> ProviderPlace:
        category_code = str(item.get("category_group_code") or "")
        category = self.kakao_categories.get(category_code) or fallback_category
        if category is None:
            category = PlaceCategory.CULTURE
        category_name = str(item.get("category_name") or "").strip()
        return ProviderPlace(
            external_id=str(item["id"]),
            name=str(item["place_name"]),
            category=category,
            address=str(item.get("road_address_name") or item.get("address_name") or ""),
            latitude=float(item["y"]),
            longitude=float(item["x"]),
            phone=str(item.get("phone") or "").strip() or None,
            website_url=str(item.get("place_url") or "").strip() or None,
            summary=category_name or None,
            payload=item,
        )

    def search(
        self,
        latitude: float,
        longitude: float,
        radius_meters: int,
        category: PlaceCategory | None = None,
        query: str | None = None,
        max_pages: int = 3,
    ) -> list[ProviderPlace]:
        common: dict[str, str | int | float] = {
            "x": longitude,
            "y": latitude,
            "radius": min(radius_meters, 20_000),
            "size": 15,
            "sort": "distance",
        }
        requests: list[tuple[str, dict[str, str | int | float], PlaceCategory | None]] = []
        normalized_query = query.strip() if query else ""
        if normalized_query:
            params = {**common, "query": normalized_query}
            if category and category in self.category_codes:
                params["category_group_code"] = self.category_codes[category][0]
            requests.append(("keyword", params, category))
        elif category == PlaceCategory.NATURE:
            requests.append(("keyword", {**common, "query": "공원"}, PlaceCategory.NATURE))
        else:
            categories = (
                (category,)
                if category
                else (
                    PlaceCategory.FOOD,
                    PlaceCategory.CAFE,
                    PlaceCategory.CULTURE,
                    PlaceCategory.SHOPPING,
                    PlaceCategory.STAY,
                    PlaceCategory.NATURE,
                )
            )
            for requested_category in categories:
                if requested_category == PlaceCategory.NATURE:
                    requests.append(
                        ("keyword", {**common, "query": "공원"}, PlaceCategory.NATURE)
                    )
                    continue
                for code in self.category_codes.get(requested_category, ()):
                    requests.append(
                        (
                            "category",
                            {**common, "category_group_code": code},
                            requested_category,
                        )
                    )

        places: dict[str, ProviderPlace] = {}
        for endpoint, params, fallback_category in requests:
            for page in range(1, max_pages + 1):
                page_places, is_end = self._request(
                    endpoint,
                    {**params, "page": page},
                    fallback_category,
                )
                for place in page_places:
                    places[place.external_id] = place
                if is_end:
                    break
        return list(places.values())