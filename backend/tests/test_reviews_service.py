"""여행 후기 서비스 계층 테스트.

실제 MySQL 없이도 검증할 수 있도록 SQLite 인메모리 DB를 사용한다.
stations는 reviews 도메인이 소유하지 않으므로 최소 컬럼의 Core 테이블로 접근한다.
"""

from collections.abc import Iterator

import pytest
from fastapi import HTTPException
from sqlalchemy import (
    Column,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    create_engine,
    event,
)
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.models.auth import User
from app.schemas.reviews import (
    ReviewCreateRequest,
    ReviewSearchField,
    ReviewUpdateRequest,
)
from app.services import reviews as review_service

_support_metadata = MetaData()

_stations_table = Table(
    "stations",
    _support_metadata,
    Column("station_id", Integer, primary_key=True),
    Column("station_name", String(100)),
    Column("latitude", Numeric(10, 7), nullable=False),
    Column("longitude", Numeric(10, 7), nullable=False),
)

@pytest.fixture
def db() -> Iterator[Session]:
    """SQLite 인메모리 세션에 최소 픽스처 데이터를 채워 반환한다."""
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(engine)
    _support_metadata.create_all(engine)

    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = session_factory()
    try:
        session.add(
            User(
                user_id=1,
                email="author@example.com",
                password="hashed",
                name="홍길동",
                nickname="메트로유저",
            )
        )
        session.add(
            User(
                user_id=2,
                email="other@example.com",
                password="hashed",
                name="다른 사용자",
                nickname="다른유저",
            )
        )
        session.execute(
            _stations_table.insert(),
            [
                {
                    "station_id": 1,
                    "station_name": "탕정역",
                    "latitude": 36.7882500,
                    "longitude": 127.0844170,
                },
                {
                    "station_id": 2,
                    "station_name": "온양온천역",
                    "latitude": 36.7804830,
                    "longitude": 127.0032490,
                },
            ],
        )
        session.commit()
        yield session
    finally:
        session.close()


def _create_request(**overrides: object) -> ReviewCreateRequest:
    payload = {
        "title": "탕정역 반나절 코스",
        "content": "가볍게 다녀오기 좋아요.",
        "start_station_id": 1,
        "end_station_id": 2,
        "rating": 8,
        "travel_cost": 15000,
        "plan_id": None,
        "tags": ["가족", "당일치기"],
        "media": [],
    }
    payload.update(overrides)
    return ReviewCreateRequest(**payload)


def test_create_review_assembles_names_and_tags(db: Session) -> None:
    response = review_service.create_review(db, 1, _create_request())

    assert response.start_station_name == "탕정역"
    assert response.end_station_name == "온양온천역"
    assert response.author_nickname == "메트로유저"
    assert response.tags == ["가족", "당일치기"]
    assert response.view_count == 0


def test_create_review_rejects_unknown_station(db: Session) -> None:
    with pytest.raises(HTTPException) as exc_info:
        review_service.create_review(db, 1, _create_request(start_station_id=999))

    assert exc_info.value.status_code == 400
    assert exc_info.value.headers["X-Error-Code"] == "STATION_NOT_FOUND"


def test_create_review_rejects_unknown_plan(db: Session) -> None:
    with pytest.raises(HTTPException) as exc_info:
        review_service.create_review(db, 1, _create_request(plan_id=999))

    assert exc_info.value.status_code == 400
    assert exc_info.value.headers["X-Error-Code"] == "PLAN_NOT_FOUND"


def test_get_review_increments_view_count(db: Session) -> None:
    created = review_service.create_review(db, 1, _create_request())

    first = review_service.get_review(db, created.review_id)
    second = review_service.get_review(db, created.review_id)

    assert first.view_count == 1
    assert second.view_count == 2


def test_get_review_missing_raises_404(db: Session) -> None:
    with pytest.raises(HTTPException) as exc_info:
        review_service.get_review(db, 999)

    assert exc_info.value.status_code == 404


def test_list_my_reviews_returns_only_current_users_reviews_in_recent_order(
    db: Session,
) -> None:
    """내 후기 목록은 다른 사용자를 제외하고 최근 작성순으로 반환한다."""
    first = review_service.create_review(
        db,
        1,
        _create_request(title="첫 번째 후기"),
    )
    review_service.create_review(
        db,
        2,
        _create_request(title="다른 사용자의 후기"),
    )
    second = review_service.create_review(
        db,
        1,
        _create_request(title="두 번째 후기"),
    )

    response = review_service.list_my_reviews(db, 1, page=1, size=10)

    assert [item.review_id for item in response.items] == [
        second.review_id,
        first.review_id,
    ]
    assert response.total_elements == 2
    assert response.total_pages == 1
    assert all(item.user_id == 1 for item in response.items)


