"""노선, 역, 시간표, 장소 API."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.contract import (
    ADMIN_REQUIRED,
    ERROR_RESPONSES,
    CurrentAdminId,
    OptionalCurrentUserId,
)
from app.schemas.common import MessageResponse
from app.schemas.transit import (
    DayType,
    Direction,
    LineListResponse,
    LineSuggestionResponse,
    PlaceAdminResponse,
    PlaceCategory,
    PlaceListResponse,
    PlaceUpdateRequest,
    PlaceUpsertRequest,
    StationDetailResponse,
    StationListResponse,
    TimetableListResponse,
)
from app.services import transit as transit_service

router = APIRouter(tags=["노선·역·장소"])
admin_router = APIRouter(
    prefix="/admin/places",
    tags=["관리자"],
    dependencies=ADMIN_REQUIRED,
)
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.get(
    "/lines",
    response_model=LineListResponse,
    summary="노선 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_lines(db: DatabaseSession) -> LineListResponse:
    """DB에 등록된 노선 목록을 화면 표시 순서대로 반환한다."""
    return transit_service.list_lines(db)


@router.get(
    "/lines/suggestions",
    response_model=LineSuggestionResponse,
    summary="노선 추천 조회",
    description="최근 1시간의 노선 조회 기록을 기준으로 추천합니다.",
    responses=ERROR_RESPONSES,
)
def suggest_lines(db: DatabaseSession) -> LineSuggestionResponse:
    """최근 1시간 조회수가 높은 상위 세 개 노선을 반환한다."""
    return transit_service.suggest_lines(db)


@router.post(
    "/lines/{line_id}/views",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="노선 조회 기록",
    responses=ERROR_RESPONSES,
    openapi_extra={"security": [{"HTTPBearer": []}, {}]},
)
def record_line_view(
    line_id: int,
    user_id: OptionalCurrentUserId,
    db: DatabaseSession,
) -> MessageResponse:
    """회원 또는 비회원의 노선 조회 기록을 저장한다."""
    transit_service.record_line_view(db, line_id, user_id)
    return MessageResponse(message="노선 조회 기록이 저장되었습니다.")


@router.get(
    "/stations",
    response_model=StationListResponse,
    summary="역 목록 및 이름 검색",
    responses=ERROR_RESPONSES,
)
def list_stations(
    db: DatabaseSession,
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    line_id: Annotated[int | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> StationListResponse:
    """역 목록과 이름·노선 필터 결과를 페이지 단위로 반환한다."""
    return transit_service.list_stations(
        db,
        keyword=keyword,
        line_id=line_id,
        page=page,
        size=size,
    )


@router.get(
    "/stations/{station_id}",
    response_model=StationDetailResponse,
    summary="역 상세 조회",
    responses=ERROR_RESPONSES,
)
def get_station(
    station_id: int,
    db: DatabaseSession,
) -> StationDetailResponse:
    """역의 좌표, 주소, 소속 노선을 반환한다."""
    return transit_service.get_station(db, station_id)


@router.get(
    "/stations/{station_id}/timetables",
    response_model=TimetableListResponse,
    summary="역 시간표 조회",
    description="실시간 위치가 아닌 DB 시간표 정보를 반환합니다.",
    responses=ERROR_RESPONSES,
)
def list_timetables(
    station_id: int,
    db: DatabaseSession,
    line_id: Annotated[int, Query()],
    day_type: Annotated[DayType, Query()],
    direction: Annotated[Direction, Query()],
) -> TimetableListResponse:
    """역·노선·요일·방향에 맞는 DB 시간표를 반환한다."""
    return transit_service.list_timetables(
        db,
        station_id,
        line_id=line_id,
        day_type=day_type,
        direction=direction,
    )


@router.get(
    "/stations/{station_id}/places",
    response_model=PlaceListResponse,
    summary="역 주변 장소 조회",
    responses=ERROR_RESPONSES,
)
def list_station_places(
    station_id: int,
    db: DatabaseSession,
    category: Annotated[PlaceCategory | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PlaceListResponse:
    """역 반경 1km 내 추천 장소를 페이지 단위로 반환한다."""
    return transit_service.list_station_places(
        db,
        station_id,
        category=category,
        page=page,
        size=size,
    )


@admin_router.post(
    "",
    response_model=PlaceAdminResponse,
    status_code=status.HTTP_201_CREATED,
    summary="장소 추가",
    responses=ERROR_RESPONSES,
)
def create_place(
    request: PlaceUpsertRequest,
    db: DatabaseSession,
    admin_id: CurrentAdminId,
) -> PlaceAdminResponse:
    """관리자가 새 추천 장소를 등록한다."""
    return transit_service.create_place(db, admin_id, request)


@admin_router.patch(
    "/{place_id}",
    response_model=PlaceAdminResponse,
    summary="장소 수정",
    responses=ERROR_RESPONSES,
)
def update_place(
    place_id: int,
    request: PlaceUpdateRequest,
    db: DatabaseSession,
) -> PlaceAdminResponse:
    """관리자가 추천 장소의 일부 정보를 수정한다."""
    return transit_service.update_place(db, place_id, request)


@admin_router.delete(
    "/{place_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="장소 삭제",
    responses=ERROR_RESPONSES,
)
def delete_place(place_id: int, db: DatabaseSession) -> None:
    """관리자가 추천 장소를 삭제한다."""
    transit_service.delete_place(db, place_id)
