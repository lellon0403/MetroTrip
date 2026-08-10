"""review cover image and place ratings

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-10
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE reviews ADD COLUMN cover_media_id uuid NULL "
        "REFERENCES media_assets(id) ON DELETE SET NULL"
    )
    op.execute(
        "CREATE TABLE review_place_ratings ("
        "review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, "
        "place_id uuid NOT NULL REFERENCES places(id) ON DELETE RESTRICT, "
        "rating_twice integer NOT NULL, "
        "PRIMARY KEY (review_id, place_id), "
        "CONSTRAINT ck_review_place_rating_range CHECK (rating_twice >= 2 AND rating_twice <= 10))"
    )


def downgrade() -> None:
    op.execute("DROP TABLE review_place_ratings")
    op.execute("ALTER TABLE reviews DROP COLUMN cover_media_id")
