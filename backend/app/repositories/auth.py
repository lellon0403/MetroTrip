"""인증 데이터 조회와 저장."""

from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.auth import AuthToken, EmailVerification, User, UserAgreement


class AuthRepository:
    """인증 관련 SQLAlchemy 작업을 담당한다."""

    def __init__(self, session: Session) -> None:
        """DB 세션을 저장한다."""
        self.session = session

    def find_user_by_email(self, email: str) -> User | None:
        """이메일로 사용자를 조회한다."""
        return self.session.scalar(select(User).where(User.email == email))

    def nickname_exists(self, nickname: str) -> bool:
        """닉네임이 이미 사용 중인지 확인한다."""
        return self.session.scalar(
            select(User.user_id).where(User.nickname == nickname)
        ) is not None

    def create_user(
        self,
        *,
        email: str,
        password: str,
        name: str,
        nickname: str,
    ) -> User:
        """새 사용자를 추가하고 식별자를 할당한다."""
        user = User(
            email=email,
            password=password,
            name=name,
            nickname=nickname,
        )
        self.session.add(user)
        self.session.flush()
        return user

    def add_required_agreements(self, user_id: int) -> None:
        """이용약관과 개인정보 처리방침 동의 내역을 추가한다."""
        self.session.add_all(
            [
                UserAgreement(
                    user_id=user_id,
                    agreement_type=agreement_type,
                    is_agreed=True,
                )
                for agreement_type in ("TERMS", "PRIVACY")
            ]
        )

    def create_verification(
        self,
        *,
        user_id: int | None,
        email: str,
        purpose: str,
        code_hash: str,
        expires_at: datetime,
    ) -> EmailVerification:
        """새 이메일 인증 내역을 추가한다."""
        verification = EmailVerification(
            user_id=user_id,
            email=email,
            purpose=purpose,
            code_hash=code_hash,
            expires_at=expires_at,
        )
        self.session.add(verification)
        self.session.flush()
        return verification

    def find_latest_pending_verification(
        self,
        email: str,
        purpose: str,
    ) -> EmailVerification | None:
        """가장 최근의 미완료 이메일 인증 내역을 조회한다."""
        statement = (
            select(EmailVerification)
            .where(
                EmailVerification.email == email,
                EmailVerification.purpose == purpose,
                EmailVerification.verified_at.is_(None),
            )
            .order_by(EmailVerification.verification_id.desc())
            .limit(1)
        )
        return self.session.scalar(statement)

    def increment_verification_attempt(
        self,
        verification: EmailVerification,
    ) -> None:
        """이메일 인증 실패 횟수를 1 증가시킨다."""
        verification.attempt_count += 1

    def mark_verification_complete(
        self,
        verification: EmailVerification,
        verified_at: datetime,
    ) -> None:
        """이메일 인증 내역을 완료 상태로 변경한다."""
        verification.verified_at = verified_at

    def attach_signup_verifications(self, user_id: int, email: str) -> None:
        """가입 전에 완료한 이메일 인증 내역에 사용자 ID를 연결한다."""
        self.session.execute(
            update(EmailVerification)
            .where(
                EmailVerification.email == email,
                EmailVerification.purpose == "SIGNUP",
                EmailVerification.verified_at.is_not(None),
                EmailVerification.user_id.is_(None),
            )
            .values(user_id=user_id)
        )

    def create_refresh_token(
        self,
        *,
        user_id: int,
        token_hash: str,
        issued_at: datetime,
        expires_at: datetime,
    ) -> None:
        """해시된 리프레시 토큰을 추가한다."""
        self.session.add(
            AuthToken(
                user_id=user_id,
                refresh_token=token_hash,
                issued_at=issued_at,
                expires_at=expires_at,
            )
        )

    def find_active_refresh_token(
        self,
        token_hash: str,
        now: datetime,
    ) -> AuthToken | None:
        """현재 사용할 수 있는 리프레시 토큰을 조회한다."""
        statement = select(AuthToken).where(
            AuthToken.refresh_token == token_hash,
            AuthToken.revoked_at.is_(None),
            AuthToken.expires_at > now,
        )
        return self.session.scalar(statement)

    def revoke_refresh_token(self, token: AuthToken, revoked_at: datetime) -> None:
        """리프레시 토큰 하나를 폐기한다."""
        token.revoked_at = revoked_at

    def revoke_all_refresh_tokens(
        self,
        user_id: int,
        revoked_at: datetime,
    ) -> None:
        """사용자의 모든 활성 리프레시 토큰을 폐기한다."""
        self.session.execute(
            update(AuthToken)
            .where(
                AuthToken.user_id == user_id,
                AuthToken.revoked_at.is_(None),
            )
            .values(revoked_at=revoked_at)
        )

    def update_password(self, user: User, password: str) -> None:
        """사용자의 비밀번호 해시를 변경한다."""
        user.password = password
