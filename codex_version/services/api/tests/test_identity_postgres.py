import os
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

from app.identity.models import PasswordResetChallenge, User
from app.infrastructure.database import SessionLocal
from app.main import app
from app.operations.models import PushDevice

pytestmark = pytest.mark.skipif(
    os.getenv("METROTRIP_RUN_POSTGRES_TESTS") != "1",
    reason="실제 PostgreSQL 통합 테스트는 명시적으로 활성화합니다.",
)


def test_account_deletion_requires_reauthentication_and_revokes_sessions() -> None:
    marker = uuid4().hex
    email = f"delete-{marker}@example.com"
    password = "MetroTrip2026"
    user_id: UUID | None = None

    try:
        with TestClient(app) as client:
            registered = client.post(
                "/api/v1/auth/register",
                headers={"X-Client-Platform": "mobile"},
                json={
                    "email": email,
                    "password": password,
                    "displayName": "탈퇴 검증",
                },
            )
            assert registered.status_code == 201
            auth = registered.json()
            user_id = UUID(auth["user"]["id"])
            headers = {"Authorization": f"Bearer {auth['accessToken']}"}

            reset_requested = client.post(
                "/api/v1/auth/password-reset/request",
                json={"email": email},
            )
            assert reset_requested.status_code == 200
            device_registered = client.post(
                "/api/v1/devices",
                headers=headers,
                json={
                    "platform": "android",
                    "pushToken": f"ExponentPushToken[{marker}]",
                    "locale": "ko-KR",
                    "appVersion": "0.1.0-test",
                },
            )
            assert device_registered.status_code == 201

            invalid_confirmation = client.request(
                "DELETE",
                "/api/v1/me",
                headers=headers,
                json={"password": password, "confirmation": "delete"},
            )
            assert invalid_confirmation.status_code == 422

            wrong_password = client.request(
                "DELETE",
                "/api/v1/me",
                headers=headers,
                json={"password": "WrongPassword2026", "confirmation": "DELETE"},
            )
            assert wrong_password.status_code == 401
            assert wrong_password.json()["error"]["code"] == "INVALID_CREDENTIALS"
            assert client.get("/api/v1/me", headers=headers).status_code == 200

            deleted = client.request(
                "DELETE",
                "/api/v1/me",
                headers=headers,
                json={"password": password, "confirmation": "DELETE"},
            )
            assert deleted.status_code == 204
            assert client.get("/api/v1/me", headers=headers).status_code == 401

            with SessionLocal() as db:
                challenge_count = db.scalar(
                    select(func.count())
                    .select_from(PasswordResetChallenge)
                    .where(PasswordResetChallenge.email == email)
                )
                device_count = db.scalar(
                    select(func.count())
                    .select_from(PushDevice)
                    .where(PushDevice.user_id == user_id)
                )
                assert challenge_count == 0
                assert device_count == 0

            refreshed = client.post(
                "/api/v1/auth/refresh",
                headers={"X-Client-Platform": "mobile"},
                json={"refreshToken": auth["refreshToken"]},
            )
            assert refreshed.status_code == 401
    finally:
        if user_id is not None:
            with SessionLocal() as db:
                db.execute(delete(User).where(User.id == user_id))
                db.commit()
