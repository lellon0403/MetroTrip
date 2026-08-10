import hashlib
import hmac
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import ApiError
from app.identity.models import PasswordResetChallenge, RefreshSession, User, UserStatus
from app.identity.repository import IdentityRepository
from app.operations.models import PushDevice
from app.recruitments.models import RecruitmentApplication


@dataclass(frozen=True)
class IssuedTokens:
    access_token: str
    refresh_token: str
    expires_in: int


class IdentityService:
    def __init__(self, db: Session, settings: Settings | None = None) -> None:
        self.db = db
        self.settings = settings or get_settings()
        self.repository = IdentityRepository(db)
        self.password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)

    @staticmethod
    def _normalize_email(email: str) -> str:
        return email.strip().lower()

    @staticmethod
    def _validate_password(password: str) -> None:
        if not (
            len(password) >= 10 and re.search(r"[A-Za-z]", password) and re.search(r"\d", password)
        ):
            raise ApiError(
                422,
                "WEAK_PASSWORD",
                "비밀번호는 10자 이상이며 영문과 숫자를 포함해야 합니다.",
            )

    @staticmethod
    def _token_hash(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()

    def _code_hash(self, email: str, code: str) -> str:
        payload = f"{self._normalize_email(email)}:{code}".encode()
        return hmac.new(self.settings.jwt_secret.encode(), payload, hashlib.sha256).hexdigest()

    def _ip_hash(self, ip_address: str | None) -> str | None:
        if not ip_address:
            return None
        return hmac.new(
            self.settings.jwt_secret.encode(), ip_address.encode(), hashlib.sha256
        ).hexdigest()

    def _access_token(self, user: User) -> str:
        now = datetime.now(UTC)
        expires = now + timedelta(minutes=self.settings.access_token_minutes)
        return jwt.encode(
            {
                "sub": str(user.id),
                "role": user.role.value,
                "type": "access",
                "iss": self.settings.jwt_issuer,
                "aud": self.settings.jwt_audience,
                "iat": now,
                "exp": expires,
                "jti": str(uuid4()),
            },
            self.settings.jwt_secret,
            algorithm="HS256",
        )

    def _issue_session(
        self,
        user: User,
        *,
        family_id: UUID | None = None,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> tuple[RefreshSession, IssuedTokens]:
        raw_refresh = secrets.token_urlsafe(48)
        expires_at = datetime.now(UTC) + timedelta(days=self.settings.refresh_token_days)
        session = RefreshSession(
            user_id=user.id,
            family_id=family_id or uuid4(),
            token_hash=self._token_hash(raw_refresh),
            expires_at=expires_at,
            user_agent=user_agent[:500] if user_agent else None,
            ip_hash=self._ip_hash(ip_address),
        )
        self.repository.add_refresh_session(session)
        expires_in = self.settings.access_token_minutes * 60
        return session, IssuedTokens(self._access_token(user), raw_refresh, expires_in)

    def register(
        self,
        email: str,
        password: str,
        display_name: str,
        user_agent: str | None,
        ip_address: str | None,
    ) -> tuple[User, IssuedTokens]:
        normalized_email = self._normalize_email(email)
        self._validate_password(password)
        if self.repository.get_user_by_email(normalized_email):
            raise ApiError(409, "EMAIL_ALREADY_EXISTS", "이미 사용 중인 이메일입니다.")
        user = User(
            email=normalized_email,
            password_hash=self.password_hasher.hash(password),
            display_name=display_name,
        )
        self.repository.add_user(user)
        self.db.flush()
        _, tokens = self._issue_session(user, user_agent=user_agent, ip_address=ip_address)
        self.db.commit()
        self.db.refresh(user)
        return user, tokens

    def login(
        self,
        email: str,
        password: str,
        user_agent: str | None,
        ip_address: str | None,
    ) -> tuple[User, IssuedTokens]:
        user = self.repository.get_user_by_email(self._normalize_email(email))
        if not user or user.status is not UserStatus.ACTIVE:
            raise ApiError(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.")
        self.verify_password(user, password)
        if self.password_hasher.check_needs_rehash(user.password_hash):
            user.password_hash = self.password_hasher.hash(password)
        _, tokens = self._issue_session(user, user_agent=user_agent, ip_address=ip_address)
        self.db.commit()
        return user, tokens

    def verify_password(self, user: User, password: str) -> None:
        try:
            self.password_hasher.verify(user.password_hash, password)
        except VerifyMismatchError as exc:
            raise ApiError(
                401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다."
            ) from exc

    def refresh(
        self, raw_token: str, user_agent: str | None, ip_address: str | None
    ) -> tuple[User, IssuedTokens]:
        session = self.repository.get_refresh_session_for_update(self._token_hash(raw_token))
        if not session:
            raise ApiError(401, "INVALID_REFRESH_TOKEN", "세션을 갱신할 수 없습니다.")
        now = datetime.now(UTC)
        if session.revoked_at is not None:
            self.repository.revoke_family(session.family_id, reuse_detected=True)
            self.db.commit()
            raise ApiError(
                401,
                "REFRESH_TOKEN_REUSED",
                "세션 재사용이 감지되어 해당 기기의 세션을 종료했습니다.",
            )
        if session.expires_at <= now:
            session.revoked_at = now
            self.db.commit()
            raise ApiError(401, "REFRESH_TOKEN_EXPIRED", "세션이 만료되었습니다.")
        user = self.repository.get_user(session.user_id)
        if not user or user.status is not UserStatus.ACTIVE:
            self.repository.revoke_family(session.family_id)
            self.db.commit()
            raise ApiError(401, "ACCOUNT_UNAVAILABLE", "사용할 수 없는 계정입니다.")
        replacement, tokens = self._issue_session(
            user,
            family_id=session.family_id,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.db.flush()
        session.revoked_at = now
        session.replaced_by_id = replacement.id
        self.db.commit()
        return user, tokens

    def logout(self, raw_token: str | None) -> None:
        if raw_token:
            session = self.repository.get_refresh_session_for_update(self._token_hash(raw_token))
            if session and session.revoked_at is None:
                session.revoked_at = datetime.now(UTC)
                self.db.commit()

    def request_password_reset(self, email: str) -> str | None:
        normalized_email = self._normalize_email(email)
        user = self.repository.get_user_by_email(normalized_email)
        if not user or user.status is not UserStatus.ACTIVE:
            return None
        code = f"{secrets.randbelow(1_000_000):06d}"
        challenge = PasswordResetChallenge(
            email=normalized_email,
            code_hash=self._code_hash(normalized_email, code),
            expires_at=datetime.now(UTC) + timedelta(minutes=10),
        )
        self.repository.add_reset_challenge(challenge)
        self.db.commit()
        return code

    def confirm_password_reset(self, email: str, code: str, new_password: str) -> None:
        normalized_email = self._normalize_email(email)
        self._validate_password(new_password)
        challenge = self.repository.get_reset_challenge_for_update(
            normalized_email, self._code_hash(normalized_email, code)
        )
        if not challenge or challenge.expires_at <= datetime.now(UTC):
            raise ApiError(400, "INVALID_RESET_CODE", "인증 코드가 올바르지 않거나 만료되었습니다.")
        user = self.repository.get_user_by_email(normalized_email)
        if not user or user.status is not UserStatus.ACTIVE:
            raise ApiError(400, "INVALID_RESET_CODE", "인증 코드가 올바르지 않거나 만료되었습니다.")
        challenge.used_at = datetime.now(UTC)
        user.password_hash = self.password_hasher.hash(new_password)
        self.repository.revoke_user_sessions(user.id)
        self.db.commit()

    def update_profile(self, user: User, display_name: str) -> User:
        user.display_name = display_name
        self.db.commit()
        self.db.refresh(user)
        return user

    def delete_account(self, user: User, password: str) -> None:
        self.verify_password(user, password)
        original_email = user.email
        self.db.execute(
            delete(PasswordResetChallenge).where(
                PasswordResetChallenge.email == self._normalize_email(original_email)
            )
        )
        self.db.execute(delete(PushDevice).where(PushDevice.user_id == user.id))
        self.db.execute(
            update(RecruitmentApplication)
            .where(RecruitmentApplication.applicant_id == user.id)
            .values(message=None)
        )
        user.email = f"deleted+{user.id}@invalid.local"
        user.display_name = "탈퇴한 사용자"
        user.password_hash = self.password_hasher.hash(secrets.token_urlsafe(32))
        user.status = UserStatus.DELETED
        user.deleted_at = datetime.now(UTC)
        self.repository.revoke_user_sessions(user.id)
        self.db.commit()
