"""Environment-based application settings."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        env_prefix="METROTRIP_",
        extra="ignore",
    )

    app_name: str = "MetroTrip API"
    app_env: str = "local"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    database_url: str
    ssl_ca_path: str | None = Field(
        default=None,
        validation_alias="SSL_CA_PATH",
    )
    cors_origins: list[str] = ["http://localhost:5173"]
    jwt_secret: str = "local-only-change-this-secret"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14
    public_frontend_url: str = "http://localhost:5173"
    share_link_expire_days: int = Field(default=7, ge=1)
    verification_code_expire_minutes: int = 5
    verification_max_attempts: int = 5
    email_mode: str = "console"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_use_tls: bool = True
    media_root_dir: str = "media"
    media_upload_expire_minutes: int = 15

    # DB 이중화 (docs/DB-FAILOVER.md)
    oracle_ro_url: str | None = None
    oracle_sync_url: str | None = None
    oracle_wallet_dir: str | None = None
    oracle_wallet_password: str | None = None
    failover_cache_seconds: float = 5.0
    failover_fail_threshold: int = 2
    failover_recover_threshold: int = 2
    sync_interval_minutes: int = 10
    sync_exclude_tables: list[str] = Field(default_factory=list)

    def oracle_connect_args(self) -> dict[str, str]:
        """Autonomous DB 지갑(mTLS) 접속 파라미터. 지갑 미사용 시 빈 dict."""
        if not self.oracle_wallet_dir:
            return {}
        args = {"config_dir": self.oracle_wallet_dir, "wallet_location": self.oracle_wallet_dir}
        if self.oracle_wallet_password:
            args["wallet_password"] = self.oracle_wallet_password
        return args

    def mysql_connect_args(self) -> dict[str, dict[str, str]]:
        """Aiven 등 TLS 필수 MySQL 접속 파라미터. CA 경로 미설정 시 빈 dict."""
        if not self.ssl_ca_path:
            return {}
        return {"ssl": {"ca": self.ssl_ca_path}}


@lru_cache
def get_settings() -> Settings:
    return Settings()
