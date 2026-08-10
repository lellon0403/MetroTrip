"""recruitment discussion comments

Revision ID: 0011
Revises: 0010
Create Date: 2026-08-10
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE TYPE recruitment_comment_kind AS ENUM ('QUESTION', 'APPLICATION')")
    op.execute(
        "CREATE TABLE recruitment_comments ("
        "id uuid PRIMARY KEY, recruitment_id uuid NOT NULL REFERENCES recruitments(id) ON DELETE CASCADE, "
        "author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, "
        "kind recruitment_comment_kind NOT NULL, body varchar(1000) NOT NULL, "
        "created_at timestamptz NOT NULL DEFAULT now())"
    )
    op.execute("CREATE INDEX ix_recruitment_comment_created ON recruitment_comments(recruitment_id, created_at)")


def downgrade() -> None:
    op.execute("DROP INDEX ix_recruitment_comment_created")
    op.execute("DROP TABLE recruitment_comments")
    op.execute("DROP TYPE recruitment_comment_kind")
