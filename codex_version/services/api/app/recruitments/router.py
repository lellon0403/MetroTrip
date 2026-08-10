from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.identity.dependencies import CurrentUser, OptionalUser
from app.infrastructure.database import get_db
from app.recruitments.models import (
    ApplicationStatus,
    Recruitment,
    RecruitmentApplication,
    RecruitmentCommentKind,
    RecruitmentStatus,
)
from app.recruitments.schemas import (
    ApplicationCreateRequest,
    ApplicationDecisionRequest,
    ApplicationPage,
    ApplicationView,
    RecruitmentCommentCreateRequest,
    RecruitmentCommentPage,
    RecruitmentCommentView,
    RecruitmentDetail,
    RecruitmentPage,
    RecruitmentSummary,
    RecruitmentWriteRequest,
)
from app.recruitments.service import RecruitmentService
from app.planning.schemas import PlanView

router = APIRouter(tags=["recruitments"])


def _version(if_match: str | None) -> int:
    if not if_match:
        raise ApiError(428, "IF_MATCH_REQUIRED", "최신 버전을 확인하는 If-Match가 필요합니다.")
    try:
        return int(if_match.strip().removeprefix("W/").strip('"'))
    except ValueError as exc:
        raise ApiError(400, "INVALID_IF_MATCH", "If-Match 값이 올바르지 않습니다.") from exc


