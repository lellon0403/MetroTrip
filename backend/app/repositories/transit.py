"""지하철 노선과 조회 기록 데이터 접근."""

from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session, aliased

from app.models.plans import TravelPlan, TravelPlanItem
from app.models.transit import (
    LineStation,
    LineViewLog,
    Place,
    PlaceImage,
    PlaceStation,
    Station,
    SubwayLine,
    TrainTimetable,
)


class TransitRepository:
    """지하철 노선과 조회 기록 관련 SQLAlchemy 작업을 담당한다."""

    def __init__(self, session: Session) -> None:
        """DB 세션을 저장한다."""
        self.session = session

    def list_lines(self) -> list[SubwayLine]:
        """모든 노선을 화면 표시 순서와 식별자 순으로 조회한다."""
        statement = select(SubwayLine).order_by(
            SubwayLine.display_order,
            SubwayLine.line_id,
        )
        return list(self.session.scalars(statement))

    def find_line_by_id(self, line_id: int) -> SubwayLine | None:
        """식별자에 해당하는 노선을 조회한다."""
        return self.session.get(SubwayLine, line_id)

    def find_station_by_id(self, station_id: int) -> Station | None:
        """식별자에 해당하는 역을 조회한다."""
        return self.session.get(Station, station_id)

    def list_line_stations(self, line_id: int) -> list[tuple[Station, int]]:
        """한 노선에 속한 역을 station_order 오름차순으로 조회한다."""
        statement = (
            select(Station, LineStation.station_order)
            .join(LineStation, LineStation.station_id == Station.station_id)
            .where(LineStation.line_id == line_id)
            .order_by(LineStation.station_order)
        )
        return [(station, order) for station, order in self.session.execute(statement)]

    def existing_station_ids(self, station_ids: set[int]) -> set[int]:
        """전달한 역 ID 중 실제로 존재하는 ID를 반환한다."""
        if not station_ids:
            return set()
        rows = self.session.scalars(
            select(Station.station_id).where(Station.station_id.in_(station_ids))
        )
        return set(rows)

    def find_place_by_id(
        self,
        place_id: int,
        *,
        for_update: bool = False,
    ) -> Place | None:
        """장소를 조회하고 필요하면 삭제 트랜잭션을 위해 행을 잠근다."""
        if not for_update:
            return self.session.get(Place, place_id)
        return self.session.scalar(
            select(Place).where(Place.place_id == place_id).with_for_update()
        )

    def create_place(
        self,
        *,
        place_name: str,
        category: str,
        description: str | None,
        address: str,
        latitude: float,
        longitude: float,
        phone: str | None,
        created_by: int,
    ) -> Place:
        """추천 장소를 생성하고 자식 행 생성에 사용할 식별자를 할당한다."""
        place = Place(
            place_name=place_name,
            category=category,
            description=description,
            address=address,
            latitude=latitude,
            longitude=longitude,
            phone=phone,
            created_by=created_by,
        )
        self.session.add(place)
        self.session.flush()
        return place

    def list_place_station_ids(self, place_id: int) -> list[int]:
        """장소에 연결된 역 ID를 중복 없이 오름차순으로 조회한다."""
        rows = self.session.scalars(
            select(PlaceStation.station_id)
            .where(PlaceStation.place_id == place_id)
            .distinct()
            .order_by(PlaceStation.station_id)
        )
        return list(rows)

    def replace_place_stations(
        self,
        place_id: int,
        station_ids: list[int],
    ) -> None:
        """장소의 기존 접근역 매핑을 전달받은 역 목록으로 교체한다."""
        self.session.execute(
            delete(PlaceStation).where(PlaceStation.place_id == place_id)
        )
        self.session.add_all(
            [
                PlaceStation(place_id=place_id, station_id=station_id)
                for station_id in station_ids
            ]
        )

    def replace_place_images(
        self,
        place_id: int,
        image_urls: list[str],
    ) -> None:
        """장소 이미지를 요청 순서에 따라 1부터 정렬 번호를 부여해 교체한다."""
        self.session.execute(
            delete(PlaceImage).where(PlaceImage.place_id == place_id)
        )
        self.session.add_all(
            [
                PlaceImage(
                    place_id=place_id,
                    image_url=image_url,
                    sort_order=sort_order,
                )
                for sort_order, image_url in enumerate(image_urls, start=1)
            ]
        )

    def delete_plan_items_by_place_id(self, place_id: int) -> set[int]:
        """장소를 참조하는 계획 항목을 삭제하고 영향받은 계획 ID를 반환한다."""
        plan_ids = set(
            self.session.scalars(
                select(TravelPlanItem.plan_id)
                .where(TravelPlanItem.place_id == place_id)
                .distinct()
            )
        )
        self.session.execute(
            delete(TravelPlanItem).where(TravelPlanItem.place_id == place_id)
        )
        return plan_ids

    def touch_travel_plans(self, plan_ids: set[int]) -> None:
        """장소 항목이 제거된 여행 계획의 수정 시각을 현재 시각으로 갱신한다."""
        if plan_ids:
            self.session.execute(
                update(TravelPlan)
                .where(TravelPlan.plan_id.in_(plan_ids))
                .values(updated_at=func.current_timestamp())
            )

    def delete_place(self, place: Place) -> None:
        """추천 장소를 삭제 대상으로 등록한다."""
        self.session.delete(place)

    def list_stations(
        self,
        *,
        keyword: str | None,
        line_id: int | None,
        page: int,
        size: int,
    ) -> tuple[list[Station], int]:
        """이름·노선 필터에 맞는 역을 페이지 조회하고 전체 건수를 반환한다."""
        conditions = []
        if keyword is not None:
            conditions.append(
                Station.station_name.contains(keyword, autoescape=True)
            )

        total_statement = select(
            func.count(func.distinct(Station.station_id))
        ).select_from(Station)
        statement = select(Station)
        if line_id is not None:
            total_statement = total_statement.join(
                LineStation,
                LineStation.station_id == Station.station_id,
            )
            statement = statement.join(
                LineStation,
                LineStation.station_id == Station.station_id,
            )
            conditions.append(LineStation.line_id == line_id)

        total = self.session.scalar(total_statement.where(*conditions)) or 0
        statement = (
            statement.where(*conditions)
            .distinct()
            .order_by(Station.station_name, Station.station_id)
            .offset((page - 1) * size)
            .limit(size)
        )
        return list(self.session.scalars(statement)), total

    def list_lines_by_station_id(self, station_id: int) -> list[SubwayLine]:
        """역이 속한 노선을 화면 표시 순서대로 조회한다."""
        statement = (
            select(SubwayLine)
            .join(LineStation, LineStation.line_id == SubwayLine.line_id)
            .where(LineStation.station_id == station_id)
            .order_by(SubwayLine.display_order, SubwayLine.line_id)
        )
        return list(self.session.scalars(statement))

    def list_lines_by_station_ids(
        self,
        station_ids: list[int],
    ) -> list[tuple[int, SubwayLine]]:
        """여러 역의 소속 노선을 한 번에 조회한다."""
        if not station_ids:
            return []
        statement = (
            select(LineStation.station_id, SubwayLine)
            .join(SubwayLine, SubwayLine.line_id == LineStation.line_id)
            .where(LineStation.station_id.in_(station_ids))
            .order_by(
                LineStation.station_id,
                SubwayLine.display_order,
                SubwayLine.line_id,
            )
        )
        return list(self.session.execute(statement).tuples())

    def station_line_exists(self, station_id: int, line_id: int) -> bool:
        """역과 노선의 소속 관계가 존재하는지 확인한다."""
        statement = select(LineStation.line_station_id).where(
            LineStation.station_id == station_id,
            LineStation.line_id == line_id,
        )
        return self.session.scalar(statement) is not None

    def list_timetables(
        self,
        *,
        station_id: int,
        line_id: int,
        day_type: str,
        direction: str,
    ) -> list[tuple[TrainTimetable, str | None]]:
        """역·노선·요일·방향에 맞는 시간표와 종착역 이름을 조회한다."""
        destination = aliased(Station)
        statement = (
            select(TrainTimetable, destination.station_name)
            .outerjoin(
                destination,
                destination.station_id
                == TrainTimetable.destination_station_id,
            )
            .where(
                TrainTimetable.station_id == station_id,
                TrainTimetable.line_id == line_id,
                TrainTimetable.day_type == day_type,
                TrainTimetable.direction == direction,
            )
            .order_by(
                func.coalesce(
                    TrainTimetable.departure_time,
                    TrainTimetable.arrival_time,
                ),
                TrainTimetable.timetable_id,
            )
        )
        return list(self.session.execute(statement).tuples())

    def list_places_by_station_id(
        self,
        *,
        station_id: int,
        category: str | None,
        page: int,
        size: int,
    ) -> tuple[list[Place], int]:
        """역 주변 장소를 중복 없이 페이지 조회하고 전체 건수를 반환한다.

        place_stations에 (place_id, station_id) 유니크 제약이 없어 조인 결과가
        중복될 수 있다. 예전에는 select(Place)에 바로 distinct()를 걸었는데,
        Place.description이 CLOB(Oracle)이라 Oracle 폴백 경로에서
        "ORA-00932: inconsistent datatypes: expected - got CLOB"로 깨졌다
        (CLOB 컬럼이 섞인 SELECT에는 DISTINCT를 못 씀). place_id만 먼저
        distinct로 뽑고, 그 ID로 Place 전체를 다시 조회하는 2단계로 우회한다
        — 2단계는 이미 중복 없는 ID 목록이라 DISTINCT가 필요 없다.
        """
        conditions = [PlaceStation.station_id == station_id]
        if category is not None:
            conditions.append(Place.category == category)

        id_statement = (
            select(Place.place_id)
            .join(PlaceStation, PlaceStation.place_id == Place.place_id)
            .where(*conditions)
            .distinct()
        )
        total = self.session.scalar(select(func.count()).select_from(id_statement.subquery())) or 0

        place_ids = self.session.scalars(
            id_statement.order_by(Place.place_id)
            .offset((page - 1) * size)
            .limit(size)
        ).all()
        if not place_ids:
            return [], total

        statement = (
            select(Place)
            .where(Place.place_id.in_(place_ids))
            .order_by(Place.place_id)
        )
        return list(self.session.scalars(statement)), total

    def list_place_images(
        self,
        place_ids: list[int],
    ) -> list[PlaceImage]:
        """여러 장소의 이미지를 장소와 표시 순서대로 조회한다."""
        if not place_ids:
            return []
        statement = (
            select(PlaceImage)
            .where(PlaceImage.place_id.in_(place_ids))
            .order_by(PlaceImage.place_id, PlaceImage.sort_order)
        )
        return list(self.session.scalars(statement))

    def create_line_view(
        self,
        line_id: int,
        user_id: int | None,
    ) -> LineViewLog:
        """회원 또는 비회원의 노선 조회 기록을 생성한다."""
        log = LineViewLog(line_id=line_id, user_id=user_id)
        self.session.add(log)
        return log

    def list_suggested_lines(
        self,
        viewed_since: datetime,
        limit: int,
    ) -> list[SubwayLine]:
        """기준 시각 이후 조회수가 높은 노선을 지정된 개수만큼 조회한다."""
        view_counts = (
            select(
                LineViewLog.line_id.label("line_id"),
                func.count(LineViewLog.log_id).label("view_count"),
            )
            .where(LineViewLog.viewed_at >= viewed_since)
            .group_by(LineViewLog.line_id)
            .subquery()
        )
        statement = (
            select(SubwayLine)
            .join(view_counts, view_counts.c.line_id == SubwayLine.line_id)
            .order_by(
                view_counts.c.view_count.desc(),
                SubwayLine.display_order,
                SubwayLine.line_id,
            )
            .limit(limit)
        )
        return list(self.session.scalars(statement))
