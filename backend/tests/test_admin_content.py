"""관리자 후기·모집 게시글 삭제 API 통합 테스트."""

import asyncio
from collections.abc import Iterator
from datetime import date, datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.database import Base
from app.db_failover import get_db
from app.integrations.security import sign_token
from app.main import app
from app.models.auth import User
from app.models.community import BoardPost, PostParticipant
from app.models.reviews import Review, ReviewMedia, ReviewTag
from app.models.transit import Station


@pytest.fixture
def db() -> Iterator[Session]:
    """관리자와 일반 회원이 작성한 콘텐츠가 있는 SQLite 세션을 제공한다."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(connection, _record) -> None:
        """SQLite에서도 자식 행 CASCADE 삭제가 동작하도록 외래 키를 활성화한다."""
        connection.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(engine)
    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )
    session = session_factory()
    session.add_all(
        [
            User(
                user_id=1,
                email="admin-content@example.com",
                password="hashed",
                name="관리자",
                nickname="콘텐츠관리자",
                role="ADMIN",
            ),
            User(
                user_id=2,
                email="author-content@example.com",
                password="hashed",
                name="작성자",
                nickname="콘텐츠작성자",
                role="USER",
            ),
            User(
                user_id=3,
                email="member-content@example.com",
                password="hashed",
                name="일반회원",
                nickname="콘텐츠회원",
                role="USER",
            ),
            Station(
                station_id=1,
                station_name="출발역",
                latitude=36.8000000,
                longitude=127.1000000,
                address=None,
            ),
            Station(
                station_id=2,
                station_name="도착역",
                latitude=36.8100000,
                longitude=127.1100000,
                address=None,
            ),
        ]
    )
    session.flush()

    review = Review(
        review_id=1,
        user_id=2,
        title="관리 대상 후기",
        content="후기 내용",
        start_station_id=1,
        end_station_id=2,
        rating=8,
        travel_cost=10000,
    )
    post = BoardPost(
        post_id=1,
        user_id=2,
        title="관리 대상 모집 글",
        content="모집 내용",
        recruit_capacity=4,
        recruit_deadline=date(2030, 1, 1),
        recruit_status="RECRUITING",
    )
    session.add_all([review, post])
    session.flush()
    session.add_all(
        [
            ReviewMedia(
                review_id=review.review_id,
                media_url="review.jpg",
                media_type="IMAGE",
            ),
            ReviewTag(review_id=review.review_id, tag_name="관리대상"),
            PostParticipant(
                post_id=post.post_id,
                user_id=3,
                status="APPLIED",
            ),
        ]
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _access_token(user_id: int) -> str:
    """관리자 또는 일반 회원의 단기 Access Token을 발급한다."""
    now = datetime.now(timezone.utc)
    return sign_token(
        {
            "sub": str(user_id),
            "type": "access",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=5)).timestamp()),
        },
        get_settings().jwt_secret,
    )


def test_admin_deletes_foreign_review_and_post_with_children(db: Session) -> None:
    """관리자가 타인의 후기·모집 글과 연결된 DB 자식 행을 삭제한다."""

    def override_get_db() -> Iterator[Session]:
        """관리자 API 요청에 현재 SQLite 세션을 주입한다."""
        yield db

    async def request_flow() -> tuple[
        httpx.Response,
        httpx.Response,
        httpx.Response,
        httpx.Response,
        httpx.Response,
    ]:
        """미인증·일반 회원·관리자 삭제 요청을 순서대로 전송한다."""
        transport = httpx.ASGITransport(app=app)
        member_headers = {"Authorization": f"Bearer {_access_token(3)}"}
        admin_headers = {"Authorization": f"Bearer {_access_token(1)}"}
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            unauthenticated = await client.delete("/api/v1/admin/reviews/1")
            member_review = await client.delete(
                "/api/v1/admin/reviews/1",
                headers=member_headers,
            )
            admin_review = await client.delete(
                "/api/v1/admin/reviews/1",
                headers=admin_headers,
            )
            member_post = await client.delete(
                "/api/v1/admin/posts/1",
                headers=member_headers,
            )
            admin_post = await client.delete(
                "/api/v1/admin/posts/1",
                headers=admin_headers,
            )
            return (
                unauthenticated,
                member_review,
                admin_review,
                member_post,
                admin_post,
            )

    app.dependency_overrides[get_db] = override_get_db
    try:
        responses = asyncio.run(request_flow())
    finally:
        app.dependency_overrides.clear()

    unauthenticated, member_review, admin_review, member_post, admin_post = responses
    assert unauthenticated.status_code == 401
    assert member_review.status_code == 403
    assert member_review.json()["code"] == "ADMIN_ONLY"
    assert admin_review.status_code == 204
    assert member_post.status_code == 403
    assert member_post.json()["code"] == "ADMIN_ONLY"
    assert admin_post.status_code == 204

    assert db.get(Review, 1) is None
    assert db.get(BoardPost, 1) is None
    assert db.scalar(select(func.count()).select_from(ReviewMedia)) == 0
    assert db.scalar(select(func.count()).select_from(ReviewTag)) == 0
    assert db.scalar(select(func.count()).select_from(PostParticipant)) == 0


def test_admin_content_delete_returns_not_found(db: Session) -> None:
    """관리자가 존재하지 않는 후기와 모집 글을 삭제하면 404를 반환한다."""

    def override_get_db() -> Iterator[Session]:
        """관리자 API 요청에 현재 SQLite 세션을 주입한다."""
        yield db

    async def request_unknown_content() -> tuple[httpx.Response, httpx.Response]:
        """존재하지 않는 후기와 모집 글의 관리자 삭제를 요청한다."""
        transport = httpx.ASGITransport(app=app)
        headers = {"Authorization": f"Bearer {_access_token(1)}"}
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            review = await client.delete(
                "/api/v1/admin/reviews/999",
                headers=headers,
            )
            post = await client.delete(
                "/api/v1/admin/posts/999",
                headers=headers,
            )
            return review, post

    app.dependency_overrides[get_db] = override_get_db
    try:
        review, post = asyncio.run(request_unknown_content())
    finally:
        app.dependency_overrides.clear()

    assert review.status_code == 404
    assert review.json()["code"] == "REVIEW_NOT_FOUND"
    assert post.status_code == 404
    assert post.json()["code"] == "POST_NOT_FOUND"
