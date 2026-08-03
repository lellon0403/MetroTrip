"""Environment-based application settings."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="METROTRIP_",
        extra="ignore",
    )

    app_name: str = "MetroTrip API"
    app_env: str = "local"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    database_url: str = (
        "mysql+pymysql://metrotrip:metrotrip@localhost:3306/"
        "metrotrip_db?charset=utf8mb4"
    )
    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
