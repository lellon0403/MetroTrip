import httpx

from app.discovery.models import PlaceCategory
from app.providers.place import KakaoPlaceProvider


def test_kakao_category_search_maps_response_without_exposing_key(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_get(url: str, **kwargs: object) -> httpx.Response:
        captured["url"] = url
        captured.update(kwargs)
        request = httpx.Request("GET", url)
        return httpx.Response(
            200,
            request=request,
            json={
                "documents": [
                    {
                        "id": "123",
                        "place_name": "테스트 식당",
                        "category_group_code": "FD6",
                        "category_name": "음식점 > 한식",
                        "road_address_name": "충남 천안시 테스트로 1",
                        "address_name": "",
                        "phone": "041-000-0000",
                        "place_url": "https://place.map.kakao.com/123",
                        "x": "127.1460",
                        "y": "36.8100",
                    }
                ]
            },
        )

    monkeypatch.setattr(httpx, "get", fake_get)
    provider = KakaoPlaceProvider("secret-for-test")

    places = provider.search(
        latitude=36.81,
        longitude=127.146,
        radius_meters=1000,
        category=PlaceCategory.FOOD,
    )

    assert captured["url"] == "https://dapi.kakao.com/v2/local/search/category.json"
    assert captured["headers"] == {"Authorization": "KakaoAK secret-for-test"}
    assert captured["params"] == {
        "x": 127.146,
        "y": 36.81,
        "radius": 1000,
        "size": 15,
        "sort": "distance",
        "category_group_code": "FD6",
        "page": 1,
    }
    assert len(places) == 1
    assert places[0].category == PlaceCategory.FOOD
    assert places[0].phone == "041-000-0000"
    assert places[0].website_url == "https://place.map.kakao.com/123"
    assert "secret-for-test" not in repr(places[0])


def test_kakao_nature_search_uses_park_keyword(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_get(url: str, **kwargs: object) -> httpx.Response:
        captured["url"] = url
        captured.update(kwargs)
        return httpx.Response(
            200,
            request=httpx.Request("GET", url),
            json={"documents": []},
        )

    monkeypatch.setattr(httpx, "get", fake_get)

    KakaoPlaceProvider("secret-for-test").search(
        latitude=36.81,
        longitude=127.146,
        radius_meters=1000,
        category=PlaceCategory.NATURE,
    )

    assert captured["url"] == "https://dapi.kakao.com/v2/local/search/keyword.json"
    assert captured["params"] == {
        "x": 127.146,
        "y": 36.81,
        "radius": 1000,
        "size": 15,
        "sort": "distance",
        "query": "공원",
        "page": 1,
    }


def test_kakao_search_fetches_until_meta_is_end(monkeypatch) -> None:
    requested_pages: list[int] = []

    def fake_get(url: str, **kwargs: object) -> httpx.Response:
        params = kwargs["params"]
        assert isinstance(params, dict)
        page = int(params["page"])
        requested_pages.append(page)
        return httpx.Response(
            200,
            request=httpx.Request("GET", url),
            json={
                "meta": {"is_end": page == 2},
                "documents": [
                    {
                        "id": str(page),
                        "place_name": f"테스트 장소 {page}",
                        "category_group_code": "FD6",
                        "category_name": "음식점",
                        "road_address_name": "충남 천안시",
                        "x": "127.1460",
                        "y": "36.8100",
                    }
                ],
            },
        )

    monkeypatch.setattr(httpx, "get", fake_get)
    places = KakaoPlaceProvider("secret-for-test").search(
        latitude=36.81,
        longitude=127.146,
        radius_meters=1000,
        category=PlaceCategory.FOOD,
        max_pages=3,
    )

    assert requested_pages == [1, 2]
    assert [place.external_id for place in places] == ["1", "2"]