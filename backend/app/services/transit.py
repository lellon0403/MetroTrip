"""지하철 노선, 역, 시간표, 주변 장소 비즈니스 로직."""

import math
from datetime import datetime, time, timedelta, timezone
from enum import Enum

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.transit import Place, PlaceImage, Station
from app.repositories.transit import TransitRepository
from app.schemas.transit import (
    DayType,
    Direction,
    LineListResponse,
    LineStationListResponse,
    LineStationResponse,
    LineSuggestionResponse,
    PlaceAdminListResponse,
    PlaceAdminResponse,
    PlaceCategory,
    PlaceImageResponse,
    PlaceListResponse,
    PlaceResponse,
    PlaceUpdateRequest,
    PlaceUpsertRequest,
    StationDetailResponse,
    StationListResponse,
    StationSummary,
    TimetableListResponse,
    TimetableResponse,
)

RECOMMENDED_LINE_LIMIT = 3
RECOMMENDATION_LOOKBACK = timedelta(hours=1)


def _error(code: str, message: str, status_code: int) -> HTTPException:
    """노선 서비스 오류를 공통 API 오류 형식으로 만든다."""
    return HTTPException(
        status_code,
        detail=message,
        headers={"X-Error-Code": code},
    )


def _find_station(
    repository: TransitRepository,
    station_id: int,
) -> Station:
    """역을 조회하고 없으면 404 오류를 발생시킨다."""
    station = repository.find_station_by_id(station_id)
    if not station:
        raise _error("STATION_NOT_FOUND", "역을 찾을 수 없습니다.", 404)
    return station


def _find_place(
    repository: TransitRepository,
    place_id: int,
    *,
    for_update: bool = False,
) -> Place:
    """장소를 조회하고 존재하지 않으면 404 오류를 발생시킨다."""
    place = repository.find_place_by_id(place_id, for_update=for_update)
    if not place:
        raise _error("PLACE_NOT_FOUND", "장소를 찾을 수 없습니다.", 404)
    return place


def _normalize_station_ids(station_ids: list[int]) -> list[int]:
    """역 ID의 최초 요청 순서를 유지하면서 중복을 제거한다."""
    return list(dict.fromkeys(station_ids))


def _require_stations(
    repository: TransitRepository,
    station_ids: list[int],
) -> None:
    """요청한 모든 역이 존재하는지 확인하고 누락된 역을 오류로 반환한다."""
    requested_ids = set(station_ids)
    missing_ids = requested_ids - repository.existing_station_ids(requested_ids)
    if missing_ids:
        raise _error(
            "STATION_NOT_FOUND",
            f"존재하지 않는 역입니다: {sorted(missing_ids)}",
            400,
        )


