"""identity and transit ledger

Revision ID: 0001
Revises:
Create Date: 2026-08-09
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute("CREATE TYPE user_role AS ENUM ('USER', 'ADMIN')")
    op.execute("CREATE TYPE user_status AS ENUM ('ACTIVE', 'DELETED', 'SUSPENDED')")
    op.execute(
        "CREATE TYPE transit_import_status AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED')"
    )
    op.execute("CREATE TYPE service_exception_kind AS ENUM ('ADDED', 'REMOVED')")

    op.execute(
        """
        CREATE TABLE users (
            id uuid PRIMARY KEY,
            email varchar(320) NOT NULL UNIQUE,
            password_hash text NOT NULL,
            display_name varchar(40) NOT NULL,
            role user_role NOT NULL DEFAULT 'USER',
            status user_status NOT NULL DEFAULT 'ACTIVE',
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            deleted_at timestamptz NULL
        )
        """
    )
    op.execute(
        """
        CREATE TABLE refresh_sessions (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            family_id uuid NOT NULL,
            token_hash varchar(64) NOT NULL UNIQUE,
            replaced_by_id uuid NULL REFERENCES refresh_sessions(id) ON DELETE SET NULL,
            expires_at timestamptz NOT NULL,
            revoked_at timestamptz NULL,
            reuse_detected_at timestamptz NULL,
            user_agent varchar(500) NULL,
            ip_hash varchar(64) NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX ix_refresh_sessions_family_active ON refresh_sessions(family_id, revoked_at)"
    )
    op.execute(
        "CREATE INDEX ix_refresh_sessions_user_active ON refresh_sessions(user_id, revoked_at)"
    )
    op.execute(
        """
        CREATE TABLE password_reset_challenges (
            id uuid PRIMARY KEY,
            email varchar(320) NOT NULL,
            code_hash varchar(64) NOT NULL,
            expires_at timestamptz NOT NULL,
            used_at timestamptz NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX ix_password_reset_email_created ON password_reset_challenges(email, created_at)"
    )

    op.execute(
        """
        CREATE TABLE transit_import_runs (
            id uuid PRIMARY KEY,
            source_name varchar(120) NOT NULL,
            source_version varchar(120) NOT NULL,
            source_uri text NULL,
            checksum_sha256 varchar(64) NOT NULL,
            status transit_import_status NOT NULL,
            validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
            imported_at timestamptz NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE transit_lines (
            id uuid PRIMARY KEY,
            source_name varchar(120) NOT NULL,
            external_id varchar(120) NOT NULL,
            name varchar(120) NOT NULL,
            short_name varchar(40) NOT NULL,
            color varchar(7) NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
            text_color varchar(7) NOT NULL DEFAULT '#FFFFFF' CHECK (text_color ~ '^#[0-9A-Fa-f]{6}$'),
            sort_order integer NOT NULL DEFAULT 0,
            is_active boolean NOT NULL DEFAULT true,
            CONSTRAINT uq_line_source_id UNIQUE (source_name, external_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE transit_stations (
            id uuid PRIMARY KEY,
            line_id uuid NOT NULL REFERENCES transit_lines(id) ON DELETE RESTRICT,
            source_name varchar(120) NOT NULL,
            external_id varchar(120) NOT NULL,
            name varchar(120) NOT NULL,
            code varchar(40) NOT NULL,
            sequence integer NOT NULL CHECK (sequence > 0),
            address varchar(500) NULL,
            location geography(POINT, 4326) NOT NULL,
            is_active boolean NOT NULL DEFAULT true,
            CONSTRAINT uq_station_source_id UNIQUE (source_name, external_id),
            CONSTRAINT uq_station_line_sequence UNIQUE (line_id, sequence)
        )
        """
    )
    op.execute(
        "CREATE INDEX ix_station_location_gist ON transit_stations USING gist(location)"
    )
    op.execute("CREATE INDEX ix_station_name ON transit_stations(name)")
    op.execute(
        """
        CREATE TABLE service_calendars (
            id uuid PRIMARY KEY,
            source_name varchar(120) NOT NULL,
            external_id varchar(120) NOT NULL,
            monday boolean NOT NULL,
            tuesday boolean NOT NULL,
            wednesday boolean NOT NULL,
            thursday boolean NOT NULL,
            friday boolean NOT NULL,
            saturday boolean NOT NULL,
            sunday boolean NOT NULL,
            start_date date NOT NULL,
            end_date date NOT NULL,
            CONSTRAINT uq_calendar_source_id UNIQUE (source_name, external_id),
            CONSTRAINT ck_calendar_date_range CHECK (start_date <= end_date)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE service_exceptions (
            id uuid PRIMARY KEY,
            calendar_id uuid NOT NULL REFERENCES service_calendars(id) ON DELETE CASCADE,
            service_date date NOT NULL,
            kind service_exception_kind NOT NULL,
            CONSTRAINT uq_service_exception_date UNIQUE (calendar_id, service_date)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE transit_trips (
            id uuid PRIMARY KEY,
            line_id uuid NOT NULL REFERENCES transit_lines(id) ON DELETE RESTRICT,
            calendar_id uuid NOT NULL REFERENCES service_calendars(id) ON DELETE RESTRICT,
            source_name varchar(120) NOT NULL,
            external_id varchar(120) NOT NULL,
            headsign varchar(120) NOT NULL,
            direction integer NOT NULL CHECK (direction IN (0, 1)),
            CONSTRAINT uq_trip_source_id UNIQUE (source_name, external_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE transit_stop_times (
            id uuid PRIMARY KEY,
            trip_id uuid NOT NULL REFERENCES transit_trips(id) ON DELETE CASCADE,
            station_id uuid NOT NULL REFERENCES transit_stations(id) ON DELETE RESTRICT,
            stop_sequence integer NOT NULL CHECK (stop_sequence > 0),
            arrival_offset_seconds integer NOT NULL CHECK (arrival_offset_seconds >= 0),
            departure_offset_seconds integer NOT NULL CHECK (departure_offset_seconds >= arrival_offset_seconds),
            CONSTRAINT uq_stop_time_trip_sequence UNIQUE (trip_id, stop_sequence)
        )
        """
    )
    op.execute(
        "CREATE INDEX ix_stop_time_station_departure ON transit_stop_times(station_id, departure_offset_seconds)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE transit_stop_times")
    op.execute("DROP TABLE transit_trips")
    op.execute("DROP TABLE service_exceptions")
    op.execute("DROP TABLE service_calendars")
    op.execute("DROP TABLE transit_stations")
    op.execute("DROP TABLE transit_lines")
    op.execute("DROP TABLE transit_import_runs")
    op.execute("DROP TABLE password_reset_challenges")
    op.execute("DROP TABLE refresh_sessions")
    op.execute("DROP TABLE users")
    op.execute("DROP TYPE service_exception_kind")
    op.execute("DROP TYPE transit_import_status")
    op.execute("DROP TYPE user_status")
    op.execute("DROP TYPE user_role")
