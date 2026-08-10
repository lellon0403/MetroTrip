from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError
from app.identity.models import User, UserRole, UserStatus
from app.identity.repository import IdentityRepository
from app.infrastructure.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if not token:
        raise ApiError(401, "AUTH_REQUIRED", "로그인이 필요합니다.")
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            options={"require": ["exp", "iat", "sub", "jti", "iss", "aud"]},
        )
        if payload.get("type") != "access":
            raise ValueError("access token required")
        user_id = UUID(str(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise ApiError(401, "INVALID_ACCESS_TOKEN", "로그인이 만료되었습니다.") from exc
    user = IdentityRepository(db).get_user(user_id)
    if not user or user.status is not UserStatus.ACTIVE:
        raise ApiError(401, "ACCOUNT_UNAVAILABLE", "사용할 수 없는 계정입니다.")
    return user


def get_optional_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User | None:
    """토큰이 없으면 익명으로, 토큰이 있으면 일반 인증과 동일하게 검증한다."""
    if not token:
        return None
    return get_current_user(token, db)


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role is not UserRole.ADMIN:
        raise ApiError(403, "ADMIN_REQUIRED", "관리자 권한이 필요합니다.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
AdminUser = Annotated[User, Depends(require_admin)]
