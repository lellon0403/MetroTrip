"""인증 비즈니스 로직."""

import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.integrations.email import EmailDeliveryError, EmailSender
from app.integrations.security import (
    decode_token,
    hash_code,
    hash_password,
    hash_value,
    sign_token,
    verify_password,
)
from app.models.auth import EmailVerification
from app.repositories.auth import AuthRepository
from app.repositories.users import UserRepository
from app.schemas.auth import (
    EmailVerificationConfirmRequest,
    PasswordResetConfirmRequest,
    ReauthenticationPurpose,
    RegisterRequest,
)


def _error(code: str, message: str, status_code: int) -> HTTPException:
    """인증 오류를 공통 API 오류 형식으로 만든다."""
    return HTTPException(
        status_code,
        detail=message,
        headers={"X-Error-Code": code},
    )


def _now() -> datetime:
    """현재 UTC 시각을 반환한다."""
    return datetime.now(timezone.utc)


def _read_token(token: str, secret: str) -> dict[str, object]:
    """토큰의 서명과 만료 시간을 검증한다."""
    try:
        return decode_token(token, secret)
    except ValueError:
        raise _error(
            "INVALID_TOKEN",
            "유효하지 않거나 만료된 인증 토큰입니다.",
            401,
        ) from None


def request_verification(
    db: Session,
    email: str,
    purpose: str,
    settings: Settings,
) -> None:
    """이메일 인증 코드를 생성하고 발송한다."""
    repository = AuthRepository(db)
    email = email.strip().lower()
    user = repository.find_user_by_email(email)

    # 존재하지 않는 계정도 같은 응답을 주어 가입 여부 노출을 막는다.
    if purpose == "PASSWORD_RESET" and not user:
        return

    code = f"{secrets.randbelow(1_000_000):06d}"
    repository.create_verification(
        user_id=user.user_id if user else None,
        email=email,
        purpose=purpose,
        code_hash=hash_code(code, settings.jwt_secret),
        expires_at=_now().replace(tzinfo=None)
        + timedelta(minutes=settings.verification_code_expire_minutes),
    )
    try:
        EmailSender(settings).send_verification_code(email, code)
        db.commit()
    except EmailDeliveryError as error:
        db.rollback()
        raise _error(
            "EMAIL_DELIVERY_FAILED",
            "인증 메일을 전송하지 못했습니다.",
            500,
        ) from error


def _find_verification(
    db: Session,
    email: str,
    purpose: str,
    code: str,
    settings: Settings,
) -> EmailVerification:
    """사용 가능한 이메일 인증 내역을 찾아 반환한다."""
    repository = AuthRepository(db)
    verification = repository.find_latest_pending_verification(
        email.strip().lower(), purpose
    )
    if (
        not verification
        or verification.attempt_count >= settings.verification_max_attempts
    ):
        raise _error(
            "INVALID_VERIFICATION_CODE",
            "이메일 인증 코드가 유효하지 않습니다.",
            400,
        )
    if verification.expires_at < _now().replace(tzinfo=None):
        raise _error(
            "VERIFICATION_EXPIRED",
            "이메일 인증 코드가 만료되었습니다.",
            400,
        )
    if not hmac.compare_digest(
        verification.code_hash, hash_code(code, settings.jwt_secret)
    ):
        repository.increment_verification_attempt(verification)
        db.commit()
        raise _error(
            "INVALID_VERIFICATION_CODE",
            "이메일 인증 코드가 올바르지 않습니다.",
            400,
        )
    return verification


def confirm_verification(
    db: Session,
    request: EmailVerificationConfirmRequest,
    settings: Settings,
) -> str:
    """인증 코드를 확인하고 이메일 인증 토큰을 발급한다."""
    request.email = request.email.strip().lower()
    request.code = request.code.strip()
    verification = _find_verification(
        db, request.email, request.purpose, request.code, settings
    )
    AuthRepository(db).mark_verification_complete(
        verification, _now().replace(tzinfo=None)
    )
    db.commit()

    now = _now()
    return sign_token(
        {
            "type": "email_verification",
            "email": request.email.strip().lower(),
            "purpose": request.purpose,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=10)).timestamp()),
        },
        settings.jwt_secret,
    )


def register(
    db: Session,
    request: RegisterRequest,
    settings: Settings,
) -> dict[str, object]:
    """인증과 필수 약관을 확인하고 회원을 생성한다."""
    if request.password != request.password_confirm:
        raise _error(
            "PASSWORD_MISMATCH",
            "비밀번호와 비밀번호 확인이 일치하지 않습니다.",
            400,
        )
    if not request.terms_agreed or not request.privacy_agreed:
        raise _error(
            "REQUIRED_AGREEMENT_MISSING",
            "필수 약관에 동의해야 합니다.",
            400,
        )

    email = request.email.strip().lower()
    verified = _read_token(request.email_verification_token, settings.jwt_secret)
    if (
        verified.get("type") not in (None, "email_verification")
        or verified.get("email") != email
        or verified.get("purpose") != "SIGNUP"
    ):
        raise _error(
            "INVALID_VERIFICATION_TOKEN",
            "회원가입용 이메일 인증 토큰이 아닙니다.",
            400,
        )

    repository = AuthRepository(db)
    if repository.find_user_by_email(email):
        raise _error("EMAIL_ALREADY_EXISTS", "이미 가입된 이메일입니다.", 409)
    if repository.nickname_exists(request.nickname):
        raise _error(
            "NICKNAME_ALREADY_EXISTS",
            "이미 사용 중인 닉네임입니다.",
            409,
        )

    try:
        user = repository.create_user(
            email=email,
            password=hash_password(request.password),
            name=request.name,
            nickname=request.nickname,
        )
        repository.add_required_agreements(user.user_id)
        repository.attach_signup_verifications(user.user_id, email)
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise _error(
            "DUPLICATE_USER",
            "이메일 또는 닉네임이 이미 사용 중입니다.",
            409,
        ) from error

    return {
        "user_id": user.user_id,
        "email": user.email,
        "nickname": user.nickname,
    }


