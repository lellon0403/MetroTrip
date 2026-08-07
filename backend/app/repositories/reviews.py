"""여행 후기 데이터 조회와 저장"""

from sqlalchemy import column, delete, func, select, table
from sqlalchemy.orm import Session

from app.models.auth import User
from app.models.reviews import Review, ReviewMedia, ReviewTag

# stations, travel_plans는 다른 도메인의 테이블이라 ORM 모델을 두지 않는다.
# 이름 조회와 존재 확인에 필요한 컬럼만 가벼운 Core 테이블로 참조한다.
_stations = table("stations", column("station_id"), column("station_name"))
_travel_plans = table("travel_plans", column("plan_id"))


class ReviewRepository:
    """여행 후기 관련 SQLAlchemy 작업을 담당한다."""

    def __init__(self, session: Session) -> None:
        """DB 세션을 저장한다."""
        self.session = session

    def find_review_by_id(self, review_id: int) -> Review | None:
        """식별자로 후기를 조회한다."""
        return self.session.get(Review, review_id)

    def list_reviews(
        self,
        *,
        keyword: str | None,
        station_id: int | None,
        tag: str | None,
        page: int,
        size: int,
    ) -> tuple[list[Review], int]:
        """검색 조건에 맞는 후기를 페이지 단위로 조회하고 전체 건수를 반환한다."""
        statement = select(Review)
        if keyword:
            pattern = f"%{keyword}%"
            statement = statement.where(
                Review.title.ilike(pattern) | Review.content.ilike(pattern)
            )
        if station_id is not None:
            statement = statement.where(
                (Review.start_station_id == station_id)
                | (Review.end_station_id == station_id)
            )
        if tag:
            statement = statement.where(
                Review.review_id.in_(
                    select(ReviewTag.review_id).where(ReviewTag.tag_name == tag)
                )
            )

        total = (
            self.session.scalar(select(func.count()).select_from(statement.subquery()))
            or 0
        )
        items = self.session.scalars(
            statement.order_by(Review.created_at.desc(), Review.review_id.desc())
            .offset((page - 1) * size)
            .limit(size)
        ).all()
        return list(items), total

    def list_reviews_by_user_id(
        self,
        *,
        user_id: int,
        page: int,
        size: int,
    ) -> tuple[list[Review], int]:
        """사용자가 작성한 후기를 최근 작성순으로 조회하고 전체 건수를 반환한다."""
        statement = select(Review).where(Review.user_id == user_id)
        total = (
            self.session.scalar(select(func.count()).select_from(statement.subquery()))
            or 0
        )
        items = self.session.scalars(
            statement.order_by(Review.created_at.desc(), Review.review_id.desc())
            .offset((page - 1) * size)
            .limit(size)
        ).all()
        return list(items), total

    def existing_station_ids(self, station_ids: set[int]) -> set[int]:
        """전달한 역 ID 중 실제로 존재하는 ID만 반환한다."""
        if not station_ids:
            return set()
        rows = self.session.execute(
            select(_stations.c.station_id).where(
                _stations.c.station_id.in_(station_ids)
            )
        ).scalars()
        return set(rows)

    def get_station_names(self, station_ids: set[int]) -> dict[int, str]:
        """역 ID별 역 이름을 조회한다."""
        if not station_ids:
            return {}
        rows = self.session.execute(
            select(_stations.c.station_id, _stations.c.station_name).where(
                _stations.c.station_id.in_(station_ids)
            )
        ).all()
        return {row.station_id: row.station_name for row in rows}

    def plan_exists(self, plan_id: int) -> bool:
        """여행 계획 ID가 존재하는지 확인한다."""
        row = self.session.execute(
            select(_travel_plans.c.plan_id).where(_travel_plans.c.plan_id == plan_id)
        ).first()
        return row is not None

    def get_user_nicknames(self, user_ids: set[int]) -> dict[int, str]:
        """사용자 ID별 닉네임을 조회한다."""
        if not user_ids:
            return {}
        rows = self.session.execute(
            select(User.user_id, User.nickname).where(User.user_id.in_(user_ids))
        ).all()
        return {row.user_id: row.nickname for row in rows}

    def list_tags(self, review_ids: list[int]) -> dict[int, list[str]]:
        """후기 ID별 태그 목록을 조회한다."""
        result: dict[int, list[str]] = {review_id: [] for review_id in review_ids}
        if not review_ids:
            return result
        rows = self.session.execute(
            select(ReviewTag.review_id, ReviewTag.tag_name).where(
                ReviewTag.review_id.in_(review_ids)
            )
        ).all()
        for row in rows:
            result[row.review_id].append(row.tag_name)
        return result

    def list_media(self, review_ids: list[int]) -> dict[int, list[ReviewMedia]]:
        """후기 ID별 첨부 미디어 목록을 조회한다."""
        result: dict[int, list[ReviewMedia]] = {
            review_id: [] for review_id in review_ids
        }
        if not review_ids:
            return result
        rows = self.session.scalars(
            select(ReviewMedia).where(ReviewMedia.review_id.in_(review_ids))
        )
        for media in rows:
            result[media.review_id].append(media)
        return result

    def create_review(
        self,
        *,
        user_id: int,
        title: str,
        content: str,
        start_station_id: int,
        end_station_id: int,
        rating: int,
        travel_cost: int | None,
        plan_id: int | None,
    ) -> Review:
        """새 후기를 추가하고 식별자를 할당한다."""
        review = Review(
            user_id=user_id,
            title=title,
            content=content,
            start_station_id=start_station_id,
            end_station_id=end_station_id,
            rating=rating,
            travel_cost=travel_cost,
            plan_id=plan_id,
        )
        self.session.add(review)
        self.session.flush()
        return review

    def add_tags(self, review_id: int, tags: list[str]) -> None:
        """후기에 태그를 추가한다. 중복 태그는 무시한다."""
        for tag_name in dict.fromkeys(tags):
            self.session.add(ReviewTag(review_id=review_id, tag_name=tag_name))

    def add_media(self, review_id: int, media: list[tuple[str, str]]) -> None:
        """후기에 첨부 미디어를 추가한다."""
        for media_url, media_type in media:
            self.session.add(
                ReviewMedia(
                    review_id=review_id,
                    media_url=media_url,
                    media_type=media_type,
                )
            )

    def replace_tags(self, review_id: int, tags: list[str]) -> None:
        """후기의 태그를 새 목록으로 교체한다."""
        self.session.execute(delete(ReviewTag).where(ReviewTag.review_id == review_id))
        self.add_tags(review_id, tags)

    def replace_media(self, review_id: int, media: list[tuple[str, str]]) -> None:
        """후기의 첨부 미디어를 새 목록으로 교체한다."""
        self.session.execute(
            delete(ReviewMedia).where(ReviewMedia.review_id == review_id)
        )
        self.add_media(review_id, media)

    def increment_view_count(self, review: Review) -> None:
        """후기 조회수를 1 증가시킨다."""
        review.view_count += 1

    def delete_review(self, review: Review) -> None:
        """후기를 삭제한다. 태그와 미디어는 DB의 CASCADE로 함께 삭제된다."""
        self.session.delete(review)
