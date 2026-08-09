from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.integrations.local_storage import media_root
from app.routers import api_router
from app.routers.health import router as health_router

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


def http_exception_handler(_: Request, exception: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exception.status_code,
        content={
            "code": exception.headers.get(
                "X-Error-Code", f"HTTP_{exception.status_code}"
            )
            if exception.headers
            else f"HTTP_{exception.status_code}",
            "message": str(exception.detail),
            "details": None,
        },
        headers=exception.headers,
    )


def validation_exception_handler(
    _: Request,
    exception: RequestValidationError,
) -> JSONResponse:
    errors = []
    for item in exception.errors():
        error = dict(item)
        if error.get("ctx") and "error" in error["ctx"]:
            error["ctx"] = {**error["ctx"], "error": str(error["ctx"]["error"])}
        errors.append(error)
    return JSONResponse(
        status_code=422,
        content={
            "code": "VALIDATION_ERROR",
            "message": "입력값을 확인해주세요.",
            "details": {"errors": errors},
        },
    )


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        summary="MetroTrip 프론트엔드 협업용 REST API 계약",
        description=(
            "API 계약과 데이터베이스 명세서 V1.10을 기준으로 작성했습니다. "
            "미구현된 API는 501을 반환합니다."
        ),
        debug=settings.debug,
        version="0.1.0",
        openapi_tags=OPENAPI_TAGS,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.add_exception_handler(HTTPException, http_exception_handler)
    application.add_exception_handler(
        RequestValidationError,
        validation_exception_handler,
    )

    application.include_router(health_router)
    application.include_router(api_router, prefix=settings.api_v1_prefix)
    application.mount(
        f"{settings.api_v1_prefix}/media",
        StaticFiles(directory=media_root(settings)),
        name="media",
    )
    return application


app = create_app()
