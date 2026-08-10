"""reviews, tags, media, and likes

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-09
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE TYPE review_status AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN')")
    op.execute(
        "CREATE TYPE media_status AS ENUM ('CLAIMED', 'UPLOADED', 'ATTACHED', 'REJECTED')"
    )
    op.execute(
        """
        CREATE TABLE reviews (
            id uuid PRIMARY KEY,
            author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            plan_id uuid NULL REFERENCES plans(id) ON DELETE SET NULL,
            origin_station_id uuid NOT NULL REFERENCES transit_stations(id) ON DELETE RESTRICT,
            destination_station_id uuid NOT NULL REFERENCES transit_stations(id) ON DELETE RESTRICT,
            title varchar(160) NOT NULL,
            excerpt varchar(300) NOT NULL,
            body jsonb NOT NULL,
            rating_twice integer NOT NULL CHECK (rating_twice >= 2 AND rating_twice <= 10),
            travel_date date NOT NULL,
            cost_won integer NULL,
            status review_status NOT NULL DEFAULT 'PUBLISHED',
            view_count bigint NOT NULL DEFAULT 0 CHECK (view_count >= 0),
            version integer NOT NULL DEFAULT 1 CHECK (version > 0),
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            deleted_at timestamptz NULL,
            CONSTRAINT ck_review_cost_nonnegative CHECK (cost_won IS NULL OR cost_won >= 0)
        )
        """
    )
    op.execute("CREATE INDEX ix_review_status_created ON reviews(status, created_at)")
    op.execute(
        "CREATE INDEX ix_review_author_created ON reviews(author_id, created_at)"
    )
    op.execute(
        """
        CREATE TABLE tags (
            id uuid PRIMARY KEY,
            slug varchar(50) NOT NULL UNIQUE,
            display_name varchar(50) NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE review_tags (
            review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
            tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (review_id, tag_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE media_assets (
            id uuid PRIMARY KEY,
            owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            object_key varchar(500) NOT NULL UNIQUE,
            original_filename varchar(255) NOT NULL,
            mime_type varchar(100) NOT NULL,
            size_bytes bigint NOT NULL CHECK (size_bytes > 0),
            checksum_sha256 varchar(64) NULL,
            status media_status NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            uploaded_at timestamptz NULL
        )
        """
    )
    op.execute("CREATE INDEX ix_media_owner_status ON media_assets(owner_id, status)")
    op.execute(
        """
        CREATE TABLE review_media (
            review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
            media_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
            position integer NOT NULL CHECK (position > 0),
            alt_text varchar(300) NOT NULL,
            PRIMARY KEY (review_id, media_id),
            CONSTRAINT uq_review_media_position UNIQUE (review_id, position),
            CONSTRAINT uq_review_media_asset UNIQUE (media_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE review_likes (
            id uuid PRIMARY KEY,
            review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_review_like_user UNIQUE (review_id, user_id)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE review_likes")
    op.execute("DROP TABLE review_media")
    op.execute("DROP TABLE media_assets")
    op.execute("DROP TABLE review_tags")
    op.execute("DROP TABLE tags")
    op.execute("DROP TABLE reviews")
    op.execute("DROP TYPE media_status")
    op.execute("DROP TYPE review_status")
