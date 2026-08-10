import os
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import delete, text

from app.discovery.models import Place
from app.discovery.repository import DiscoveryRepository
from app.infrastructure.database import SessionLocal

pytestmark = pytest.mark.skipif(
    os.getenv("METROTRIP_RUN_POSTGRES_TESTS") != "1",
    reason="실제 PostgreSQL 통합 테스트는 명시적으로 활성화합니다.",
)


def test_nearby_places_respects_one_kilometer_boundary() -> None:
    inside_id, outside_id = uuid4(), uuid4()
    marker = uuid4().hex
    latitude, longitude = 36.8100, 127.1460
    insert = text(
        """
        INSERT INTO places (
            id, source_name, external_id, name, category, address, location,
            provider_payload, data_status, last_synced_at
        )
        VALUES (
            :id, 'boundary-test', :external_id, :name,
            CAST('CAFE' AS place_category), '테스트 주소',
            ST_Project(
                ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
                :distance,
                0.0
            ),
            '{}'::jsonb, CAST('FIXTURE' AS place_data_status), :synced_at
        )
        """
    )

    try:
        with SessionLocal() as db:
            for place_id, distance, label in (
                (inside_id, 999.0, "inside"),
                (outside_id, 1001.0, "outside"),
            ):
                db.execute(
                    insert,
                    {
                        "id": place_id,
                        "external_id": f"{marker}-{label}",
                        "name": f"경계 테스트 {label}",
                        "longitude": longitude,
                        "latitude": latitude,
                        "distance": distance,
                        "synced_at": datetime.now(UTC),
                    },
                )
            db.commit()

            rows = DiscoveryRepository(db).nearby_places(
                latitude=latitude,
                longitude=longitude,
                radius_meters=1000,
                categories=None,
                query="경계 테스트",
                bounds=None,
                cursor=None,
                limit=10,
            )

            ids = {place.id for place, *_ in rows}
            assert inside_id in ids
            assert outside_id not in ids
            inside_distance = next(
                distance for place, distance, *_ in rows if place.id == inside_id
            )
            assert 998.9 <= inside_distance <= 999.1
    finally:
        with SessionLocal() as db:
            db.execute(delete(Place).where(Place.id.in_([inside_id, outside_id])))
            db.commit()
