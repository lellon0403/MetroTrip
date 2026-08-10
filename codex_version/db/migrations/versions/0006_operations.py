"""notices, reports, and audit logs

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-09
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "CREATE TYPE publication_status AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN')"
    )
    op.execute("CREATE TYPE report_status AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED')")
    op.execute(
        """CREATE TABLE notices (id uuid PRIMARY KEY, author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, title varchar(180) NOT NULL, body text NOT NULL, status publication_status NOT NULL DEFAULT 'DRAFT', published_at timestamptz NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())"""
    )
    op.execute("CREATE INDEX ix_notice_publication ON notices(status, published_at)")
    op.execute(
        """CREATE TABLE content_reports (id uuid PRIMARY KEY, reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, resource_type varchar(40) NOT NULL, resource_id uuid NOT NULL, reason varchar(80) NOT NULL, detail varchar(1000) NULL, status report_status NOT NULL DEFAULT 'OPEN', created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz NULL)"""
    )
    op.execute("CREATE INDEX ix_report_queue ON content_reports(status, created_at)")
    op.execute(
        """CREATE TABLE audit_logs (id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, action varchar(100) NOT NULL, resource_type varchar(80) NOT NULL, resource_id uuid NOT NULL, reason varchar(500) NOT NULL, metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now())"""
    )
    op.execute(
        "CREATE INDEX ix_audit_resource ON audit_logs(resource_type, resource_id, created_at)"
    )
    op.execute(
        """CREATE TABLE push_devices (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, platform varchar(20) NOT NULL, token_fingerprint varchar(64) NOT NULL UNIQUE, token_ciphertext text NOT NULL, locale varchar(20) NOT NULL DEFAULT 'ko-KR', app_version varchar(30) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz NULL)"""
    )
    op.execute(
        "CREATE INDEX ix_push_device_user_active ON push_devices(user_id, revoked_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE push_devices")
    op.execute("DROP TABLE audit_logs")
    op.execute("DROP TABLE content_reports")
    op.execute("DROP TABLE notices")
    op.execute("DROP TYPE report_status")
    op.execute("DROP TYPE publication_status")
