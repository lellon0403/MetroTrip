"""OpenAPI contract regression tests."""

import asyncio

import httpx

from app.main import app


def test_openapi_contains_agreed_api_contract() -> None:
    schema = app.openapi()
    paths = schema["paths"]

    expected_paths = {
        "/api/v1/auth/register",
        "/api/v1/auth/reauthenticate",
        "/api/v1/users/me",
        "/api/v1/users/me/favorites",
        "/api/v1/users/me/favorites/{station_id}",
        "/api/v1/users/me/password",
        "/api/v1/users/me/participating-posts",
        "/api/v1/users/me/posts",
        "/api/v1/users/me/reviews",
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


def test_my_reviews_contract_requires_auth_and_exposes_pagination() -> None:
    """내 후기 목록 API가 인증과 페이지 쿼리 계약을 노출하는지 확인한다."""
    operation = app.openapi()["paths"]["/api/v1/users/me/reviews"]["get"]
    query_parameters = {
        parameter["name"]: parameter
        for parameter in operation["parameters"]
        if parameter["in"] == "query"
    }

    assert operation["security"]
    assert set(query_parameters) == {"page", "size"}
    assert query_parameters["page"]["schema"]["default"] == 1
    assert query_parameters["size"]["schema"]["default"] == 10


def test_my_community_contract_requires_status_and_authentication() -> None:
    """내 모집 글 API의 인증 및 참여 상태 필터 계약을 확인한다."""
    schema = app.openapi()
    my_posts = schema["paths"]["/api/v1/users/me/posts"]["get"]
    participating = schema["paths"]["/api/v1/users/me/participating-posts"]["get"]
    parameters = {
        parameter["name"]: parameter for parameter in participating["parameters"]
    }
    status_schema = schema["components"]["schemas"]["ParticipatingPostStatus"]

    assert my_posts["security"]
    assert participating["security"]
    assert parameters["status"]["required"] is True
    assert status_schema["enum"] == ["APPLIED", "ACCEPTED"]
    assert parameters["page"]["schema"]["default"] == 1
    assert parameters["size"]["schema"]["default"] == 10


def test_posts_contract_excludes_sort_and_uses_camel_case_body() -> None:
    schema = app.openapi()
    posts_get = schema["paths"]["/api/v1/posts"]["get"]
    query_names = {parameter["name"] for parameter in posts_get["parameters"]}
    post_properties = schema["components"]["schemas"]["PostCreateRequest"]["properties"]

    assert "sort" not in query_names
    assert "recruitCapacity" in post_properties
    assert "recruit_capacity" not in post_properties


def test_protected_and_shared_plan_security_contract() -> None:
    schema = app.openapi()

    assert schema["paths"]["/api/v1/plans"]["get"]["security"]
    assert (
        "security" not in schema["paths"]["/api/v1/shared-plans/{share_token}"]["get"]
    )


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
