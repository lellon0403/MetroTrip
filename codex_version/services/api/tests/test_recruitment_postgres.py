import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier, Lock
from uuid import UUID, uuid4

import pytest
from sqlalchemy import delete

from app.core.errors import ApiError
from app.identity.models import User
from app.infrastructure.database import SessionLocal
from app.planning.models import Plan, PlanStatus
from app.recruitments.models import (
    ApplicationStatus,
    OutboxEvent,
    Recruitment,
    RecruitmentApplication,
    RecruitmentStatus,
)
from app.recruitments.service import RecruitmentService

pytestmark = pytest.mark.skipif(
    os.getenv("METROTRIP_RUN_POSTGRES_TESTS") != "1",
    reason="실제 PostgreSQL 통합 테스트는 명시적으로 활성화합니다.",
)


def test_simultaneous_acceptance_never_exceeds_capacity() -> None:
    owner_id, plan_id, recruitment_id = uuid4(), uuid4(), uuid4()
    applicant_ids = [uuid4() for _ in range(20)]
    application_ids = [uuid4() for _ in applicant_ids]
    capacity = 5
    marker = uuid4().hex
    with SessionLocal() as db:
        db.add_all(
            [
                User(
                    id=owner_id,
                    email=f"owner-{marker}@example.com",
                    password_hash="test",
                    display_name="owner",
                ),
                *[
                    User(
                        id=applicant_id,
                        email=f"applicant-{index}-{marker}@example.com",
                        password_hash="test",
                        display_name=f"applicant-{index}",
                    )
                    for index, applicant_id in enumerate(applicant_ids)
                ],
            ]
        )
        db.add(
            Plan(
                id=plan_id,
                owner_id=owner_id,
                title="concurrency test plan",
                start_date=datetime.now(UTC).date(),
                end_date=datetime.now(UTC).date(),
                status=PlanStatus.DRAFT,
            )
        )
        db.add(
            Recruitment(
                id=recruitment_id,
                owner_id=owner_id,
                plan_id=plan_id,
                title="concurrency test recruitment",
                body="twenty simultaneous decisions must not exceed capacity",
                capacity=capacity,
                deadline=datetime.now(UTC) + timedelta(days=1),
                meeting_at=datetime.now(UTC) + timedelta(days=2),
            )
        )
        db.add_all(
            [
                RecruitmentApplication(
                    id=application_id,
                    recruitment_id=recruitment_id,
                    applicant_id=applicant_id,
                )
                for application_id, applicant_id in zip(application_ids, applicant_ids, strict=True)
            ]
        )
        db.commit()

    barrier = Barrier(len(application_ids))
    result_lock = Lock()
    outcomes: list[str] = []

    def accept(application_id: UUID) -> None:
        with SessionLocal() as db:
            barrier.wait(timeout=10)
            try:
                RecruitmentService(db).decide(
                    recruitment_id,
                    application_id,
                    owner_id,
                    ApplicationStatus.ACCEPTED,
                )
                outcome = "ACCEPTED"
            except ApiError as error:
                db.rollback()
                outcome = error.code
            with result_lock:
                outcomes.append(outcome)

    try:
        with ThreadPoolExecutor(max_workers=len(application_ids)) as executor:
            list(executor.map(accept, application_ids))
        assert outcomes.count("ACCEPTED") == capacity
        assert outcomes.count("CAPACITY_REACHED") == len(application_ids) - capacity
        with SessionLocal() as db:
            recruitment = db.get(Recruitment, recruitment_id)
            assert recruitment is not None
            assert recruitment.accepted_count == recruitment.capacity == capacity
            assert recruitment.status is RecruitmentStatus.CLOSED
    finally:
        with SessionLocal() as db:
            db.execute(delete(OutboxEvent).where(OutboxEvent.aggregate_id == recruitment_id))
            recruitment = db.get(Recruitment, recruitment_id)
            if recruitment:
                db.delete(recruitment)
                db.flush()
            plan = db.get(Plan, plan_id)
            if plan:
                db.delete(plan)
                db.flush()
            for user_id in [owner_id, *applicant_ids]:
                user = db.get(User, user_id)
                if user:
                    db.delete(user)
            db.commit()
