"""Service health endpoint."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])

# 서버 실행 여부를 판단
@router.get("/health")
# Liveness/Readiness Probe 목적으로 컨테이너 오케스트레이션(Docker, k8s)이나 로드밸런서가 서버 상태를 주기적으로 체크할 때 사용
def health_check() -> dict[str, str]:
    return {"status": "ok"}