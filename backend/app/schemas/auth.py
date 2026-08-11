"""인증 API 요청 및 응답 모델."""

import re
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.common import ApiSchema

ReauthenticationPurpose = Literal[
    "PROFILE_UPDATE",
    "PASSWORD_CHANGE",
    "WITHDRAWAL",
]


class AgreementInput(ApiSchema):
    """회원가입 시 제출하는 약관 동의 항목."""

    agreement_type: str = Field(
        pattern="^(TERMS|PRIVACY|LOCATION|MARKETING)$",
        examples=["TERMS"],
    )
    is_agreed: bool


class RegisterRequest(ApiSchema):
    """이메일 인증과 필수 약관 동의를 포함한 회원가입 요청."""

    email: str = Field(max_length=255, examples=["user@example.com"])
    password: str = Field(min_length=8, max_length=72)
    password_confirm: str = Field(min_length=8, max_length=72)
    name: str = Field(min_length=1, max_length=50)
    nickname: str = Field(min_length=2, max_length=20)
    terms_agreed: bool
    privacy_agreed: bool
    email_verification_token: str = Field(min_length=1, max_length=1024)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        """비밀번호가 영문, 숫자, 특수문자를 모두 포함하는지 검사한다."""

        if (
            not re.search(r"[A-Za-z]", value)
            or not re.search(r"\d", value)
            or not re.search(r"[^A-Za-z0-9]", value)
        ):
            raise ValueError("비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.")
        return value


class EmailVerificationRequest(ApiSchema):
    """가입 또는 비밀번호 재설정용 이메일 인증 코드 요청."""

    email: str = Field(max_length=255)
    purpose: str = Field(default="SIGNUP", pattern="^(SIGNUP|PASSWORD_RESET)$")


class EmailVerificationConfirmRequest(ApiSchema):
    """이메일로 받은 인증 코드를 확인하는 요청."""

    email: str = Field(max_length=255)
    code: str = Field(pattern=r"^\d{6}$")
    purpose: str = Field(default="SIGNUP", pattern="^(SIGNUP|PASSWORD_RESET)$")


class EmailVerificationConfirmResponse(ApiSchema):
    """확인 완료된 이메일 인증 토큰 응답."""

    verification_token: str


class PasswordResetConfirmRequest(EmailVerificationConfirmRequest):
    """이메일 인증 코드와 새 비밀번호를 제출하는 재설정 요청."""

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


class LoginRequest(ApiSchema):
    """이메일과 비밀번호를 사용하는 로그인 요청."""

    email: str = Field(max_length=255)
    password: str = Field(min_length=1, max_length=72)


class ReauthenticationRequest(ApiSchema):
    """로그인 사용자의 현재 비밀번호 재인증 요청."""

    password: str = Field(min_length=1, max_length=72)
    purpose: ReauthenticationPurpose


class ReauthenticationResponse(ApiSchema):
    """회원 정보 수정에 사용할 단기 재인증 토큰 응답."""

    verification_token: str
    expires_in: int = Field(gt=0, description="재인증 토큰 만료 시간(초)")
    purpose: ReauthenticationPurpose


class RefreshRequest(ApiSchema):
    """리프레시 토큰으로 인증 토큰을 갱신하는 요청."""

    refresh_token: str = Field(min_length=1, max_length=512)


class TokenResponse(ApiSchema):
    """액세스 토큰과 리프레시 토큰 발급 응답."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(gt=0, description="Access Token 만료 시간(초)")


class RegisteredUserResponse(ApiSchema):
    """회원가입을 완료한 사용자의 기본 정보 응답."""

    user_id: int
    email: str
    nickname: str
