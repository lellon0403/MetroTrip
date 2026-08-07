"""회원 정보 비즈니스 로직."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.integrations.security import hash_password
from app.models.auth import User
from app.repositories.auth import AuthRepository
from app.repositories.users import UserRepository
from app.schemas.users import PasswordChangeRequest, UserProfileUpdateRequest


def _error(code: str, message: str, status_code: int) -> HTTPException:
    """회원 서비스 오류를 공통 API 오류 형식으로 만든다."""
    return HTTPException(
        status_code,
        detail=message,
        headers={"X-Error-Code": code},
    )


def _find_user(repository: UserRepository, user_id: int) -> User:
    """회원 ID에 해당하는 사용자를 찾고 없으면 404 오류를 발생시킨다."""
    user = repository.find_user_by_id(user_id)
    if not user:
        raise _error("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.", 404)
    return user


def get_profile(db: Session, user_id: int) -> User:
    """아이디로 회원 정보를 찾아 반환한다."""
    return _find_user(UserRepository(db), user_id)


def update_profile(
    db: Session,
    user_id: int,
    request: UserProfileUpdateRequest,
) -> User:
    """현재 사용자의 이름과 닉네임 중 요청에 포함된 값만 수정한다."""
    repository = UserRepository(db)
    user = _find_user(repository, user_id)
    changes = request.model_dump(exclude_unset=True)

    if "name" in changes:
        changes["name"] = changes["name"].strip()
        if not changes["name"]:
            raise _error("INVALID_NAME", "이름을 입력해주세요.", 400)

    if "nickname" in changes:
        nickname = changes["nickname"].strip()
        if not nickname:
            raise _error("INVALID_NICKNAME", "닉네임을 입력해주세요.", 400)
        existing = repository.find_user_by_nickname(nickname)
        if existing and existing.user_id != user_id:
            raise _error(
                "NICKNAME_ALREADY_EXISTS",
                "이미 사용 중인 닉네임입니다.",
                409,
            )
        changes["nickname"] = nickname

    repository.update_profile(user, **changes)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise _error(
            "NICKNAME_ALREADY_EXISTS",
            "이미 사용 중인 닉네임입니다.",
            409,
        ) from error
    return user


def change_password(
    db: Session,
    user_id: int,
    request: PasswordChangeRequest,
) -> None:
    """새 비밀번호를 저장하고 사용자의 모든 리프레시 토큰을 폐기한다."""
    if request.new_password != request.new_password_confirm:
        raise _error(
            "PASSWORD_MISMATCH",
            "새 비밀번호와 비밀번호 확인이 일치하지 않습니다.",
            400,
        )

    repository = UserRepository(db)
    user = _find_user(repository, user_id)
    repository.update_password(user, hash_password(request.new_password))
    AuthRepository(db).revoke_all_refresh_tokens(
        user_id,
        datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.commit()


def withdraw(db: Session, user_id: int) -> None:
    """현재 사용자를 삭제해 DB의 회원 소유 데이터를 연쇄 하드 딜리트한다."""
    repository = UserRepository(db)
    user = _find_user(repository, user_id)
    repository.delete_user(user)
    db.commit()


def list_favorites(db: Session, user_id: int) -> dict[str, object]:
    """현재 사용자가 즐겨찾기한 역을 최근 추가순으로 반환한다."""
    repository = UserRepository(db)
    _find_user(repository, user_id)
    favorites = repository.list_favorites(user_id)
    return {
        "items": [
            {
                "favorite_id": favorite.favorite_id,
                "station_id": favorite.station_id,
                "station_name": station_name,
                "created_at": favorite.created_at,
            }
            for favorite, station_name in favorites
        ]
    }


def add_favorite(
    db: Session,
    user_id: int,
    station_id: int,
) -> dict[str, object]:
    """현재 사용자의 역 즐겨찾기를 중복 없이 생성한다."""
    repository = UserRepository(db)
    _find_user(repository, user_id)
    station = repository.find_station_by_id(station_id)
    if not station:
        raise _error("STATION_NOT_FOUND", "역을 찾을 수 없습니다.", 404)
    if repository.find_favorite(user_id, station_id):
        raise _error(
            "FAVORITE_ALREADY_EXISTS",
            "이미 즐겨찾기한 역입니다.",
            409,
        )

    try:
        favorite = repository.create_favorite(user_id, station_id)
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise _error(
            "FAVORITE_ALREADY_EXISTS",
            "이미 즐겨찾기한 역입니다.",
            409,
        ) from error

    return {
        "favorite_id": favorite.favorite_id,
        "station_id": favorite.station_id,
        "station_name": station.station_name,
        "created_at": favorite.created_at,
    }


def delete_favorite(db: Session, user_id: int, station_id: int) -> None:
    """현재 사용자의 역 즐겨찾기를 멱등적으로 삭제한다."""
    repository = UserRepository(db)
    _find_user(repository, user_id)
    repository.delete_favorite(user_id, station_id)
    db.commit()
