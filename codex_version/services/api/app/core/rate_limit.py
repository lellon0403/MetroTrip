import time
from collections.abc import Awaitable, Callable

import redis
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    """인증·쓰기 요청을 Redis 고정 윈도우로 제한하고 장애 시 읽기 가능성을 유지한다."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        sensitive = request.url.path.startswith("/api/v1/auth/") or request.method not in {
            "GET",
            "HEAD",
            "OPTIONS",
        }
        if not sensitive:
            return await call_next(request)
        client = request.client.host if request.client else "unknown"
        window = int(time.time() // 60)
        key = f"rate:{client}:{request.url.path}:{window}"
        limit = 20 if request.url.path.startswith("/api/v1/auth/") else 120
        try:
            store = redis.from_url(
                get_settings().redis_url, socket_connect_timeout=0.15, socket_timeout=0.15
            )
            count = int(store.incr(key))
            if count == 1:
                store.expire(key, 70)
            if count > limit:
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": {
                            "code": "RATE_LIMITED",
                            "message": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
                            "requestId": getattr(request.state, "request_id", "unknown"),
                            "details": [],
                        }
                    },
                    headers={"Retry-After": "60"},
                )
        except Exception:
            # Redis 장애가 전체 API 장애로 번지지 않게 하되 readiness에서 별도로 드러낸다.
            pass
        return await call_next(request)
