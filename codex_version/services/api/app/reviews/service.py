import re
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.identity.models import User
from app.planning.models import Plan
from app.discovery.models import Place
from app.providers.storage import S3StorageProvider
from app.reviews.models import (
    MediaAsset,
    MediaStatus,
    Review,
    ReviewMedia,
    ReviewPlaceRating,
    ReviewStatus,
    ReviewTag,
    Tag,
)
from app.reviews.repository import ReviewRepository
from app.reviews.schemas import (
    MediaClaimRequest,
    MediaClaimResponse,
    MediaCompleteResponse,
    ReviewBlock,
    ReviewBlockKind,
    ReviewDetail,
    ReviewMediaView,
    ReviewPlaceRatingView,
    ReviewSummary,
    ReviewWriteRequest,
)
from app.transit.models import Station

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


class ReviewService:
    def __init__(self, db: Session, storage: S3StorageProvider | None = None) -> None:
        self.db = db
        self.repository = ReviewRepository(db)
        self.storage = storage or S3StorageProvider()

    @staticmethod
    def _slug(value: str) -> str:
        normalized = re.sub(r"[^0-9a-zA-Z가-힣]+", "-", value.casefold()).strip("-")
        return normalized[:50]

    def claim_media(self, owner_id: UUID, body: MediaClaimRequest) -> MediaClaimResponse:
        extension = ALLOWED_IMAGE_TYPES.get(body.mime_type.casefold())
        if not extension:
            raise ApiError(
                422, "UNSUPPORTED_MEDIA_TYPE", "JPEG, PNG, WebP 이미지만 업로드할 수 있습니다."
            )
        safe_name = Path(body.filename).name
        object_key = f"reviews/{owner_id}/{uuid4()}.{extension}"
        asset = MediaAsset(
            id=uuid4(),
            owner_id=owner_id,
            object_key=object_key,
            original_filename=safe_name,
            mime_type=body.mime_type.casefold(),
            size_bytes=body.size_bytes,
            checksum_sha256=body.checksum_sha256.casefold() if body.checksum_sha256 else None,
            width=body.width,
            height=body.height,
            status=MediaStatus.CLAIMED,
        )
        self.db.add(asset)
        self.db.commit()
        return MediaClaimResponse(
            id=asset.id,
            object_key=asset.object_key,
            upload_url=self.storage.presign_put(asset.object_key, asset.mime_type),
            upload_headers={"Content-Type": asset.mime_type},
            expires_in=900,
            status=asset.status,
        )

    @staticmethod
    def _valid_image_signature(mime_type: str, signature: bytes) -> bool:
        if mime_type == "image/jpeg":
            return signature.startswith(b"\xff\xd8\xff")
        if mime_type == "image/png":
            return signature.startswith(b"\x89PNG\r\n\x1a\n")
        if mime_type == "image/webp":
            return signature.startswith(b"RIFF") and signature[8:12] == b"WEBP"
        return False

    def complete_media(self, media_id: UUID, owner_id: UUID) -> MediaCompleteResponse:
        asset = self.repository.get_media_for_update(media_id)
        if not asset:
            raise ApiError(404, "MEDIA_NOT_FOUND", "업로드 정보를 찾을 수 없습니다.")
        if asset.owner_id != owner_id:
            raise ApiError(403, "MEDIA_FORBIDDEN", "이 파일을 사용할 권한이 없습니다.")
        if asset.status not in {MediaStatus.CLAIMED, MediaStatus.UPLOADED}:
            raise ApiError(
                409, "MEDIA_STATE_CONFLICT", "현재 상태에서 업로드를 완료할 수 없습니다."
            )
        try:
            stored = self.storage.inspect(asset.object_key)
        except (BotoCoreError, ClientError) as exc:
            raise ApiError(
                409, "MEDIA_UPLOAD_MISSING", "업로드된 파일을 확인할 수 없습니다."
            ) from exc
        if (
            stored.size_bytes != asset.size_bytes
            or stored.content_type.casefold() != asset.mime_type
            or not self._valid_image_signature(asset.mime_type, stored.signature)
            or (
                asset.checksum_sha256 is not None
                and stored.checksum_sha256 != asset.checksum_sha256
            )
        ):
            asset.status = MediaStatus.REJECTED
            self.db.commit()
            raise ApiError(
                422, "MEDIA_VALIDATION_FAILED", "업로드한 파일의 크기 또는 형식이 다릅니다."
            )
        asset.status = MediaStatus.UPLOADED
        asset.uploaded_at = datetime.now(UTC)
        self.db.commit()
        return MediaCompleteResponse(
            id=asset.id,
            status=asset.status,
            public_url=self.storage.public_url(asset.object_key),
        )

    def _validate_context(self, author_id: UUID, body: ReviewWriteRequest) -> None:
        origin_exists = self.db.get(Station, body.origin_station_id)
        destination_exists = (
            self.db.get(Station, body.destination_station_id)
            if body.destination_station_id
            else True
        )
        if not origin_exists or not destination_exists:
            raise ApiError(422, "INVALID_REVIEW_STATION", "후기 경로의 역을 찾을 수 없습니다.")
        if body.plan_id:
            plan = self.db.get(Plan, body.plan_id)
            if not plan or plan.owner_id != author_id:
                raise ApiError(422, "INVALID_REVIEW_PLAN", "연결할 수 없는 일정입니다.")

    def _replace_place_ratings(self, review: Review, body: ReviewWriteRequest) -> None:
        seen: set[UUID] = set()
        allowed_place_ids: set[UUID] | None = None
        if body.plan_id:
            plan = self.db.get(Plan, body.plan_id)
            allowed_place_ids = {
                item.place_id for day in plan.days for item in day.items if item.place_id is not None
            } if plan else set()
        review.place_ratings.clear()
        for item in body.place_ratings:
            if item.place_id in seen:
                raise ApiError(422, "DUPLICATE_PLACE_RATING", "장소별 평점은 한 번만 등록할 수 있습니다.")
            if allowed_place_ids is not None and item.place_id not in allowed_place_ids:
                raise ApiError(422, "INVALID_REVIEW_PLACE", "연결한 일정에 없는 장소입니다.")
            if not self.db.get(Place, item.place_id):
                raise ApiError(422, "INVALID_REVIEW_PLACE", "평점을 남길 장소를 찾을 수 없습니다.")
            seen.add(item.place_id)
            review.place_ratings.append(
                ReviewPlaceRating(place_id=item.place_id, rating_twice=int(item.rating * 2))
            )

    def _assets_for_blocks(
        self,
        author_id: UUID,
        blocks: list[ReviewBlock],
        review: Review | None = None,
    ) -> list[MediaAsset]:
        media_ids = [
            block.media_id
            for block in blocks
            if block.kind is ReviewBlockKind.IMAGE and block.media_id is not None
        ]
        if len(media_ids) != len(set(media_ids)):
            raise ApiError(
                422, "DUPLICATE_REVIEW_MEDIA", "같은 이미지는 한 번만 사용할 수 있습니다."
            )
        assets: list[MediaAsset] = []
        for media_id in media_ids:
            asset = self.repository.get_media_for_update(media_id)
            if not asset or asset.owner_id != author_id:
                raise ApiError(403, "MEDIA_FORBIDDEN", "사용할 수 없는 이미지가 포함되어 있습니다.")
            attached_to_review = review is not None and any(
                relation.media_id == asset.id for relation in review.media
            )
            if asset.status is not MediaStatus.UPLOADED and not (
                asset.status is MediaStatus.ATTACHED and attached_to_review
            ):
                raise ApiError(409, "MEDIA_NOT_READY", "업로드가 완료되지 않은 이미지가 있습니다.")
            assets.append(asset)
        return assets

    def _replace_tags(self, review: Review, tag_names: list[str]) -> None:
        review.tags.clear()
        for display_name in tag_names:
            slug = self._slug(display_name)
            if not slug:
                raise ApiError(422, "INVALID_TAG", "태그에 사용할 수 있는 문자가 없습니다.")
            tag = self.db.scalar(select(Tag).where(Tag.slug == slug))
            if not tag:
                tag = Tag(id=uuid4(), slug=slug, display_name=display_name)
                self.db.add(tag)
                self.db.flush()
            review.tags.append(ReviewTag(tag=tag))

    @staticmethod
    def _excerpt(blocks: list[ReviewBlock]) -> str:
        paragraph = next(block.text for block in blocks if block.kind is ReviewBlockKind.PARAGRAPH)
        compact = " ".join(str(paragraph).split())
        return compact[:297] + "..." if len(compact) > 300 else compact

    def _apply_content(
        self, review: Review, body: ReviewWriteRequest, assets: list[MediaAsset]
    ) -> None:
        review.title = body.title
        review.plan_id = body.plan_id
        review.cover_media_id = body.cover_media_id
        review.origin_station_id = body.origin_station_id
        review.destination_station_id = body.destination_station_id
        review.rating = body.rating
        review.travel_date = body.travel_date
        review.cost_won = body.cost_won
        review.status = body.status
        review.body = [block.model_dump(mode="json", by_alias=True) for block in body.blocks]
        review.excerpt = self._excerpt(body.blocks)
        for relation in review.media:
            relation.asset.status = MediaStatus.UPLOADED
        review.media.clear()
        asset_by_id = {asset.id: asset for asset in assets}
        if body.cover_media_id and body.cover_media_id not in asset_by_id:
            raise ApiError(422, "INVALID_REVIEW_COVER", "대표 이미지는 본문에 넣은 이미지여야 합니다.")
        position = 0
        for block in body.blocks:
            if block.kind is not ReviewBlockKind.IMAGE or not block.media_id:
                continue
            position += 1
            asset = asset_by_id[block.media_id]
            asset.status = MediaStatus.ATTACHED
            review.media.append(
                ReviewMedia(
                    media_id=asset.id,
                    position=position,
                    alt_text=block.alt_text or "여행 사진",
                    asset=asset,
                )
            )
        self._replace_tags(review, body.tags)
        self._replace_place_ratings(review, body)

    def create(self, author_id: UUID, body: ReviewWriteRequest) -> Review:
        self._validate_context(author_id, body)
        assets = self._assets_for_blocks(author_id, body.blocks)
        review = Review(id=uuid4(), author_id=author_id, title="", excerpt="", body=[])
        self._apply_content(review, body, assets)
        self.db.add(review)
        self.db.commit()
        return self.repository.get(review.id) or review

    def update(
        self, review_id: UUID, author_id: UUID, expected_version: int, body: ReviewWriteRequest
    ) -> Review:
        review = self.repository.get(review_id, for_update=True)
        if not review:
            raise ApiError(404, "REVIEW_NOT_FOUND", "후기를 찾을 수 없습니다.")
        if review.author_id != author_id:
            raise ApiError(403, "REVIEW_FORBIDDEN", "이 후기를 수정할 권한이 없습니다.")
        if review.version != expected_version:
            raise ApiError(412, "REVIEW_VERSION_CONFLICT", "후기가 다른 곳에서 변경되었습니다.")
        self._validate_context(author_id, body)
        assets = self._assets_for_blocks(author_id, body.blocks, review)
        self._apply_content(review, body, assets)
        review.version += 1
        self.db.commit()
        return self.repository.get(review.id) or review

    def delete(self, review_id: UUID, author_id: UUID) -> None:
        review = self.repository.get(review_id, for_update=True)
        if not review:
            raise ApiError(404, "REVIEW_NOT_FOUND", "후기를 찾을 수 없습니다.")
        if review.author_id != author_id:
            raise ApiError(403, "REVIEW_FORBIDDEN", "이 후기를 삭제할 권한이 없습니다.")
        review.status = ReviewStatus.HIDDEN
        review.deleted_at = datetime.now(UTC)
        self.db.commit()

    def _summary(self, review: Review) -> ReviewSummary:
        author = self.db.get(User, review.author_id)
        origin = self.db.get(Station, review.origin_station_id)
        destination = (
            self.db.get(Station, review.destination_station_id)
            if review.destination_station_id
            else None
        )
        cover_relation = next(
            (relation for relation in review.media if relation.media_id == review.cover_media_id),
            review.media[0] if review.media else None,
        )
        cover = cover_relation.asset if cover_relation else None
        return ReviewSummary(
            id=review.id,
            author_id=review.author_id,
            author_name=author.display_name if author else "탈퇴한 사용자",
            title=review.title,
            excerpt=review.excerpt,
            origin_station_id=review.origin_station_id,
            origin_station_name=origin.name if origin else "알 수 없는 역",
            destination_station_id=review.destination_station_id,
            destination_station_name=destination.name if destination else None,
            rating=review.rating,
            travel_date=review.travel_date,
            cost_won=review.cost_won,
            status=review.status,
            view_count=review.view_count,
            like_count=self.repository.like_count(review.id),
            tags=[relation.tag.display_name for relation in review.tags],
            cover_url=self.storage.public_url(cover.object_key) if cover else None,
            cover_width=cover.width if cover else None,
            cover_height=cover.height if cover else None,
            created_at=review.created_at,
            version=review.version,
        )

    def summary(self, review: Review) -> ReviewSummary:
        return self._summary(review)

    def detail(
        self, review_id: UUID, viewer_id: UUID | None, increment_view: bool = True
    ) -> ReviewDetail:
        review = self.repository.get(review_id)
        if not review or review.status is not ReviewStatus.PUBLISHED:
            raise ApiError(404, "REVIEW_NOT_FOUND", "후기를 찾을 수 없습니다.")
        if increment_view:
            self.repository.increment_view(review.id)
            self.db.commit()
            review = self.repository.get(review.id) or review
        summary = self._summary(review)
        return ReviewDetail(
            **summary.model_dump(),
            plan_id=review.plan_id,
            blocks=[ReviewBlock.model_validate(block) for block in review.body],
            media=[
                ReviewMediaView(
                    id=relation.asset.id,
                    url=self.storage.public_url(relation.asset.object_key),
                    mime_type=relation.asset.mime_type,
                    width=relation.asset.width,
                    height=relation.asset.height,
                    alt_text=relation.alt_text,
                    position=relation.position,
                )
                for relation in review.media
            ],
            updated_at=review.updated_at,
            liked_by_me=self.repository.liked(review.id, viewer_id),
            place_ratings=[
                ReviewPlaceRatingView(
                    place_id=relation.place_id,
                    place_name=relation.place.name,
                    rating=relation.rating_twice / 2,
                )
                for relation in review.place_ratings
            ],
        )

    def set_like(self, review_id: UUID, user_id: UUID, liked: bool) -> int:
        review = self.repository.get(review_id)
        if not review or review.status is not ReviewStatus.PUBLISHED:
            raise ApiError(404, "REVIEW_NOT_FOUND", "후기를 찾을 수 없습니다.")
        if liked:
            self.repository.add_like(review_id, user_id)
        else:
            self.repository.remove_like(review_id, user_id)
        self.db.commit()
        return self.repository.like_count(review_id)