@router.get("/recruitments", operation_id="listRecruitments", response_model=RecruitmentPage)
def list_recruitments(
    db: Annotated[Session, Depends(get_db)],
    query: Annotated[str | None, Query(max_length=100)] = None,
    recruitment_status: Annotated[RecruitmentStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    sort: Annotated[Literal["latest", "popular", "closing"], Query()] = "latest",
) -> RecruitmentPage:
    service = RecruitmentService(db)
    items = service.list(query, recruitment_status, limit, sort)
    return RecruitmentPage(items=[service.summary(item) for item in items[:limit]])


@router.get(
    "/recruitments/{recruitment_id}",
    operation_id="getRecruitment",
    response_model=RecruitmentDetail,
)
def get_recruitment(
    recruitment_id: UUID,
    response: Response,
    user: OptionalUser,
    db: Annotated[Session, Depends(get_db)],
) -> RecruitmentDetail:
    detail = RecruitmentService(db).detail(recruitment_id, user.id if user else None)
    response.headers["ETag"] = f'W/"{detail.version}"'
    return detail


@router.get(
    "/recruitments/{recruitment_id}/plan",
    operation_id="getRecruitmentPlan",
    response_model=PlanView,
)
def get_recruitment_plan(
    recruitment_id: UUID, db: Annotated[Session, Depends(get_db)]
) -> PlanView:
    service = RecruitmentService(db)
    item = service._get(recruitment_id)
    if not item.plan_id:
        raise ApiError(404, "RECRUITMENT_PLAN_NOT_FOUND", "연결된 일정이 없습니다.")
    plan = service._get_owned_active_plan(item.plan_id, item.owner_id)
    return PlanView.model_validate(plan)


@router.get(
    "/recruitments/{recruitment_id}/comments",
    operation_id="listRecruitmentComments",
    response_model=RecruitmentCommentPage,
)
def list_comments(recruitment_id: UUID, db: Annotated[Session, Depends(get_db)]) -> RecruitmentCommentPage:
    service = RecruitmentService(db)
    return RecruitmentCommentPage(items=[service.comment_view(item) for item in service.comments(recruitment_id)])


@router.post(
    "/recruitments/{recruitment_id}/comments",
    operation_id="createRecruitmentComment",
    response_model=RecruitmentCommentView,
    status_code=201,
)
def create_comment(
    recruitment_id: UUID,
    body: RecruitmentCommentCreateRequest,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> RecruitmentCommentView:
    service = RecruitmentService(db)
    return service.comment_view(service.add_comment(recruitment_id, user.id, body.kind, body.body))


@router.post(
    "/recruitments",
    operation_id="createRecruitment",
    response_model=RecruitmentSummary,
    status_code=201,
)
def create_recruitment(
    body: RecruitmentWriteRequest, user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> RecruitmentSummary:
    service = RecruitmentService(db)
    return service.summary(service.create(user.id, body))


@router.put(
    "/recruitments/{recruitment_id}",
    operation_id="updateRecruitment",
    response_model=RecruitmentSummary,
)
def update_recruitment(
    recruitment_id: UUID,
    body: RecruitmentWriteRequest,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> RecruitmentSummary:
    service = RecruitmentService(db)
    return service.summary(service.update(recruitment_id, user.id, _version(if_match), body))


@router.post(
    "/recruitments/{recruitment_id}/close",
    operation_id="closeRecruitment",
    response_model=RecruitmentSummary,
)
def close_recruitment(
    recruitment_id: UUID, user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> RecruitmentSummary:
    service = RecruitmentService(db)
    return service.summary(service.close(recruitment_id, user.id))


@router.delete("/recruitments/{recruitment_id}", operation_id="deleteRecruitment", status_code=204)
def delete_recruitment(
    recruitment_id: UUID, user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> Response:
    RecruitmentService(db).delete(recruitment_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/recruitments/{recruitment_id}/applications",
    operation_id="applyRecruitment",
    response_model=ApplicationView,
    status_code=201,
)
def apply_recruitment(
    recruitment_id: UUID,
    body: ApplicationCreateRequest,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> ApplicationView:
    service = RecruitmentService(db)
    return service.application_view(service.apply(recruitment_id, user.id, body.message))


@router.delete(
    "/recruitments/{recruitment_id}/applications/me",
    operation_id="cancelRecruitmentApplication",
    response_model=ApplicationView,
)
def cancel_application(
    recruitment_id: UUID, user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> ApplicationView:
    service = RecruitmentService(db)
    return service.application_view(service.cancel_application(recruitment_id, user.id))


@router.get(
    "/recruitments/{recruitment_id}/applications",
    operation_id="listRecruitmentApplications",
    response_model=ApplicationPage,
)
def list_applications(
    recruitment_id: UUID, user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> ApplicationPage:
    service = RecruitmentService(db)
    recruitment = service._get(recruitment_id)
    if recruitment.owner_id != user.id:
        raise ApiError(403, "RECRUITMENT_FORBIDDEN", "신청 목록을 볼 권한이 없습니다.")
    applications = db.scalars(
        select(RecruitmentApplication)
        .where(RecruitmentApplication.recruitment_id == recruitment_id)
        .order_by(RecruitmentApplication.created_at)
    ).all()
    return ApplicationPage(items=[service.application_view(item) for item in applications])


@router.put(
    "/recruitments/{recruitment_id}/applications/{application_id}",
    operation_id="decideRecruitmentApplication",
    response_model=ApplicationView,
)
def decide_application(
    recruitment_id: UUID,
    application_id: UUID,
    body: ApplicationDecisionRequest,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> ApplicationView:
    service = RecruitmentService(db)
    return service.application_view(
        service.decide(recruitment_id, application_id, user.id, body.status)
    )


@router.get("/me/recruitments", operation_id="listMyRecruitments", response_model=RecruitmentPage)
def list_my_recruitments(
    user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> RecruitmentPage:
    service = RecruitmentService(db)
    items = db.scalars(
        select(Recruitment)
        .where(Recruitment.owner_id == user.id, Recruitment.deleted_at.is_(None))
        .order_by(Recruitment.created_at.desc())
    ).all()
    return RecruitmentPage(items=[service.summary(item) for item in items])


@router.get(
    "/me/recruitment-applications",
    operation_id="listMyRecruitmentApplications",
    response_model=ApplicationPage,
)
def list_my_applications(
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    application_status: Annotated[ApplicationStatus | None, Query(alias="status")] = None,
) -> ApplicationPage:
    statement = select(RecruitmentApplication).where(RecruitmentApplication.applicant_id == user.id)
    if application_status:
        statement = statement.where(RecruitmentApplication.status == application_status)
    service = RecruitmentService(db)
    return ApplicationPage(
        items=[
            service.application_view(item)
            for item in db.scalars(
                statement.order_by(RecruitmentApplication.created_at.desc())
            ).all()
        ]
    )
