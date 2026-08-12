"""서비스와 데이터베이스 상태 확인 API."""

from fastapi import APIRouter

from app.db_failover import current_routing, last_synced_at

router = APIRouter(tags=["health"])
db_router = APIRouter(prefix="/health", tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str]:
    """애플리케이션 프로세스가 응답 가능한지 확인한다."""

    return {"status": "ok"}


@db_router.get("/db")
def db_health_check() -> dict[str, str | None]:
    """현재 DB 라우팅 대상과 마지막 동기화 성공 시각을 노출한다 (DB-FAILOVER.md §6)."""
    return {"routing": current_routing(), "last_synced_at": last_synced_at()}
