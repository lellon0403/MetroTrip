from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import get_settings
from app.routers import api_router
from app.routers.health import router as health_router

# Swagger UI에 표시될 API 태그들의 이름과 설명을 정의
# 엔드포인트들을 도메인 역할별로 그룹화하여 가독성을 높임.
OPENAPI_TAGS = [
    {"name": "인증", "description": "회원가입, 로그인, 토큰 갱신과 로그아웃"},
    {"name": "사용자", "description": "내 정보, 즐겨찾기와 내가 작성한 후기"},
    {"name": "노선·역·장소", "description": "노선, 역, 시간표와 주변 장소 조회"},
    {"name": "여행 계획", "description": "내 여행 계획 작성과 관리"},
    {"name": "여행 계획 공유", "description": "로그인 없는 읽기 전용 공유"},
    {"name": "여행 후기", "description": "여행 후기와 첨부 미디어"},
    {"name": "공지사항", "description": "공지사항 조회"},
    {"name": "게시판", "description": "일반 글, 모집 글과 참여 신청"},
    {"name": "관리자", "description": "공지사항과 장소 관리"},
    {"name": "health", "description": "서버 상태 확인"},
]

# 기본 HTTPException이 발생했을 때, 클라이언트에게 반환할 공통 오류 응답 포맷(JSON)을 정의
# 클라이언트가 오류 코드와 메시지를 일관성 있게 파싱할 수 있도록 도움
def http_exception_handler(_: Request, exception: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exception.status_code,
        content={
            "code": f"HTTP_{exception.status_code}",
            "message": str(exception.detail),
            "details": None,
        },
        headers=exception.headers
    )


def validation_exception_handler(_: Request, exception: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "code": "VALIDATION_ERROR",
            "message": "입력값을 확인해주세요.",
            "details": {"errors": exception.errors()},
        },
    )

# FastAPI 애플리케이션 인스턴스를 조립하고 초기화하는 함수
def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        summary="MetroTrip 프론트엔드 협업용 REST API 계약",
        description=(
            "API 명세서와 데이터베이스 명세서 V1.8을 기준으로 작성했습니다. "
            "현재 비즈니스 API는 계약만 정의되어 501을 반환합니다."
        ),
        debug=settings.debug,
        version="0.1.0",
        openapi_tags=OPENAPI_TAGS       # 위에서 선언한 Swagger 태그 적용
    )

    # CORS(교차 출처 리소스 공유) 미들웨어를 등록
    # 다른 포트나 도메인에서 들어오는 API 요청을 브라우저가 차단하지 않도록 허용
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,                 # 쿠키 및 인증 토큰(헤더) 포함 허용
        allow_methods=["*"],                    # 모든 HTTP 메서드(GET, POST, PUT, DELETE 등) 허용
        allow_headers=["*"]                     # 클라이언트가 보낼 수 있는 모든 커스텀 HTTP 헤더 허용
    )

    # 앞서 정의한 커스텀 예외들을 앱에 등록
    application.add_exception_handler(HTTPException, http_exception_handler)
    application.add_exception_handler(
        RequestValidationError,
        validation_exception_handler,
    )

    # 정의된 라우터들을 애플리케이션에 조립
    # 하위 도메인 로직들은 api_router 내부에 캡슐화되어 있으며, 공통 접두사가 적용
    application.include_router(health_router)
    application.include_router(api_router, prefix=settings.api_v1_prefix)

    return application

# 앱 인스턴스 생성: Uvicorn 등의 ASGI 서버가 실행될 때 이 app 객체를 진입점으로 사용
app = create_app()