"""soft-delete plans and preserve recruitment history

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-09
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE plans ADD COLUMN deleted_at timestamptz NULL")
    op.execute(
        "CREATE INDEX ix_plan_owner_active_updated "
        "ON plans(owner_id, updated_at DESC, id DESC) WHERE deleted_at IS NULL"
    )
    op.execute("ALTER TABLE recruitments DROP CONSTRAINT recruitments_plan_id_fkey")
    op.execute("ALTER TABLE recruitments ALTER COLUMN plan_id DROP NOT NULL")
    op.execute(
        "ALTER TABLE recruitments ADD CONSTRAINT recruitments_plan_id_fkey "
        "FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE recruitments DROP CONSTRAINT recruitments_plan_id_fkey")
    op.execute("ALTER TABLE recruitments ALTER COLUMN plan_id SET NOT NULL")
    op.execute(
        "ALTER TABLE recruitments ADD CONSTRAINT recruitments_plan_id_fkey "
        "FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT"
    )
    op.execute("DROP INDEX ix_plan_owner_active_updated")
    op.execute("ALTER TABLE plans DROP COLUMN deleted_at")
