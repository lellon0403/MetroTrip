"""Notice API contracts."""

from typing import Annotated
from fastapi import APIRouter, Query, status
from fastapi.responses import JSONResponse
from app.routers.contract import AUTH_REQUIRED, ERROR_RESPONSES, not_implemented
from app.schemas.notices import (
    NoticeListResponse,
    NoticeResponse,
    NoticeType,
    NoticeUpdateRequest,
    NoticeUpsertRequest,
)

# 일반 사용자가 접근할 수 있는 읽기 전용 라우터
router = APIRouter(prefix="/notices", tags=["공지사항"])

# 생성, 수정, 삭제를 담당하는 라우터는 '/admin' prefix를 가지며, 라우터 레벨에서 공통으로 인증을 강제함.
admin_router = APIRouter(
    prefix="/admin/notices",
    tags=["관리자"],
    dependencies=AUTH_REQUIRED,
)

# 공지사항 목록 조회
@router.get(
    "",
    response_model=NoticeListResponse,
    summary="공지사항 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_notices(
    notice_type: Annotated[NoticeType | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> JSONResponse:
    return not_implemented()

# 공지사항 상세 조회
@router.get(
    "/{notice_id}",
    response_model=NoticeResponse,
    summary="공지사항 상세 조회",
    responses=ERROR_RESPONSES,
)
def get_notice(notice_id: int) -> JSONResponse:
    return not_implemented()

# 공지사항 작성
@admin_router.post(
    "",
    response_model=NoticeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="공지사항 작성",
    responses=ERROR_RESPONSES,
)
# 관리자 전용 API이므로, 비즈니스 로직(Service 계층)에서 관리자 권한 확인이 추가로 이루어짐
def create_notice(_: NoticeUpsertRequest) -> JSONResponse:
    return not_implemented()

# 공지사항 수정
@admin_router.patch(
    "/{notice_id}",
    response_model=NoticeResponse,
    summary="공지사항 수정",
    responses=ERROR_RESPONSES,
)
def update_notice(notice_id: int, _: NoticeUpdateRequest) -> JSONResponse:
    return not_implemented()

# 공지사항 삭제
@admin_router.delete(
    "/{notice_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="공지사항 삭제",
    responses=ERROR_RESPONSES,
)
def delete_notice(notice_id: int) -> JSONResponse:
    return not_implemented()