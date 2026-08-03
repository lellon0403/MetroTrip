"""Line, station, timetable, and place API contracts."""

from typing import Annotated

from fastapi import APIRouter, Query, status
from fastapi.responses import JSONResponse

from app.routers.contract import AUTH_REQUIRED, ERROR_RESPONSES, not_implemented
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

router = APIRouter(tags=["노선·역·장소"])
admin_router = APIRouter(
    prefix="/admin/places",
    tags=["관리자"],
    dependencies=AUTH_REQUIRED,
)


@router.get(
    "/lines",
    response_model=LineListResponse,
    summary="노선 목록 조회",
    responses=ERROR_RESPONSES,
)
def list_lines() -> JSONResponse:
    return not_implemented()


@router.get(
    "/lines/suggestions",
    response_model=LineSuggestionResponse,
    summary="노선 추천 조회",
    description="최근 1시간의 노선 조회 기록을 기준으로 추천합니다.",
    responses=ERROR_RESPONSES,
)
def suggest_lines() -> JSONResponse:
    return not_implemented()


@router.post(
    "/lines/{line_id}/views",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="노선 조회 기록",
    responses=ERROR_RESPONSES,
)
def record_line_view(line_id: int) -> JSONResponse:
    return not_implemented()


@router.get(
    "/stations",
    response_model=StationListResponse,
    summary="역 목록 및 이름 검색",
    responses=ERROR_RESPONSES,
)
def list_stations(
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    line_id: Annotated[int | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> JSONResponse:
    return not_implemented()


@router.get(
    "/stations/{station_id}",
    response_model=StationDetailResponse,
    summary="역 상세 조회",
    responses=ERROR_RESPONSES,
)
def get_station(station_id: int) -> JSONResponse:
    return not_implemented()


@router.get(
    "/stations/{station_id}/timetables",
    response_model=TimetableListResponse,
    summary="역 시간표 조회",
    description="실시간 위치가 아닌 DB 시간표 정보를 반환합니다.",
    responses=ERROR_RESPONSES,
)
def list_timetables(
    station_id: int,
    line_id: Annotated[int, Query()],
    day_type: Annotated[DayType, Query()],
    direction: Annotated[Direction, Query()],
) -> JSONResponse:
    return not_implemented()


@router.get(
    "/stations/{station_id}/places",
    response_model=PlaceListResponse,
    summary="역 주변 장소 조회",
    responses=ERROR_RESPONSES,
)
def list_station_places(
    station_id: int,
    category: Annotated[PlaceCategory | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> JSONResponse:
    return not_implemented()


@admin_router.post(
    "",
    response_model=PlaceAdminResponse,
    status_code=status.HTTP_201_CREATED,
    summary="장소 추가",
    responses=ERROR_RESPONSES,
)
def create_place(_: PlaceUpsertRequest) -> JSONResponse:
    return not_implemented()


@admin_router.patch(
    "/{place_id}",
    response_model=PlaceAdminResponse,
    summary="장소 수정",
    responses=ERROR_RESPONSES,
)
def update_place(place_id: int, _: PlaceUpdateRequest) -> JSONResponse:
    return not_implemented()


@admin_router.delete(
    "/{place_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="장소 삭제",
    responses=ERROR_RESPONSES,
)
def delete_place(place_id: int) -> JSONResponse:
    return not_implemented()
