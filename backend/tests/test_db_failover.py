"""MySQL 헬스체크·읽기 폴백·쓰기 503 단위 테스트 (docs/DB-FAILOVER.md §6)."""

import pytest
from fastapi import HTTPException

from app import db_failover


class _FakeSession:
    """SessionLocal() 대역. get_db/get_read_db의 finally: database.close()를 만족시킨다."""

    def close(self) -> None:
        pass


@pytest.fixture(autouse=True)
def _reset_failover_state():
    """테스트 간 헬스체크 캐시/카운터가 새지 않도록 초기화한다."""
    db_failover._state.update(
        {"healthy": True, "checked_at": float("-inf"), "fail": 0, "ok": 0}
    )
    db_failover.settings.failover_cache_seconds = 0
    db_failover.settings.failover_fail_threshold = 2
    db_failover.settings.failover_recover_threshold = 2
    original_oracle_ro_url = db_failover.settings.oracle_ro_url
    yield
    db_failover.settings.oracle_ro_url = original_oracle_ro_url


def test_primary_healthy_true_when_probe_succeeds(monkeypatch):
    monkeypatch.setattr(db_failover, "_probe", lambda: None)
    assert db_failover.primary_healthy() is True


def test_primary_healthy_needs_two_consecutive_failures(monkeypatch):
    def failing_probe():
        raise ConnectionError("down")

    monkeypatch.setattr(db_failover, "_probe", failing_probe)
    assert db_failover.primary_healthy() is True
    assert db_failover.primary_healthy() is False


def test_primary_healthy_needs_two_consecutive_successes_to_recover(monkeypatch):
    def failing_probe():
        raise ConnectionError("down")

    monkeypatch.setattr(db_failover, "_probe", failing_probe)
    db_failover.primary_healthy()
    db_failover.primary_healthy()
    assert db_failover._state["healthy"] is False

    monkeypatch.setattr(db_failover, "_probe", lambda: None)
    assert db_failover.primary_healthy() is False
    assert db_failover.primary_healthy() is True


def test_primary_healthy_uses_cache_within_window(monkeypatch):
    db_failover.settings.failover_cache_seconds = 999
    calls = []
    monkeypatch.setattr(db_failover, "_probe", lambda: calls.append(1))
    db_failover.primary_healthy()
    db_failover.primary_healthy()
    assert len(calls) == 1


def test_primary_healthy_probes_once_under_concurrent_calls(monkeypatch):
    """캐시 만료 직후 여러 요청이 동시에 들어와도 프로브는 한 번만 실행돼야 한다.

    FastAPI가 동기 의존성을 스레드풀에서 돌리므로 _state에 락이 없으면
    여러 스레드가 동시에 캐시 만료를 관찰하고 각자 프로브를 쏠 수 있다.
    """
    import threading

    db_failover.settings.failover_cache_seconds = 999
    call_count = 0
    probe_started = threading.Event()
    release_probe = threading.Event()

    def slow_probe():
        nonlocal call_count
        call_count += 1
        probe_started.set()
        release_probe.wait(timeout=2)

    monkeypatch.setattr(db_failover, "_probe", slow_probe)

    threads = [threading.Thread(target=db_failover.primary_healthy) for _ in range(5)]
    for t in threads:
        t.start()
    assert probe_started.wait(timeout=2)
    release_probe.set()
    for t in threads:
        t.join(timeout=2)

    assert call_count == 1


def test_get_db_raises_503_when_unhealthy(monkeypatch):
    monkeypatch.setattr(db_failover, "primary_healthy", lambda: False)
    with pytest.raises(HTTPException) as exc_info:
        next(db_failover.get_db())
    assert exc_info.value.status_code == 503
    assert exc_info.value.headers["Retry-After"] == "60"
    assert "조회는 정상 이용 가능합니다" in exc_info.value.detail


def test_get_db_yields_mysql_session_when_healthy(monkeypatch):
    monkeypatch.setattr(db_failover, "primary_healthy", lambda: True)
    sentinel = _FakeSession()
    monkeypatch.setattr(db_failover, "SessionLocal", lambda: sentinel)
    assert next(db_failover.get_db()) is sentinel


def test_get_read_db_uses_mysql_when_healthy(monkeypatch):
    monkeypatch.setattr(db_failover, "primary_healthy", lambda: True)
    sentinel = _FakeSession()
    monkeypatch.setattr(db_failover, "SessionLocal", lambda: sentinel)
    assert next(db_failover.get_read_db()) is sentinel


def test_get_read_db_falls_back_to_oracle_when_unhealthy(monkeypatch):
    monkeypatch.setattr(db_failover, "primary_healthy", lambda: False)
    db_failover.settings.oracle_ro_url = "oracle+oracledb://ro:pw@localhost/?service_name=x"
    sentinel = object()

    def fake_oracle_session():
        yield sentinel

    monkeypatch.setattr(db_failover, "get_oracle_read_session", fake_oracle_session)
    assert next(db_failover.get_read_db()) is sentinel


def test_get_read_db_raises_503_when_oracle_not_configured(monkeypatch):
    """Oracle 폴백 설정이 없는 환경(로컬 개발 등)에서는 500 대신 503으로 실패해야 한다."""
    monkeypatch.setattr(db_failover, "primary_healthy", lambda: False)
    db_failover.settings.oracle_ro_url = None
    with pytest.raises(HTTPException) as exc_info:
        next(db_failover.get_read_db())
    assert exc_info.value.status_code == 503


def test_current_routing_reports_mysql_or_oracle(monkeypatch):
    monkeypatch.setattr(db_failover, "primary_healthy", lambda: True)
    assert db_failover.current_routing() == "mysql"
    monkeypatch.setattr(db_failover, "primary_healthy", lambda: False)
    assert db_failover.current_routing() == "oracle"


def test_last_synced_at_reads_state_file(tmp_path, monkeypatch):
    state_path = tmp_path / "sync_state.json"
    state_path.write_text(
        '{"synced_at": "2026-01-01T00:00:00+00:00", "tables": {}}', encoding="utf-8"
    )
    monkeypatch.setattr(db_failover, "SYNC_STATE_PATH", state_path)
    assert db_failover.last_synced_at() == "2026-01-01T00:00:00+00:00"


def test_last_synced_at_returns_none_when_file_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(db_failover, "SYNC_STATE_PATH", tmp_path / "missing.json")
    assert db_failover.last_synced_at() is None
