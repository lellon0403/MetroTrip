"""discovery places and favorites

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-09
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "CREATE TYPE place_category AS ENUM ('FOOD', 'CAFE', 'CULTURE', 'SHOPPING', 'NATURE', 'STAY')"
    )
    op.execute("CREATE TYPE place_data_status AS ENUM ('FIXTURE', 'VERIFIED', 'STALE')")
    op.execute(
        """
        CREATE TABLE places (
            id uuid PRIMARY KEY,
            source_name varchar(120) NOT NULL,
            external_id varchar(160) NOT NULL,
            name varchar(200) NOT NULL,
            category place_category NOT NULL,
            address varchar(500) NOT NULL,
            location geography(POINT, 4326) NOT NULL,
            summary text NULL,
            phone varchar(40) NULL,
            website_url text NULL,
            provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            data_status place_data_status NOT NULL,
            last_synced_at timestamptz NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_place_source_id UNIQUE (source_name, external_id)
        )
        """
    )
    op.execute("CREATE INDEX ix_place_location_gist ON places USING gist(location)")
    op.execute("CREATE INDEX ix_place_category_name ON places(category, name)")
    op.execute(
        """
        CREATE TABLE favorite_stations (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            station_id uuid NOT NULL REFERENCES transit_stations(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_favorite_station_user UNIQUE (user_id, station_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE favorite_places (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_favorite_place_user UNIQUE (user_id, place_id)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE favorite_places")
    op.execute("DROP TABLE favorite_stations")
    op.execute("DROP TABLE places")
    op.execute("DROP TYPE place_data_status")
    op.execute("DROP TYPE place_category")
