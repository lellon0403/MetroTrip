"""OpenAPI contract regression tests."""

import asyncio
import httpx
from app.main import app

# FastAPI가 자동으로 생성하는 OpenAPI(Swagger) 스키마 딕셔너리를 메모리에 불려옴
def test_openapi_contains_agreed_api_contract() -> None:
    schema = app.openapi()
    paths = schema["paths"]

    # 프론트엔드 등 클라이언트와 사전에 정의된 필수 API 엔드포인트들의 집합
    expected_paths = {
        "/api/v1/auth/register",
        "/api/v1/users/me",
        "/api/v1/stations",
        "/api/v1/stations/{station_id}/places",
        "/api/v1/plans/{plan_id}/share-links",
        "/api/v1/shared-plans/{share_token}",
        "/api/v1/reviews",
        "/api/v1/notices",
        "/api/v1/posts",
        "/api/v1/posts/{post_id}/participants/{participant_id}",
    }

    # 부분집합 연산자를 사용하여 기대하는 경로들이 모두 실제 스키마에 존재하는지 확인
    assert expected_paths <= paths.keys()

    # 잘못된 이름이나 배제하기로 합의된 경로가 스키마에 생성되지 않았는지 회귀 검증을 수행
    assert "/api/v1/review" not in paths
    assert "/api/v1/plan" not in paths
    assert "/api/v1/station/time" not in paths


def test_posts_contract_excludes_sort_and_uses_camel_case_body() -> None:
    schema = app.openapi()
    posts_get = schema["paths"]["/api/v1/posts"]["get"]

    # 게시글 조회 API의 쿼리 파라미터 이름들을 스키마에서 모두 추출
    query_names = {parameter["name"] for parameter in posts_get["parameters"]}

    # PostCreateRequest 스키마에 정의된 속성(properties) 목록을 가져옵니다.
    post_properties = schema["components"]["schemas"]["PostCreateRequest"][
        "properties"
    ]

    # 기획/설계상 라우터에서 제외하기로 한 'sort' 정렬 옵션이 실제로 빠져 있는지 검증
    assert "sort" not in query_names

    # schemas/common.py의 ApiSchema에서 설정한 alias_generator에 의해
    # 파이썬의 스네이크 케이스가 JSON 요청 모델에서는
    # 카멜 케이스로 정상 변환되었는지 검증
    assert "recruitCapacity" in post_properties
    assert "recruit_capacity" not in post_properties


def test_protected_and_shared_plan_security_contract() -> None:
    schema = app.openapi()

    # 인증(AUTH_REQUIRED) 의존성이 주입된 본인 여행 계획 조회 API는 스키마 상에 'security' 항목이 존재해야 함.
    assert schema["paths"]["/api/v1/plans"]["get"]["security"]

    # 읽기 전용 공유 API는 로그인 없이 접근 가능해야 하므로 'security' 요구사항이 없어야 함을 검증
    assert "security" not in schema["paths"]["/api/v1/shared-plans/{share_token}"]["get"]

# 아직 비즈니스 로직이 구현되지 않고 not_implemented()를 반환하는 엔드포인트를 호출할 때, 
# 사전에 합의된 공통 에러 규격에 맞게 501 상태 코드가 반환되는지 HTTP 클라이언트를 통해 직접 확인
def test_contract_endpoint_returns_standard_not_implemented_error() -> None:
    async def request_lines() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get("/api/v1/lines")

    response = asyncio.run(request_lines())

    # HTTP 상태 코드와 커스텀 내부 에러 코드("NOT_IMPLEMENTED")를 모두 검증
    assert response.status_code == 501
    assert response.json()["code"] == "NOT_IMPLEMENTED"