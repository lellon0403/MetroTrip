import hashlib

import pytest
from argon2 import PasswordHasher

from app.core.errors import ApiError
from app.identity.models import User
from app.identity.service import IdentityService


def test_refresh_token_hash_never_preserves_raw_token() -> None:
    raw = "refresh-secret-value"

    digest = IdentityService._token_hash(raw)

    assert digest == hashlib.sha256(raw.encode()).hexdigest()
    assert raw not in digest


@pytest.mark.parametrize("password", ["short1", "onlyletterslong", "12345678901"])
def test_password_policy_rejects_weak_password(password: str) -> None:
    with pytest.raises(ApiError) as error:
        IdentityService._validate_password(password)

    assert error.value.code == "WEAK_PASSWORD"


def test_password_policy_accepts_letters_and_numbers() -> None:
    IdentityService._validate_password("MetroTrip2026")


def identity_service_for_password_test() -> IdentityService:
    service = IdentityService.__new__(IdentityService)
    service.password_hasher = PasswordHasher(time_cost=1, memory_cost=8192, parallelism=1)
    return service


def test_verify_password_accepts_current_password() -> None:
    service = identity_service_for_password_test()
    user = User(
        email="member@example.com",
        password_hash=service.password_hasher.hash("MetroTrip2026"),
        display_name="여행자",
    )

    service.verify_password(user, "MetroTrip2026")


def test_verify_password_rejects_wrong_password() -> None:
    service = identity_service_for_password_test()
    user = User(
        email="member@example.com",
        password_hash=service.password_hasher.hash("MetroTrip2026"),
        display_name="여행자",
    )

    with pytest.raises(ApiError) as error:
        service.verify_password(user, "WrongPassword2026")

    assert error.value.code == "INVALID_CREDENTIALS"
