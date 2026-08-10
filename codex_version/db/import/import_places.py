import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from geoalchemy2 import WKTElement
from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[2]
API_ROOT = ROOT / "services" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.discovery.models import Place, PlaceCategory, PlaceDataStatus
from app.infrastructure.database import SessionLocal

DEFAULT_FIXTURE = ROOT / "db" / "import" / "cheonanasan_places_fixture.json"


def import_places(path: Path = DEFAULT_FIXTURE) -> dict[str, object]:
    raw = path.read_bytes()
    payload = json.loads(raw.decode("utf-8"))
    source = payload["source"]
    seen: set[str] = set()
    for item in payload["places"]:
        if item["externalId"] in seen:
            raise ValueError(f"duplicate place external ID: {item['externalId']}")
        seen.add(item["externalId"])
        PlaceCategory(item["category"])
        if not (-90 <= item["latitude"] <= 90 and -180 <= item["longitude"] <= 180):
            raise ValueError(f"invalid place coordinate: {item['externalId']}")
    now = datetime.now(UTC)
    with SessionLocal() as db:
        for item in payload["places"]:
            place = db.scalar(
                select(Place).where(
                    Place.source_name == source["name"],
                    Place.external_id == item["externalId"],
                )
            )
            if not place:
                place = Place(
                    id=uuid4(),
                    source_name=source["name"],
                    external_id=item["externalId"],
                )
                db.add(place)
            place.name = item["name"]
            place.category = PlaceCategory(item["category"])
            place.address = item["address"]
            place.summary = item.get("summary")
            place.location = WKTElement(
                f"POINT({item['longitude']} {item['latitude']})", srid=4326
            )
            place.provider_payload = {"fixtureVersion": source["version"]}
            place.data_status = PlaceDataStatus.FIXTURE
            place.last_synced_at = now
        db.commit()
    return {
        "valid": True,
        "placeCount": len(payload["places"]),
        "sourceVersion": source["version"],
        "checksumSha256": hashlib.sha256(raw).hexdigest(),
    }


if __name__ == "__main__":
    print(json.dumps(import_places(), ensure_ascii=False, indent=2))
