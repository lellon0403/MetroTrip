"""Shared API contract models."""

from typing import Any
from pydantic import BaseModel, ConfigDict, Field

# 파이썬의 스네이크 케이스 변수명을 JSO으로 변환하는 유틸리티 함수
def to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])

# API 요청/응답에서 사용될 모든 Pydantic 모델의 상위 부모 클래스
class ApiSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,       # 파이썬 필드명을 JSON 직렬화/역직렬화 시 자동으로 카멜 케이스로 변환
        populate_by_name=True,          # 필드 이름이나 별칭 두 가지 방식 모두로 객체 생성을 허용
        from_attributes=True            # SQLAlchemy 모델 같은 ORM 객체를 Pydantic 모델로 자동 변환할 수 있게 함.
    )

# 전역 예외 처리기에서 반환할 공통 오류 응답 포맷
class ErrorResponse(ApiSchema):
    code: str = Field(examples=["RESOURCE_NOT_FOUND"])
    message: str = Field(examples=["요청한 리소스를 찾을 수 없습니다."])
    details: dict[str, Any] | None = None

# 메시지
class MessageResponse(ApiSchema):
    message: str

# 목록 조회 API에서 공통으로 상속받을 페이지네이션 메타데이터 모델
class Pagination(ApiSchema):
    page: int = Field(ge=1)
    size: int = Field(ge=1, le=100)
    total_elements: int = Field(ge=0)
    total_pages: int = Field(ge=0)