"""Authentication API contract models."""

from pydantic import Field

from app.schemas.common import ApiSchema


class AgreementInput(ApiSchema):
    agreement_type: str = Field(
        pattern="^(TERMS|PRIVACY|LOCATION|MARKETING)$",
        examples=["TERMS"],
    )
    is_agreed: bool


class RegisterRequest(ApiSchema):
    email: str = Field(max_length=255, examples=["user@example.com"])
    password: str = Field(min_length=8, max_length=72)
    name: str = Field(min_length=1, max_length=50)
    nickname: str = Field(min_length=1, max_length=30)
    phone: str | None = Field(default=None, max_length=20)
    agreements: list[AgreementInput] = Field(min_length=1)


class LoginRequest(ApiSchema):
    email: str = Field(max_length=255)
    password: str = Field(min_length=1, max_length=72)


class RefreshRequest(ApiSchema):
    refresh_token: str = Field(min_length=1, max_length=512)


class TokenResponse(ApiSchema):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(gt=0, description="Access Token 만료 시간(초)")


class RegisteredUserResponse(ApiSchema):
    user_id: int
    email: str
    nickname: str

