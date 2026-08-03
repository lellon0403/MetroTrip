"""Travel plan and read-only share API contracts."""

from typing import Annotated

from fastapi import APIRouter, Query, status
from fastapi.responses import JSONResponse

from app.routers.contract import AUTH_REQUIRED, ERROR_RESPONSES, not_implemented
from app.schemas.plans import (
    PlanCreateRequest,
    PlanListResponse,
    PlanResponse,
    PlanUpdateRequest,
    SharedPlanResponse,
    ShareLinkResponse,
)

router = APIRouter(
    prefix="/plans",
    tags=["여행 계획"],
    dependencies=AUTH_REQUIRED,
)
shared_router = APIRouter(prefix="/shared-plans", tags=["여행 계획 공유"])


@router.get(
    "",
    response_model=PlanListResponse,
    summary="내 여행 계획 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_plans(
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> JSONResponse:
    return not_implemented()


@router.post(
    "",
    response_model=PlanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="여행 계획 작성",
    responses=ERROR_RESPONSES,
)
def create_plan(_: PlanCreateRequest) -> JSONResponse:
    return not_implemented()


@router.get(
    "/{plan_id}",
    response_model=PlanResponse,
    summary="여행 계획 상세 조회",
    responses=ERROR_RESPONSES,
)
def get_plan(plan_id: int) -> JSONResponse:
    return not_implemented()


@router.patch(
    "/{plan_id}",
    response_model=PlanResponse,
    summary="여행 계획 수정",
    responses=ERROR_RESPONSES,
)
def update_plan(plan_id: int, _: PlanUpdateRequest) -> JSONResponse:
    return not_implemented()


@router.delete(
    "/{plan_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="여행 계획 삭제",
    responses=ERROR_RESPONSES,
)
def delete_plan(plan_id: int) -> JSONResponse:
    return not_implemented()


@router.post(
    "/{plan_id}/share-links",
    response_model=ShareLinkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="읽기 전용 공유 링크 발급",
    responses=ERROR_RESPONSES,
)
def create_share_link(plan_id: int) -> JSONResponse:
    return not_implemented()


@shared_router.get(
    "/{share_token}",
    response_model=SharedPlanResponse,
    summary="공유 여행 계획 조회",
    description="로그인 없이 읽기만 가능하며 수정 API는 제공하지 않습니다.",
    responses=ERROR_RESPONSES,
)
def get_shared_plan(share_token: str) -> JSONResponse:
    return not_implemented()