def _issue_tokens(
    db: Session,
    user_id: int,
    settings: Settings,
) -> dict[str, object]:
    """액세스 토큰과 리프레시 토큰을 발급한다."""
    now = _now()
    access_expires = now + timedelta(minutes=settings.access_token_expire_minutes)
    refresh_expires = now + timedelta(days=settings.refresh_token_expire_days)
    access_token = sign_token(
        {
            "sub": str(user_id),
            "type": "access",
            "iat": int(now.timestamp()),
            "exp": int(access_expires.timestamp()),
        },
        settings.jwt_secret,
    )
    refresh_token = secrets.token_urlsafe(48)
    AuthRepository(db).create_refresh_token(
        user_id=user_id,
        token_hash=hash_value(refresh_token),
        issued_at=now.replace(tzinfo=None),
        expires_at=refresh_expires.replace(tzinfo=None),
    )
    db.commit()
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
    }


def login(
    db: Session,
    email: str,
    password: str,
    settings: Settings,
) -> dict[str, object]:
    """계정 정보를 확인하고 인증 토큰을 발급한다."""
    user = AuthRepository(db).find_user_by_email(email.strip().lower())
    if not user or not user.password or not verify_password(password, user.password):
        raise _error(
            "INVALID_CREDENTIALS",
            "이메일 또는 비밀번호가 올바르지 않습니다.",
            401,
        )
    return _issue_tokens(db, user.user_id, settings)


def refresh(
    db: Session,
    refresh_token: str,
    settings: Settings,
) -> dict[str, object]:
    """기존 리프레시 토큰을 폐기하고 새 토큰을 발급한다."""
    repository = AuthRepository(db)
    token = repository.find_active_refresh_token(
        hash_value(refresh_token), _now().replace(tzinfo=None)
    )
    if not token:
        raise _error(
            "INVALID_REFRESH_TOKEN",
            "유효하지 않은 리프레시 토큰입니다.",
            401,
        )
    repository.revoke_refresh_token(token, _now().replace(tzinfo=None))
    return _issue_tokens(db, token.user_id, settings)


def authenticate_access(token: str, settings: Settings) -> int:
    """액세스 토큰을 검증하고 사용자 식별자를 반환한다."""
    payload = _read_token(token, settings.jwt_secret)
    if payload.get("type") not in (None, "access"):
        raise _error("INVALID_TOKEN", "유효하지 않은 액세스 토큰입니다.", 401)
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise _error(
            "INVALID_TOKEN",
            "유효하지 않은 액세스 토큰입니다.",
            401,
        ) from None


def reauthenticate(
    db: Session,
    user_id: int,
    password: str,
    purpose: ReauthenticationPurpose,
    settings: Settings,
) -> dict[str, object]:
    """현재 비밀번호를 확인하고 지정된 목적의 5분짜리 재인증 토큰을 발급한다."""
    user = UserRepository(db).find_user_by_id(user_id)
    if not user or not user.password:
        raise _error("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.", 404)
    if not verify_password(password, user.password):
        raise _error(
            "INVALID_PASSWORD",
            "비밀번호가 올바르지 않습니다.",
            401,
        )

    now = _now()
    expires_in = 5 * 60
    token = sign_token(
        {
            "sub": str(user_id),
            "type": "reauthentication",
            "purpose": purpose,
            "iat": int(now.timestamp()),
            "exp": int(now.timestamp()) + expires_in,
        },
        settings.jwt_secret,
    )
    return {
        "verification_token": token,
        "expires_in": expires_in,
        "purpose": purpose,
    }


def authenticate_reauthentication(
    token: str,
    purpose: ReauthenticationPurpose,
    settings: Settings,
) -> int:
    """재인증 토큰의 서명, 사용자 ID와 요청 목적을 검증한다."""
    payload = _read_token(token, settings.jwt_secret)
    if (
        payload.get("type") != "reauthentication"
        or payload.get("purpose") != purpose
    ):
        raise _error(
            "INVALID_REAUTHENTICATION_TOKEN",
            "요청 목적에 맞지 않는 재인증 토큰입니다.",
            401,
        )
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise _error(
            "INVALID_REAUTHENTICATION_TOKEN",
            "유효하지 않은 재인증 토큰입니다.",
            401,
        ) from None


def logout(db: Session, user_id: int) -> None:
    """사용자의 모든 리프레시 토큰을 폐기한다."""
    AuthRepository(db).revoke_all_refresh_tokens(user_id, _now().replace(tzinfo=None))
    db.commit()


def reset_password(
    db: Session,
    request: PasswordResetConfirmRequest,
    settings: Settings,
) -> None:
    """인증 코드를 확인하고 비밀번호를 변경한다."""
    if request.new_password != request.new_password_confirm:
        raise _error(
            "PASSWORD_MISMATCH",
            "새 비밀번호와 비밀번호 확인이 일치하지 않습니다.",
            400,
        )

    verification = _find_verification(
        db, request.email, "PASSWORD_RESET", request.code, settings
    )
    repository = AuthRepository(db)
    user = repository.find_user_by_email(request.email.strip().lower())
    if not user:
        raise _error("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.", 404)

    now = _now().replace(tzinfo=None)
    repository.mark_verification_complete(verification, now)
    repository.update_password(user, hash_password(request.new_password))
    repository.revoke_all_refresh_tokens(user.user_id, now)
    db.commit()
