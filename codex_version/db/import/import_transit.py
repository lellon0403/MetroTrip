import hashlib
import json
import sys
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from geoalchemy2 import WKTElement
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[2]
API_ROOT = ROOT / "services" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.infrastructure.database import SessionLocal
from app.transit.models import (
    ImportRun,
    ImportStatus,
    Line,
    ServiceCalendar,
    ServiceException,
    ServiceExceptionKind,
    Station,
    StopTime,
    Trip,
)

DEFAULT_FIXTURE = ROOT / "db" / "import" / "cheonanasan_transit_fixture.json"


def _offset_seconds(value: str) -> int:
    hours, minutes = (int(part) for part in value.split(":"))
    if not 0 <= minutes < 60 or not 0 <= hours <= 47:
        raise ValueError(f"invalid service time: {value}")
    return hours * 3600 + minutes * 60


def validate_payload(payload: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    line_ids = [line["externalId"] for line in payload.get("lines", [])]
    if not line_ids or len(line_ids) != len(set(line_ids)):
        errors.append("line external IDs must be present and unique")
    station_ids: list[str] = []
    for line in payload.get("lines", []):
        sequences = [station["sequence"] for station in line.get("stations", [])]
        station_ids.extend(
            station["externalId"] for station in line.get("stations", [])
        )
        if sequences != sorted(sequences) or len(sequences) != len(set(sequences)):
            errors.append(f"station sequences are invalid for {line['externalId']}")
        for station in line.get("stations", []):
            if not (
                -90 <= station["latitude"] <= 90 and -180 <= station["longitude"] <= 180
            ):
                errors.append(f"invalid coordinate for {station['externalId']}")
    if len(station_ids) != len(set(station_ids)):
        errors.append("station external IDs must be unique")
    calendar_ids = {calendar["externalId"] for calendar in payload.get("calendars", [])}
    for pattern in payload.get("servicePatterns", []):
        if pattern["lineExternalId"] not in line_ids:
            errors.append(f"unknown line in pattern {pattern['externalId']}")
        if pattern["calendarExternalId"] not in calendar_ids:
            errors.append(f"unknown calendar in pattern {pattern['externalId']}")
        for start_time in pattern.get("startTimes", []):
            try:
                _offset_seconds(start_time)
            except ValueError as exc:
                errors.append(str(exc))
    return {
        "valid": not errors,
        "errors": errors,
        "lineCount": len(line_ids),
        "stationCount": len(station_ids),
        "calendarCount": len(calendar_ids),
        "patternCount": len(payload.get("servicePatterns", [])),
    }


def _upsert_line(db: Session, source_name: str, item: dict[str, Any]) -> Line:
    line = db.scalar(
        select(Line).where(
            Line.source_name == source_name, Line.external_id == item["externalId"]
        )
    )
    if not line:
        line = Line(id=uuid4(), source_name=source_name, external_id=item["externalId"])
        db.add(line)
    line.name = item["name"]
    line.short_name = item["shortName"]
    line.color = item["color"]
    line.text_color = item["textColor"]
    line.sort_order = item["sortOrder"]
    line.is_active = True
    return line


def _upsert_station(
    db: Session, source_name: str, line: Line, item: dict[str, Any]
) -> Station:
    station = db.scalar(
        select(Station).where(
            Station.source_name == source_name,
            Station.external_id == item["externalId"],
        )
    )
    if not station:
        station = Station(
            id=uuid4(), source_name=source_name, external_id=item["externalId"]
        )
        db.add(station)
    station.line_id = line.id
    station.name = item["name"]
    station.code = item["code"]
    station.sequence = item["sequence"]
    station.address = item.get("address")
    station.location = WKTElement(
        f"POINT({item['longitude']} {item['latitude']})", srid=4326
    )
    station.is_active = True
    return station


def import_fixture(path: Path = DEFAULT_FIXTURE) -> dict[str, Any]:
    raw = path.read_bytes()
    payload = json.loads(raw.decode("utf-8"))
    validation = validate_payload(payload)
    if not validation["valid"]:
        raise ValueError("; ".join(validation["errors"]))
    source = payload["source"]
    checksum = hashlib.sha256(raw).hexdigest()
    with SessionLocal() as db:
        run = ImportRun(
            id=uuid4(),
            source_name=source["name"],
            source_version=source["version"],
            source_uri=source.get("uri"),
            checksum_sha256=checksum,
            status=ImportStatus.RUNNING,
            validation_result=validation,
        )
        db.add(run)
        db.commit()
        try:
            line_by_external: dict[str, Line] = {}
            station_by_external: dict[str, Station] = {}
            for line_item in payload["lines"]:
                line = _upsert_line(db, source["name"], line_item)
                db.flush()
                line_by_external[line.external_id] = line
                for station_item in line_item["stations"]:
                    station = _upsert_station(db, source["name"], line, station_item)
                    db.flush()
                    station_by_external[station.external_id] = station

            calendar_by_external: dict[str, ServiceCalendar] = {}
            for item in payload["calendars"]:
                calendar = db.scalar(
                    select(ServiceCalendar).where(
                        ServiceCalendar.source_name == source["name"],
                        ServiceCalendar.external_id == item["externalId"],
                    )
                )
                if not calendar:
                    calendar = ServiceCalendar(
                        id=uuid4(),
                        source_name=source["name"],
                        external_id=item["externalId"],
                    )
                    db.add(calendar)
                weekdays = item["weekdays"]
                (
                    calendar.monday,
                    calendar.tuesday,
                    calendar.wednesday,
                    calendar.thursday,
                    calendar.friday,
                    calendar.saturday,
                    calendar.sunday,
                ) = weekdays
                calendar.start_date = date.fromisoformat(item["startDate"])
                calendar.end_date = date.fromisoformat(item["endDate"])
                db.flush()
                calendar_by_external[calendar.external_id] = calendar
                db.execute(
                    delete(ServiceException).where(
                        ServiceException.calendar_id == calendar.id
                    )
                )
                for exception in item.get("exceptions", []):
                    db.add(
                        ServiceException(
                            id=uuid4(),
                            calendar_id=calendar.id,
                            service_date=date.fromisoformat(exception["date"]),
                            kind=ServiceExceptionKind(exception["kind"]),
                        )
                    )

            for pattern in payload["servicePatterns"]:
                line = line_by_external[pattern["lineExternalId"]]
                calendar = calendar_by_external[pattern["calendarExternalId"]]
                line_stations = sorted(
                    (
                        station
                        for station in station_by_external.values()
                        if station.line_id == line.id
                    ),
                    key=lambda station: station.sequence,
                    reverse=pattern["stationOrder"] == "reverse",
                )
                for run_index, start_time in enumerate(pattern["startTimes"], start=1):
                    trip_external_id = f"{pattern['externalId']}-{run_index:02d}"
                    trip = db.scalar(
                        select(Trip).where(
                            Trip.source_name == source["name"],
                            Trip.external_id == trip_external_id,
                        )
                    )
                    if not trip:
                        trip = Trip(
                            id=uuid4(),
                            source_name=source["name"],
                            external_id=trip_external_id,
                        )
                        db.add(trip)
                    trip.line_id = line.id
                    trip.calendar_id = calendar.id
                    trip.headsign = pattern["headsign"]
                    trip.direction = pattern["direction"]
                    db.flush()
                    db.execute(delete(StopTime).where(StopTime.trip_id == trip.id))
                    start_offset = _offset_seconds(start_time)
                    step = int(pattern["minutesBetweenStops"]) * 60
                    for sequence, station in enumerate(line_stations, start=1):
                        offset = start_offset + (sequence - 1) * step
                        db.add(
                            StopTime(
                                id=uuid4(),
                                trip_id=trip.id,
                                station_id=station.id,
                                stop_sequence=sequence,
                                arrival_offset_seconds=offset,
                                departure_offset_seconds=offset + 30,
                            )
                        )
            run.status = ImportStatus.SUCCEEDED
            run.imported_at = datetime.now(UTC)
            db.commit()
        except Exception as exc:
            db.rollback()
            persisted_run = db.get(ImportRun, run.id)
            if persisted_run:
                persisted_run.status = ImportStatus.FAILED
                persisted_run.validation_result = {
                    **validation,
                    "runtimeError": type(exc).__name__,
                }
                db.commit()
            raise
    return {
        **validation,
        "checksumSha256": checksum,
        "sourceVersion": source["version"],
    }


if __name__ == "__main__":
    result = import_fixture(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_FIXTURE)
    print(json.dumps(result, ensure_ascii=False, indent=2))
