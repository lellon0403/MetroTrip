"""회원 정보 API 요청 및 응답 모델."""

import re
from datetime import datetime

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.schemas.common import ApiSchema


class UserProfileResponse(ApiSchema):
    user_id: int
    email: str
    name: str
    nickname: str
    role: str = Field(pattern="^(USER|ADMIN)$")
    created_at: datetime
    updated_at: datetime


class UserProfileUpdateRequest(ApiSchema):
    """이름과 닉네임 부분 수정 요청."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=50)
    nickname: str | None = Field(default=None, min_length=2, max_length=20)

    @model_validator(mode="after")
    def validate_changes(self) -> "UserProfileUpdateRequest":
        """최소 한 개의 수정 필드가 실제 문자열로 전달되었는지 확인한다."""
        if not self.model_fields_set:
            raise ValueError("변경할 회원 정보를 입력해야 합니다.")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("이름과 닉네임은 null로 변경할 수 없습니다.")
        return self


class PasswordChangeRequest(ApiSchema):
    """로그인 사용자의 새 비밀번호 변경 요청."""

    new_password: str = Field(min_length=8, max_length=72)
    new_password_confirm: str = Field(min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        """새 비밀번호가 영문, 숫자, 특수문자를 모두 포함하는지 검사한다."""
        if (
            not re.search(r"[A-Za-z]", value)
            or not re.search(r"\d", value)
            or not re.search(r"[^A-Za-z0-9]", value)
        ):
            raise ValueError("비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.")
        return value


class FavoriteResponse(ApiSchema):
    favorite_id: int
    station_id: int
    station_name: str
    created_at: datetime


class FavoriteListResponse(ApiSchema):
    items: list[FavoriteResponse]
