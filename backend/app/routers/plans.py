"""여행 계획과 읽기 전용 공유 API."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db_failover import get_db, get_read_db
from app.routers.contract import (
    AUTH_REQUIRED,
    ERROR_RESPONSES,
    CurrentUserId,
)
from app.schemas.plans import (
    PlanCreateRequest,
    PlanListResponse,
    PlanResponse,
    PlanUpdateRequest,
    SharedPlanResponse,
    ShareLinkResponse,
)
from app.services import plans as plan_service

router = APIRouter(
    prefix="/plans",
    tags=["여행 계획"],
    dependencies=AUTH_REQUIRED,
)
shared_router = APIRouter(prefix="/shared-plans", tags=["여행 계획 공유"])
DatabaseSession = Annotated[Session, Depends(get_db)]
ReadDatabaseSession = Annotated[Session, Depends(get_read_db)]


@router.get(
    "",
    response_model=PlanListResponse,
    summary="내 여행 계획 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_plans(
    db: ReadDatabaseSession,
    user_id: CurrentUserId,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PlanListResponse:
    """현재 사용자의 여행 계획을 생성 최신순으로 조회한다."""
    return plan_service.list_plans(db, user_id, page=page, size=size)


@router.post(
    "",
    response_model=PlanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="여행 계획 작성",
    responses=ERROR_RESPONSES,
)
def create_plan(
    request: PlanCreateRequest,
    db: DatabaseSession,
    user_id: CurrentUserId,
) -> PlanResponse:
    """현재 사용자의 새 여행 계획을 작성한다."""
    return plan_service.create_plan(db, user_id, request)


@router.get(
    "/{plan_id}",
    response_model=PlanResponse,
    summary="여행 계획 상세 조회",
    responses=ERROR_RESPONSES,
)
def get_plan(
    plan_id: int,
    db: ReadDatabaseSession,
    user_id: CurrentUserId,
) -> PlanResponse:
    """본인이 작성한 여행 계획의 상세 정보를 조회한다."""
    return plan_service.get_plan(db, plan_id, user_id)


@router.patch(
    "/{plan_id}",
    response_model=PlanResponse,
    summary="여행 계획 수정",
    responses=ERROR_RESPONSES,
)
def update_plan(
    plan_id: int,
    request: PlanUpdateRequest,
    db: DatabaseSession,
    user_id: CurrentUserId,
) -> PlanResponse:
    """본인의 여행 계획과 일정 항목을 수정한다."""
    return plan_service.update_plan(db, plan_id, user_id, request)


@router.delete(
    "/{plan_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="여행 계획 삭제",
    responses=ERROR_RESPONSES,
)
def delete_plan(
    plan_id: int,
    db: DatabaseSession,
    user_id: CurrentUserId,
) -> None:
    """본인이 작성한 여행 계획을 삭제한다."""
    plan_service.delete_plan(db, plan_id, user_id)


@router.post(
    "/{plan_id}/share-links",
    response_model=ShareLinkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="읽기 전용 공유 링크 발급",
    responses=ERROR_RESPONSES,
)
def create_share_link(
    plan_id: int,
    db: DatabaseSession,
    user_id: CurrentUserId,
) -> ShareLinkResponse:
    """본인 여행 계획의 읽기 전용 공유 링크를 발급한다."""
    return plan_service.create_share_link(
        db,
        plan_id,
        user_id,
        get_settings(),
    )


@shared_router.get(
    "/{share_token}",
    response_model=SharedPlanResponse,
    summary="공유 여행 계획 조회",
    description="로그인 없이 읽기만 가능하며 수정 API는 제공하지 않습니다.",
    responses=ERROR_RESPONSES,
)
def get_shared_plan(
    share_token: str,
    db: ReadDatabaseSession,
) -> SharedPlanResponse:
    """유효한 공유 토큰의 여행 계획을 로그인 없이 조회한다."""
    return plan_service.get_shared_plan(db, share_token)
