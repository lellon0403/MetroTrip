"""후기 미디어 로컬 업로드 API 테스트.

DB에 접근하지 않는 엔드포인트라 실제 앱을 통째로 띄워 httpx로 검증한다.
"""

import asyncio
import shutil
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.config import get_settings
from app.integrations import local_storage
from app.integrations.security import sign_token
from app.main import app


def _access_token() -> str:
    """AUTH_REQUIRED 검증을 통과하는 실제 서명된 액세스 토큰을 만든다."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    return sign_token(
        {
            "sub": "1",
            "type": "access",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=30)).timestamp()),
        },
        settings.jwt_secret,
    )


AUTH_HEADERS = {"Authorization": f"Bearer {_access_token()}"}


@pytest.fixture(autouse=True)
def _cleanup_media_dir():
    """테스트가 로컬 디스크에 남긴 업로드 파일을 정리한다."""
    yield
    root = local_storage.media_root(get_settings())
    review_dir = root / "reviews"
    if review_dir.exists():
        shutil.rmtree(review_dir)


def _run(coroutine):
    return asyncio.run(coroutine)


async def _client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


def test_create_media_upload_returns_urls() -> None:
    async def call() -> httpx.Response:
        async with await _client() as client:
            return await client.post(
                "/api/v1/review-media",
                json={"fileName": "trip.jpg", "contentType": "image/jpeg"},
                headers=AUTH_HEADERS,
            )

    response = _run(call())
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["uploadUrl"].endswith(".jpg")
    assert "/api/v1/review-media/" in body["uploadUrl"]
    assert "/api/v1/media/reviews/" in body["mediaUrl"]
    assert body["mediaUrl"].endswith(".jpg")
    assert body["expiresIn"] > 0


def test_create_media_upload_rejects_unsupported_content_type() -> None:
    async def call() -> httpx.Response:
        async with await _client() as client:
            return await client.post(
                "/api/v1/review-media",
                json={"fileName": "note.txt", "contentType": "text/plain"},
                headers=AUTH_HEADERS,
            )

    response = _run(call())
    assert response.status_code == 400
    assert response.json()["code"] == "UNSUPPORTED_MEDIA_TYPE"


def test_create_media_upload_requires_auth() -> None:
    async def call() -> httpx.Response:
        async with await _client() as client:
            return await client.post(
                "/api/v1/review-media",
                json={"fileName": "trip.jpg", "contentType": "image/jpeg"},
            )

    response = _run(call())
    assert response.status_code == 403 or response.status_code == 401


def test_upload_then_serve_round_trip() -> None:
    async def call() -> tuple[httpx.Response, httpx.Response, httpx.Response]:
        async with await _client() as client:
            issued = await client.post(
                "/api/v1/review-media",
                json={"fileName": "trip.jpg", "contentType": "image/jpeg"},
                headers=AUTH_HEADERS,
            )
            body = issued.json()
            put_response = await client.put(
                body["uploadUrl"],
                content=b"fake-jpeg-bytes",
                headers=AUTH_HEADERS,
            )
            get_response = await client.get(body["mediaUrl"])
            return issued, put_response, get_response

    issued, put_response, get_response = _run(call())
    assert issued.status_code == 201
    assert put_response.status_code == 204, put_response.text
    assert get_response.status_code == 200
    assert get_response.content == b"fake-jpeg-bytes"


def test_upload_rejects_invalid_file_name() -> None:
    async def call() -> httpx.Response:
        async with await _client() as client:
            return await client.put(
                "/api/v1/review-media/not-a-valid-name.jpg",
                content=b"whatever",
                headers=AUTH_HEADERS,
            )

    response = _run(call())
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_FILE_NAME"


def test_upload_rejects_oversized_file(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(local_storage, "MAX_UPLOAD_BYTES", 10)

    async def call() -> tuple[str, httpx.Response]:
        async with await _client() as client:
            issued = await client.post(
                "/api/v1/review-media",
                json={"fileName": "trip.jpg", "contentType": "image/jpeg"},
                headers=AUTH_HEADERS,
            )
            body = issued.json()
            put_response = await client.put(
                body["uploadUrl"],
                content=b"this payload is definitely over ten bytes",
                headers=AUTH_HEADERS,
            )
            return body["uploadUrl"], put_response

    _, put_response = _run(call())
    assert put_response.status_code == 413
    assert put_response.json()["code"] == "MEDIA_TOO_LARGE"
