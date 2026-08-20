"""V1.12 기준 SQL과 ORM 메타데이터의 핵심 정합성 회귀 테스트."""

from sqlalchemy import CheckConstraint

from app.models.plans import TravelPlanItem
from app.models.transit import LineViewLog, Station, TrainTimetable


def test_travel_plan_item_constraints_match_v1_12() -> None:
    """일정 항목의 FK 삭제 정책과 CHECK 이름이 기준 SQL과 같아야 한다."""
    station_fk = next(
        foreign_key
        for foreign_key in TravelPlanItem.__table__.foreign_keys
        if foreign_key.parent.name == "station_id"
    )
    check_names = {
        constraint.name
        for constraint in TravelPlanItem.__table__.constraints
        if isinstance(constraint, CheckConstraint)
    }

    assert station_fk.ondelete == "RESTRICT"
    assert {"ck_tpi_item_type", "ck_tpi_item_reference"} <= check_names


def test_performance_indexes_match_v1_12() -> None:
    """기준 SQL의 명시적 성능 인덱스와 컬럼 순서를 ORM에도 보존한다."""
    expected = {
        Station.__table__: {"idx_stations_name": ["station_name"]},
        TrainTimetable.__table__: {
            "idx_timetables_lookup": [
                "station_id",
                "day_type",
                "direction",
                "arrival_time",
            ]
        },
        LineViewLog.__table__: {
            "idx_line_view_logs_time": ["viewed_at", "line_id"]
        },
    }

    for table, indexes in expected.items():
        actual = {
            index.name: [column.name for column in index.columns]
            for index in table.indexes
        }
        for name, columns in indexes.items():
            assert actual[name] == columns
