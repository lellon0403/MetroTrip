from unittest.mock import MagicMock, patch

from fastapi import Response
from fastapi.testclient import TestClient

from app.api.v1.router import get_readiness
from app.main import app

client = TestClient(app)


def test_liveness_returns_request_id() -> None:
    response = client.get("/api/v1/health/live")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers["X-Request-ID"]


def test_meta_discloses_fixture_provider() -> None:
    response = client.get("/api/v1/meta")

    assert response.status_code == 200
    assert response.json()["providerMode"] == "fixture"


def test_readiness_degrades_without_optional_dependencies() -> None:
    response = Response()
    db = MagicMock()
    with (
        patch("app.api.v1.router.redis.from_url", side_effect=ConnectionError),
        patch("app.api.v1.router.boto3.client", side_effect=ConnectionError),
    ):
        result = get_readiness(response, db)

    assert response.status_code == 200
    assert result.status == "degraded"
    assert {item.name: item.status for item in result.dependencies} == {
        "postgres": "ok",
        "redis": "degraded",
        "objectStorage": "degraded",
    }


def test_readiness_fails_when_postgres_is_unavailable() -> None:
    response = Response()
    db = MagicMock()
    db.execute.side_effect = ConnectionError
    with (
        patch("app.api.v1.router.redis.from_url"),
        patch("app.api.v1.router.boto3.client"),
    ):
        result = get_readiness(response, db)

    assert response.status_code == 503
    assert result.status == "notReady"
