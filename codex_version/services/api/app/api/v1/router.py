from typing import Annotated

import boto3
import redis
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.observability import prometheus_snapshot
from app.core.schemas import DependencyHealth, HealthResponse, MetaResponse, ReadinessResponse
from app.discovery.router import router as discovery_router
from app.identity.router import profile_router
from app.identity.router import router as identity_router
from app.infrastructure.database import get_db
from app.operations.router import router as operations_router
from app.planning.router import router as planning_router
from app.recruitments.router import router as recruitments_router
from app.reviews.router import router as reviews_router
from app.routing.router import router as routing_router
from app.transit.router import router as transit_router

router = APIRouter()
router.include_router(identity_router)
router.include_router(profile_router)
router.include_router(transit_router)
router.include_router(discovery_router)
router.include_router(routing_router)
router.include_router(planning_router)
router.include_router(reviews_router)
router.include_router(recruitments_router)
router.include_router(operations_router)


@router.get("/health/live", operation_id="getLiveness", response_model=HealthResponse)
def get_liveness() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(status="ok", service="api", environment=settings.environment)


@router.get("/health/ready", operation_id="getReadiness", response_model=ReadinessResponse)
def get_readiness(response: Response, db: Annotated[Session, Depends(get_db)]) -> ReadinessResponse:
    settings = get_settings()
    checks: list[DependencyHealth] = []
    try:
        db.execute(text("SELECT 1"))
        checks.append(DependencyHealth(name="postgres", status="ok"))
    except Exception:
        checks.append(DependencyHealth(name="postgres", status="error", detail="unavailable"))
    try:
        redis.from_url(settings.redis_url, socket_connect_timeout=1).ping()
        checks.append(DependencyHealth(name="redis", status="ok"))
    except Exception:
        checks.append(DependencyHealth(name="redis", status="degraded", detail="unavailable"))
    try:
        storage = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        )
        storage.head_bucket(Bucket=settings.s3_bucket)
        checks.append(DependencyHealth(name="objectStorage", status="ok"))
    except Exception:
        checks.append(
            DependencyHealth(name="objectStorage", status="degraded", detail="unavailable")
        )
    ready = next(check for check in checks if check.name == "postgres").status == "ok"
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    degraded = any(check.status != "ok" for check in checks)
    return ReadinessResponse(
        status="notReady" if not ready else "degraded" if degraded else "ready",
        dependencies=checks,
    )


@router.get("/meta", operation_id="getApiMeta", response_model=MetaResponse)
def get_api_meta() -> MetaResponse:
    settings = get_settings()
    return MetaResponse(
        api_version="v1",
        pilot_region="천안·아산",
        provider_mode=settings.provider_mode,
    )


@router.get("/metrics", operation_id="getMetrics", include_in_schema=False)
def get_metrics() -> Response:
    return Response(content=prometheus_snapshot(), media_type="text/plain; version=0.0.4")
