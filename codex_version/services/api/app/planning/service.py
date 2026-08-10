import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.discovery.models import Place
from app.planning.models import (
    Plan,
    PlanDay,
    PlanItem,
    PlanShareLink,
    PlanVisibility,
)
from app.planning.repository import PlanningRepository
from app.planning.schemas import PlanWriteRequest
from app.transit.models import Station


class PlanningService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = PlanningRepository(db)

    @staticmethod
    def _token_hash(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()

    def _validate_references(self, body: PlanWriteRequest) -> None:
        station_ids = {
            item.station_id
            for day in body.days
            for item in day.items
            if item.station_id is not None
        }
        place_ids = {
            item.place_id for day in body.days for item in day.items if item.place_id is not None
        }
        if station_ids:
            found = set(self.db.scalars(select(Station.id).where(Station.id.in_(station_ids))))
            if found != station_ids:
                raise ApiError(
                    422, "INVALID_PLAN_STATION", "일정에 존재하지 않는 역이 포함되어 있습니다."
                )
        if place_ids:
            found = set(self.db.scalars(select(Place.id).where(Place.id.in_(place_ids))))
            if found != place_ids:
                raise ApiError(
                    422, "INVALID_PLAN_PLACE", "일정에 존재하지 않는 장소가 포함되어 있습니다."
                )

    @staticmethod
    def _append_days(plan: Plan, body: PlanWriteRequest) -> None:
        for day_position, day_input in enumerate(body.days, start=1):
            day = PlanDay(
                id=uuid4(),
                day_date=day_input.day_date,
                title=day_input.title,
                position=day_position,
            )
            for item_position, item_input in enumerate(day_input.items, start=1):
                day.items.append(
                    PlanItem(
                        id=uuid4(),
                        item_type=item_input.item_type,
                        station_id=item_input.station_id,
                        place_id=item_input.place_id,
                        route_snapshot=item_input.route_snapshot,
                        note=item_input.note,
                        scheduled_time=item_input.scheduled_time,
                        duration_minutes=item_input.duration_minutes,
                        position=item_position,
                    )
                )
            plan.days.append(day)

    def create(self, owner_id: UUID, body: PlanWriteRequest) -> Plan:
        self._validate_references(body)
        plan = Plan(
            id=uuid4(),
            owner_id=owner_id,
            title=body.title,
            description=body.description,
            start_date=body.start_date,
            end_date=body.end_date,
            status=body.status,
            visibility=PlanVisibility.PRIVATE,
            version=1,
        )
        self._append_days(plan, body)
        self.repository.add(plan)
        self.db.commit()
        return self.repository.get(plan.id) or plan

    def get_owned(self, plan_id: UUID, owner_id: UUID, *, for_update: bool = False) -> Plan:
        plan = self.repository.get(plan_id, for_update=for_update)
        if not plan:
            raise ApiError(404, "PLAN_NOT_FOUND", "일정을 찾을 수 없습니다.")
        if plan.owner_id != owner_id:
            raise ApiError(403, "PLAN_FORBIDDEN", "이 일정을 수정할 권한이 없습니다.")
        return plan

    def update(
        self, plan_id: UUID, owner_id: UUID, expected_version: int, body: PlanWriteRequest
    ) -> Plan:
        plan = self.get_owned(plan_id, owner_id, for_update=True)
        if plan.version != expected_version:
            raise ApiError(
                412,
                "PLAN_VERSION_CONFLICT",
                "다른 곳에서 일정이 변경되었습니다. 최신 내용을 다시 불러와 주세요.",
            )
        self._validate_references(body)
        plan.title = body.title
        plan.description = body.description
        plan.start_date = body.start_date
        plan.end_date = body.end_date
        plan.status = body.status
        plan.version += 1
        plan.days.clear()
        # 기존 날짜 행의 orphan delete를 먼저 반영해야 동일 position/date의
        # 교체 행이 PostgreSQL 고유 제약과 충돌하지 않는다.
        self.db.flush()
        self._append_days(plan, body)
        self.db.commit()
        return self.repository.get(plan.id) or plan

    def delete(self, plan_id: UUID, owner_id: UUID) -> None:
        plan = self.get_owned(plan_id, owner_id, for_update=True)
        deleted_at = datetime.now(UTC)
        plan.deleted_at = deleted_at
        plan.visibility = PlanVisibility.PRIVATE
        plan.version += 1
        self.db.execute(
            update(PlanShareLink)
            .where(
                PlanShareLink.plan_id == plan.id,
                PlanShareLink.revoked_at.is_(None),
            )
            .values(revoked_at=deleted_at)
        )
        self.db.commit()

    def list_deleted(self, owner_id: UUID) -> list[Plan]:
        self.repository.purge_expired_deleted(owner_id)
        self.db.commit()
        return self.repository.list_deleted_owned(owner_id)

    def restore(self, plan_id: UUID, owner_id: UUID) -> Plan:
        plan = self.repository.get_deleted_owned(plan_id, owner_id)
        if not plan:
            raise ApiError(404, "DELETED_PLAN_NOT_FOUND", "복원할 수 있는 삭제 일정이 없습니다.")
        plan.deleted_at = None
        plan.visibility = PlanVisibility.PRIVATE
        plan.version += 1
        self.db.commit()
        return self.repository.get(plan.id) or plan

    def create_share_link(
        self,
        plan_id: UUID,
        owner_id: UUID,
        expires_in_days: int | None,
        max_uses: int | None,
    ) -> tuple[str, PlanShareLink]:
        plan = self.get_owned(plan_id, owner_id, for_update=True)
        raw_token = secrets.token_urlsafe(32)
        link = PlanShareLink(
            id=uuid4(),
            plan_id=plan.id,
            token_hash=self._token_hash(raw_token),
            expires_at=(datetime.now(UTC) + timedelta(days=expires_in_days))
            if expires_in_days
            else None,
            max_uses=max_uses,
        )
        plan.visibility = PlanVisibility.UNLISTED
        plan.version += 1
        self.db.add(link)
        self.db.commit()
        self.db.refresh(link)
        return raw_token, link

    def get_shared(self, raw_token: str) -> Plan:
        link = self.repository.get_share_for_update(self._token_hash(raw_token))
        now = datetime.now(UTC)
        if not link:
            raise ApiError(404, "SHARE_LINK_NOT_FOUND", "공유 일정을 찾을 수 없습니다.")
        if link.revoked_at:
            raise ApiError(410, "SHARE_LINK_REVOKED", "공유 링크가 해제되었습니다.")
        if link.expires_at and link.expires_at <= now:
            raise ApiError(410, "SHARE_LINK_EXPIRED", "공유 링크가 만료되었습니다.")
        if link.max_uses is not None and link.use_count >= link.max_uses:
            raise ApiError(410, "SHARE_LINK_EXHAUSTED", "공유 링크 사용 횟수를 모두 사용했습니다.")
        link.use_count += 1
        plan = self.repository.get(link.plan_id)
        if not plan or plan.visibility is not PlanVisibility.UNLISTED:
            raise ApiError(404, "SHARE_LINK_NOT_FOUND", "공유 일정을 찾을 수 없습니다.")
        self.db.commit()
        return plan

    def copy(self, plan_id: UUID, source_owner_id: UUID, new_owner_id: UUID) -> Plan:
        source = self.get_owned(plan_id, source_owner_id)
        return self._copy_source(source, new_owner_id)

    def copy_shared(self, raw_token: str, new_owner_id: UUID) -> Plan:
        return self._copy_source(self.get_shared(raw_token), new_owner_id)

    def revoke_share_link(self, plan_id: UUID, link_id: UUID, owner_id: UUID) -> None:
        self.get_owned(plan_id, owner_id, for_update=True)
        link = self.repository.get_share_by_id_for_update(link_id)
        if not link or link.plan_id != plan_id:
            raise ApiError(404, "SHARE_LINK_NOT_FOUND", "공유 링크를 찾을 수 없습니다.")
        if link.revoked_at is None:
            link.revoked_at = datetime.now(UTC)
        self.db.commit()

    def _copy_source(self, source: Plan, new_owner_id: UUID) -> Plan:
        body = PlanWriteRequest(
            title=f"{source.title} 사본",
            description=source.description,
            start_date=source.start_date,
            end_date=source.end_date,
            status=source.status,
            days=[
                {
                    "dayDate": day.day_date,
                    "title": day.title,
                    "items": [
                        {
                            "itemType": item.item_type,
                            "stationId": item.station_id,
                            "placeId": item.place_id,
                            "routeSnapshot": item.route_snapshot,
                            "note": item.note,
                            "scheduledTime": item.scheduled_time,
                            "durationMinutes": item.duration_minutes,
                        }
                        for item in day.items
                    ],
                }
                for day in source.days
            ],
        )
        return self.create(new_owner_id, body)
