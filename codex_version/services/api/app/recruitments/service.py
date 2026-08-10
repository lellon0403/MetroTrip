from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.identity.models import User
from app.planning.models import Plan
from app.recruitments.models import (
    ApplicationStatus,
    OutboxEvent,
    Recruitment,
    RecruitmentApplication,
    RecruitmentStatus,
)
from app.recruitments.schemas import (
    ApplicationView,
    RecruitmentDetail,
    RecruitmentSummary,
    RecruitmentWriteRequest,
)


class RecruitmentService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _get(self, recruitment_id: UUID, *, lock: bool = False) -> Recruitment:
        statement = select(Recruitment).where(
            Recruitment.id == recruitment_id, Recruitment.deleted_at.is_(None)
        )
        if lock:
            statement = statement.with_for_update()
        recruitment = self.db.scalar(statement)
        if not recruitment:
            raise ApiError(404, "RECRUITMENT_NOT_FOUND", "모집글을 찾을 수 없습니다.")
        return recruitment

    def _owner_name(self, owner_id: UUID) -> str:
        user = self.db.get(User, owner_id)
        return user.display_name if user else "탈퇴한 사용자"

    def _get_owned_active_plan(self, plan_id: UUID, owner_id: UUID) -> Plan:
        plan = self.db.get(Plan, plan_id)
        if not plan or plan.owner_id != owner_id or plan.deleted_at is not None:
            raise ApiError(422, "INVALID_RECRUITMENT_PLAN", "??? ?? ??? ??? ??? ? ????.")
        return plan

    def summary(self, item: Recruitment) -> RecruitmentSummary:
        return RecruitmentSummary(
            id=item.id,
            owner_id=item.owner_id,
            owner_name=self._owner_name(item.owner_id),
            plan_id=item.plan_id,
            title=item.title,
            body=item.body,
            capacity=item.capacity,
            accepted_count=item.accepted_count,
            deadline=item.deadline,
            meeting_at=item.meeting_at,
            status=item.status,
            version=item.version,
            created_at=item.created_at,
            view_count=item.view_count,
        )

    def list(
        self, query: str | None, status: RecruitmentStatus | None, limit: int, sort: str = "latest"
    ) -> list[Recruitment]:
        statement = select(Recruitment).where(Recruitment.deleted_at.is_(None))
        if query:
            pattern = f"%{query.strip()}%"
            statement = statement.where(
                or_(
                    Recruitment.title.ilike(pattern),
                    Recruitment.body.ilike(pattern),
                )
            )
        if status:
            statement = statement.where(Recruitment.status == status)
        if sort == "popular":
            order = (Recruitment.view_count.desc(), Recruitment.accepted_count.desc())
        elif sort == "closing":
            order = (Recruitment.deadline.asc(), Recruitment.created_at.desc())
        else:
            order = (Recruitment.created_at.desc(), Recruitment.id.desc())
        return list(
            self.db.scalars(
                statement.order_by(*order).limit(limit + 1)
            )
        )

    def detail(self, recruitment_id: UUID, viewer_id: UUID | None) -> RecruitmentDetail:
        item = self._get(recruitment_id)
        application = None
        item.view_count += 1
        self.db.commit()
        self.db.refresh(item)
        if viewer_id:
            application = self.db.scalar(
                select(RecruitmentApplication).where(
                    RecruitmentApplication.recruitment_id == item.id,
                    RecruitmentApplication.applicant_id == viewer_id,
                )
            )
        return RecruitmentDetail(
            **self.summary(item).model_dump(),
            my_application_status=application.status if application else None,
        )

    def create(self, owner_id: UUID, body: RecruitmentWriteRequest) -> Recruitment:
        self._get_owned_active_plan(body.plan_id, owner_id)
        if body.deadline <= datetime.now(UTC):
            raise ApiError(
                422, "RECRUITMENT_DEADLINE_PAST", "마감 시각은 현재보다 이후여야 합니다."
            )
        item = Recruitment(
            id=uuid4(),
            owner_id=owner_id,
            plan_id=body.plan_id,
            title=body.title,
            body=body.body,
            capacity=body.capacity,
            deadline=body.deadline,
            meeting_at=body.meeting_at,
        )
        self.db.add(item)
        self.db.commit()
        return item

    def update(
        self, recruitment_id: UUID, owner_id: UUID, version: int, body: RecruitmentWriteRequest
    ) -> Recruitment:
        item = self._get(recruitment_id, lock=True)
        if item.owner_id != owner_id:
            raise ApiError(403, "RECRUITMENT_FORBIDDEN", "모집글을 수정할 권한이 없습니다.")
        if item.version != version:
            raise ApiError(
                412, "RECRUITMENT_VERSION_CONFLICT", "모집글이 다른 곳에서 변경되었습니다."
            )
        if body.capacity < item.accepted_count:
            raise ApiError(409, "CAPACITY_BELOW_ACCEPTED", "수락 인원보다 정원을 줄일 수 없습니다.")
        self._get_owned_active_plan(body.plan_id, owner_id)
        item.plan_id = body.plan_id
        item.title, item.body, item.capacity = body.title, body.body, body.capacity
        item.deadline, item.meeting_at, item.version = (
            body.deadline,
            body.meeting_at,
            item.version + 1,
        )
        self.db.commit()
        return item

    def close(self, recruitment_id: UUID, owner_id: UUID) -> Recruitment:
        item = self._get(recruitment_id, lock=True)
        if item.owner_id != owner_id:
            raise ApiError(403, "RECRUITMENT_FORBIDDEN", "모집을 마감할 권한이 없습니다.")
        item.status = RecruitmentStatus.CLOSED
        item.version += 1
        self.db.commit()
        return item

    def delete(self, recruitment_id: UUID, owner_id: UUID) -> None:
        item = self._get(recruitment_id, lock=True)
        if item.owner_id != owner_id:
            raise ApiError(403, "RECRUITMENT_FORBIDDEN", "모집글을 삭제할 권한이 없습니다.")
        item.status = RecruitmentStatus.CANCELED
        item.deleted_at = datetime.now(UTC)
        self.db.add(
            OutboxEvent(
                id=uuid4(),
                event_type="recruitment.canceled",
                aggregate_type="recruitment",
                aggregate_id=item.id,
                payload={
                    "recruitmentId": str(item.id),
                    "recipientIds": [
                        str(application.applicant_id) for application in item.applications
                    ],
                },
            )
        )
        self.db.commit()

    def apply(
        self, recruitment_id: UUID, applicant_id: UUID, message: str | None
    ) -> RecruitmentApplication:
        item = self._get(recruitment_id, lock=True)
        if item.owner_id == applicant_id:
            raise ApiError(409, "OWNER_CANNOT_APPLY", "본인 모집에는 신청할 수 없습니다.")
        if item.status is not RecruitmentStatus.OPEN or item.deadline <= datetime.now(UTC):
            raise ApiError(409, "RECRUITMENT_CLOSED", "마감된 모집입니다.")
        existing = self.db.scalar(
            select(RecruitmentApplication).where(
                RecruitmentApplication.recruitment_id == item.id,
                RecruitmentApplication.applicant_id == applicant_id,
            )
        )
        if existing and existing.status is not ApplicationStatus.CANCELED:
            raise ApiError(409, "APPLICATION_EXISTS", "이미 신청한 모집입니다.")
        if existing:
            existing.status, existing.message = ApplicationStatus.APPLIED, message
            application = existing
        else:
            application = RecruitmentApplication(
                id=uuid4(), recruitment_id=item.id, applicant_id=applicant_id, message=message
            )
            self.db.add(application)
        self.db.add(
            OutboxEvent(
                id=uuid4(),
                event_type="recruitment.applied",
                aggregate_type="recruitment",
                aggregate_id=item.id,
                payload={"recipientId": str(item.owner_id), "applicantId": str(applicant_id)},
            )
        )
        self.db.commit()
        return application

    def decide(
        self,
        recruitment_id: UUID,
        application_id: UUID,
        owner_id: UUID,
        decision: ApplicationStatus,
    ) -> RecruitmentApplication:
        if decision not in {ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED}:
            raise ApiError(
                422, "INVALID_APPLICATION_DECISION", "수락 또는 거절만 선택할 수 있습니다."
            )
        item = self._get(recruitment_id, lock=True)
        if item.owner_id != owner_id:
            raise ApiError(403, "RECRUITMENT_FORBIDDEN", "신청을 처리할 권한이 없습니다.")
        application = self.db.scalar(
            select(RecruitmentApplication)
            .where(
                RecruitmentApplication.id == application_id,
                RecruitmentApplication.recruitment_id == item.id,
            )
            .with_for_update()
        )
        if not application:
            raise ApiError(404, "APPLICATION_NOT_FOUND", "신청을 찾을 수 없습니다.")
        if application.status is not ApplicationStatus.APPLIED:
            raise ApiError(409, "APPLICATION_STATE_CONFLICT", "이미 처리된 신청입니다.")
        if decision is ApplicationStatus.ACCEPTED:
            if item.status is not RecruitmentStatus.OPEN or item.accepted_count >= item.capacity:
                raise ApiError(409, "CAPACITY_REACHED", "모집 정원이 모두 찼습니다.")
            item.accepted_count += 1
            if item.accepted_count == item.capacity:
                item.status = RecruitmentStatus.CLOSED
        application.status = decision
        item.version += 1
        self.db.add(
            OutboxEvent(
                id=uuid4(),
                event_type=f"recruitment.application.{decision.value.lower()}",
                aggregate_type="recruitment",
                aggregate_id=item.id,
                payload={
                    "recipientId": str(application.applicant_id),
                    "applicationId": str(application.id),
                },
            )
        )
        self.db.commit()
        return application

    def cancel_application(
        self, recruitment_id: UUID, applicant_id: UUID
    ) -> RecruitmentApplication:
        item = self._get(recruitment_id, lock=True)
        application = self.db.scalar(
            select(RecruitmentApplication)
            .where(
                RecruitmentApplication.recruitment_id == item.id,
                RecruitmentApplication.applicant_id == applicant_id,
            )
            .with_for_update()
        )
        if not application or application.status not in {
            ApplicationStatus.APPLIED,
            ApplicationStatus.ACCEPTED,
        }:
            raise ApiError(409, "APPLICATION_STATE_CONFLICT", "취소할 수 있는 신청이 없습니다.")
        if application.status is ApplicationStatus.ACCEPTED:
            item.accepted_count -= 1
            if item.status is RecruitmentStatus.CLOSED and item.deadline > datetime.now(UTC):
                item.status = RecruitmentStatus.OPEN
        application.status = ApplicationStatus.CANCELED
        item.version += 1
        self.db.commit()
        return application

    def application_view(self, application: RecruitmentApplication) -> ApplicationView:
        user = self.db.get(User, application.applicant_id)
        return ApplicationView(
            id=application.id,
            recruitment_id=application.recruitment_id,
            applicant_id=application.applicant_id,
            applicant_name=user.display_name if user else "탈퇴한 사용자",
            message=application.message,
            status=application.status,
            created_at=application.created_at,
            updated_at=application.updated_at,
        )
