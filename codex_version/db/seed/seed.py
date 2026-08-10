import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[2]
API_ROOT = ROOT / "services" / "api"
IMPORT_ROOT = ROOT / "db" / "import"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))
if str(IMPORT_ROOT) not in sys.path:
    sys.path.insert(0, str(IMPORT_ROOT))

from app.identity.models import User, UserRole
from app.identity.service import IdentityService
from app.infrastructure.database import SessionLocal
from app.operations.models import Notice, PublicationStatus
from app.planning.models import Plan
from app.planning.schemas import PlanWriteRequest
from app.planning.service import PlanningService
from app.recruitments.models import Recruitment
from app.recruitments.schemas import RecruitmentWriteRequest
from app.recruitments.service import RecruitmentService
from app.reviews.models import Review
from app.reviews.schemas import ReviewWriteRequest
from app.reviews.service import ReviewService
from app.transit.models import Station
from import_places import import_places
from import_transit import import_fixture


def seed_identity() -> None:
    accounts = (
        ("demo@example.com", "DemoPass1234", "여행자", UserRole.USER),
        ("admin@example.com", "AdminPass1234", "운영자", UserRole.ADMIN),
    )
    with SessionLocal() as db:
        service = IdentityService(db)
        for email, password, display_name, role in accounts:
            user = db.scalar(select(User).where(User.email == email))
            if not user:
                user, _ = service.register(
                    email, password, display_name, "seed", "127.0.0.1"
                )
            user.role = role
        db.commit()


def seed_product_examples() -> None:
    with SessionLocal() as db:
        demo = db.scalar(select(User).where(User.email == "demo@example.com"))
        admin = db.scalar(select(User).where(User.email == "admin@example.com"))
        stations = list(db.scalars(select(Station).order_by(Station.sequence).limit(2)))
        if not demo or not admin or len(stations) < 2:
            raise RuntimeError("identity and transit seed must run first")
        today = datetime.now(UTC).date()
        plan = db.scalar(
            select(Plan).where(
                Plan.owner_id == demo.id, Plan.title == "천안·아산 파일럿 여행"
            )
        )
        if not plan:
            plan = PlanningService(db).create(
                demo.id,
                PlanWriteRequest.model_validate(
                    {
                        "title": "천안·아산 파일럿 여행",
                        "description": "발견부터 후기와 동행까지 확인하는 로컬 예시 일정",
                        "startDate": today.isoformat(),
                        "endDate": today.isoformat(),
                        "status": "ACTIVE",
                        "days": [
                            {
                                "dayDate": today.isoformat(),
                                "title": "당일 여행",
                                "items": [
                                    {
                                        "itemType": "STATION",
                                        "stationId": str(stations[0].id),
                                    },
                                    {
                                        "itemType": "NOTE",
                                        "note": "역 주변 장소를 둘러봅니다.",
                                    },
                                ],
                            }
                        ],
                    }
                ),
            )
        if not db.scalar(
            select(Review).where(
                Review.author_id == demo.id, Review.title == "천안에서 시작한 하루"
            )
        ):
            ReviewService(db).create(
                demo.id,
                ReviewWriteRequest.model_validate(
                    {
                        "title": "천안에서 시작한 하루",
                        "planId": str(plan.id),
                        "originStationId": str(stations[0].id),
                        "destinationStationId": str(stations[1].id),
                        "rating": "4.5",
                        "travelDate": today.isoformat(),
                        "costWon": 35000,
                        "blocks": [
                            {
                                "kind": "PARAGRAPH",
                                "text": (
                                    "fixture 데이터로 발견한 장소와 이동 흐름을 "
                                    "검증한 예시 후기입니다."
                                ),
                            }
                        ],
                        "tags": ["당일치기", "천안아산"],
                    }
                ),
            )
        if not db.scalar(
            select(Recruitment).where(
                Recruitment.owner_id == demo.id, Recruitment.title == "주말 온천 동행"
            )
        ):
            now = datetime.now(UTC)
            RecruitmentService(db).create(
                demo.id,
                RecruitmentWriteRequest(
                    plan_id=plan.id,
                    title="주말 온천 동행",
                    body="천안에서 출발해 아산 온천 주변을 함께 둘러볼 동행을 찾습니다.",
                    capacity=3,
                    deadline=now + timedelta(days=2),
                    meeting_at=now + timedelta(days=3),
                ),
            )
        if not db.scalar(select(Notice).where(Notice.title == "천안·아산 파일럿 안내")):
            db.add(
                Notice(
                    author_id=admin.id,
                    title="천안·아산 파일럿 안내",
                    body=(
                        "현재 장소·경로·시간표 일부는 개발 fixture이며 "
                        "화면에 근거 상태를 표시합니다."
                    ),
                    status=PublicationStatus.PUBLISHED,
                    published_at=datetime.now(UTC),
                )
            )
            db.commit()


if __name__ == "__main__":
    print(import_fixture())
    print(import_places())
    seed_identity()
    seed_product_examples()
    print("Seed complete: transit/place fixture, local accounts, and product examples")
