from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.errors import ApiError
from app.planning.models import Plan, PlanDay, PlanStatus
from app.planning.repository import decode_plan_cursor, encode_plan_cursor
from app.planning.schemas import PlanWriteRequest
from app.planning.service import PlanningService
from app.providers.storage import StoredObject
from app.recruitments.schemas import RecruitmentWriteRequest
from app.reviews.models import MediaAsset, MediaStatus
from app.reviews.repository import decode_review_cursor, encode_review_cursor
from app.reviews.schemas import ReviewWriteRequest
from app.reviews.service import ReviewService


def test_plan_requires_days_inside_trip_range() -> None:
    with pytest.raises(ValidationError):
        PlanWriteRequest.model_validate(
            {
                "title": "하루 여행",
                "startDate": "2026-08-09",
                "endDate": "2026-08-09",
                "days": [{"dayDate": "2026-08-10", "items": []}],
            }
        )


def test_plan_update_flushes_removed_days_before_reusing_positions() -> None:
    owner_id = uuid4()
    plan = Plan(
        id=uuid4(),
        owner_id=owner_id,
        title="기존 일정",
        start_date=datetime(2026, 8, 9, tzinfo=UTC).date(),
        end_date=datetime(2026, 8, 9, tzinfo=UTC).date(),
        status=PlanStatus.DRAFT,
        version=1,
    )
    plan.days.append(
        PlanDay(
            id=uuid4(),
            day_date=plan.start_date,
            title="기존 1일차",
            position=1,
        )
    )
    body = PlanWriteRequest.model_validate(
        {
            "title": "수정 일정",
            "startDate": "2026-08-09",
            "endDate": "2026-08-09",
            "days": [{"dayDate": "2026-08-09", "title": "새 1일차", "items": []}],
        }
    )
    db = MagicMock()
    service = PlanningService(db)
    service.get_owned = MagicMock(return_value=plan)
    service._validate_references = MagicMock()
    service.repository.get = MagicMock(return_value=plan)
    db.flush.side_effect = lambda: (
        plan.days == [] or pytest.fail("기존 일정 일자는 새 일자를 추가하기 전에 비워져야 합니다.")
    )

    updated = service.update(plan.id, owner_id, 1, body)

    db.flush.assert_called_once_with()
    db.commit.assert_called_once_with()
    assert updated.version == 2
    assert [(day.position, day.title) for day in updated.days] == [(1, "새 1일차")]


def test_review_rating_requires_half_step_and_normalizes_tags() -> None:
    base = {
        "title": "천안 하루 여행",
        "originStationId": str(uuid4()),
        "destinationStationId": str(uuid4()),
        "travelDate": "2026-08-09",
        "blocks": [{"kind": "PARAGRAPH", "text": "충분히 긴 여행 후기입니다."}],
        "tags": ["#온천", " 온천 ", "당일 치기"],
    }
    with pytest.raises(ValidationError):
        ReviewWriteRequest.model_validate({**base, "rating": "4.2"})
    request = ReviewWriteRequest.model_validate({**base, "rating": "4.5"})
    assert request.rating == Decimal("4.5")
    assert request.tags == ["온천", "당일 치기"]

def test_review_allows_a_single_station_trip() -> None:
    request = ReviewWriteRequest.model_validate(
        {
            "title": "천안역만 둘러본 날",
            "originStationId": str(uuid4()),
            "destinationStationId": None,
            "rating": "5.0",
            "travelDate": "2026-08-09",
            "blocks": [{"kind": "PARAGRAPH", "text": "한 역 주변을 충분히 둘러본 후기입니다."}],
        }
    )

    assert request.destination_station_id is None


def test_recruitment_deadline_must_precede_meeting() -> None:
    now = datetime.now(UTC)
    with pytest.raises(ValidationError):
        RecruitmentWriteRequest(
            plan_id=uuid4(),
            title="함께 가요",
            body="충분히 긴 모집 소개 문장입니다.",
            capacity=2,
            deadline=now + timedelta(days=2),
            meeting_at=now + timedelta(days=1),
        )


def test_cursor_roundtrips_stable_sort_keys() -> None:
    resource_id = uuid4()
    moment = datetime(2026, 8, 9, 12, 30, tzinfo=UTC)
    assert decode_plan_cursor(encode_plan_cursor(moment, resource_id)) == (moment, resource_id)
    assert decode_review_cursor(encode_review_cursor(moment, resource_id)) == (moment, resource_id)


def test_push_token_encryption_does_not_preserve_plaintext() -> None:
    token = "ExponentPushToken[device-specific-secret]"
    encrypted = encrypt_secret(token)
    assert token not in encrypted
    assert decrypt_secret(encrypted) == token


@pytest.mark.parametrize(
    ("mime_type", "signature"),
    [
        ("image/jpeg", b"\xff\xd8\xff\xe0rest"),
        ("image/png", b"\x89PNG\r\n\x1a\nrest"),
        ("image/webp", b"RIFF1234WEBPrest"),
    ],
)
def test_media_signature_validation(mime_type: str, signature: bytes) -> None:
    assert ReviewService._valid_image_signature(mime_type, signature)
    assert not ReviewService._valid_image_signature(mime_type, b"<script>alert(1)")


def test_media_completion_rejects_cross_owner_access() -> None:
    owner_id, attacker_id = uuid4(), uuid4()
    db = MagicMock()
    storage = MagicMock()
    service = ReviewService(db, storage=storage)
    asset = MediaAsset(
        id=uuid4(),
        owner_id=owner_id,
        object_key=f"reviews/{owner_id}/image.png",
        original_filename="image.png",
        mime_type="image/png",
        size_bytes=12,
        status=MediaStatus.CLAIMED,
    )
    service.repository.get_media_for_update = MagicMock(return_value=asset)

    with pytest.raises(ApiError) as error:
        service.complete_media(asset.id, attacker_id)

    assert error.value.code == "MEDIA_FORBIDDEN"
    storage.inspect.assert_not_called()


def test_media_completion_rejects_mismatched_object_metadata() -> None:
    owner_id = uuid4()
    db = MagicMock()
    storage = MagicMock()
    service = ReviewService(db, storage=storage)
    asset = MediaAsset(
        id=uuid4(),
        owner_id=owner_id,
        object_key=f"reviews/{owner_id}/image.png",
        original_filename="image.png",
        mime_type="image/png",
        size_bytes=12,
        status=MediaStatus.CLAIMED,
    )
    service.repository.get_media_for_update = MagicMock(return_value=asset)
    storage.inspect.return_value = StoredObject(
        size_bytes=13,
        content_type="image/png",
        signature=b"\x89PNG\r\n\x1a\nrest",
        checksum_sha256="unused",
    )

    with pytest.raises(ApiError) as error:
        service.complete_media(asset.id, owner_id)

    assert error.value.code == "MEDIA_VALIDATION_FAILED"
    assert asset.status is MediaStatus.REJECTED
    db.commit.assert_called_once_with()
