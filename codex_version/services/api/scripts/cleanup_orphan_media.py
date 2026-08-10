from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.infrastructure.database import SessionLocal
from app.providers.storage import S3StorageProvider
from app.reviews.models import MediaAsset, MediaStatus


def cleanup(max_age_hours: int = 24) -> int:
    cutoff = datetime.now(UTC) - timedelta(hours=max_age_hours)
    storage = S3StorageProvider()
    deleted = 0
    with SessionLocal() as db:
        assets = db.scalars(
            select(MediaAsset).where(
                MediaAsset.status.in_([MediaStatus.CLAIMED, MediaStatus.REJECTED]),
                MediaAsset.created_at < cutoff,
            )
        ).all()
        for asset in assets:
            try:
                storage.delete(asset.object_key)
            except Exception:
                if asset.status is not MediaStatus.REJECTED:
                    continue
            db.delete(asset)
            deleted += 1
        db.commit()
    return deleted


if __name__ == "__main__":
    print({"deleted": cleanup()})
