"""structured plans and unlisted sharing

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-09
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE TYPE plan_visibility AS ENUM ('PRIVATE', 'UNLISTED')")
    op.execute("CREATE TYPE plan_status AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED')")
    op.execute(
        "CREATE TYPE plan_item_type AS ENUM ('STATION', 'PLACE', 'ROUTE', 'NOTE')"
    )
    op.execute(
        """
        CREATE TABLE plans (
            id uuid PRIMARY KEY,
            owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title varchar(120) NOT NULL,
            description text NULL,
            start_date date NOT NULL,
            end_date date NOT NULL,
            visibility plan_visibility NOT NULL DEFAULT 'PRIVATE',
            status plan_status NOT NULL DEFAULT 'DRAFT',
            version integer NOT NULL DEFAULT 1 CHECK (version > 0),
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_plan_date_range CHECK (start_date <= end_date)
        )
        """
    )
    op.execute("CREATE INDEX ix_plan_owner_updated ON plans(owner_id, updated_at)")
    op.execute(
        """
        CREATE TABLE plan_days (
            id uuid PRIMARY KEY,
            plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
            day_date date NOT NULL,
            title varchar(120) NULL,
            position integer NOT NULL CHECK (position > 0),
            CONSTRAINT uq_plan_day_position UNIQUE (plan_id, position),
            CONSTRAINT uq_plan_day_date UNIQUE (plan_id, day_date)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE plan_items (
            id uuid PRIMARY KEY,
            day_id uuid NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE,
            item_type plan_item_type NOT NULL,
            station_id uuid NULL REFERENCES transit_stations(id) ON DELETE RESTRICT,
            place_id uuid NULL REFERENCES places(id) ON DELETE RESTRICT,
            route_snapshot jsonb NULL,
            note text NULL,
            scheduled_time time NULL,
            duration_minutes integer NULL CHECK (duration_minutes IS NULL OR duration_minutes > 0),
            position integer NOT NULL CHECK (position > 0),
            CONSTRAINT uq_plan_item_position UNIQUE (day_id, position),
            CONSTRAINT ck_plan_item_single_context CHECK (num_nonnulls(station_id, place_id, route_snapshot) <= 1),
            CONSTRAINT ck_plan_item_required_context CHECK (
                (item_type = 'STATION' AND station_id IS NOT NULL) OR
                (item_type = 'PLACE' AND place_id IS NOT NULL) OR
                (item_type = 'ROUTE' AND route_snapshot IS NOT NULL) OR
                (item_type = 'NOTE' AND note IS NOT NULL)
            )
        )
        """
    )
    op.execute(
        """
        CREATE TABLE plan_share_links (
            id uuid PRIMARY KEY,
            plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
            token_hash varchar(64) NOT NULL UNIQUE,
            expires_at timestamptz NULL,
            max_uses integer NULL CHECK (max_uses IS NULL OR max_uses > 0),
            use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
            revoked_at timestamptz NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX ix_plan_share_plan_active ON plan_share_links(plan_id, revoked_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE plan_share_links")
    op.execute("DROP TABLE plan_items")
    op.execute("DROP TABLE plan_days")
    op.execute("DROP TABLE plans")
    op.execute("DROP TYPE plan_item_type")
    op.execute("DROP TYPE plan_status")
    op.execute("DROP TYPE plan_visibility")
