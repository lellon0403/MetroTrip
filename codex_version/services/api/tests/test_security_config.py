import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_local_environment_accepts_documented_development_defaults() -> None:
    settings = Settings(_env_file=None)

    assert settings.is_local


def test_production_rejects_development_security_defaults() -> None:
    with pytest.raises(ValidationError) as error:
        Settings(environment="production", _env_file=None)

    message = str(error.value)
    assert "JWT_SECRET" in message
    assert "DATABASE_URL" in message
    assert "COOKIE_SECURE" in message


def test_production_accepts_explicit_secure_runtime_settings() -> None:
    settings = Settings(
        environment="production",
        database_url="postgresql+psycopg://metrotrip:changed@postgres.example/metrotrip",
        jwt_secret="production-secret-with-at-least-32-characters",
        s3_secret_key="production-object-storage-secret",
        push_token_encryption_secret="production-push-encryption-secret",
        cookie_secure=True,
        web_origin="https://metrotrip.example",
        _env_file=None,
    )

    assert not settings.is_local


def test_kakao_mode_requires_rest_api_key() -> None:
    with pytest.raises(ValidationError) as error:
        Settings(provider_mode="kakao", _env_file=None)

    assert "KAKAO_REST_API_KEY" in str(error.value)


def test_kakao_mode_accepts_rest_api_key_as_secret() -> None:
    settings = Settings(
        provider_mode="kakao",
        kakao_rest_api_key="secret-for-test",
        _env_file=None,
    )

    assert settings.kakao_rest_api_key is not None
    assert settings.kakao_rest_api_key.get_secret_value() == "secret-for-test"
    assert "secret-for-test" not in repr(settings)
