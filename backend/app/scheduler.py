"""동기화 스케줄러.

docs/DB-FAILOVER.md §8.6. FastAPI 앱 안에서 APScheduler로 주기 동기화를
수행한다. 반드시 워커 1개(`uvicorn --workers 1`)로 기동해야 한다 — 다중
워커에서는 워커마다 스케줄러가 중복 실행되어 같은 작업이 겹쳐 돈다.

METROTRIP_ORACLE_SYNC_URL이 설정되지 않은 로컬 환경(Oracle 미설치)에서는
스케줄러를 아예 시작하지 않는다.
"""

import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import create_engine

from app.config import get_settings

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _run_sync_job() -> None:
    """MySQL 데이터를 Oracle로 동기화하고 성공 상태를 기록한다."""

    from scripts.sync_to_oracle import (
        check_empty_strings,
        run_sync,
        sync_tables,
        write_sync_state,
    )

    settings = get_settings()
    mysql_engine = None
    oracle_engine = None
    try:
        mysql_engine = create_engine(
            settings.database_url, connect_args=settings.mysql_connect_args()
        )
        oracle_engine = create_engine(
            settings.oracle_sync_url, connect_args=settings.oracle_connect_args()
        )
        violations = check_empty_strings(mysql_engine)
        if violations:
            logger.error("빈 문자열 위반으로 Oracle 동기화를 건너뜁니다: %s", violations)
            return
        tables = sync_tables(
            include_timetables=False, exclude=settings.sync_exclude_tables
        )
        counts = run_sync(mysql_engine, oracle_engine, tables)
        write_sync_state(counts)
        logger.info("Oracle 동기화 완료: 테이블 %d개, 총 %d행", len(counts), sum(counts.values()))
    except Exception:
        logger.exception("Oracle 동기화 실패")
    finally:
        if mysql_engine is not None:
            mysql_engine.dispose()
        if oracle_engine is not None:
            oracle_engine.dispose()


def start_scheduler() -> BackgroundScheduler | None:
    """Oracle 동기화 설정이 있으면 주기 실행 스케줄러를 시작한다."""

    global _scheduler
    if _scheduler is not None:
        logger.warning("동기화 스케줄러가 이미 실행 중입니다. 재시작을 건너뜁니다.")
        return _scheduler
    settings = get_settings()
    if not settings.oracle_sync_url:
        logger.info(
            "METROTRIP_ORACLE_SYNC_URL이 설정되지 않아 동기화 스케줄러를 시작하지 않습니다."
        )
        return None
    _scheduler = BackgroundScheduler(timezone="Asia/Seoul")
    _scheduler.add_job(
        _run_sync_job,
        "interval",
        minutes=settings.sync_interval_minutes,
        id="sync_to_oracle",
        next_run_time=datetime.now(),
        max_instances=1,
        coalesce=True,
    )
    _scheduler.start()
    logger.info("동기화 스케줄러 시작 (주기 %d분)", settings.sync_interval_minutes)
    return _scheduler


def stop_scheduler() -> None:
    """실행 중인 동기화 스케줄러를 종료하고 상태를 초기화한다."""

    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
