import httpx

from app.providers.routing import KakaoRoutingProvider
from app.routing.repository import ResolvedPoint


def test_kakao_partner_walking_route_uses_official_contract(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_get(url: str, **kwargs: object) -> httpx.Response:
        captured["url"] = url
        captured.update(kwargs)
        return httpx.Response(
            200,
            request=httpx.Request("GET", url),
            json={
                "routes": [
                    {
                        "result_code": 0,
                        "result_message": "길찾기 성공",
                        "summary": {"distance": 350, "duration": 300},
                        "sections": [
                            {"roads": [{"vertexes": [127.1, 36.8, 127.2, 36.9]}]}
                        ],
                    }
                ]
            },
        )

    monkeypatch.setattr(httpx, "get", fake_get)
    provider = KakaoRoutingProvider("secret-for-test", "metrotrip-test")
    origin = ResolvedPoint(label="천안역", latitude=36.8, longitude=127.1)
    destination = ResolvedPoint(label="테스트 장소", latitude=36.9, longitude=127.2)

    route = provider.walking(origin, destination)

    assert captured["url"] == provider.endpoint
    assert captured["headers"] == {
        "Authorization": "KakaoAK secret-for-test",
        "service": "metrotrip-test",
        "Content-Type": "application/json",
    }
    assert captured["params"] == {
        "origin": "127.1,36.8",
        "destination": "127.2,36.9",
        "priority": "DISTANCE",
        "summary": "false",
    }
    assert route.distance_meters == 350
    assert route.duration_seconds == 300
    assert route.path == [(36.8, 127.1), (36.9, 127.2)]