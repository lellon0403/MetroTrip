"""공지사항 비즈니스 로직.

작성자(admin_id)는 기록용일 뿐 소유권 제약은 아니다. 관리자라면 누구나
모든 공지사항을 수정·삭제할 수 있다(팀 회의로 확정).
"""

import math
from enum import Enum

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.notices import Notice
from app.repositories.notices import NoticeRepository
from app.schemas.notices import (
    NoticeListResponse,
    NoticeResponse,
    NoticeType,
    NoticeUpdateRequest,
    NoticeUpsertRequest,
)


def _error(code: str, message: str, status_code: int) -> HTTPException:
    """공지사항 오류를 공통 API 오류 형식으로 만든다."""
    return HTTPException(status_code, detail=message, headers={"X-Error-Code": code})


def _find_notice(repository: NoticeRepository, notice_id: int) -> Notice:
    """공지사항을 조회하고 없으면 404를 발생시킨다."""
    notice = repository.find_notice_by_id(notice_id)
    if not notice:
        raise _error("NOTICE_NOT_FOUND", "공지사항을 찾을 수 없습니다.", 404)
    return notice


def _to_response(notice: Notice) -> NoticeResponse:
    """Notice 엔티티를 응답 스키마로 조립한다."""
    return NoticeResponse(
        notice_id=notice.notice_id,
        admin_id=notice.admin_id,
        title=notice.title,
        content=notice.content,
        notice_type=notice.notice_type,
        created_at=notice.created_at,
        updated_at=notice.updated_at,
    )


def list_notices(
    db: Session,
    *,
    notice_type: NoticeType | None,
    page: int,
    size: int,
) -> NoticeListResponse:
    """공지 유형별로 공지사항 목록을 페이지 단위로 조회한다."""
    repository = NoticeRepository(db)
    notices, total = repository.list_notices(
        notice_type=notice_type.value if notice_type else None,
        page=page,
        size=size,
    )
    return NoticeListResponse(
        items=[_to_response(notice) for notice in notices],
        page=page,
        size=size,
        total_elements=total,
        total_pages=math.ceil(total / size) if total else 0,
    )


def get_notice(db: Session, notice_id: int) -> NoticeResponse:
    """공지사항 상세를 조회한다."""
    repository = NoticeRepository(db)
    notice = _find_notice(repository, notice_id)
    return _to_response(notice)


def create_notice(
    db: Session,
    admin_id: int,
    request: NoticeUpsertRequest,
) -> NoticeResponse:
    """관리자가 새 공지사항을 작성한다."""
    repository = NoticeRepository(db)
    notice = repository.create_notice(
        admin_id=admin_id,
        title=request.title,
        content=request.content,
        notice_type=request.notice_type.value,
    )
    db.commit()
    db.refresh(notice)
    return _to_response(notice)


def update_notice(
    db: Session,
    notice_id: int,
    request: NoticeUpdateRequest,
) -> NoticeResponse:
    """관리자가 공지사항을 수정한다. 작성자가 아니어도 수정할 수 있다."""
    repository = NoticeRepository(db)
    notice = _find_notice(repository, notice_id)

    fields = request.model_dump(exclude_unset=True)
    for name, value in fields.items():
        setattr(notice, name, value.value if isinstance(value, Enum) else value)

    db.commit()
    db.refresh(notice)
    return _to_response(notice)


def delete_notice(db: Session, notice_id: int) -> None:
    """관리자가 공지사항을 삭제한다. 작성자가 아니어도 삭제할 수 있다."""
    repository = NoticeRepository(db)
    notice = _find_notice(repository, notice_id)
    repository.delete_notice(notice)
    db.commit()
