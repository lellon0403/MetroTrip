"""Health endpoint tests."""

import asyncio
import httpx
from app.main import app

# FastAPI 애플리케이션의 비동기(Async) 엔드포인트를 테스트하기 위한 내부 비동기 함수
# ASGI(Asynchronous Server Gateway Interface) 전송 계층을 사용하여, 
# 실제 서버(포트)를 띄우지 않고 메모리 상에서 애플리케이션(app)으로 직접 HTTP 요청을 보냄
def test_health_check() -> None:
    async def request_health() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get("/health")

    # 동기적인 pytest 환경에서 비동기 함수를 실행하기 위해 asyncio.run을 사용
    response = asyncio.run(request_health())

    # 응답 상태 코드가 200(성공)인지, 응답 본문이 예상된 JSON 객체인지 검증함.
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
