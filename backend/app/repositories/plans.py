"""여행 계획 데이터 조회와 저장."""

from datetime import datetime, time

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.plans import TravelPlan, TravelPlanItem, TravelPlanShareLink
from app.models.transit import Place, PlaceStation, Station


class PlanRepository:
    """여행 계획 관련 SQLAlchemy 작업을 담당한다."""

    def __init__(self, session: Session) -> None:
        """요청 단위 데이터베이스 세션을 저장한다."""
        self.session = session

    def find_plan_by_id(self, plan_id: int) -> TravelPlan | None:
        """식별자로 여행 계획을 조회한다."""
        return self.session.get(TravelPlan, plan_id)

    def list_plans_by_user_id(
        self,
        *,
        user_id: int,
        page: int,
        size: int,
    ) -> tuple[list[TravelPlan], int]:
        """사용자의 여행 계획을 생성 최신순으로 페이지 조회한다."""
        statement = select(TravelPlan).where(TravelPlan.user_id == user_id)
        total = (
            self.session.scalar(select(func.count()).select_from(statement.subquery()))
            or 0
        )
        plans = self.session.scalars(
            statement.order_by(
                TravelPlan.created_at.desc(),
                TravelPlan.plan_id.desc(),
            )
            .offset((page - 1) * size)
            .limit(size)
        ).all()
        return list(plans), total

    def list_plan_items(
        self,
        plan_ids: list[int],
    ) -> dict[int, list[TravelPlanItem]]:
        """여러 계획의 일정 항목을 방문 시간과 식별자 순으로 조회한다."""
        result = {plan_id: [] for plan_id in plan_ids}
        if not plan_ids:
            return result
        items = self.session.scalars(
            select(TravelPlanItem)
            .where(TravelPlanItem.plan_id.in_(plan_ids))
            .order_by(
                TravelPlanItem.plan_id.asc(),
                TravelPlanItem.visit_time.asc(),
                TravelPlanItem.plan_item_id.asc(),
            )
        ).all()
        for item in items:
            result[item.plan_id].append(item)
        return result

    def existing_station_ids(self, station_ids: set[int]) -> set[int]:
        """전달한 역 ID 중 실제로 존재하는 ID를 반환한다."""
        if not station_ids:
            return set()
        rows = self.session.scalars(
            select(Station.station_id).where(Station.station_id.in_(station_ids))
        )
        return set(rows)

    def existing_place_ids(self, place_ids: set[int]) -> set[int]:
        """전달한 장소 ID 중 실제로 존재하는 ID를 반환한다."""
        if not place_ids:
            return set()
        rows = self.session.scalars(
            select(Place.place_id).where(Place.place_id.in_(place_ids))
        )
        return set(rows)

    def existing_place_station_pairs(
        self,
        pairs: set[tuple[int, int]],
    ) -> set[tuple[int, int]]:
        """전달한 장소-접근역 조합 중 실제 매핑된 조합을 반환한다."""
        if not pairs:
            return set()
        place_ids = {place_id for place_id, _ in pairs}
        station_ids = {station_id for _, station_id in pairs}
        rows = self.session.execute(
            select(PlaceStation.place_id, PlaceStation.station_id).where(
                PlaceStation.place_id.in_(place_ids),
                PlaceStation.station_id.in_(station_ids),
            )
        ).all()
        return {
            (row.place_id, row.station_id)
            for row in rows
            if (row.place_id, row.station_id) in pairs
        }

    def get_station_names(self, station_ids: set[int]) -> dict[int, str]:
        """역 ID별 역 이름을 조회한다."""
        if not station_ids:
            return {}
        rows = self.session.execute(
            select(Station.station_id, Station.station_name).where(
                Station.station_id.in_(station_ids)
            )
        ).all()
        return {row.station_id: row.station_name for row in rows}

    def get_place_names(self, place_ids: set[int]) -> dict[int, str]:
        """장소 ID별 장소 이름을 조회한다."""
        if not place_ids:
            return {}
        rows = self.session.execute(
            select(Place.place_id, Place.place_name).where(
                Place.place_id.in_(place_ids)
            )
        ).all()
        return {row.place_id: row.place_name for row in rows}

    def create_plan(
        self,
        *,
        user_id: int,
        plan_title: str,
        start_station_id: int,
        end_station_id: int,
    ) -> TravelPlan:
        """새 여행 계획을 추가하고 식별자를 할당한다."""
        plan = TravelPlan(
            user_id=user_id,
            plan_title=plan_title,
            start_station_id=start_station_id,
            end_station_id=end_station_id,
        )
        self.session.add(plan)
        self.session.flush()
        return plan

    def create_share_link(
        self,
        *,
        plan_id: int,
        token_hash: str,
        expires_at: datetime,
    ) -> TravelPlanShareLink:
        """여행 계획에 만료 시각이 있는 읽기 전용 공유 링크를 추가한다."""
        share_link = TravelPlanShareLink(
            plan_id=plan_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self.session.add(share_link)
        self.session.flush()
        return share_link

    def find_active_share_link_by_token_hash(
        self,
        token_hash: str,
        now: datetime,
    ) -> TravelPlanShareLink | None:
        """해시가 일치하며 만료·폐기되지 않은 공유 링크를 조회한다."""
        return self.session.scalar(
            select(TravelPlanShareLink).where(
                TravelPlanShareLink.token_hash == token_hash,
                TravelPlanShareLink.revoked_at.is_(None),
                TravelPlanShareLink.expires_at > now,
            )
        )

    def add_plan_item(
        self,
        *,
        plan_id: int,
        place_id: int,
        station_id: int | None,
        visit_time: time,
        memo: str | None,
    ) -> TravelPlanItem:
        """여행 계획에 새 일정 항목을 추가한다."""
        item = TravelPlanItem(
            plan_id=plan_id,
            place_id=place_id,
            station_id=station_id,
            visit_time=visit_time,
            memo=memo,
        )
        self.session.add(item)
        return item

    def delete_plan_items(self, plan_item_ids: set[int]) -> None:
        """전달한 식별자의 일정 항목을 삭제한다."""
        if plan_item_ids:
            self.session.execute(
                delete(TravelPlanItem).where(
                    TravelPlanItem.plan_item_id.in_(plan_item_ids)
                )
            )

    def flush(self) -> None:
        """대기 중인 일정 변경을 현재 트랜잭션에 반영한다."""
        self.session.flush()

    def delete_plan(self, plan: TravelPlan) -> None:
        """여행 계획을 삭제한다."""
        self.session.delete(plan)
