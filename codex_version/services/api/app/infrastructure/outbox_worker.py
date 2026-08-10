from __future__ import annotations

import json
import logging
import os
import signal
from datetime import UTC, datetime, timedelta
from threading import Event
from typing import Protocol
from uuid import UUID

from sqlalchemy import select

from app.infrastructure.database import SessionLocal
from app.recruitments.models import OutboxEvent

logger = logging.getLogger("metrotrip.worker")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(message)s")
shutdown = Event()


class EventPublisher(Protocol):
    def publish(self, event: OutboxEvent) -> None: ...


class DevelopmentEventPublisher:
    """외부 자격 증명 없이 이벤트 메타데이터만 구조화 로그로 전달한다."""

    def publish(self, event: OutboxEvent) -> None:
        logger.info(
            json.dumps(
                {
                    "event": "outbox.processed",
                    "eventId": str(event.id),
                    "eventType": event.event_type,
                    "aggregateType": event.aggregate_type,
                    "aggregateId": str(event.aggregate_id),
                    "provider": "development-logger",
                },
                ensure_ascii=False,
            )
        )


def process_one(publisher: EventPublisher | None = None, event_id: UUID | None = None) -> bool:
    publisher = publisher or DevelopmentEventPublisher()
    now = datetime.now(UTC)
    with SessionLocal() as db:
        statement = select(OutboxEvent).where(
            OutboxEvent.processed_at.is_(None), OutboxEvent.available_at <= now
        )
        if event_id is not None:
            statement = statement.where(OutboxEvent.id == event_id)
        event = db.scalar(
            statement.order_by(OutboxEvent.occurred_at, OutboxEvent.id)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if event is None:
            return False
        event.attempts += 1
        try:
            publisher.publish(event)
        except Exception as error:  # pragma: no cover - provider별 예외를 공통 재시도 정책으로 변환
            delay = min(2**event.attempts, 300)
            event.available_at = now + timedelta(seconds=delay)
            event.last_error = f"{type(error).__name__}: {error}"[:1000]
            db.commit()
            logger.exception("outbox provider failure event_id=%s", event.id)
            return True
        event.processed_at = now
        event.last_error = None
        db.commit()
        return True


def _request_shutdown(_signum: int, _frame: object) -> None:
    shutdown.set()


def run() -> None:
    signal.signal(signal.SIGTERM, _request_shutdown)
    signal.signal(signal.SIGINT, _request_shutdown)
    poll_seconds = max(0.2, min(float(os.getenv("WORKER_POLL_SECONDS", "1")), 30.0))
    logger.info(json.dumps({"event": "worker.started", "pollSeconds": poll_seconds}))
    while not shutdown.is_set():
        if not process_one():
            shutdown.wait(poll_seconds)
    logger.info(json.dumps({"event": "worker.stopped"}))
