import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import delete, select

from app.identity.models import User
from app.infrastructure.database import SessionLocal
from app.planning.models import Plan, PlanShareLink, PlanStatus, PlanVisibility
from app.planning.repository import PlanningRepository
from app.planning.service import PlanningService
from app.recruitments.models import Recruitment

pytestmark = pytest.mark.skipif(
    os.getenv("METROTRIP_RUN_POSTGRES_TESTS") != "1",
    reason="실제 PostgreSQL 통합 테스트는 명시적으로 활성화합니다.",
)


def test_plan_soft_delete_hides_plan_and_revokes_links_with_recruitment_history() -> None:
    owner_id, plan_id, recruitment_id, share_id = uuid4(), uuid4(), uuid4(), uuid4()
    marker = uuid4().hex
    now = datetime.now(UTC)

    with SessionLocal() as db:
        db.add(
            User(
                id=owner_id,
                email=f"plan-delete-{marker}@example.com",
                password_hash="test",
                display_name="plan-delete-test",
            )
        )
        db.add(
            Plan(
                id=plan_id,
                owner_id=owner_id,
                title="soft delete test plan",
                start_date=now.date(),
                end_date=now.date(),
                status=PlanStatus.DRAFT,
                visibility=PlanVisibility.UNLISTED,
            )
        )
        db.flush()
        db.add(
            PlanShareLink(
                id=share_id,
                plan_id=plan_id,
                token_hash=marker,
            )
        )
        db.add(
            Recruitment(
                id=recruitment_id,
                owner_id=owner_id,
                plan_id=plan_id,
                title="soft delete linked recruitment",
                body="삭제된 일정과 연결된 모집 기록 보존을 검증합니다.",
                capacity=1,
                deadline=now + timedelta(days=1),
                meeting_at=now + timedelta(days=2),
            )
        )
        db.commit()

    try:
        with SessionLocal() as db:
            PlanningService(db).delete(plan_id, owner_id)

        with SessionLocal() as db:
            stored_plan = db.get(Plan, plan_id)
            stored_share = db.get(PlanShareLink, share_id)
            stored_recruitment = db.get(Recruitment, recruitment_id)
            assert stored_plan is not None and stored_plan.deleted_at is not None
            assert stored_plan.visibility is PlanVisibility.PRIVATE
            assert stored_share is not None and stored_share.revoked_at is not None
            assert stored_recruitment is not None and stored_recruitment.plan_id == plan_id
            assert PlanningRepository(db).get(plan_id) is None
            assert db.scalar(select(Plan.id).where(Plan.id == plan_id)) == plan_id
            assert PlanningRepository(db).list_owned(owner_id, None, 10) == []
    finally:
        with SessionLocal() as db:
            db.execute(delete(Recruitment).where(Recruitment.id == recruitment_id))
            db.execute(delete(Plan).where(Plan.id == plan_id))
            db.execute(delete(User).where(User.id == owner_id))
            db.commit()
