"""지하철 노선과 조회 기록 데이터 접근."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

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
        """역 주변 장소를 중복 없이 페이지 조회하고 전체 건수를 반환한다."""
        conditions = [PlaceStation.station_id == station_id]
        if category is not None:
            conditions.append(Place.category == category)

        total_statement = (
            select(func.count(func.distinct(Place.place_id)))
            .select_from(Place)
            .join(PlaceStation, PlaceStation.place_id == Place.place_id)
            .where(*conditions)
        )
        total = self.session.scalar(total_statement) or 0

        statement = (
            select(Place)
            .join(PlaceStation, PlaceStation.place_id == Place.place_id)
            .where(*conditions)
            .distinct()
            .order_by(Place.place_id)
            .offset((page - 1) * size)
            .limit(size)
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
