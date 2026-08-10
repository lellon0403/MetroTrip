import os
from functools import lru_cache

from pydantic import Field, SecretStr, computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=None if os.getenv("METROTRIP_IGNORE_DOTENV") == "1" else ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "MetroTrip API"
    environment: str = "local"
    api_prefix: str = "/api/v1"
    web_origin: str = "http://localhost:3100"
    database_url: str = (
        "postgresql+psycopg://metrotrip:metrotrip-local-only@127.0.0.1:55432/metrotrip"
    )
    redis_url: str = "redis://127.0.0.1:56379/0"
    provider_mode: str = "fixture"
    kakao_rest_api_key: SecretStr | None = None
    kakao_sync_ttl_seconds: int = Field(default=86_400, ge=0, le=604_800)
    kakao_place_max_pages: int = Field(default=3, ge=1, le=3)
    kakao_walking_enabled: bool = False
    kakao_walking_service: str = "metrotrip-local"
    jwt_secret: str = Field(default="local-development-secret-change-me-32-chars")
    jwt_issuer: str = "metrotrip-api"
    jwt_audience: str = "metrotrip-clients"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    refresh_cookie_name: str = "metrotrip_refresh"
    cookie_secure: bool = False
    email_provider: str = "logger"
    s3_endpoint_url: str = "http://127.0.0.1:59000"
    s3_public_url: str = "http://127.0.0.1:59000"
    s3_access_key: str = "metrotrip"
    s3_secret_key: str = "metrotrip-local-only"
    s3_bucket: str = "metrotrip-media"
    push_token_encryption_secret: str = "local-push-token-secret-change-me"

    @computed_field
    @property
    def is_local(self) -> bool:
        return self.environment in {"local", "test"}

    @model_validator(mode="after")
    def reject_development_security_defaults_outside_local(self) -> "Settings":
        if self.provider_mode not in {"fixture", "kakao"}:
            raise ValueError("PROVIDER_MODE는 fixture 또는 kakao여야 합니다.")
        if self.provider_mode == "kakao" and not self.kakao_rest_api_key:
            raise ValueError("PROVIDER_MODE=kakao에는 KAKAO_REST_API_KEY가 필요합니다.")
        if self.is_local:
            return self
        insecure: list[str] = []
        if self.jwt_secret == "local-development-secret-change-me-32-chars":
            insecure.append("JWT_SECRET")
        if self.s3_secret_key == "metrotrip-local-only":
            insecure.append("S3_SECRET_KEY")
        if self.push_token_encryption_secret == "local-push-token-secret-change-me":
            insecure.append("PUSH_TOKEN_ENCRYPTION_SECRET")
        if "metrotrip-local-only" in self.database_url:
            insecure.append("DATABASE_URL")
        if not self.cookie_secure:
            insecure.append("COOKIE_SECURE")
        if not self.web_origin.startswith("https://"):
            insecure.append("WEB_ORIGIN")
        if insecure:
            names = ", ".join(sorted(insecure))
            raise ValueError(f"비로컬 환경에서 개발용 보안 설정을 사용할 수 없습니다: {names}")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
