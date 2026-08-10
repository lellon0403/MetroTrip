import os
from uuid import uuid4

import pytest
from sqlalchemy import delete

from app.infrastructure.database import SessionLocal
from app.infrastructure.outbox_worker import process_one
from app.recruitments.models import OutboxEvent

pytestmark = pytest.mark.skipif(
    os.getenv("METROTRIP_RUN_POSTGRES_TESTS") != "1",
    reason="실제 PostgreSQL 통합 테스트는 명시적으로 활성화합니다.",
)


class RecordingPublisher:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.event_ids: list[str] = []

    def publish(self, event: OutboxEvent) -> None:
        self.event_ids.append(str(event.id))
        if self.fail:
            raise RuntimeError("provider unavailable")


def test_worker_marks_success_and_schedules_failed_event_retry() -> None:
    success_id, failure_id = uuid4(), uuid4()
    with SessionLocal() as db:
        db.add_all(
            [
                OutboxEvent(
                    id=success_id,
                    event_type="test.success",
                    aggregate_type="test",
                    aggregate_id=success_id,
                    payload={"safe": True},
                ),
                OutboxEvent(
                    id=failure_id,
                    event_type="test.retry",
                    aggregate_type="test",
                    aggregate_id=failure_id,
                    payload={"safe": True},
                ),
            ]
        )
        db.commit()

    try:
        success_publisher = RecordingPublisher()
        assert process_one(success_publisher, success_id)
        assert success_publisher.event_ids == [str(success_id)]

        failure_publisher = RecordingPublisher(fail=True)
        assert process_one(failure_publisher, failure_id)
        assert failure_publisher.event_ids == [str(failure_id)]

        with SessionLocal() as db:
            success = db.get(OutboxEvent, success_id)
            failure = db.get(OutboxEvent, failure_id)
            assert success is not None and success.processed_at is not None
            assert success.attempts == 1 and success.last_error is None
            assert failure is not None and failure.processed_at is None
            assert failure.attempts == 1
            assert failure.last_error == "RuntimeError: provider unavailable"
            assert failure.available_at > failure.occurred_at
    finally:
        with SessionLocal() as db:
            db.execute(delete(OutboxEvent).where(OutboxEvent.id.in_([success_id, failure_id])))
            db.commit()