def _format_timetable_time(value: str | time | timedelta | None) -> str | None:
    """DB 시각을 24시 이후 값도 보존하는 HH:MM:SS 문자열로 변환한다."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, time):
        return value.strftime("%H:%M:%S")

    total_seconds = int(value.total_seconds())
    sign = "-" if total_seconds < 0 else ""
    total_seconds = abs(total_seconds)
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{sign}{hours:02d}:{minutes:02d}:{seconds:02d}"


def _build_place_response(
    place: Place,
    images: list[PlaceImage],
) -> PlaceResponse:
    """장소 엔티티와 이미지를 API 응답으로 조립한다."""
    return PlaceResponse(
        place_id=place.place_id,
        place_name=place.place_name,
        category=place.category,
        description=place.description,
        address=place.address,
        latitude=float(place.latitude),
        longitude=float(place.longitude),
        phone=place.phone,
        images=[
            PlaceImageResponse(
                image_url=image.image_url,
                sort_order=image.sort_order,
            )
            for image in images
        ],
    )


def _build_place_admin_response(
    repository: TransitRepository,
    place: Place,
) -> PlaceAdminResponse:
    """장소와 이미지·접근역·등록 정보를 관리자 응답으로 조립한다."""
    images = repository.list_place_images([place.place_id])
    public_response = _build_place_response(place, images)
    return PlaceAdminResponse(
        **public_response.model_dump(),
        station_ids=repository.list_place_station_ids(place.place_id),
        created_by=place.created_by,
        created_at=place.created_at,
        updated_at=place.updated_at,
    )


def list_lines(db: Session) -> LineListResponse:
    """모든 지하철 노선을 화면 표시 순서대로 반환한다."""
    lines = TransitRepository(db).list_lines()
    return LineListResponse(items=lines)


def suggest_lines(db: Session) -> LineSuggestionResponse:
    """최근 1시간 조회수가 높은 노선 중 상위 세 개를 반환한다."""
    viewed_since = (
        datetime.now(timezone.utc).replace(tzinfo=None) - RECOMMENDATION_LOOKBACK
    )
    lines = TransitRepository(db).list_suggested_lines(
        viewed_since,
        RECOMMENDED_LINE_LIMIT,
    )
    return LineSuggestionResponse(items=lines, basis="RECENT_VIEWS")


def record_line_view(
    db: Session,
    line_id: int,
    user_id: int | None,
) -> None:
    """존재하는 노선의 회원 또는 비회원 조회 기록을 저장한다."""
    repository = TransitRepository(db)
    if not repository.find_line_by_id(line_id):
        raise _error("LINE_NOT_FOUND", "노선을 찾을 수 없습니다.", 404)
    repository.create_line_view(line_id, user_id)
    db.commit()


def list_stations(
    db: Session,
    *,
    keyword: str | None,
    line_id: int | None,
    page: int,
    size: int,
) -> StationListResponse:
    """이름·노선 필터에 맞는 역과 좌표를 페이지 단위로 반환한다."""
    repository = TransitRepository(db)
    normalized_keyword = keyword.strip() if keyword else None
    stations, total = repository.list_stations(
        keyword=normalized_keyword or None,
        line_id=line_id,
        page=page,
        size=size,
    )

    lines_by_station = {station.station_id: [] for station in stations}
    for station_id, line in repository.list_lines_by_station_ids(
        [station.station_id for station in stations]
    ):
        lines_by_station[station_id].append(line)

    return StationListResponse(
        items=[
            StationSummary(
                station_id=station.station_id,
                station_name=station.station_name,
                latitude=float(station.latitude),
                longitude=float(station.longitude),
                lines=lines_by_station[station.station_id],
            )
            for station in stations
        ],
        page=page,
        size=size,
        total_elements=total,
        total_pages=math.ceil(total / size) if total else 0,
    )


def get_line_stations(db: Session, line_id: int) -> LineStationListResponse:
    """한 노선에 속한 역을 노선을 따라가는 순서(station_order)대로 반환한다."""
    repository = TransitRepository(db)
    if not repository.find_line_by_id(line_id):
        raise _error("LINE_NOT_FOUND", "노선을 찾을 수 없습니다.", 404)

    rows = repository.list_line_stations(line_id)
    return LineStationListResponse(
        line_id=line_id,
        items=[
            LineStationResponse(
                station_id=station.station_id,
                station_name=station.station_name,
                station_order=station_order,
                latitude=float(station.latitude),
                longitude=float(station.longitude),
            )
            for station, station_order in rows
        ],
    )


def get_station(db: Session, station_id: int) -> StationDetailResponse:
    """역 상세 정보와 소속 노선을 반환한다."""
    repository = TransitRepository(db)
    station = _find_station(repository, station_id)
    return StationDetailResponse(
        station_id=station.station_id,
        station_name=station.station_name,
        latitude=float(station.latitude),
        longitude=float(station.longitude),
        address=station.address,
        lines=repository.list_lines_by_station_id(station_id),
    )


def list_timetables(
    db: Session,
    station_id: int,
    *,
    line_id: int,
    day_type: DayType,
    direction: Direction,
) -> TimetableListResponse:
    """역·노선·요일·방향에 맞는 열차 시간표를 반환한다."""
    repository = TransitRepository(db)
    _find_station(repository, station_id)
    if not repository.find_line_by_id(line_id):
        raise _error("LINE_NOT_FOUND", "노선을 찾을 수 없습니다.", 404)
    if not repository.station_line_exists(station_id, line_id):
        raise _error(
            "STATION_LINE_NOT_FOUND",
            "해당 역은 요청한 노선에 속하지 않습니다.",
            404,
        )

    rows = repository.list_timetables(
        station_id=station_id,
        line_id=line_id,
        day_type=day_type.value,
        direction=direction.value,
    )
    return TimetableListResponse(
        items=[
            TimetableResponse(
                timetable_id=timetable.timetable_id,
                train_no=timetable.train_no,
                line_id=timetable.line_id,
                station_id=timetable.station_id,
                day_type=timetable.day_type,
                direction=timetable.direction,
                arrival_time=_format_timetable_time(timetable.arrival_time),
                departure_time=_format_timetable_time(timetable.departure_time),
                destination_station_id=timetable.destination_station_id,
                destination_station_name=destination_name,
            )
            for timetable, destination_name in rows
        ]
    )


def list_station_places(
    db: Session,
    station_id: int,
    *,
    category: PlaceCategory | None,
    page: int,
    size: int,
) -> PlaceListResponse:
    """역 반경 1km 내 추천 장소를 페이지 단위로 반환한다."""
    repository = TransitRepository(db)
    _find_station(repository, station_id)
    places, total = repository.list_places_by_station_id(
        station_id=station_id,
        category=category.value if category else None,
        page=page,
        size=size,
    )

    images_by_place: dict[int, list[PlaceImage]] = {
        place.place_id: [] for place in places
    }
    for image in repository.list_place_images(
        [place.place_id for place in places]
    ):
        images_by_place[image.place_id].append(image)

    return PlaceListResponse(
        items=[
            _build_place_response(
                place,
                images_by_place[place.place_id],
            )
            for place in places
        ],
        page=page,
        size=size,
        total_elements=total,
        total_pages=math.ceil(total / size) if total else 0,
    )


def list_admin_places_by_station(
    db: Session,
    station_id: int,
    *,
    page: int,
    size: int,
) -> PlaceAdminListResponse:
    """관리자가 선택한 역에 연결된 장소와 수정용 전체 정보를 조회한다."""
    repository = TransitRepository(db)
    _find_station(repository, station_id)
    places, total = repository.list_places_by_station_id(
        station_id=station_id,
        category=None,
        page=page,
        size=size,
    )
    return PlaceAdminListResponse(
        items=[_build_place_admin_response(repository, place) for place in places],
        page=page,
        size=size,
        total_elements=total,
        total_pages=math.ceil(total / size) if total else 0,
    )


def create_place(
    db: Session,
    admin_id: int,
    request: PlaceUpsertRequest,
) -> PlaceAdminResponse:
    """관리자가 장소와 접근역·이미지를 하나의 트랜잭션으로 등록한다."""
    repository = TransitRepository(db)
    station_ids = _normalize_station_ids(request.station_ids)
    _require_stations(repository, station_ids)

    place = repository.create_place(
        place_name=request.place_name,
        category=request.category.value,
        description=request.description,
        address=request.address,
        latitude=request.latitude,
        longitude=request.longitude,
        phone=request.phone,
        created_by=admin_id,
    )
    repository.replace_place_stations(place.place_id, station_ids)
    repository.replace_place_images(place.place_id, request.image_urls)
    db.commit()
    db.refresh(place)
    return _build_place_admin_response(repository, place)


def update_place(
    db: Session,
    place_id: int,
    request: PlaceUpdateRequest,
) -> PlaceAdminResponse:
    """관리자가 전달한 장소 필드와 접근역·이미지 목록을 부분 수정한다."""
    repository = TransitRepository(db)
    place = _find_place(repository, place_id)
    fields = request.model_dump(
        exclude_unset=True,
        exclude={"station_ids", "image_urls"},
    )
    for name, value in fields.items():
        setattr(place, name, value.value if isinstance(value, Enum) else value)

    if "station_ids" in request.model_fields_set:
        station_ids = _normalize_station_ids(request.station_ids or [])
        _require_stations(repository, station_ids)
        repository.replace_place_stations(place_id, station_ids)
    if "image_urls" in request.model_fields_set:
        repository.replace_place_images(place_id, request.image_urls or [])

    place.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(place)
    return _build_place_admin_response(repository, place)


def delete_place(db: Session, place_id: int) -> None:
    """계획에서 장소 항목을 제거한 뒤 장소와 종속 데이터를 삭제한다."""
    repository = TransitRepository(db)
    place = _find_place(repository, place_id, for_update=True)
    affected_plan_ids = repository.delete_plan_items_by_place_id(place_id)
    repository.touch_travel_plans(affected_plan_ids)
    repository.delete_place(place)
    db.commit()
