"""Environment-based application settings."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

# pydantic_settings를 사용하여 환경 변수를 검증하고 로드하는 클래스
# .env 파일에서 설정값을 읽어오며, 'METROTRIP_' 접두사가 붙은 환경변수와 자동으로 매핑됨.
class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="METROTRIP_",
        extra="ignore" # 모델에 정의되지 않은 환경변수가 들어오면 오류를 내지 않고 무시
    )

    # 애플리케이션 기본 설정값
    app_name: str = "MetroTrip API"
    app_env: str = "local"              # 현재 실행 환경
    debug: bool = False
    api_v1_prefix: str = "/api/v1"      # API 버전 관리를 위한 공통 URL 라우터 접두사
    database_url: str = (
        "mysql+pymysql://metrotrip:metrotrip@localhost:3306/"
        "metrotrip_db?charset=utf8mb4"
    )                                   # 테스트 DB 연결 
    cors_origins: list[str] = ["http://localhost:5173"]     # CORS 허용 출처


@lru_cache
def get_settings() -> Settings:
    # lru_cache 데코레이터를 사용하여 Settings 인스턴스를 메모리에 캐싱(싱글톤 패턴처럼 동작)을 함
    # 매 요청마다 파일 시스템(.env)에 접근하는 오버헤드를 줄여 성능을 최적화
    return Settings()
