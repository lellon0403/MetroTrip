"""User and favorite API contract models."""

from datetime import datetime
from pydantic import Field
from app.schemas.common import ApiSchema

# 열거형 대신 정규식을 통해 역할 필드를 USER나 ADMIN 문자열로만 제한하는 방식을 사용
class UserProfileResponse(ApiSchema):
    user_id: int
    email: str
    name: str
    nickname: str
    phone: str | None
    role: str = Field(pattern="^(USER|ADMIN)$")
    created_at: datetime
    updated_at: datetime

class UserProfileUpdateRequest(ApiSchema):
    email: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=72)
    name: str | None = Field(default=None, min_length=1, max_length=50)
    nickname: str | None = Field(default=None, min_length=1, max_length=30)
    phone: str | None = Field(default=None, max_length=20)

class WithdrawRequest(ApiSchema):
    password: str = Field(min_length=1, max_length=72)

class FavoriteResponse(ApiSchema):
    favorite_id: int
    station_id: int
    station_name: str
    created_at: datetime

class FavoriteListResponse(ApiSchema):
    items: list[FavoriteResponse]