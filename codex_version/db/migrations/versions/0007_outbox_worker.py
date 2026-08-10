"""harden transactional outbox for polling workers

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-09
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_outbox_pending")
    op.execute("ALTER TABLE outbox_events RENAME COLUMN created_at TO occurred_at")
    op.execute("ALTER TABLE outbox_events RENAME COLUMN published_at TO processed_at")
    op.execute(
        "ALTER TABLE outbox_events ADD COLUMN schema_version integer NOT NULL DEFAULT 1"
    )
    op.execute(
        "ALTER TABLE outbox_events ADD COLUMN attempts integer NOT NULL DEFAULT 0"
    )
    op.execute("ALTER TABLE outbox_events ADD COLUMN last_error text NULL")
    op.execute(
        "ALTER TABLE outbox_events ADD COLUMN available_at timestamptz NOT NULL DEFAULT now()"
    )
    op.execute(
        "ALTER TABLE outbox_events ADD CONSTRAINT ck_outbox_schema_version CHECK (schema_version > 0)"
    )
    op.execute(
        "ALTER TABLE outbox_events ADD CONSTRAINT ck_outbox_attempts CHECK (attempts >= 0)"
    )
    op.execute(
        "CREATE INDEX ix_outbox_pending ON outbox_events(available_at, occurred_at) WHERE processed_at IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_outbox_pending")
    op.execute("ALTER TABLE outbox_events DROP CONSTRAINT ck_outbox_attempts")
    op.execute("ALTER TABLE outbox_events DROP CONSTRAINT ck_outbox_schema_version")
    op.execute("ALTER TABLE outbox_events DROP COLUMN available_at")
    op.execute("ALTER TABLE outbox_events DROP COLUMN last_error")
    op.execute("ALTER TABLE outbox_events DROP COLUMN attempts")
    op.execute("ALTER TABLE outbox_events DROP COLUMN schema_version")
    op.execute("ALTER TABLE outbox_events RENAME COLUMN processed_at TO published_at")
    op.execute("ALTER TABLE outbox_events RENAME COLUMN occurred_at TO created_at")
    op.execute(
        "CREATE INDEX ix_outbox_pending ON outbox_events(published_at, created_at)"
    )
