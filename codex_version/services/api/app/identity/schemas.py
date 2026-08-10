from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import EmailStr, Field, SecretStr, field_validator

from app.core.schemas import ApiModel
from app.identity.models import UserRole, UserStatus


class RegisterRequest(ApiModel):
    email: EmailStr
    password: SecretStr = Field(min_length=10, max_length=128)
    display_name: str = Field(min_length=2, max_length=40)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        return " ".join(value.strip().split())


class LoginRequest(ApiModel):
    email: EmailStr
    password: SecretStr


class RefreshRequest(ApiModel):
    refresh_token: str | None = Field(default=None, min_length=32, max_length=500)


class UserProfile(ApiModel):
    id: UUID
    email: EmailStr
    display_name: str
    role: UserRole
    status: UserStatus
    created_at: datetime


class AuthResponse(ApiModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    refresh_token: str | None = None
    user: UserProfile


class MessageResponse(ApiModel):
    message: str


class PasswordResetRequest(ApiModel):
    email: EmailStr


class PasswordResetRequested(ApiModel):
    message: str
    debug_code: str | None = None


class PasswordResetConfirm(ApiModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")
    new_password: SecretStr = Field(min_length=10, max_length=128)


class ProfileUpdate(ApiModel):
    display_name: str = Field(min_length=2, max_length=40)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        return " ".join(value.strip().split())


class AccountDeleteRequest(ApiModel):
    password: SecretStr
    confirmation: Literal["DELETE"]
