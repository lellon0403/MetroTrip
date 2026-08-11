"""MySQL 헬스체크와 읽기/쓰기 세션 라우팅.

docs/DB-FAILOVER.md §3, §6 참고.
- get_db(): 쓰기 전용. MySQL이 비정상이면 503을 즉시 반환한다.
- get_read_db(): 조회 전용. MySQL이 unhealthy면 Oracle RO 세션으로 폴백한다.

기존 database.py가 동기(pymysql + SQLAlchemy Session) 구조이므로 여기도 동기로
맞춘다(문서 §6 골격은 async 예시이지만 이 프로젝트 라우터가 전부 동기 def라
그대로 옮기면 세션 타입이 어긋난다). ThreadPoolExecutor로 블로킹 커넥션 시도에
타임아웃을 강제로 씌운다 — pymysql 자체는 무응답(방화벽 드롭 등) 상황에서
기본 타임아웃이 매우 길어 헬스체크가 요청을 붙잡을 수 있기 때문이다.
"""

import json
import threading
import time
from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import BACKEND_DIR, get_settings
from app.database import SessionLocal
from app.database import engine as primary_engine
from app.database_oracle import get_oracle_read_session

settings = get_settings()

SYNC_STATE_PATH = BACKEND_DIR / "var" / "sync_state.json"
_PROBE_TIMEOUT_SECONDS = 2

_state = {"healthy": True, "checked_at": 0.0, "fail": 0, "ok": 0}
_state_lock = threading.Lock()
_probe_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="db-healthcheck")


def _probe() -> None:
    """MySQL에 간단한 쿼리를 실행하여 연결 가능 여부를 확인한다."""

    with primary_engine.connect() as conn:
        conn.execute(text("SELECT 1"))


def primary_healthy() -> bool:
    """MySQL 상태를 캐시(§6: 기본 5초) 범위 내에서 재사용하며 판정한다.

    FastAPI는 동기 의존성을 스레드풀에서 실행하므로, 캐시 만료 직후 여러
    요청이 동시에 primary_healthy()를 호출할 수 있다. 락 없이 _state를
    읽고 쓰면 캐시 판단이 깨지거나(중복 프로브) fail/ok 카운트가 유실될
    수 있어 락으로 감싼다.
    """
    with _state_lock:
        now = time.monotonic()
        if now - _state["checked_at"] < settings.failover_cache_seconds:
            return _state["healthy"]
        _state["checked_at"] = now
    try:
        _probe_executor.submit(_probe).result(timeout=_PROBE_TIMEOUT_SECONDS)
        ok = True
    except Exception:
        ok = False
    with _state_lock:
        if ok:
            _state["ok"] += 1
            _state["fail"] = 0
            if _state["ok"] >= settings.failover_recover_threshold:
                _state["healthy"] = True
        else:
            _state["fail"] += 1
            _state["ok"] = 0
            if _state["fail"] >= settings.failover_fail_threshold:
                _state["healthy"] = False
        return _state["healthy"]


def shutdown_probe_executor() -> None:
    """앱 종료 시 헬스체크 스레드풀을 정리한다(main.py lifespan에서 호출)."""
    _probe_executor.shutdown(wait=False, cancel_futures=True)


def get_db() -> Generator[Session, None, None]:
    """쓰기(POST/PATCH/DELETE)와 쓰기 직후 재조회용 세션."""
    if not primary_healthy():
        raise HTTPException(
            status_code=503,
            detail="일시적으로 등록·수정 기능을 사용할 수 없습니다. 조회는 정상 이용 가능합니다.",
            headers={"Retry-After": "60"},
        )
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()


def get_read_db() -> Generator[Session, None, None]:
    """순수 조회(GET)용 세션. MySQL 장애 시 Oracle RO 세션으로 자동 전환한다."""
    if primary_healthy():
        database = SessionLocal()
        try:
            yield database
        finally:
            database.close()
        return
    if not settings.oracle_ro_url:
        # Oracle 폴백이 설정되지 않은 환경(로컬 개발 등)에서는 원인 불명의 500
        # 대신 get_db()와 동일한 503으로 실패해 사용자에게 명확한 신호를 준다.
        raise HTTPException(
            status_code=503,
            detail="일시적으로 조회 기능을 사용할 수 없습니다.",
            headers={"Retry-After": "60"},
        )
    yield from get_oracle_read_session()


def current_routing() -> str:
    """현재 읽기 요청이 향하는 데이터베이스 이름을 반환한다."""

    return "mysql" if primary_healthy() else "oracle"


def last_synced_at() -> str | None:
    """sync_to_oracle.py가 남긴 마지막 성공 동기화 시각(ISO 8601)을 읽는다."""
    try:
        data = json.loads(Path(SYNC_STATE_PATH).read_text(encoding="utf-8"))
        return data.get("synced_at")
    except (FileNotFoundError, ValueError, OSError):
        return None
