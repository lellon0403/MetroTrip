"""동기화 스케줄러 단위 테스트 (docs/DB-FAILOVER.md §8.1/§8.6).

실제 APScheduler 스레드나 DB 연결 없이, 엔진 생성 시 넘기는 인자와
재시작 방지 가드만 검증한다.
"""

import pytest

from app import scheduler
from scripts import sync_to_oracle as sync_module


@pytest.fixture(autouse=True)
def _reset_scheduler_state():
    scheduler._scheduler = None
    yield
    scheduler._scheduler = None


def test_run_sync_job_passes_wallet_and_ssl_connect_args(monkeypatch):
    """§8.1 회귀: 스케줄러가 자체적으로 만드는 엔진도 database_oracle.py/
    sync_to_oracle.py의 main()과 동일한 wallet/SSL 파라미터를 받아야 한다."""
    captured: list[tuple[str, dict | None]] = []

    class _FakeEngine:
        def dispose(self) -> None:
            pass

    def fake_create_engine(url, connect_args=None, **kwargs):
        captured.append((url, connect_args))
        return _FakeEngine()

    monkeypatch.setattr(scheduler, "create_engine", fake_create_engine)
    monkeypatch.setattr(sync_module, "check_empty_strings", lambda engine: {})
    monkeypatch.setattr(sync_module, "sync_tables", lambda **kwargs: [])
    monkeypatch.setattr(sync_module, "run_sync", lambda *a, **kw: {})
    monkeypatch.setattr(sync_module, "write_sync_state", lambda counts: None)

    settings = scheduler.get_settings()
    monkeypatch.setattr(settings, "oracle_wallet_dir", "/tmp/wallet")
    monkeypatch.setattr(settings, "oracle_wallet_password", None)
    monkeypatch.setattr(settings, "ssl_ca_path", "/tmp/ca.pem")

    scheduler._run_sync_job()

    assert len(captured) == 2
    (_, mysql_connect_args), (_, oracle_connect_args) = captured
    assert mysql_connect_args == {"ssl": {"ca": "/tmp/ca.pem"}}
    assert oracle_connect_args == {
        "config_dir": "/tmp/wallet",
        "wallet_location": "/tmp/wallet",
    }


def test_start_scheduler_skips_restart_when_already_running(monkeypatch):
    """중복 시작을 막아, 이전 스케줄러의 주기 잡이 겹쳐 도는 것을 방지한다."""
    settings = scheduler.get_settings()
    monkeypatch.setattr(settings, "oracle_sync_url", "oracle+oracledb://x:y@z")

    class _FakeScheduler:
        def __init__(self, *args, **kwargs) -> None:
            self.jobs: list[object] = []

        def add_job(self, *args, **kwargs) -> None:
            self.jobs.append((args, kwargs))

        def start(self) -> None:
            pass

    monkeypatch.setattr(scheduler, "BackgroundScheduler", _FakeScheduler)

    first = scheduler.start_scheduler()
    second = scheduler.start_scheduler()

    assert first is second
    assert len(first.jobs) == 1
