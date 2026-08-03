"""OpenAPI contract regression tests."""

import asyncio

import httpx

from app.main import app


def test_openapi_contains_agreed_api_contract() -> None:
    schema = app.openapi()
    paths = schema["paths"]

    expected_paths = {
        "/api/v1/auth/register",
        "/api/v1/users/me",
        "/api/v1/stations",
        "/api/v1/stations/{station_id}/places",
        "/api/v1/plans/{plan_id}/share-links",
        "/api/v1/shared-plans/{share_token}",
        "/api/v1/reviews",
        "/api/v1/notices",
        "/api/v1/posts",
        "/api/v1/posts/{post_id}/participants/{participant_id}",
    }

    assert expected_paths <= paths.keys()
    assert "/api/v1/review" not in paths
    assert "/api/v1/plan" not in paths
    assert "/api/v1/station/time" not in paths


def test_posts_contract_excludes_sort_and_uses_camel_case_body() -> None:
    schema = app.openapi()
    posts_get = schema["paths"]["/api/v1/posts"]["get"]
    query_names = {parameter["name"] for parameter in posts_get["parameters"]}
    post_properties = schema["components"]["schemas"]["PostCreateRequest"][
        "properties"
    ]

    assert "sort" not in query_names
    assert "recruitCapacity" in post_properties
    assert "recruit_capacity" not in post_properties


def test_protected_and_shared_plan_security_contract() -> None:
    schema = app.openapi()

    assert schema["paths"]["/api/v1/plans"]["get"]["security"]
    assert "security" not in schema["paths"][
        "/api/v1/shared-plans/{share_token}"
    ]["get"]


def test_contract_endpoint_returns_standard_not_implemented_error() -> None:
    async def request_lines() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get("/api/v1/lines")

    response = asyncio.run(request_lines())

    assert response.status_code == 501
    assert response.json()["code"] == "NOT_IMPLEMENTED"
