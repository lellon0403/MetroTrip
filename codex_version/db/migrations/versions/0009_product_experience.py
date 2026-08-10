"""product discovery and community experience fields

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-10
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE TYPE notice_kind AS ENUM ('NOTICE', 'EVENT')")
    op.execute("ALTER TABLE notices ADD COLUMN kind notice_kind NOT NULL DEFAULT 'NOTICE'")
    op.execute("ALTER TABLE notices ADD COLUMN banner_url text NULL")
    op.execute("ALTER TABLE notices ADD COLUMN starts_at timestamptz NULL")
    op.execute("ALTER TABLE notices ADD COLUMN ends_at timestamptz NULL")
    op.execute("ALTER TABLE recruitments ADD COLUMN view_count integer NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE reviews ALTER COLUMN destination_station_id DROP NOT NULL")
    op.execute("ALTER TABLE media_assets ADD COLUMN width integer NULL")
    op.execute("ALTER TABLE media_assets ADD COLUMN height integer NULL")
    op.execute(
        "CREATE TABLE place_search_syncs ("
        "cache_key varchar(64) PRIMARY KEY, source_name varchar(120) NOT NULL, "
        "result_count integer NOT NULL DEFAULT 0, synced_at timestamptz NOT NULL)"
    )
    op.execute(
        "CREATE INDEX ix_place_search_sync_freshness "
        "ON place_search_syncs(source_name, synced_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX ix_place_search_sync_freshness")
    op.execute("DROP TABLE place_search_syncs")
    op.execute("ALTER TABLE media_assets DROP COLUMN height")
    op.execute("ALTER TABLE media_assets DROP COLUMN width")
    op.execute("UPDATE reviews SET destination_station_id = origin_station_id WHERE destination_station_id IS NULL")
    op.execute("ALTER TABLE reviews ALTER COLUMN destination_station_id SET NOT NULL")
    op.execute("ALTER TABLE recruitments DROP COLUMN view_count")
    op.execute("ALTER TABLE notices DROP COLUMN ends_at")
    op.execute("ALTER TABLE notices DROP COLUMN starts_at")
    op.execute("ALTER TABLE notices DROP COLUMN banner_url")
    op.execute("ALTER TABLE notices DROP COLUMN kind")
    op.execute("DROP TYPE notice_kind")
