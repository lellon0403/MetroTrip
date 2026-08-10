import hashlib
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.crypto import encrypt_secret
from app.core.errors import ApiError
from app.discovery.models import Place, PlaceDataStatus
from app.discovery.repository import DiscoveryRepository
from app.discovery.router import _place_summary
from app.identity.dependencies import AdminUser, CurrentUser
from app.infrastructure.database import get_db
from app.operations.models import (
    AuditLog,
    ContentReport,
    Notice,
    NoticeKind,
    PublicationStatus,
    PushDevice,
    ReportStatus,
)
from app.operations.schemas import (
    DataSyncRequest,
    DataSyncResult,
    DeviceRegister,
    DeviceView,
    HomeResponse,
    NoticePage,
    NoticeView,
    NoticeWrite,
    ReportAction,
    ReportCreate,
    ReportPage,
    ReportView,
)
from app.recruitments.models import OutboxEvent, Recruitment, RecruitmentStatus
from app.recruitments.service import RecruitmentService
from app.reviews.models import Review, ReviewStatus

router = APIRouter(tags=["operations"])


@router.get("/home", operation_id="getHome", response_model=HomeResponse)
def get_home(db: Annotated[Session, Depends(get_db)]) -> HomeResponse:
    discovery = DiscoveryRepository(db)
    recommended_rows = discovery.featured_places(limit=6, popular=False)
    popular_rows = discovery.featured_places(limit=6, popular=True)
    recruitments = RecruitmentService(db)
    now = datetime.now(UTC)
    active_events = list(
        db.scalars(
            select(Notice)
            .where(
                Notice.status == PublicationStatus.PUBLISHED,
                Notice.kind == NoticeKind.EVENT,
                or_(Notice.starts_at.is_(None), Notice.starts_at <= now),
                or_(Notice.ends_at.is_(None), Notice.ends_at >= now),
            )
            .order_by(Notice.starts_at.asc().nullslast(), Notice.published_at.desc())
            .limit(4)
        )
    )
    notices = list(
        db.scalars(
            select(Notice)
            .where(
                Notice.status == PublicationStatus.PUBLISHED,
                Notice.kind == NoticeKind.NOTICE,
            )
            .order_by(Notice.published_at.desc(), Notice.id.desc())
            .limit(4)
        )
    )
    return HomeResponse(
        recommended_places=[
            _place_summary(place, latitude, longitude, favorite_count=favorites)
            for place, latitude, longitude, favorites in recommended_rows
        ],
        popular_places=[
            _place_summary(place, latitude, longitude, favorite_count=favorites)
            for place, latitude, longitude, favorites in popular_rows
        ],
        latest_recruitments=[
            recruitments.summary(item)
            for item in recruitments.list(None, RecruitmentStatus.OPEN, 4, "latest")[:4]
        ],
        popular_recruitments=[
            recruitments.summary(item)
            for item in recruitments.list(None, RecruitmentStatus.OPEN, 4, "popular")[:4]
        ],
        active_events=[NoticeView.model_validate(item) for item in active_events],
        notices=[NoticeView.model_validate(item) for item in notices],
    )



def _audit(
    db: Session,
    actor_id: UUID,
    action: str,
    resource_type: str,
    resource_id: UUID,
    reason: str,
    metadata: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            id=uuid4(),
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            reason=reason,
            metadata_json=metadata or {},
        )
    )


@router.get("/notices", operation_id="listNotices", response_model=NoticePage)
def list_notices(
    db: Annotated[Session, Depends(get_db)],
    kind: Annotated[NoticeKind | None, Query()] = None,
) -> NoticePage:
    statement = select(Notice).where(Notice.status == PublicationStatus.PUBLISHED)
    if kind:
        statement = statement.where(Notice.kind == kind)
    items = db.scalars(
        statement.order_by(Notice.published_at.desc(), Notice.id.desc())
    ).all()
    return NoticePage(items=[NoticeView.model_validate(item) for item in items])


@router.get("/notices/{notice_id}", operation_id="getNotice", response_model=NoticeView)
def get_notice(notice_id: UUID, db: Annotated[Session, Depends(get_db)]) -> NoticeView:
    notice = db.get(Notice, notice_id)
    if not notice or notice.status is not PublicationStatus.PUBLISHED:
        raise ApiError(404, "NOTICE_NOT_FOUND", "공지를 찾을 수 없습니다.")
    return NoticeView.model_validate(notice)


@router.get("/admin/notices", operation_id="adminListNotices", response_model=NoticePage)
def admin_list_notices(_admin: AdminUser, db: Annotated[Session, Depends(get_db)]) -> NoticePage:
    return NoticePage(
        items=[
            NoticeView.model_validate(item)
            for item in db.scalars(select(Notice).order_by(Notice.created_at.desc())).all()
        ]
    )


