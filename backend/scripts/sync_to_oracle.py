"""MySQL → Oracle 단방향 전체 재적재.

docs/DB-FAILOVER.md §3.4, §8 참고.

증분(upsert)이 아니라 테이블 전체를 delete-all → insert-all로 재적재한다.
이유: 스키마가 하드 삭제 정책이라 증분(updated_at 기준)으로는 MySQL에서
삭제된 행이 Oracle에 영구히 남는다. 대상 테이블 합계가 (train_timetables
제외 시) 1,000행 미만이라 전체 재적재가 수 초 내에 끝나므로 이 방식이
증분보다 단순하면서도 더 안전하다.

테이블 순서는 별도 목록으로 관리하지 않고 SQLAlchemy가 FK로부터 계산하는
위상 정렬(Base.metadata.sorted_tables)을 그대로 사용한다 — 스키마가 바뀌어도
순서표가 낡아 어긋나는 일이 없다. 삽입은 이 순서, 삭제는 역순.

사용법:
    python -m scripts.sync_to_oracle                      # 기본 동기화
    python -m scripts.sync_to_oracle --include-timetables # 시간표 포함
    python -m scripts.sync_to_oracle --verify              # 행 수만 비교
    python -m scripts.sync_to_oracle --dry-run              # 실행 계획만 출력
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterable
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import Engine, Table, create_engine, func, select
from sqlalchemy.engine import Connection

from app.config import get_settings
from app.database import Base
from app.db_failover import SYNC_STATE_PATH

# 모델을 import해야 Base.metadata에 23개 테이블이 전부 등록된다.
from app.models import (  # noqa: F401
    auth,
    community,
    notices,
    plans,
    reviews,
    transit,
    users,
)

# §8.3-① TIME → VARCHAR2(8) 변환 대상. MySQL 드라이버는 TIME을 timedelta로
# 반환하므로(24시 이후 값 보존) 그대로 바인딩하면 실패한다.
TIME_COLUMNS: set[tuple[str, str]] = {
    ("train_timetables", "arrival_time"),
    ("train_timetables", "departure_time"),
    ("travel_plan_items", "visit_time"),
}

# §8.3-③ Oracle은 ''를 NULL로 취급하므로 NOT NULL 문자열 컬럼에 ''가 있으면
# 적재가 ORA-01400으로 실패한다. 적재 전 반드시 0건인지 확인한다.
EMPTY_STRING_CHECKS: list[tuple[str, str]] = [
    ("places", "address"),
    ("places", "place_name"),
    ("stations", "station_name"),
    ("subway_lines", "line_name"),
    ("reviews", "title"),
    ("reviews", "content"),
    ("board_posts", "title"),
    ("board_posts", "content"),
    ("notices", "title"),
    ("notices", "content"),
    ("place_images", "image_url"),
    ("travel_plans", "plan_title"),
    ("review_tags", "tag_name"),
]

DEFAULT_BATCH_SIZE = 5000


class SyncVerificationError(RuntimeError):
    """커밋 직전 행 수 대조에 실패했을 때 발생한다."""

    def __init__(self, mismatches: dict[str, tuple[int, int]]) -> None:
        self.mismatches = mismatches
        detail = ", ".join(
            f"{name}(예상 {expected} / 실제 {actual})"
            for name, (expected, actual) in mismatches.items()
        )
        super().__init__(f"행 수 불일치로 롤백함: {detail}")


def to_time_string(value: time | timedelta | None) -> str | None:
    """timedelta 또는 time → 'HH24:MI:SS' 문자열. 24시 이후 값도 보존한다."""
    if value is None:
        return None
    if isinstance(value, timedelta):
        total_seconds = int(value.total_seconds())
    else:
        total_seconds = value.hour * 3600 + value.minute * 60 + value.second
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def transform_row(table_name: str, row: dict) -> dict:
    for column_name in row:
        if (table_name, column_name) in TIME_COLUMNS:
            row[column_name] = to_time_string(row[column_name])
    return row


def sync_tables(
    *, include_timetables: bool = False, exclude: Iterable[str] = ()
) -> list[Table]:
    """FK 위상 정렬 순서(삽입 순서)로 동기화 대상 테이블을 반환한다."""
    exclude_set = set(exclude)
    if not include_timetables:
        exclude_set.add("train_timetables")
    return [t for t in Base.metadata.sorted_tables if t.name not in exclude_set]


def check_empty_strings(mysql_engine: Engine) -> dict[str, int]:
    """§8.3-③ 사전 점검. 위반이 있으면 {"테이블.컬럼": 건수} 를 반환한다."""
    violations: dict[str, int] = {}
    with mysql_engine.connect() as conn:
        for table_name, column_name in EMPTY_STRING_CHECKS:
            table = Base.metadata.tables[table_name]
            column = table.c[column_name]
            count = conn.execute(
                select(func.count()).select_from(table).where(column == "")
            ).scalar_one()
            if count:
                violations[f"{table_name}.{column_name}"] = count
    return violations


def _table_count(conn: Connection, table: Table) -> int:
    return conn.execute(select(func.count()).select_from(table)).scalar_one()


def run_sync(
    mysql_engine: Engine,
    oracle_engine: Engine,
    tables: list[Table],
    *,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> dict[str, int]:
    """전체 재적재를 단일 트랜잭션으로 수행한다. 실패 시 전량 롤백한다."""
    with mysql_engine.connect() as mysql_conn, oracle_engine.connect() as oracle_conn:
        transaction = oracle_conn.begin()
        try:
            for table in reversed(tables):
                oracle_conn.execute(table.delete())

            counts: dict[str, int] = {}
            for table in tables:
                rows = [
                    transform_row(table.name, dict(mapping))
                    for mapping in mysql_conn.execute(select(table)).mappings()
                ]
                for start in range(0, len(rows), batch_size):
                    batch = rows[start : start + batch_size]
                    oracle_conn.execute(table.insert(), batch)
                counts[table.name] = len(rows)

            mismatches = {
                table.name: (counts[table.name], actual)
                for table in tables
                if (actual := _table_count(oracle_conn, table)) != counts[table.name]
            }
            if mismatches:
                raise SyncVerificationError(mismatches)
        except Exception:
            transaction.rollback()
            raise
        else:
            transaction.commit()
    return counts


def verify_row_counts(
    mysql_engine: Engine, oracle_engine: Engine, tables: list[Table]
) -> dict[str, tuple[int, int]]:
    """--verify: 쓰기 없이 양쪽 행 수만 비교한다."""
    mismatches: dict[str, tuple[int, int]] = {}
    with mysql_engine.connect() as mysql_conn, oracle_engine.connect() as oracle_conn:
        for table in tables:
            mysql_count = _table_count(mysql_conn, table)
            oracle_count = _table_count(oracle_conn, table)
            print(f"  {table.name}: mysql={mysql_count} oracle={oracle_count}")
            if mysql_count != oracle_count:
                mismatches[table.name] = (mysql_count, oracle_count)
    return mismatches


def write_sync_state(counts: dict[str, int]) -> None:
    SYNC_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "tables": counts,
    }
    SYNC_STATE_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--include-timetables",
        action="store_true",
        help="train_timetables(약 95,000행)도 함께 동기화한다.",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="쓰기 없이 양쪽 테이블 행 수만 비교한다.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="DB에 연결하지 않고 실행 계획(테이블 순서)만 출력한다.",
    )
    args = parser.parse_args(argv)

    settings = get_settings()
    tables = sync_tables(
        include_timetables=args.include_timetables,
        exclude=settings.sync_exclude_tables,
    )

    if args.dry_run:
        print(f"삽입 순서 ({len(tables)}개 테이블):")
        for table in tables:
            print(f"  - {table.name}")
        print("삭제는 이 역순으로 수행됩니다.")
        return 0

    if not settings.oracle_sync_url:
        print("METROTRIP_ORACLE_SYNC_URL이 설정되지 않았습니다.", file=sys.stderr)
        return 1

    mysql_engine = create_engine(settings.database_url)
    oracle_engine = create_engine(settings.oracle_sync_url)

    if args.verify:
        print("행 수 비교:")
        mismatches = verify_row_counts(mysql_engine, oracle_engine, tables)
        if mismatches:
            print(f"불일치 {len(mismatches)}건 발견", file=sys.stderr)
            return 1
        print("모든 테이블 행 수 일치.")
        return 0

    violations = check_empty_strings(mysql_engine)
    if violations:
        print(
            "NOT NULL 문자열 컬럼에 빈 문자열이 있어 동기화를 중단합니다:",
            file=sys.stderr,
        )
        for key, count in violations.items():
            print(f"  - {key}: {count}건", file=sys.stderr)
        return 1

    counts = run_sync(mysql_engine, oracle_engine, tables)
    write_sync_state(counts)
    total = sum(counts.values())
    print(f"동기화 완료: {len(tables)}개 테이블, 총 {total}행")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
