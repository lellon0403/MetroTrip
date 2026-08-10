from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.infrastructure.database import get_db
from app.routing.schemas import RouteCompareRequest, RouteComparison
from app.routing.service import RoutingService

router = APIRouter(prefix="/routes", tags=["routing"])


@router.post("/compare", operation_id="compareRoutes", response_model=RouteComparison)
def compare_routes(
    body: RouteCompareRequest, db: Annotated[Session, Depends(get_db)]
) -> RouteComparison:
    return RoutingService(db).compare(body)
