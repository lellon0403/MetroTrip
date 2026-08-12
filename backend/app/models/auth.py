"""인증 모델."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    """회원 정보를 users 테이블에 매핑한다."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('USER', 'ADMIN')", name="ck_users_role"),
    )

    user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password: Mapped[str | None] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    nickname: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    role: Mapped[str] = mapped_column(String(20), default="USER", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
        nullable=False,
    )


class UserAgreement(Base):
    """약관 동의 이력을 user_agreements 테이블에 매핑한다."""

    __tablename__ = "user_agreements"
    __table_args__ = (
        CheckConstraint(
            "agreement_type IN ('TERMS', 'PRIVACY', 'LOCATION', 'MARKETING')",
            name="ck_user_agreements_agreement_type",
        ),
        CheckConstraint(
            "is_agreed IN (0, 1)",
            name="ck_user_agreements_is_agreed",
        ),
    )

    agreement_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    agreement_type: Mapped[str] = mapped_column(String(30), nullable=False)
    is_agreed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    agreed_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        nullable=False,
    )


class SocialAccount(Base):
    """소셜 계정 연결 정보를 social_accounts 테이블에 매핑한다."""

    __tablename__ = "social_accounts"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_user_id",
            name="uk_social_provider",
        ),
        CheckConstraint(
            "provider IN ('KAKAO', 'NAVER')",
            name="ck_social_accounts_provider",
        ),
    )

    social_account_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_user_id: Mapped[str] = mapped_column(String(100), nullable=False)
    connected_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        nullable=False,
    )


class AuthToken(Base):
    """리프레시 토큰 정보를 auth_tokens 테이블에 매핑한다."""

    __tablename__ = "auth_tokens"

    token_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    refresh_token: Mapped[str] = mapped_column(
        String(512),
        unique=True,
        nullable=False,
    )
    issued_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)
    user_agent: Mapped[str | None] = mapped_column(String(255))


class EmailVerification(Base):
    """이메일 인증 내역을 email_verifications 테이블에 매핑한다."""

    __tablename__ = "email_verifications"
    __table_args__ = (
        CheckConstraint(
            "purpose IN ('WITHDRAWAL', 'SIGNUP', 'PASSWORD_RESET')",
            name="ck_email_verifications_purpose",
        ),
    )

    verification_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        nullable=False,
    )
