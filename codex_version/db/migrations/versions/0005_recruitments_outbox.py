"""recruitments, applications, and transactional outbox

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-09
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE TYPE recruitment_status AS ENUM ('OPEN', 'CLOSED', 'CANCELED')")
    op.execute(
        "CREATE TYPE application_status AS ENUM ('APPLIED', 'ACCEPTED', 'REJECTED', 'CANCELED')"
    )
    op.execute("""
        CREATE TABLE recruitments (
            id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
            title varchar(160) NOT NULL, body text NOT NULL,
            capacity integer NOT NULL CHECK (capacity > 0 AND capacity <= 50),
            accepted_count integer NOT NULL DEFAULT 0 CHECK (accepted_count >= 0 AND accepted_count <= capacity),
            deadline timestamptz NOT NULL, meeting_at timestamptz NOT NULL,
            status recruitment_status NOT NULL DEFAULT 'OPEN', version integer NOT NULL DEFAULT 1 CHECK (version > 0),
            created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz NULL
        )
    """)
    op.execute(
        "CREATE INDEX ix_recruitment_status_meeting ON recruitments(status, meeting_at)"
    )
    op.execute(
        "CREATE INDEX ix_recruitment_owner_created ON recruitments(owner_id, created_at)"
    )
    op.execute("""
        CREATE TABLE recruitment_applications (
            id uuid PRIMARY KEY, recruitment_id uuid NOT NULL REFERENCES recruitments(id) ON DELETE CASCADE,
            applicant_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, message varchar(500) NULL,
            status application_status NOT NULL DEFAULT 'APPLIED', created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_recruitment_applicant UNIQUE (recruitment_id, applicant_id)
        )
    """)
    op.execute(
        "CREATE INDEX ix_application_applicant_status ON recruitment_applications(applicant_id, status)"
    )
    op.execute("""
        CREATE TABLE outbox_events (
            id uuid PRIMARY KEY, event_type varchar(100) NOT NULL, aggregate_type varchar(80) NOT NULL,
            aggregate_id uuid NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz NULL
        )
    """)
    op.execute(
        "CREATE INDEX ix_outbox_pending ON outbox_events(published_at, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE outbox_events")
    op.execute("DROP TABLE recruitment_applications")
    op.execute("DROP TABLE recruitments")
    op.execute("DROP TYPE application_status")
    op.execute("DROP TYPE recruitment_status")
