import base64
from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, selectinload

from app.planning.models import Plan, PlanDay, PlanShareLink


def encode_plan_cursor(updated_at: datetime, plan_id: UUID) -> str:
    raw = f"{updated_at.isoformat()}|{plan_id}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_plan_cursor(cursor: str) -> tuple[datetime, UUID]:
    padded = cursor + "=" * (-len(cursor) % 4)
    updated_at, plan_id = base64.urlsafe_b64decode(padded).decode().split("|", 1)
    return datetime.fromisoformat(updated_at), UUID(plan_id)


class PlanningRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def _with_tree():
        return selectinload(Plan.days).selectinload(PlanDay.items)

    def add(self, plan: Plan) -> None:
        self.db.add(plan)

    def get(self, plan_id: UUID, *, for_update: bool = False) -> Plan | None:
        statement = (
            select(Plan)
            .options(self._with_tree())
            .where(Plan.id == plan_id, Plan.deleted_at.is_(None))
        )
        if for_update:
            statement = statement.with_for_update()
        return self.db.scalar(statement)

    def list_owned(
        self,
        owner_id: UUID,
        cursor: tuple[datetime, UUID] | None,
        limit: int,
    ) -> list[Plan]:
        statement = (
            select(Plan)
            .where(Plan.owner_id == owner_id, Plan.deleted_at.is_(None))
            .order_by(Plan.updated_at.desc(), Plan.id.desc())
            .limit(limit + 1)
        )
        if cursor:
            updated_at, plan_id = cursor
            statement = statement.where(
                or_(
                    Plan.updated_at < updated_at,
                    and_(Plan.updated_at == updated_at, Plan.id < plan_id),
                )
            )
        return list(self.db.scalars(statement))

    def get_share_for_update(self, token_hash: str) -> PlanShareLink | None:
        return self.db.scalar(
            select(PlanShareLink).where(PlanShareLink.token_hash == token_hash).with_for_update()
        )

    def get_share_by_id_for_update(self, link_id: UUID) -> PlanShareLink | None:
        return self.db.scalar(
            select(PlanShareLink).where(PlanShareLink.id == link_id).with_for_update()
        )
