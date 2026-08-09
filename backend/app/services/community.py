"""모집 게시판 비즈니스 로직.

V1.10 개정으로 board_posts는 인원 모집 전용이 되어(일반 게시판 제외),
모든 게시글이 모집 정보를 가진다.
"""

import math
from datetime import date, datetime, timezone
from enum import Enum

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.community import BoardPost, PostParticipant
from app.repositories.community import CommunityRepository
from app.schemas.community import (
    AuthorResponse,
    MyParticipationResponse,
    ParticipantCancelRequest,
    ParticipantDecisionRequest,
    ParticipantListResponse,
    ParticipantResponse,
    ParticipantStatus,
    ParticipatingPostListResponse,
    ParticipatingPostResponse,
    ParticipatingPostStatus,
    PostCreateRequest,
    PostDetailResponse,
    PostListResponse,
    PostSummaryResponse,
    PostUpdateRequest,
    RecruitmentResponse,
    RecruitStatus,
)


def _error(code: str, message: str, status_code: int) -> HTTPException:
    """게시판 오류를 공통 API 오류 형식으로 만든다."""
    return HTTPException(status_code, detail=message, headers={"X-Error-Code": code})


def _now() -> datetime:
    """현재 UTC 시각을 naive datetime으로 반환한다."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _today() -> date:
    """오늘 날짜(UTC 기준)를 반환한다."""
    return _now().date()


def _find_post(
    repository: CommunityRepository,
    post_id: int,
) -> BoardPost:
    """모집 게시글을 조회하고 존재하지 않으면 404 오류를 발생시킨다."""
    post = repository.find_post_by_id(post_id)
    if not post:
        raise _error("POST_NOT_FOUND", "게시글을 찾을 수 없습니다.", 404)
    return post


def _find_owned_post(
    repository: CommunityRepository,
    post_id: int,
    user_id: int,
) -> BoardPost:
    """게시글을 조회하고 요청자가 작성자인지 확인한다."""
    post = _find_post(repository, post_id)
    if post.user_id != user_id:
        raise _error(
            "POST_FORBIDDEN",
            "본인이 작성한 게시글만 처리할 수 있습니다.",
            403,
        )
    return post


def _recruitment(post: BoardPost, accepted_count: int) -> RecruitmentResponse:
    """모집 정보를 조립한다."""
    return RecruitmentResponse(
        capacity=post.recruit_capacity,
        accepted_count=accepted_count,
        deadline=post.recruit_deadline,
        status=post.recruit_status,
        meeting_date=post.meeting_date,
    )


def _to_summary(
    post: BoardPost,
    *,
    author_nickname: str,
    accepted_count: int,
) -> PostSummaryResponse:
    """BoardPost 엔티티를 목록용 요약 응답으로 조립한다."""
    return PostSummaryResponse(
        post_id=post.post_id,
        title=post.title,
        author=AuthorResponse(user_id=post.user_id, nickname=author_nickname),
        view_count=post.view_count,
        recruitment=_recruitment(post, accepted_count),
        created_at=post.created_at,
    )


def _to_detail(
    post: BoardPost,
    *,
    author_nickname: str,
    accepted_count: int,
) -> PostDetailResponse:
    """BoardPost 엔티티를 상세 응답으로 조립한다."""
    return PostDetailResponse(
        post_id=post.post_id,
        title=post.title,
        author=AuthorResponse(user_id=post.user_id, nickname=author_nickname),
        view_count=post.view_count,
        recruitment=_recruitment(post, accepted_count),
        created_at=post.created_at,
        content=post.content,
        plan_id=post.plan_id,
        updated_at=post.updated_at,
    )


def _to_participant_response(
    participant: PostParticipant,
    nickname: str,
) -> ParticipantResponse:
    """PostParticipant 엔티티를 응답 스키마로 조립한다."""
    return ParticipantResponse(
        participant_id=participant.participant_id,
        post_id=participant.post_id,
        user=AuthorResponse(user_id=participant.user_id, nickname=nickname),
        status=participant.status,
        applied_at=participant.applied_at,
        responded_at=participant.responded_at,
    )


def _build_post_summaries(
    repository: CommunityRepository,
    posts: list[BoardPost],
) -> list[PostSummaryResponse]:
    """여러 모집 글을 작성자와 수락 인원을 포함한 요약 응답으로 조립한다."""
    if not posts:
        return []
    nicknames = repository.get_user_nicknames({post.user_id for post in posts})
    accepted_counts = repository.count_accepted_for_posts(
        [post.post_id for post in posts]
    )
    return [
        _to_summary(
            post,
            author_nickname=nicknames.get(post.user_id, ""),
            accepted_count=accepted_counts.get(post.post_id, 0),
        )
        for post in posts
    ]


def list_posts(
    db: Session,
    *,
    keyword: str | None,
    recruit_status: RecruitStatus | None,
    page: int,
    size: int,
) -> PostListResponse:
    """검색 조건에 맞는 모집 게시글 목록을 페이지 단위로 조회한다."""
    repository = CommunityRepository(db)
    posts, total = repository.list_posts(
        keyword=keyword,
        recruit_status=recruit_status.value if recruit_status else None,
        page=page,
        size=size,
    )

    return PostListResponse(
        items=_build_post_summaries(repository, posts),
        page=page,
        size=size,
        total_elements=total,
        total_pages=math.ceil(total / size) if total else 0,
    )


def list_my_posts(
    db: Session,
    user_id: int,
    *,
    page: int,
    size: int,
) -> PostListResponse:
    """현재 사용자가 작성한 모집 글을 최근 작성순으로 페이지 조회한다."""
    repository = CommunityRepository(db)
    posts, total = repository.list_posts_by_author_id(
        user_id=user_id,
        page=page,
        size=size,
    )
    return PostListResponse(
        items=_build_post_summaries(repository, posts),
        page=page,
        size=size,
        total_elements=total,
        total_pages=math.ceil(total / size) if total else 0,
    )


def list_my_participating_posts(
    db: Session,
    user_id: int,
    *,
    status: ParticipatingPostStatus,
    page: int,
    size: int,
) -> ParticipatingPostListResponse:
    """현재 사용자의 신청 중 또는 수락된 모집 글을 상태별 활동순으로 조회한다."""
    repository = CommunityRepository(db)
    rows, total = repository.list_participating_posts(
        user_id=user_id,
        status=status.value,
        page=page,
        size=size,
    )
    posts = [post for post, _ in rows]
    summaries = _build_post_summaries(repository, posts)
    items = [
        ParticipatingPostResponse(
            **summary.model_dump(),
            participation=MyParticipationResponse(
                participant_id=participant.participant_id,
                status=participant.status,
                applied_at=participant.applied_at,
                responded_at=participant.responded_at,
            ),
        )
        for summary, (_, participant) in zip(summaries, rows, strict=True)
    ]
    return ParticipatingPostListResponse(
        items=items,
        page=page,
        size=size,
        total_elements=total,
        total_pages=math.ceil(total / size) if total else 0,
    )


def create_post(
    db: Session,
    user_id: int,
    request: PostCreateRequest,
) -> PostDetailResponse:
    """새 모집 게시글을 작성한다. 모집 상태는 DB 기본값(RECRUITING)을 따른다."""
    repository = CommunityRepository(db)
    if request.plan_id is not None and not repository.plan_exists(request.plan_id):
        raise _error("PLAN_NOT_FOUND", "존재하지 않는 여행 계획입니다.", 400)

    post = repository.create_post(
        user_id=user_id,
        title=request.title,
        content=request.content,
        recruit_capacity=request.recruit_capacity,
        recruit_deadline=request.recruit_deadline,
        meeting_date=request.meeting_date,
        plan_id=request.plan_id,
    )
    db.commit()
    db.refresh(post)

    nickname = repository.get_user_nicknames({user_id}).get(user_id, "")
    return _to_detail(post, author_nickname=nickname, accepted_count=0)


def get_post(db: Session, post_id: int) -> PostDetailResponse:
    """게시글 상세를 조회하고 조회수를 1 증가시킨다."""
    repository = CommunityRepository(db)
    post = repository.find_post_by_id(post_id)
    if not post:
        raise _error("POST_NOT_FOUND", "게시글을 찾을 수 없습니다.", 404)

    repository.increment_view_count(post)
    db.commit()
    db.refresh(post)

    nickname = repository.get_user_nicknames({post.user_id}).get(post.user_id, "")
    accepted_count = repository.count_accepted(post_id)
    return _to_detail(post, author_nickname=nickname, accepted_count=accepted_count)


def update_post(
    db: Session,
    post_id: int,
    user_id: int,
    request: PostUpdateRequest,
) -> PostDetailResponse:
    """본인이 작성한 게시글을 수정한다."""
    repository = CommunityRepository(db)
    post = _find_owned_post(repository, post_id, user_id)

    fields = request.model_dump(exclude_unset=True)

    if "plan_id" in fields and fields["plan_id"] is not None:
        if not repository.plan_exists(fields["plan_id"]):
            raise _error("PLAN_NOT_FOUND", "존재하지 않는 여행 계획입니다.", 400)

    if "recruit_capacity" in fields and fields["recruit_capacity"] is not None:
        accepted_count = repository.count_accepted(post_id)
        if fields["recruit_capacity"] < accepted_count:
            raise _error(
                "RECRUIT_CAPACITY_TOO_LOW",
                "이미 수락된 인원보다 적은 정원으로 줄일 수 없습니다.",
                400,
            )

    for name, value in fields.items():
        setattr(post, name, value.value if isinstance(value, Enum) else value)

    db.commit()
    db.refresh(post)

    nickname = repository.get_user_nicknames({post.user_id}).get(post.user_id, "")
    accepted_count = repository.count_accepted(post_id)
    return _to_detail(post, author_nickname=nickname, accepted_count=accepted_count)


def delete_post(db: Session, post_id: int, user_id: int) -> None:
    """본인이 작성한 게시글을 삭제한다."""
    repository = CommunityRepository(db)
    post = _find_owned_post(repository, post_id, user_id)
    repository.delete_post(post)
    db.commit()


def delete_post_as_admin(db: Session, post_id: int) -> None:
    """관리자가 작성자와 관계없이 모집 게시글을 삭제한다."""
    repository = CommunityRepository(db)
    post = _find_post(repository, post_id)
    repository.delete_post(post)
    db.commit()


def apply_to_post(
    db: Session,
    post_id: int,
    user_id: int,
) -> ParticipantResponse:
    """모집 글에 참여를 신청한다. 취소·거절 이력이 있으면 다시 신청 상태로 되돌린다."""
    repository = CommunityRepository(db)
    post = repository.find_post_by_id(post_id)
    if not post:
        raise _error("POST_NOT_FOUND", "게시글을 찾을 수 없습니다.", 404)
    if post.user_id == user_id:
        raise _error(
            "CANNOT_APPLY_OWN_POST",
            "본인이 작성한 모집 글에는 신청할 수 없습니다.",
            400,
        )
    if (
        post.recruit_status != RecruitStatus.RECRUITING.value
        or post.recruit_deadline < _today()
    ):
        raise _error("RECRUIT_CLOSED", "마감된 모집입니다.", 409)

    accepted_count = repository.count_accepted(post_id)
    if accepted_count >= post.recruit_capacity:
        raise _error("RECRUIT_FULL", "모집 정원이 모두 찼습니다.", 409)

    existing = repository.find_participant(post_id, user_id)
    if existing:
        if existing.status in (
            ParticipantStatus.APPLIED.value,
            ParticipantStatus.ACCEPTED.value,
        ):
            raise _error(
                "PARTICIPANT_ALREADY_EXISTS",
                "이미 신청했거나 참여 중입니다.",
                409,
            )
        existing.status = ParticipantStatus.APPLIED.value
        existing.applied_at = _now()
        existing.responded_at = None
        participant = existing
    else:
        participant = repository.create_participant(post_id, user_id)

    db.commit()
    db.refresh(participant)

    nickname = repository.get_user_nicknames({user_id}).get(user_id, "")
    return _to_participant_response(participant, nickname)


def cancel_my_application(
    db: Session,
    post_id: int,
    user_id: int,
    request: ParticipantCancelRequest,
) -> ParticipantResponse:
    """본인의 참여 신청을 취소한다."""
    if request.status is not ParticipantStatus.CANCELED:
        raise _error(
            "INVALID_PARTICIPANT_STATUS",
            "CANCELED만 허용됩니다.",
            400,
        )

    repository = CommunityRepository(db)
    participant = repository.find_participant(post_id, user_id)
    if not participant:
        raise _error("PARTICIPANT_NOT_FOUND", "신청 내역을 찾을 수 없습니다.", 404)
    if participant.status not in (
        ParticipantStatus.APPLIED.value,
        ParticipantStatus.ACCEPTED.value,
    ):
        raise _error(
            "PARTICIPANT_NOT_CANCELABLE",
            "취소할 수 있는 상태가 아닙니다.",
            409,
        )

    participant.status = ParticipantStatus.CANCELED.value
    db.commit()
    db.refresh(participant)

    nickname = repository.get_user_nicknames({user_id}).get(user_id, "")
    return _to_participant_response(participant, nickname)


def list_participants(
    db: Session,
    post_id: int,
    organizer_id: int,
    status: ParticipantStatus | None,
) -> ParticipantListResponse:
    """게시글 작성자가 참여 신청 목록을 조회한다."""
    repository = CommunityRepository(db)
    _find_owned_post(repository, post_id, organizer_id)

    participants = repository.list_participants(
        post_id, status.value if status else None
    )
    nicknames = repository.get_user_nicknames(
        {participant.user_id for participant in participants}
    )
    return ParticipantListResponse(
        items=[
            _to_participant_response(
                participant, nicknames.get(participant.user_id, "")
            )
            for participant in participants
        ]
    )


def decide_participant(
    db: Session,
    post_id: int,
    participant_id: int,
    organizer_id: int,
    request: ParticipantDecisionRequest,
) -> ParticipantResponse:
    """게시글 작성자가 참여 신청을 수락하거나 거절한다."""
    if request.status not in (ParticipantStatus.ACCEPTED, ParticipantStatus.REJECTED):
        raise _error(
            "INVALID_PARTICIPANT_STATUS",
            "ACCEPTED 또는 REJECTED만 허용됩니다.",
            400,
        )

    repository = CommunityRepository(db)
    post = _find_owned_post(repository, post_id, organizer_id)

    participant = repository.find_participant_by_id(post_id, participant_id)
    if not participant:
        raise _error("PARTICIPANT_NOT_FOUND", "신청 내역을 찾을 수 없습니다.", 404)
    if participant.status != ParticipantStatus.APPLIED.value:
        raise _error("PARTICIPANT_NOT_PENDING", "이미 처리된 신청입니다.", 409)

    if request.status is ParticipantStatus.ACCEPTED:
        accepted_count = repository.count_accepted(post_id)
        if accepted_count >= post.recruit_capacity:
            raise _error("RECRUIT_FULL", "모집 정원이 모두 찼습니다.", 409)

        participant.status = ParticipantStatus.ACCEPTED.value
        participant.responded_at = _now()
        if accepted_count + 1 >= post.recruit_capacity:
            post.recruit_status = RecruitStatus.CLOSED.value
    else:
        participant.status = ParticipantStatus.REJECTED.value
        participant.responded_at = _now()

    db.commit()
    db.refresh(participant)

    nickname = repository.get_user_nicknames({participant.user_id}).get(
        participant.user_id, ""
    )
    return _to_participant_response(participant, nickname)
