"""Authentication API contract models."""

from pydantic import Field
from app.schemas.common import ApiSchema

# 정규표현식을 사용하여 약관 유형이 지정된 4가지 중 하나인지 프레임워크 단에서 검증
class AgreementInput(ApiSchema):
    agreement_type: str = Field(
        pattern="^(TERMS|PRIVACY|LOCATION|MARKETING)$",
        examples=["TERMS"],
    )
    is_agreed: bool

# 사용자 정보
class RegisterRequest(ApiSchema):
    email: str = Field(max_length=255, examples=["user@example.com"])
    password: str = Field(min_length=8, max_length=72)                  # 보안을 위해 비밀번호의 최소 길이를 강제
    name: str = Field(min_length=1, max_length=50)
    nickname: str = Field(min_length=1, max_length=30)
    phone: str | None = Field(default=None, max_length=20)
    agreements: list[AgreementInput] = Field(min_length=1)              # 최소 1개 이상의 약관 동의 내역이 필요함을 보장

# 로그인
class LoginRequest(ApiSchema):
    email: str = Field(max_length=255)
    password: str = Field(min_length=1, max_length=72)

# 토큰
class RefreshRequest(ApiSchema):
    refresh_token: str = Field(min_length=1, max_length=512)

# 토큰 갱신
class TokenResponse(ApiSchema):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(gt=0, description="Access Token 만료 시간(초)")

# 등록된 사용자 
class RegisteredUserResponse(ApiSchema):
    user_id: int
    email: str
    nickname: str