"""회원 재인증과 회원 정보 수정 기능 테스트."""

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.config import get_settings
from app.database import get_db
from app.integrations.security import (
    hash_password,
    sign_token,
    verify_password,
)
from app.main import app
from app.schemas.users import PasswordChangeRequest, UserProfileUpdateRequest
from app.services import auth, users


def test_reauthenticate_issues_short_lived_token(monkeypatch: pytest.MonkeyPatch) -> None:
    """올바른 현재 비밀번호로 사용자 ID가 담긴 재인증 토큰을 발급한다."""
    user = SimpleNamespace(user_id=7, password=hash_password("Current1!"))
    repository = MagicMock()
    repository.find_user_by_id.return_value = user
    monkeypatch.setattr(auth, "UserRepository", lambda _: repository)
    settings = get_settings()

    result = auth.reauthenticate(
        MagicMock(),
        7,
        "Current1!",
        "PROFILE_UPDATE",
        settings,
    )

    assert result["expires_in"] == 300
    assert result["purpose"] == "PROFILE_UPDATE"
    assert (
        auth.authenticate_reauthentication(
            str(result["verification_token"]),
            "PROFILE_UPDATE",
            settings,
        )
        == 7
    )


def test_reauthenticate_rejects_wrong_password(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """현재 비밀번호가 틀리면 재인증 토큰을 발급하지 않는다."""
    user = SimpleNamespace(user_id=7, password=hash_password("Current1!"))
    repository = MagicMock()
    repository.find_user_by_id.return_value = user
    monkeypatch.setattr(auth, "UserRepository", lambda _: repository)

    with pytest.raises(HTTPException) as caught:
        auth.reauthenticate(
            MagicMock(),
            7,
            "Wrong1!",
            "WITHDRAWAL",
            get_settings(),
        )

    assert caught.value.status_code == 401
    assert caught.value.headers["X-Error-Code"] == "INVALID_PASSWORD"


def test_reauthentication_token_rejects_different_purpose(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """프로필 수정용 재인증 토큰을 회원 탈퇴에 사용할 수 없게 한다."""
    user = SimpleNamespace(user_id=7, password=hash_password("Current1!"))
    repository = MagicMock()
    repository.find_user_by_id.return_value = user
    monkeypatch.setattr(auth, "UserRepository", lambda _: repository)
    settings = get_settings()
    result = auth.reauthenticate(
        MagicMock(),
        7,
        "Current1!",
        "PROFILE_UPDATE",
        settings,
    )

    with pytest.raises(HTTPException) as caught:
        auth.authenticate_reauthentication(
            str(result["verification_token"]),
            "WITHDRAWAL",
            settings,
        )

    assert caught.value.status_code == 401
    assert (
        caught.value.headers["X-Error-Code"]
        == "INVALID_REAUTHENTICATION_TOKEN"
    )


def test_profile_update_only_accepts_name_and_nickname() -> None:
    """일반 프로필 수정 요청에서 이메일과 비밀번호 필드를 거절한다."""
    with pytest.raises(ValidationError):
        UserProfileUpdateRequest.model_validate(
            {
                "email": "changed@example.com",
                "password": "Changed1!",
            }
        )


def test_update_profile_changes_requested_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """요청에 포함된 이름과 닉네임을 정리해 현재 사용자에게 반영한다."""
    user = SimpleNamespace(user_id=7, name="기존 이름", nickname="기존닉네임")
    repository = MagicMock()
    repository.find_user_by_id.return_value = user
    repository.find_user_by_nickname.return_value = None
    monkeypatch.setattr(users, "UserRepository", lambda _: repository)
    db = MagicMock()
    request = UserProfileUpdateRequest(
        name="  새 이름  ",
        nickname="  새닉네임  ",
    )

    result = users.update_profile(db, 7, request)

    repository.update_profile.assert_called_once_with(
        user,
        name="새 이름",
        nickname="새닉네임",
    )
    db.commit.assert_called_once_with()
    assert result is user


def test_update_profile_rejects_duplicate_nickname(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """다른 회원이 사용 중인 닉네임으로 변경하지 못하게 한다."""
    user = SimpleNamespace(user_id=7, name="기존 이름", nickname="기존닉네임")
    duplicate = SimpleNamespace(user_id=8, nickname="중복닉네임")
    repository = MagicMock()
    repository.find_user_by_id.return_value = user
    repository.find_user_by_nickname.return_value = duplicate
    monkeypatch.setattr(users, "UserRepository", lambda _: repository)

    with pytest.raises(HTTPException) as caught:
        users.update_profile(
            MagicMock(),
            7,
            UserProfileUpdateRequest(nickname="중복닉네임"),
        )

    assert caught.value.status_code == 409
    assert caught.value.headers["X-Error-Code"] == "NICKNAME_ALREADY_EXISTS"


def test_change_password_hashes_password_and_revokes_refresh_tokens(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """새 비밀번호를 해시해 저장하고 기존 리프레시 토큰을 모두 폐기한다."""
    user = SimpleNamespace(user_id=7, password=hash_password("Current1!"))
    user_repository = MagicMock()
    user_repository.find_user_by_id.return_value = user
    auth_repository = MagicMock()
    monkeypatch.setattr(users, "UserRepository", lambda _: user_repository)
    monkeypatch.setattr(users, "AuthRepository", lambda _: auth_repository)
    db = MagicMock()

    users.change_password(
        db,
        7,
        PasswordChangeRequest(
            new_password="Changed1!",
            new_password_confirm="Changed1!",
        ),
    )

    stored_password = user_repository.update_password.call_args.args[1]
    assert verify_password("Changed1!", stored_password)
    auth_repository.revoke_all_refresh_tokens.assert_called_once()
    db.commit.assert_called_once_with()


def test_withdraw_deletes_user_and_commits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """회원 탈퇴 시 사용자 삭제를 등록하고 연쇄 삭제 트랜잭션을 커밋한다."""
    user = SimpleNamespace(user_id=7)
    repository = MagicMock()
    repository.find_user_by_id.return_value = user
    monkeypatch.setattr(users, "UserRepository", lambda _: repository)
    db = MagicMock()

    users.withdraw(db, 7)

    repository.delete_user.assert_called_once_with(user)
    db.commit.assert_called_once_with()


def test_reauthenticate_then_update_profile_api(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """HTTP API로 재인증한 뒤 이름과 닉네임을 수정하는 전체 흐름을 검증한다."""
    now = datetime.now(timezone.utc)
    user = SimpleNamespace(
        user_id=7,
        email="user@example.com",
        password=hash_password("Current1!"),
        name="기존 이름",
        nickname="기존닉네임",
        role="USER",
        created_at=now,
        updated_at=now,
    )

    class FakeUserRepository:
        """통합 테스트에서 회원 조회와 수정을 대신하는 저장소."""

        def __init__(self, _: object) -> None:
            """테스트에서는 DB 세션을 사용하지 않는다."""

        def find_user_by_id(self, user_id: int) -> object | None:
            """테스트 사용자 ID가 일치하면 사용자를 반환한다."""
            return user if user_id == user.user_id else None

        def find_user_by_nickname(self, nickname: str) -> object | None:
            """현재 사용자를 제외한 닉네임 중복이 없다고 처리한다."""
            return user if nickname == user.nickname else None

        def update_profile(
            self,
            target: object,
            *,
            name: str | None = None,
            nickname: str | None = None,
        ) -> None:
            """전달받은 프로필 필드를 테스트 사용자에게 반영한다."""
            if name is not None:
                target.name = name
            if nickname is not None:
                target.nickname = nickname

    db = MagicMock()

    def override_get_db():
        """API 통합 테스트에 가짜 DB 세션을 주입한다."""
        yield db

    monkeypatch.setattr(auth, "UserRepository", FakeUserRepository)
    monkeypatch.setattr(users, "UserRepository", FakeUserRepository)
    app.dependency_overrides[get_db] = override_get_db
    settings = get_settings()
    access_token = sign_token(
        {
            "sub": str(user.user_id),
            "type": "access",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=5)).timestamp()),
        },
        settings.jwt_secret,
    )

    async def request_flow() -> tuple[httpx.Response, httpx.Response]:
        """ASGI 애플리케이션에 재인증과 프로필 수정 요청을 순서대로 보낸다."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            reauthentication = await client.post(
                "/api/v1/auth/reauthenticate",
                headers={"Authorization": f"Bearer {access_token}"},
                json={
                    "password": "Current1!",
                    "purpose": "PROFILE_UPDATE",
                },
            )
            profile_update = await client.patch(
                "/api/v1/users/me",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "X-Reauthentication-Token": reauthentication.json()[
                        "verificationToken"
                    ],
                },
                json={"name": "새 이름", "nickname": "새닉네임"},
            )
            return reauthentication, profile_update

    try:
        reauthentication, profile_update = asyncio.run(request_flow())
    finally:
        app.dependency_overrides.clear()

    assert reauthentication.status_code == 200
    assert profile_update.status_code == 200
    assert profile_update.json()["name"] == "새 이름"
    assert profile_update.json()["nickname"] == "새닉네임"
    assert "phone" not in profile_update.json()