@router.post(
    "/admin/notices", operation_id="adminCreateNotice", response_model=NoticeView, status_code=201
)
def admin_create_notice(
    body: NoticeWrite, admin: AdminUser, db: Annotated[Session, Depends(get_db)]
) -> NoticeView:
    notice = Notice(
        id=uuid4(),
        author_id=admin.id,
        title=body.title,
        body=body.body,
        status=body.status,
        published_at=datetime.now(UTC) if body.status is PublicationStatus.PUBLISHED else None,
        kind=body.kind,
        banner_url=body.banner_url,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
    )
    db.add(notice)
    _audit(
        db,
        admin.id,
        "notice.create",
        "notice",
        notice.id,
        "관리자 공지 생성",
        {"status": body.status},
    )
    db.commit()
    db.refresh(notice)
    return NoticeView.model_validate(notice)


@router.put(
    "/admin/notices/{notice_id}", operation_id="adminUpdateNotice", response_model=NoticeView
)
def admin_update_notice(
    notice_id: UUID, body: NoticeWrite, admin: AdminUser, db: Annotated[Session, Depends(get_db)]
) -> NoticeView:
    notice = db.get(Notice, notice_id)
    if not notice:
        raise ApiError(404, "NOTICE_NOT_FOUND", "공지를 찾을 수 없습니다.")
    was_published = notice.status is PublicationStatus.PUBLISHED
    notice.title, notice.body, notice.status = body.title, body.body, body.status
    if body.status is PublicationStatus.PUBLISHED and not was_published:
        notice.published_at = datetime.now(UTC)
    notice.kind = body.kind
    notice.banner_url = body.banner_url
    notice.starts_at = body.starts_at
    notice.ends_at = body.ends_at
    _audit(
        db,
        admin.id,
        "notice.update",
        "notice",
        notice.id,
        "관리자 공지 수정",
        {"status": body.status},
    )
    db.commit()
    return NoticeView.model_validate(notice)


