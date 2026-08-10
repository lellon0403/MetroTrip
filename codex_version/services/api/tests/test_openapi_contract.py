from app.main import app


def test_openapi_operation_ids_are_unique() -> None:
    schema = app.openapi()
    operation_ids = [
        operation["operationId"]
        for path in schema["paths"].values()
        for method, operation in path.items()
        if method.lower() in {"get", "post", "put", "patch", "delete"}
    ]

    assert len(operation_ids) == len(set(operation_ids))


def test_openapi_contains_identity_and_transit_contracts() -> None:
    paths = app.openapi()["paths"]

    assert "/api/v1/auth/refresh" in paths
    assert "/api/v1/me" in paths
    assert "/api/v1/stations" in paths
    assert "/api/v1/stations/{station_id}/departures" in paths
    assert "/api/v1/plans/{plan_id}/share-links/{link_id}" in paths
    assert "/api/v1/reviews/{review_id}/like" in paths
    assert "/api/v1/recruitments/{recruitment_id}/applications/{application_id}" in paths
    assert "/api/v1/admin/reports/{report_id}/actions" in paths
    assert "/api/v1/devices" in paths
    assert "/api/v1/home" in paths
