"""모집 게시판 서비스 계층 테스트.

V1.10 개정으로 board_posts는 인원 모집 전용이 되어(일반 게시판 제외) 별도
post_type 구분이 없다. 실제 MySQL 없이도 검증할 수 있도록 SQLite 인메모리
DB를 사용한다.
"""

import datetime as dt
from collections.abc import Iterator

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.models.auth import User
from app.models.community import PostParticipant
from app.schemas.community import (
    ParticipantCancelRequest,
    ParticipantDecisionRequest,
    ParticipantStatus,
    ParticipatingPostStatus,
    PostCreateRequest,
    PostUpdateRequest,
)
from app.services import community as community_service


@pytest.fixture
def db() -> Iterator[Session]:
    """SQLite 인메모리 세션에 최소 픽스처 사용자를 채워 반환한다."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = session_factory()
    try:
        session.add_all(
            [
                User(
                    user_id=1,
                    email="organizer@example.com",
                    password="hashed",
                    name="주최자",
                    nickname="주최자닉",
                ),
                User(
                    user_id=2,
                    email="applicant@example.com",
                    password="hashed",
                    name="신청자",
                    nickname="신청자닉",
                ),
                User(
                    user_id=3,
                    email="applicant2@example.com",
                    password="hashed",
                    name="신청자2",
                    nickname="신청자2닉",
                ),
            ]
        )
        session.commit()
        yield session
    finally:
        session.close()


def _create_request(**overrides: object) -> PostCreateRequest:
    payload = {
        "title": "온양온천역 같이 가실 분",
        "content": "주말에 같이 가요.",
        "recruit_capacity": 2,
        "recruit_deadline": dt.date.today() + dt.timedelta(days=7),
    }
    payload.update(overrides)
    return PostCreateRequest(**payload)


def test_create_post_starts_recruiting(db: Session) -> None:
    created = community_service.create_post(db, 1, _create_request())

    assert created.recruitment.status.value == "RECRUITING"
    assert created.recruitment.accepted_count == 0
    assert created.recruitment.capacity == 2


def test_get_post_increments_view_count(db: Session) -> None:
    created = community_service.create_post(db, 1, _create_request())

    first = community_service.get_post(db, created.post_id)
    second = community_service.get_post(db, created.post_id)
    assert first.view_count == 1
    assert second.view_count == 2


def test_create_post_rejects_unknown_plan(db: Session) -> None:
    with pytest.raises(HTTPException) as exc_info:
        community_service.create_post(db, 1, _create_request(plan_id=999))
    assert exc_info.value.status_code == 400
    assert exc_info.value.headers["X-Error-Code"] == "PLAN_NOT_FOUND"


def test_list_posts_filters_by_keyword(db: Session) -> None:
    community_service.create_post(db, 1, _create_request(title="탕정역 모임"))
    community_service.create_post(db, 1, _create_request(title="온양온천역 모임"))

    result = community_service.list_posts(
        db, keyword="탕정", recruit_status=None, page=1, size=20
    )
    assert result.total_elements == 1
    assert result.items[0].title == "탕정역 모임"


def test_list_my_posts_returns_only_authors_posts_in_recent_order(
    db: Session,
) -> None:
    """내 작성 글은 다른 사용자의 글을 제외하고 최근 작성순으로 반환한다."""
    first = community_service.create_post(
        db,
        1,
        _create_request(title="첫 번째 작성 글"),
    )
    community_service.create_post(
        db,
        2,
        _create_request(title="다른 사용자의 글"),
    )
    second = community_service.create_post(
        db,
        1,
        _create_request(title="두 번째 작성 글"),
    )

    result = community_service.list_my_posts(db, 1, page=1, size=10)

    assert [item.post_id for item in result.items] == [
        second.post_id,
        first.post_id,
    ]
    assert result.total_elements == 2
    assert result.total_pages == 1
    assert all(item.author.user_id == 1 for item in result.items)
    assert all(item.view_count == 0 for item in result.items)


def test_list_my_posts_paginates_and_returns_empty_page(db: Session) -> None:
    """내 작성 글은 페이지 단위로 조회하고 결과가 없으면 빈 페이지를 반환한다."""
    community_service.create_post(db, 1, _create_request(title="첫 번째 작성 글"))
    community_service.create_post(db, 1, _create_request(title="두 번째 작성 글"))

    second_page = community_service.list_my_posts(db, 1, page=2, size=1)
    empty = community_service.list_my_posts(db, 3, page=1, size=10)

    assert len(second_page.items) == 1
    assert second_page.total_elements == 2
    assert second_page.total_pages == 2
    assert empty.items == []
    assert empty.total_elements == 0
    assert empty.total_pages == 0


def test_list_my_applied_posts_uses_recent_application_order(db: Session) -> None:
    """신청 중인 모집 글은 최근 신청순이며 다른 상태는 제외한다."""
    first_post = community_service.create_post(
        db,
        1,
        _create_request(title="먼저 신청한 글"),
    )
    second_post = community_service.create_post(
        db,
        1,
        _create_request(title="나중에 신청한 글"),
    )
    accepted_post = community_service.create_post(
        db,
        1,
        _create_request(title="수락된 글"),
    )
    first = community_service.apply_to_post(db, first_post.post_id, 2)
    second = community_service.apply_to_post(db, second_post.post_id, 2)
    accepted = community_service.apply_to_post(db, accepted_post.post_id, 2)
    community_service.decide_participant(
        db,
        accepted_post.post_id,
        accepted.participant_id,
        1,
        ParticipantDecisionRequest(status=ParticipantStatus.ACCEPTED),
    )

    first_row = db.get(PostParticipant, first.participant_id)
    second_row = db.get(PostParticipant, second.participant_id)
    assert first_row is not None
    assert second_row is not None
    first_row.applied_at = dt.datetime(2026, 8, 1, 10, 0)
    second_row.applied_at = dt.datetime(2026, 8, 2, 10, 0)
    db.commit()

    result = community_service.list_my_participating_posts(
        db,
        2,
        status=ParticipatingPostStatus.APPLIED,
        page=1,
        size=10,
    )

    assert [item.post_id for item in result.items] == [
        second_post.post_id,
        first_post.post_id,
    ]
    assert all(item.participation.status.value == "APPLIED" for item in result.items)
    assert result.total_elements == 2


def test_list_my_accepted_posts_uses_recent_acceptance_order(db: Session) -> None:
    """수락된 모집 글은 최근 수락순으로 참여 정보를 포함해 반환한다."""
    first_post = community_service.create_post(
        db,
        1,
        _create_request(title="먼저 수락된 글"),
    )
    second_post = community_service.create_post(
        db,
        1,
        _create_request(title="나중에 수락된 글"),
    )
    first = community_service.apply_to_post(db, first_post.post_id, 2)
    second = community_service.apply_to_post(db, second_post.post_id, 2)
    community_service.decide_participant(
        db,
        first_post.post_id,
        first.participant_id,
        1,
        ParticipantDecisionRequest(status=ParticipantStatus.ACCEPTED),
    )
    community_service.decide_participant(
        db,
        second_post.post_id,
        second.participant_id,
        1,
        ParticipantDecisionRequest(status=ParticipantStatus.ACCEPTED),
    )

    first_row = db.get(PostParticipant, first.participant_id)
    second_row = db.get(PostParticipant, second.participant_id)
    assert first_row is not None
    assert second_row is not None
    first_row.responded_at = dt.datetime(2026, 8, 1, 10, 0)
    second_row.responded_at = dt.datetime(2026, 8, 2, 10, 0)
    db.commit()

    result = community_service.list_my_participating_posts(
        db,
        2,
        status=ParticipatingPostStatus.ACCEPTED,
        page=1,
        size=1,
    )

    assert [item.post_id for item in result.items] == [second_post.post_id]
    assert result.items[0].participation.participant_id == second.participant_id
    assert result.items[0].participation.responded_at == dt.datetime(
        2026,
        8,
        2,
        10,
        0,
    )
    assert result.total_elements == 2
    assert result.total_pages == 2


def test_update_post_rejects_other_user(db: Session) -> None:
    created = community_service.create_post(db, 1, _create_request())

    with pytest.raises(HTTPException) as exc_info:
        community_service.update_post(
            db, created.post_id, 2, PostUpdateRequest(title="변경")
        )
    assert exc_info.value.status_code == 403


def test_update_post_rejects_capacity_below_accepted(db: Session) -> None:
    created = community_service.create_post(db, 1, _create_request(recruit_capacity=2))
    first = community_service.apply_to_post(db, created.post_id, 2)
    second = community_service.apply_to_post(db, created.post_id, 3)
    community_service.decide_participant(
        db,
        created.post_id,
        first.participant_id,
        1,
        ParticipantDecisionRequest(status=ParticipantStatus.ACCEPTED),
    )
    community_service.decide_participant(
        db,
        created.post_id,
        second.participant_id,
        1,
        ParticipantDecisionRequest(status=ParticipantStatus.ACCEPTED),
    )

    with pytest.raises(HTTPException) as exc_info:
        community_service.update_post(
            db, created.post_id, 1, PostUpdateRequest(recruit_capacity=1)
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.headers["X-Error-Code"] == "RECRUIT_CAPACITY_TOO_LOW"


def test_apply_to_own_post_is_rejected(db: Session) -> None:
    created = community_service.create_post(db, 1, _create_request())

    with pytest.raises(HTTPException) as exc_info:
        community_service.apply_to_post(db, created.post_id, 1)
    assert exc_info.value.status_code == 400
    assert exc_info.value.headers["X-Error-Code"] == "CANNOT_APPLY_OWN_POST"


def test_apply_accept_fills_capacity_and_closes_recruit(db: Session) -> None:
    created = community_service.create_post(db, 1, _create_request(recruit_capacity=1))

    participant = community_service.apply_to_post(db, created.post_id, 2)
    assert participant.status.value == "APPLIED"

    decided = community_service.decide_participant(
        db,
        created.post_id,
        participant.participant_id,
        1,
        ParticipantDecisionRequest(status=ParticipantStatus.ACCEPTED),
    )
    assert decided.status.value == "ACCEPTED"

    post_after = community_service.get_post(db, created.post_id)
    assert post_after.recruitment.status.value == "CLOSED"
    assert post_after.recruitment.accepted_count == 1


def test_apply_after_closed_is_rejected(db: Session) -> None:
    created = community_service.create_post(db, 1, _create_request(recruit_capacity=1))
    participant = community_service.apply_to_post(db, created.post_id, 2)
    community_service.decide_participant(
        db,
        created.post_id,
        participant.participant_id,
        1,
        ParticipantDecisionRequest(status=ParticipantStatus.ACCEPTED),
    )

    with pytest.raises(HTTPException) as exc_info:
        community_service.apply_to_post(db, created.post_id, 3)
    assert exc_info.value.status_code == 409
    assert exc_info.value.headers["X-Error-Code"] in ("RECRUIT_CLOSED", "RECRUIT_FULL")


def test_cancel_and_reapply(db: Session) -> None:
    created = community_service.create_post(db, 1, _create_request())
    first = community_service.apply_to_post(db, created.post_id, 2)

    canceled = community_service.cancel_my_application(
        db, created.post_id, 2, ParticipantCancelRequest()
    )
    assert canceled.status.value == "CANCELED"

    reapplied = community_service.apply_to_post(db, created.post_id, 2)
    assert reapplied.status.value == "APPLIED"
    assert reapplied.participant_id == first.participant_id


def test_decide_participant_requires_pending_status(db: Session) -> None:
    created = community_service.create_post(db, 1, _create_request())
    participant = community_service.apply_to_post(db, created.post_id, 2)
    community_service.decide_participant(
        db,
        created.post_id,
        participant.participant_id,
        1,
        ParticipantDecisionRequest(status=ParticipantStatus.REJECTED),
    )

    with pytest.raises(HTTPException) as exc_info:
        community_service.decide_participant(
            db,
            created.post_id,
            participant.participant_id,
            1,
            ParticipantDecisionRequest(status=ParticipantStatus.ACCEPTED),
        )
    assert exc_info.value.status_code == 409
    assert exc_info.value.headers["X-Error-Code"] == "PARTICIPANT_NOT_PENDING"


def test_list_participants_requires_organizer(db: Session) -> None:
    created = community_service.create_post(db, 1, _create_request())
    community_service.apply_to_post(db, created.post_id, 2)

    with pytest.raises(HTTPException) as exc_info:
        community_service.list_participants(db, created.post_id, 2, None)
    assert exc_info.value.status_code == 403

    result = community_service.list_participants(db, created.post_id, 1, None)
    assert len(result.items) == 1


def test_delete_post_removes_it(db: Session) -> None:
    created = community_service.create_post(db, 1, _create_request())

    community_service.delete_post(db, created.post_id, 1)

    with pytest.raises(HTTPException) as exc_info:
        community_service.get_post(db, created.post_id)
    assert exc_info.value.status_code == 404
