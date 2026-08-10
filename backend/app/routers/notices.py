"""Notice API contracts."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db_failover import get_db, get_read_db
from app.routers.contract import ADMIN_REQUIRED, ERROR_RESPONSES, CurrentAdminId
from app.schemas.notices import (
    NoticeListResponse,
    NoticeResponse,
    NoticeType,
    NoticeUpdateRequest,
    NoticeUpsertRequest,
)
from app.services import notices as notice_service

router = APIRouter(prefix="/notices", tags=["공지사항"])
admin_router = APIRouter(
    prefix="/admin/notices",
    tags=["관리자"],
    dependencies=ADMIN_REQUIRED,
)
DatabaseSession = Annotated[Session, Depends(get_db)]
ReadDatabaseSession = Annotated[Session, Depends(get_read_db)]


@router.get(
    "",
    response_model=NoticeListResponse,
    summary="공지사항 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_notices(
    db: ReadDatabaseSession,
    notice_type: Annotated[NoticeType | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> NoticeListResponse:
    """공지사항 목록을 조회한다."""
    return notice_service.list_notices(
        db, notice_type=notice_type, page=page, size=size
    )


@router.get(
    "/{notice_id}",
    response_model=NoticeResponse,
    summary="공지사항 상세 조회",
    responses=ERROR_RESPONSES,
)
def get_notice(notice_id: int, db: ReadDatabaseSession) -> NoticeResponse:
    """공지사항 상세를 조회한다."""
    return notice_service.get_notice(db, notice_id)


@admin_router.post(
    "",
    response_model=NoticeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="공지사항 작성",
    responses=ERROR_RESPONSES,
)
def create_notice(
    request: NoticeUpsertRequest,
    db: DatabaseSession,
    admin_id: CurrentAdminId,
) -> NoticeResponse:
    """관리자가 새 공지사항을 작성한다."""
    return notice_service.create_notice(db, admin_id, request)


@admin_router.patch(
    "/{notice_id}",
    response_model=NoticeResponse,
    summary="공지사항 수정",
    responses=ERROR_RESPONSES,
)
def update_notice(
    notice_id: int,
    request: NoticeUpdateRequest,
    db: DatabaseSession,
    admin_id: CurrentAdminId,
) -> NoticeResponse:
    """관리자가 공지사항을 수정한다."""
    return notice_service.update_notice(db, notice_id, request)


@admin_router.delete(
    "/{notice_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="공지사항 삭제",
    responses=ERROR_RESPONSES,
)
def delete_notice(
    notice_id: int,
    db: DatabaseSession,
    admin_id: CurrentAdminId,
) -> None:
    """관리자가 공지사항을 삭제한다."""
    notice_service.delete_notice(db, notice_id)
