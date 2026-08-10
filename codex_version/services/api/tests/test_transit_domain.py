from datetime import date, datetime
from unittest.mock import MagicMock
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy.dialects import postgresql

from app.transit.models import ServiceCalendar, StopTime, Trip
from app.transit.repository import TransitRepository, decode_station_cursor, encode_station_cursor


def test_station_cursor_round_trip() -> None:
    station_id = uuid4()

    cursor = encode_station_cursor(17, station_id)

    assert decode_station_cursor(cursor) == (17, station_id)


def test_station_cursor_is_opaque() -> None:
    cursor = encode_station_cursor(3, uuid4())

    assert ":" not in cursor


def test_station_list_query_compiles_for_postgresql() -> None:
    db = MagicMock()
    db.execute.return_value = []

    TransitRepository(db).list_stations(line_id=None, query=None, cursor=None, limit=2)

    statement = db.execute.call_args.args[0]
    statement.compile(dialect=postgresql.dialect())


def test_departures_preserve_previous_service_date_after_midnight() -> None:
    station_id, line_id, calendar_id = uuid4(), uuid4(), uuid4()
    calendar = ServiceCalendar(
        id=calendar_id,
        source_name="test",
        external_id="all-days",
        monday=True,
        tuesday=True,
        wednesday=True,
        thursday=True,
        friday=True,
        saturday=True,
        sunday=True,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )
    late_trip = Trip(
        id=uuid4(),
        line_id=line_id,
        calendar_id=calendar_id,
        source_name="test",
        external_id="late",
        headsign="심야행",
        direction=0,
    )
    morning_trip = Trip(
        id=uuid4(),
        line_id=line_id,
        calendar_id=calendar_id,
        source_name="test",
        external_id="morning",
        headsign="첫차",
        direction=0,
    )
    late_stop = StopTime(
        trip_id=late_trip.id,
        station_id=station_id,
        stop_sequence=1,
        arrival_offset_seconds=24 * 3600 + 10 * 60,
        departure_offset_seconds=24 * 3600 + 10 * 60,
    )
    morning_stop = StopTime(
        trip_id=morning_trip.id,
        station_id=station_id,
        stop_sequence=1,
        arrival_offset_seconds=20 * 60,
        departure_offset_seconds=20 * 60,
    )
    db = MagicMock()
    db.execute.return_value.all.return_value = [
        (morning_stop, morning_trip, calendar),
        (late_stop, late_trip, calendar),
    ]
    db.scalar.return_value = None
    requested_at = datetime(2026, 8, 10, 0, 5, tzinfo=ZoneInfo("Asia/Seoul"))

    departures = TransitRepository(db).list_departures(station_id, requested_at, limit=2)

    assert departures[0] == (
        late_trip,
        date(2026, 8, 9),
        datetime(2026, 8, 10, 0, 10, tzinfo=ZoneInfo("Asia/Seoul")),
    )
    assert departures[1] == (
        morning_trip,
        date(2026, 8, 10),
        datetime(2026, 8, 10, 0, 20, tzinfo=ZoneInfo("Asia/Seoul")),
    )
