"""게시판 데이터 조회와 저장."""

from sqlalchemy import column, func, select, table
from sqlalchemy.orm import Session

from app.models.auth import User
from app.models.community import BoardPost, PostParticipant

# travel_plans는 다른 도메인의 테이블이라 ORM 모델을 두지 않는다.
# 존재 확인에 필요한 컬럼만 가벼운 Core 테이블로 참조한다.
_travel_plans = table("travel_plans", column("plan_id"))


class CommunityRepository:
    """게시글과 모집 참여 신청 관련 SQLAlchemy 작업을 담당한다."""

    def __init__(self, session: Session) -> None:
        """DB 세션을 저장한다."""
        self.session = session

    # 게시글 -------------------------------------------------------

    def find_post_by_id(self, post_id: int) -> BoardPost | None:
        """식별자로 게시글을 조회한다."""
        return self.session.get(BoardPost, post_id)

    def list_posts(
        self,
        *,
        keyword: str | None,
        recruit_status: str | None,
        page: int,
        size: int,
    ) -> tuple[list[BoardPost], int]:
        """검색 조건에 맞는 게시글을 페이지 단위로 조회하고 전체 건수를 반환한다."""
        statement = select(BoardPost)
        if keyword:
            pattern = f"%{keyword}%"
            statement = statement.where(
                BoardPost.title.ilike(pattern) | BoardPost.content.ilike(pattern)
            )
        if recruit_status:
            statement = statement.where(BoardPost.recruit_status == recruit_status)

        total = (
            self.session.scalar(select(func.count()).select_from(statement.subquery()))
            or 0
        )
        items = self.session.scalars(
            statement.order_by(BoardPost.created_at.desc(), BoardPost.post_id.desc())
            .offset((page - 1) * size)
            .limit(size)
        ).all()
        return list(items), total

    def create_post(self, **fields: object) -> BoardPost:
        """새 게시글을 추가하고 식별자를 할당한다."""
        post = BoardPost(**fields)
        self.session.add(post)
        self.session.flush()
        return post

    def increment_view_count(self, post: BoardPost) -> None:
        """게시글 조회수를 1 증가시킨다."""
        post.view_count += 1

    def delete_post(self, post: BoardPost) -> None:
        """게시글을 삭제한다. 참여 신청은 DB의 CASCADE로 함께 삭제된다."""
        self.session.delete(post)

    # 참여 신청 ------------------------------------------------------

    def find_participant(self, post_id: int, user_id: int) -> PostParticipant | None:
        """게시글과 사용자 조합으로 참여 신청을 조회한다."""
        return self.session.scalar(
            select(PostParticipant).where(
                PostParticipant.post_id == post_id,
                PostParticipant.user_id == user_id,
            )
        )

    def find_participant_by_id(
        self,
        post_id: int,
        participant_id: int,
    ) -> PostParticipant | None:
        """게시글 범위 안에서 식별자로 참여 신청을 조회한다."""
        return self.session.scalar(
            select(PostParticipant).where(
                PostParticipant.post_id == post_id,
                PostParticipant.participant_id == participant_id,
            )
        )

    def list_participants(
        self,
        post_id: int,
        status: str | None,
    ) -> list[PostParticipant]:
        """게시글의 참여 신청 목록을 신청 순서대로 조회한다."""
        statement = select(PostParticipant).where(PostParticipant.post_id == post_id)
        if status:
            statement = statement.where(PostParticipant.status == status)
        return list(
            self.session.scalars(
                statement.order_by(PostParticipant.applied_at.asc())
            ).all()
        )

    def create_participant(self, post_id: int, user_id: int) -> PostParticipant:
        """새 참여 신청을 추가한다."""
        participant = PostParticipant(
            post_id=post_id, user_id=user_id, status="APPLIED"
        )
        self.session.add(participant)
        self.session.flush()
        return participant

    def count_accepted(self, post_id: int) -> int:
        """게시글의 수락된 참여자 수를 센다."""
        return (
            self.session.scalar(
                select(func.count())
                .select_from(PostParticipant)
                .where(
                    PostParticipant.post_id == post_id,
                    PostParticipant.status == "ACCEPTED",
                )
            )
            or 0
        )

    def count_accepted_for_posts(self, post_ids: list[int]) -> dict[int, int]:
        """여러 게시글의 수락된 참여자 수를 한 번에 센다."""
        if not post_ids:
            return {}
        rows = self.session.execute(
            select(PostParticipant.post_id, func.count())
            .where(
                PostParticipant.post_id.in_(post_ids),
                PostParticipant.status == "ACCEPTED",
            )
            .group_by(PostParticipant.post_id)
        ).all()
        return {row[0]: row[1] for row in rows}

    # 공용 -----------------------------------------------------------

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
