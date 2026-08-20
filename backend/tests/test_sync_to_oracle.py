"""sync_to_oracle.py 단위/통합 테스트 (docs/DB-FAILOVER.md §8).

Oracle 없이도 검증 가능한 부분만 다룬다: TIME 변환, FK 순서, 빈 문자열
점검, 그리고 전체 재적재(delete-all → insert-all)의 원자성·행 수 대조는
run_sync()가 엔진을 인자로 받는 구조를 이용해 SQLite 두 개로 왕복시켜
검증한다.
"""

import json
from datetime import time, timedelta

import pytest
from sqlalchemy import (
    Column,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    create_engine,
    event,
    select,
    text,
)
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.main import app  # noqa: F401  — 전체 모델을 Base.metadata에 등록시킨다
from scripts import sync_to_oracle


def _sqlite_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys = ON")

    return engine


# --- TIME → 문자열 변환 (§8.3-①) -------------------------------------------


def test_to_time_string_none_stays_none():
    assert sync_to_oracle.to_time_string(None) is None


def test_to_time_string_preserves_values_past_24h():
    """timedelta는 train_timetables처럼 24시 이후 값을 가질 수 있다."""
    assert sync_to_oracle.to_time_string(timedelta(hours=24, minutes=1)) == "24:01:00"


def test_to_time_string_handles_plain_time():
    """travel_plan_items.visit_time은 timedelta가 아닌 datetime.time으로 온다."""
    assert sync_to_oracle.to_time_string(time(9, 5, 3)) == "09:05:03"


def test_transform_row_only_touches_time_columns():
    row = {"arrival_time": timedelta(hours=1), "train_no": "K101"}
    transformed = sync_to_oracle.transform_row("train_timetables", row)
    assert transformed["arrival_time"] == "01:00:00"
    assert transformed["train_no"] == "K101"


# --- FK 위상 정렬 (§8.1) -----------------------------------------------------


def test_sync_tables_includes_all_v1_12_tables():
    names = [t.name for t in sync_to_oracle.sync_tables()]
    assert "train_timetables" in names
    assert "users" in names
    assert len(names) == 23


def test_sync_tables_respects_fk_dependency_order():
    names = [t.name for t in sync_to_oracle.sync_tables()]
    assert names.index("users") < names.index("user_agreements")
    assert names.index("stations") < names.index("station_favorites")
    assert names.index("subway_lines") < names.index("line_stations")
    assert names.index("travel_plans") < names.index("reviews")
    assert names.index("reviews") < names.index("review_media")
    assert names.index("places") < names.index("place_stations")
    assert names.index("board_posts") < names.index("post_participants")


# --- 빈 문자열 사전 점검 (§8.3-③) -------------------------------------------


def test_check_empty_strings_detects_violation():
    engine = _sqlite_engine()
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO subway_lines (line_id, line_name, display_order) "
                "VALUES (1, '', 0)"
            )
        )
    violations = sync_to_oracle.check_empty_strings(engine)
    assert violations["subway_lines.line_name"] == 1


def test_check_empty_strings_clean_when_no_violations():
    engine = _sqlite_engine()
    Base.metadata.create_all(engine)
    assert sync_to_oracle.check_empty_strings(engine) == {}


# --- 전체 재적재 원자성·행 수 대조 (§8.2) — SQLite 왕복으로 검증 -------------


@pytest.fixture
def toy_tables():
    """Base.metadata와 무관한 최소 FK 구조(부모-자식)로 run_sync 로직만 검증한다."""
    metadata = MetaData()
    parent = Table(
        "toy_parent",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("name", String(50), nullable=False),
    )
    child = Table(
        "toy_child",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("parent_id", Integer, ForeignKey("toy_parent.id")),
        Column("label", String(50)),
    )
    return metadata, [parent, child]


def test_run_sync_copies_rows_and_reports_counts(toy_tables):
    _, tables = toy_tables
    source = _sqlite_engine()
    dest = _sqlite_engine()
    for table in tables:
        table.metadata.create_all(source)
        table.metadata.create_all(dest)

    parent, child = tables
    with source.begin() as conn:
        conn.execute(parent.insert(), [{"id": 1, "name": "A"}, {"id": 2, "name": "B"}])
        conn.execute(child.insert(), [{"id": 1, "parent_id": 1, "label": "x"}])

    counts = sync_to_oracle.run_sync(source, dest, tables)

    assert counts == {"toy_parent": 2, "toy_child": 1}
    with dest.connect() as conn:
        assert conn.execute(select(parent)).fetchall() == [(1, "A"), (2, "B")]
        assert conn.execute(select(child)).fetchall() == [(1, 1, "x")]


def test_run_sync_replaces_stale_destination_rows(toy_tables):
    """delete-all → insert-all이므로 MySQL에서 삭제된 행은 Oracle에서도 사라져야 한다."""
    _, tables = toy_tables
    (parent,) = [t for t in tables if t.name == "toy_parent"]
    source = _sqlite_engine()
    dest = _sqlite_engine()
    for table in tables:
        table.metadata.create_all(source)
        table.metadata.create_all(dest)

    with dest.begin() as conn:
        conn.execute(parent.insert(), [{"id": 99, "name": "이제는 삭제됨"}])

    with source.begin() as conn:
        conn.execute(parent.insert(), [{"id": 1, "name": "A"}])

    sync_to_oracle.run_sync(source, dest, tables)

    with dest.connect() as conn:
        rows = conn.execute(select(parent)).fetchall()
    assert rows == [(1, "A")]


def test_run_sync_rolls_back_on_row_count_mismatch(monkeypatch, toy_tables):
    _, tables = toy_tables
    parent = tables[0]
    source = _sqlite_engine()
    dest = _sqlite_engine()
    for table in tables:
        table.metadata.create_all(source)
        table.metadata.create_all(dest)

    with dest.begin() as conn:
        conn.execute(parent.insert(), [{"id": 99, "name": "기존 데이터"}])
    with source.begin() as conn:
        conn.execute(parent.insert(), [{"id": 1, "name": "A"}])

    monkeypatch.setattr(sync_to_oracle, "_table_count", lambda conn, table: -1)

    with pytest.raises(sync_to_oracle.SyncVerificationError):
        sync_to_oracle.run_sync(source, dest, [parent])

    with dest.connect() as conn:
        rows = conn.execute(select(parent)).fetchall()
    assert rows == [(99, "기존 데이터")]


def test_verify_row_counts_reports_mismatches(toy_tables):
    _, tables = toy_tables
    parent, child = tables
    source = _sqlite_engine()
    dest = _sqlite_engine()
    for table in tables:
        table.metadata.create_all(source)
        table.metadata.create_all(dest)

    with source.begin() as conn:
        conn.execute(parent.insert(), [{"id": 1, "name": "A"}, {"id": 2, "name": "B"}])

    mismatches = sync_to_oracle.verify_row_counts(source, dest, tables)
    assert mismatches == {"toy_parent": (2, 0)}


# --- 동기화 상태 파일 -------------------------------------------------------


def test_write_sync_state_writes_json(tmp_path, monkeypatch):
    state_path = tmp_path / "sync_state.json"
    monkeypatch.setattr(sync_to_oracle, "SYNC_STATE_PATH", state_path)

    sync_to_oracle.write_sync_state({"users": 3})

    data = json.loads(state_path.read_text(encoding="utf-8"))
    assert data["tables"] == {"users": 3}
    assert "synced_at" in data
