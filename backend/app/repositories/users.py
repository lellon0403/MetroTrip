"""회원 정보 관리."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth import User


class UserRepository:
    """회원 정보 관련 SQLAlchemy 작업을 담당한다."""

    def __init__(self, session: Session) -> None:
        """DB 세션을 저장한다."""
        self.session = session

    def find_user_by_id(self, user_id: int) -> User | None:
        """아이디로 사용자를 조회한다."""
        return self.session.get(User, user_id)

    def find_user_by_nickname(self, nickname: str) -> User | None:
        """닉네임으로 사용자를 조회한다."""
        return self.session.scalar(select(User).where(User.nickname == nickname))

    def update_profile(
        self,
        user: User,
        *,
        name: str | None = None,
        nickname: str | None = None,
    ) -> None:
        """전달된 이름과 닉네임만 사용자 모델에 반영한다."""
        if name is not None:
            user.name = name
        if nickname is not None:
            user.nickname = nickname

    def update_password(self, user: User, password: str) -> None:
        """해시된 새 비밀번호를 사용자 모델에 반영한다."""
        user.password = password

    def delete_user(self, user: User) -> None:
        """사용자 모델을 삭제 대상으로 등록해 DB 연쇄 삭제를 시작한다."""
        self.session.delete(user)