def _create_report(
    resource_type: str, resource_id: UUID, body: ReportCreate, user_id: UUID, db: Session
) -> ReportView:
    if resource_type == "review" and not db.get(Review, resource_id):
        raise ApiError(404, "REVIEW_NOT_FOUND", "후기를 찾을 수 없습니다.")
    if resource_type == "recruitment" and not db.get(Recruitment, resource_id):
        raise ApiError(404, "RECRUITMENT_NOT_FOUND", "모집글을 찾을 수 없습니다.")
    report = ContentReport(
        id=uuid4(),
        reporter_id=user_id,
        resource_type=resource_type,
        resource_id=resource_id,
        reason=body.reason,
        detail=body.detail,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return ReportView.model_validate(report)


@router.post(
    "/reviews/{review_id}/reports",
    operation_id="reportReview",
    response_model=ReportView,
    status_code=201,
)
def report_review(
    review_id: UUID, body: ReportCreate, user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> ReportView:
    return _create_report("review", review_id, body, user.id, db)


@router.post(
    "/recruitments/{recruitment_id}/reports",
    operation_id="reportRecruitment",
    response_model=ReportView,
    status_code=201,
)
def report_recruitment(
    recruitment_id: UUID,
    body: ReportCreate,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> ReportView:
    return _create_report("recruitment", recruitment_id, body, user.id, db)


@router.get("/admin/reports", operation_id="adminListReports", response_model=ReportPage)
def admin_list_reports(
    _admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
    report_status: Annotated[ReportStatus | None, Query(alias="status")] = None,
) -> ReportPage:
    statement = select(ContentReport)
    if report_status:
        statement = statement.where(ContentReport.status == report_status)
    return ReportPage(
        items=[
            ReportView.model_validate(item)
            for item in db.scalars(statement.order_by(ContentReport.created_at)).all()
        ]
    )


@router.post(
    "/admin/reports/{report_id}/actions",
    operation_id="adminResolveReport",
    response_model=ReportView,
)
def admin_resolve_report(
    report_id: UUID, body: ReportAction, admin: AdminUser, db: Annotated[Session, Depends(get_db)]
) -> ReportView:
    report = db.get(ContentReport, report_id)
    if not report:
        raise ApiError(404, "REPORT_NOT_FOUND", "신고를 찾을 수 없습니다.")
    if body.status not in {ReportStatus.RESOLVED, ReportStatus.DISMISSED}:
        raise ApiError(422, "INVALID_REPORT_ACTION", "처리 완료 또는 기각을 선택해 주세요.")
    if body.hide_content:
        if report.resource_type == "review":
            review = db.get(Review, report.resource_id)
            if review:
                review.status = ReviewStatus.HIDDEN
        elif report.resource_type == "recruitment":
            recruitment = db.get(Recruitment, report.resource_id)
            if recruitment:
                recruitment.status = RecruitmentStatus.CANCELED
    report.status, report.resolved_at = body.status, datetime.now(UTC)
    _audit(
        db,
        admin.id,
        "moderation.resolve",
        report.resource_type,
        report.resource_id,
        body.reason,
        {"reportId": str(report.id), "hidden": body.hide_content},
    )
    db.commit()
    return ReportView.model_validate(report)


@router.get("/admin/places", operation_id="adminListPlaces")
def admin_list_places(_admin: AdminUser, db: Annotated[Session, Depends(get_db)]) -> list[dict]:
    return [
        {"id": str(place.id), "name": place.name, "dataStatus": place.data_status}
        for place in db.scalars(select(Place).order_by(Place.name)).all()
    ]


@router.post("/admin/places/{place_id}/verify", operation_id="adminVerifyPlace")
def admin_verify_place(
    place_id: UUID, admin: AdminUser, db: Annotated[Session, Depends(get_db)]
) -> dict:
    place = db.get(Place, place_id)
    if not place:
        raise ApiError(404, "PLACE_NOT_FOUND", "장소를 찾을 수 없습니다.")
    place.data_status = PlaceDataStatus.VERIFIED
    _audit(db, admin.id, "place.verify", "place", place.id, "관리자 장소 검증")
    db.commit()
    return {"id": str(place.id), "dataStatus": place.data_status}


@router.post(
    "/admin/data-sync-jobs",
    operation_id="adminStartDataSync",
    response_model=DataSyncResult,
    status_code=202,
)
def admin_start_data_sync(
    body: DataSyncRequest, admin: AdminUser, db: Annotated[Session, Depends(get_db)]
) -> DataSyncResult:
    job_id = uuid4()
    if not body.dry_run:
        db.add(
            OutboxEvent(
                id=job_id,
                event_type="data-sync.requested",
                aggregate_type="data-sync",
                aggregate_id=job_id,
                payload=body.model_dump(mode="json"),
            )
        )
    _audit(
        db,
        admin.id,
        "data-sync.request",
        "data-sync",
        job_id,
        "데이터 동기화 요청",
        body.model_dump(mode="json"),
    )
    db.commit()
    return DataSyncResult(
        job_id=job_id,
        source=body.source,
        dry_run=body.dry_run,
        status="VALIDATED" if body.dry_run else "QUEUED",
        message="dry-run은 데이터 변경 없이 입력과 작업 잠금을 검증합니다."
        if body.dry_run
        else "outbox worker 실행 대기 중입니다.",
    )


@router.get("/admin/audit-logs", operation_id="adminListAuditLogs")
def admin_list_audit_logs(
    _admin: AdminUser,
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[dict]:
    items = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)).all()
    return [
        {
            "id": str(item.id),
            "actorId": str(item.actor_id),
            "action": item.action,
            "resourceType": item.resource_type,
            "resourceId": str(item.resource_id),
            "reason": item.reason,
            "metadata": item.metadata_json,
            "createdAt": item.created_at,
        }
        for item in items
    ]


@router.post(
    "/devices", operation_id="registerPushDevice", response_model=DeviceView, status_code=201
)
def register_push_device(
    body: DeviceRegister,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> DeviceView:
    fingerprint = hashlib.sha256(body.push_token.encode()).hexdigest()
    device = db.scalar(select(PushDevice).where(PushDevice.token_fingerprint == fingerprint))
    if device and device.user_id != user.id:
        raise ApiError(409, "PUSH_TOKEN_IN_USE", "다른 계정에 연결된 기기 토큰입니다.")
    if not device:
        device = PushDevice(
            id=uuid4(),
            user_id=user.id,
            platform=body.platform,
            token_fingerprint=fingerprint,
            token_ciphertext=encrypt_secret(body.push_token),
            locale=body.locale,
            app_version=body.app_version,
        )
        db.add(device)
    else:
        device.platform = body.platform
        device.token_ciphertext = encrypt_secret(body.push_token)
        device.locale = body.locale
        device.app_version = body.app_version
        device.last_seen_at = datetime.now(UTC)
        device.revoked_at = None
    db.commit()
    db.refresh(device)
    return DeviceView.model_validate(device)


@router.delete("/devices/{device_id}", operation_id="removePushDevice", status_code=204)
def remove_push_device(
    device_id: UUID,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    device = db.get(PushDevice, device_id)
    if not device or device.user_id != user.id:
        raise ApiError(404, "DEVICE_NOT_FOUND", "기기를 찾을 수 없습니다.")
    device.revoked_at = datetime.now(UTC)
    db.commit()
    return Response(status_code=204)