def test_list_my_reviews_paginates_without_incrementing_view_count(
    db: Session,
) -> None:
    """내 후기 목록은 페이지 단위로 조회하며 조회수를 변경하지 않는다."""
    first = review_service.create_review(
        db,
        1,
        _create_request(title="첫 번째 후기"),
    )
    second = review_service.create_review(
        db,
        1,
        _create_request(title="두 번째 후기"),
    )

    response = review_service.list_my_reviews(db, 1, page=2, size=1)

    assert [item.review_id for item in response.items] == [first.review_id]
    assert response.page == 2
    assert response.size == 1
    assert response.total_elements == 2
    assert response.total_pages == 2
    assert response.items[0].view_count == 0
    assert second.review_id != first.review_id


def test_list_my_reviews_returns_empty_page(db: Session) -> None:
    """작성한 후기가 없으면 빈 페이지 응답을 반환한다."""
    response = review_service.list_my_reviews(db, 2, page=1, size=10)

    assert response.items == []
    assert response.total_elements == 0
    assert response.total_pages == 0


def test_update_review_rejects_other_user(db: Session) -> None:
    created = review_service.create_review(db, 1, _create_request())

    with pytest.raises(HTTPException) as exc_info:
        review_service.update_review(
            db, created.review_id, 2, ReviewUpdateRequest(title="변경된 제목")
        )

    assert exc_info.value.status_code == 403


def test_update_review_replaces_tags(db: Session) -> None:
    created = review_service.create_review(db, 1, _create_request())

    updated = review_service.update_review(
        db,
        created.review_id,
        1,
        ReviewUpdateRequest(tags=["연인"]),
    )

    assert updated.tags == ["연인"]
    assert updated.title == created.title


def test_list_reviews_title_search_excludes_content_only_matches(
    db: Session,
) -> None:
    review_service.create_review(
        db, 1, _create_request(title="벚꽃놀이 후기", content="평범한 내용입니다.")
    )
    review_service.create_review(
        db, 1, _create_request(title="평범한 제목", content="벚꽃놀이 다녀왔어요.")
    )

    result = review_service.list_reviews(
        db,
        keyword="벚꽃놀이",
        search_field=ReviewSearchField.TITLE,
        station_id=None,
        tag=None,
        page=1,
        size=20,
    )

    assert result.total_elements == 1
    assert result.items[0].title == "벚꽃놀이 후기"


def test_list_reviews_content_search_excludes_title_only_matches(
    db: Session,
) -> None:
    review_service.create_review(
        db, 1, _create_request(title="벚꽃놀이 후기", content="평범한 내용입니다.")
    )
    review_service.create_review(
        db, 1, _create_request(title="평범한 제목", content="벚꽃놀이 다녀왔어요.")
    )

    result = review_service.list_reviews(
        db,
        keyword="벚꽃놀이",
        search_field=ReviewSearchField.CONTENT,
        station_id=None,
        tag=None,
        page=1,
        size=20,
    )

    assert result.total_elements == 1
    assert result.items[0].content == "벚꽃놀이 다녀왔어요."


def test_list_reviews_title_content_search_matches_either(db: Session) -> None:
    review_service.create_review(
        db, 1, _create_request(title="벚꽃놀이 후기", content="평범한 내용입니다.")
    )
    review_service.create_review(
        db, 1, _create_request(title="평범한 제목", content="벚꽃놀이 다녀왔어요.")
    )

    result = review_service.list_reviews(
        db,
        keyword="벚꽃놀이",
        search_field=ReviewSearchField.TITLE_CONTENT,
        station_id=None,
        tag=None,
        page=1,
        size=20,
    )

    assert result.total_elements == 2


def test_delete_review_removes_it(db: Session) -> None:
    created = review_service.create_review(db, 1, _create_request())

    review_service.delete_review(db, created.review_id, 1)

    with pytest.raises(HTTPException) as exc_info:
        review_service.get_review(db, created.review_id)
    assert exc_info.value.status_code == 404
