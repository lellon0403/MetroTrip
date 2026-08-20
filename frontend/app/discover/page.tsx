"use client";

import type { components } from "@metrotrip/contracts";
import { DndContext, type DragEndEvent, closestCenter } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, CalendarPlus, ChevronRight, Clock3, GripVertical, Map as MapIcon, MapPinned, Plus, Star, TrainFront, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KakaoMap } from "@/components/KakaoMap";
import { ClearableInput } from "@/components/ClearableInput";
import { SubwayRouteBoard } from "@/components/SubwayRouteBoard";
import { api } from "@/lib/api";
import { dateInSeoul } from "@/lib/date";
import { useSession } from "@/lib/session";
import { calculateSubwayRouteSchedule, type SubwayRouteSchedule } from "@/lib/transitTimetable";

type Station = components["schemas"]["StationSummary"];
type StationDetail = components["schemas"]["StationDetail"];
type Place = components["schemas"]["PlaceSummary"];
type PlaceDetail = components["schemas"]["PlaceDetail"];
type Departure = components["schemas"]["Departure"];
type RouteComparison = components["schemas"]["RouteComparison"];
type RouteCoordinate = components["schemas"]["RouteCoordinate"];
type Category = components["schemas"]["PlaceCategory"];
type PlanSummary = components["schemas"]["PlanSummary"];
type PlanView = components["schemas"]["PlanView"];
type PlanWriteRequest = components["schemas"]["PlanWriteRequest"];
type PlanItem = components["schemas"]["PlanItemView"];
type PlanPlace = components["schemas"]["PlaceDetail"];

type DepartureGroup = { key: string; label: string };

function departureGroups(lineId: string | undefined): DepartureGroup[] {
  if (lineId === "3") return [
    { key: "up", label: "상행 · 진접 방면" },
    { key: "down", label: "하행 · 오이도 방면" },
  ];
  if (["4", "5", "6"].includes(lineId ?? "")) return [
    { key: "up", label: "내선순환" },
    { key: "down", label: "외선순환" },
  ];
  return [
    { key: "north", label: "상행 · 연천·소요산 방면" },
    { key: "incheon", label: "하행 · 인천 방면" },
    { key: "south", label: "하행 · 천안·신창 방면" },
  ];
}

function departureGroupKey(lineId: string | undefined, departure: Departure): string {
  if (lineId === "3" || ["4", "5", "6"].includes(lineId ?? "")) return departure.direction === 0 ? "up" : "down";
  if (departure.direction === 0) return "north";
  return departure.headsign.includes("인천") ? "incheon" : "south";
}

type TimelineItemProps = {
  item: PlanItem;
  index: number;
  label: string;
  timeEditing: boolean;
  warning: string | null;
  stationRole: "출발" | "경유" | "도착" | null;
  onSetTime: (value: string) => void;
  onOpenTimePicker: () => void;
  onOpenTimetable: () => void;
  onRemove: () => void;
  onFocus: () => void;
  readOnly: boolean;
};

function SortableTimelineItem({ item, index, label, timeEditing, warning, stationRole, onSetTime, onOpenTimePicker, onOpenTimetable, onRemove, onFocus, readOnly }: TimelineItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const isStation = item.itemType === "STATION";
  return <li ref={setNodeRef} style={style} className={`${item.itemType.toLowerCase()} ${isDragging ? "dragging" : ""}`}>
    {!readOnly ? <button type="button" className="dragHandle" aria-label={`${index + 1}번 ${label} 순서 이동`} {...attributes} {...listeners}><GripVertical size={17} aria-hidden /></button> : <span className="dragHandle" aria-hidden><GripVertical size={17} /></span>}
    <button type="button" className="timelineNode" aria-label={`${index + 1}번 ${label} 지도에서 보기`} onClick={onFocus}>{isStation ? <MapPinned size={14} aria-hidden /> : index + 1}</button>
    <div><strong>{label}{stationRole ? <span className={`timelineStationRole ${stationRole === "경유" ? "via" : ""}`}>{stationRole}</span> : null}</strong>{isStation ? <div className="timelineTime"><span>{item.scheduledTime?.slice(0, 5) ?? "시간 미지정"}</span>{!readOnly ? <button type="button" onClick={onOpenTimetable}><Clock3 size={14} aria-hidden /> 시간표에서 선택</button> : null}</div> : item.itemType === "PLACE" ? <div className="timelineTime">{item.scheduledTime && !timeEditing ? <span>{item.scheduledTime.slice(0, 5)}</span> : null}{!readOnly && (timeEditing ? <label><span className="srOnly">{label} 시각</span><input autoFocus type="time" value={item.scheduledTime?.slice(0, 5) ?? ""} onChange={(event) => onSetTime(event.target.value)} /></label> : <button type="button" onClick={onOpenTimePicker}><Clock3 size={14} aria-hidden /> 시간 지정</button>)}</div> : <small>{item.note ?? "메모"}</small>}{warning ? <p className="timelineWarning">{warning}</p> : null}</div>
    {!readOnly ? <button type="button" className="timelineDelete" aria-label={`${label} 삭제`} onClick={onRemove}><Trash2 size={16} aria-hidden /></button> : null}
  </li>;
}

const categoryOptions: Array<{ value: Category; label: string }> = [
  { value: "FOOD", label: "맛집" },
  { value: "CAFE", label: "카페" },
  { value: "CULTURE", label: "문화" },
  { value: "NATURE", label: "산책" },
  { value: "SHOPPING", label: "쇼핑" },
  { value: "STAY", label: "숙박" },
];

function readError(error: unknown) {
  if (error && typeof error === "object" && "error" in error) {
    return (error as { error?: { message?: string } }).error?.message ?? "요청을 처리하지 못했습니다.";
  }
  return "API 서버에 연결할 수 없습니다.";
}

function toWriteRequest(plan: PlanView): PlanWriteRequest {
  return {
    title: plan.title,
    description: plan.description,
    startDate: plan.startDate,
    endDate: plan.endDate,
    status: plan.status,
    days: plan.days.map((day) => ({
      dayDate: day.dayDate,
      title: day.title,
      items: day.items.map((item) => ({
        id: item.id,
        itemType: item.itemType,
        stationId: item.stationId ?? null,
        placeId: item.placeId ?? null,
        routeSnapshot: item.routeSnapshot ?? null,
        note: item.note ?? null,
        scheduledTime: item.scheduledTime ?? null,
        durationMinutes: item.durationMinutes ?? null,
      })),
    })),
  };
}

function stationIdsFromPlan(plan: PlanView) {
  return [...new Set(plan.days
    .flatMap((day) => day.items)
    .filter((item) => item.itemType === "STATION" && item.stationId)
    .map((item) => item.stationId as string))];
}

function localClock() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export default function DiscoverPage() {
  const { status } = useSession();
  const [stations, setStations] = useState<Station[]>([]);
  const [stationSuggestions, setStationSuggestions] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [stationFocusRequestKey, setStationFocusRequestKey] = useState(0);
  const [, setStationDetail] = useState<StationDetail | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [sourceMode, setSourceMode] = useState("MOCKED");
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [placeDetail, setPlaceDetail] = useState<PlaceDetail | null>(null);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [expandedDepartureGroups, setExpandedDepartureGroups] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Category[]>(["FOOD", "CAFE"]);
  const [radiusMeters, setRadiusMeters] = useState(1000);
  const [radiusMenuOpen, setRadiusMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchCenter, setSearchCenter] = useState<{ latitude: number; longitude: number; south: number; west: number; north: number; east: number } | null>(null);
  const [pendingViewport, setPendingViewport] = useState<typeof searchCenter>(null);
  const [loadingStations, setLoadingStations] = useState(true);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteComparison | null>(null);
  const [favoriteStationIds, setFavoriteStationIds] = useState<Set<string>>(new Set());
  const [authPrompt, setAuthPrompt] = useState(false);
  const [rightPanel, setRightPanel] = useState<"planner" | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "subway">("map");
  const [subwayRouteStationIds, setSubwayRouteStationIds] = useState<string[]>([]);
  const [subwayDepartureTime, setSubwayDepartureTime] = useState("");
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [subwaySchedule, setSubwaySchedule] = useState<SubwayRouteSchedule | null>(null);
  const [subwayScheduleStatus, setSubwayScheduleStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [subwayScheduleError, setSubwayScheduleError] = useState<string | null>(null);
  const [inspectorMode, setInspectorMode] = useState<"place" | "timetable">("place");
  const [, setPlanSummaries] = useState<PlanSummary[]>([]);
  const [plannerPlan, setPlannerPlan] = useState<PlanView | null>(null);
  const [plannerPending, setPlannerPending] = useState(false);
  const [plannerDirty, setPlannerDirty] = useState(false);
  const [plannerReadOnly, setPlannerReadOnly] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [placeNames, setPlaceNames] = useState<Record<string, string>>({});
  const [planPlaces, setPlanPlaces] = useState<Record<string, PlanPlace>>({});
  const [timeTargetItemId, setTimeTargetItemId] = useState<string | null>(null);
  const [timeEditingItemId, setTimeEditingItemId] = useState<string | null>(null);
  const initialPlaceHandled = useRef(false);
  const initialPlannerHandled = useRef(false);
  const initialRecruitmentPlannerHandled = useRef(false);
  const plannerPlanRef = useRef<PlanView | null>(null);
  const plannerReadOnlyRef = useRef(false);

  useEffect(() => {
    plannerPlanRef.current = plannerPlan;
    plannerReadOnlyRef.current = plannerReadOnly;
  }, [plannerPlan, plannerReadOnly]);

  useEffect(() => {
    if (!notice) return;
    const task = window.setTimeout(() => setNotice(null), 5_000);
    return () => window.clearTimeout(task);
  }, [notice]);

  useEffect(() => {
    const syncClock = () => {
      const currentTime = localClock();
      setCurrentTimeMs(Date.now());
      if (currentTime === subwayDepartureTime) return;
      setSubwayDepartureTime(currentTime);
      setSubwaySchedule(null);
      setSubwayScheduleError(null);
      setSubwayScheduleStatus(subwayRouteStationIds.length >= 2 ? "loading" : "idle");
    };
    const initialTask = window.setTimeout(syncClock, 0);
    const interval = window.setInterval(syncClock, 15_000);
    return () => {
      window.clearTimeout(initialTask);
      window.clearInterval(interval);
    };
  }, [subwayDepartureTime, subwayRouteStationIds.length]);

  const selectedStation = useMemo(
    () => stations.find((station) => station.id === selectedStationId) ?? null,
    [stations, selectedStationId],
  );

  const timetableDepartures = useMemo(() => {
    const now = currentTimeMs;
    const threeHours = 3 * 60 * 60 * 1_000;
    const sorted = departures
      .map((departure) => ({ departure, timestamp: new Date(departure.scheduledAt).getTime() }))
      .filter((entry) => Number.isFinite(entry.timestamp))
      .sort((left, right) => left.timestamp - right.timestamp);
    const groups = departureGroups(selectedStation?.lineId);
    const groupedDepartures = groups.map((group) => ({
      ...group,
      past: sorted
        .filter((entry) => entry.timestamp < now && entry.timestamp >= now - threeHours && departureGroupKey(selectedStation?.lineId, entry.departure) === group.key)
        .slice(-3),
      future: sorted
        .filter((entry) => entry.timestamp >= now && entry.timestamp <= now + threeHours && departureGroupKey(selectedStation?.lineId, entry.departure) === group.key)
        .slice(0, 10),
    })).filter((group) => group.past.length > 0 || group.future.length > 0);
    return {
      groups: groupedDepartures,
      firstKey: sorted[0] ? `${sorted[0].departure.tripId}-${sorted[0].departure.scheduledAt}` : null,
      lastKey: sorted.at(-1) ? `${sorted.at(-1)!.departure.tripId}-${sorted.at(-1)!.departure.scheduledAt}` : null,
    };
  }, [currentTimeMs, departures, selectedStation?.lineId]);

  const subwayRouteStations = useMemo(
    () => subwayRouteStationIds
      .map((stationId) => stations.find((station) => station.id === stationId))
      .filter((station): station is Station => Boolean(station)),
    [stations, subwayRouteStationIds],
  );

  const mapPlaces = useMemo(() => {
    const byId = new Map(places.map((place) => [place.id, place]));
    Object.values(planPlaces).forEach((place) => byId.set(place.id, place));
    return [...byId.values()];
  }, [places, planPlaces]);

  // 역 목록은 검색어와 무관하게 한 번만 불러온다. 화면 어딘가에서 선택한 역을
  // 조회(stations.find)하는 코드가 많아서, 검색으로 이 목록 자체를 바꾸면
  // 검색어와 무관한 역을 고른 상태에서 선택이 갑자기 풀린다.
  const loadStations = useCallback(async () => {
    setLoadingStations(true);
    const [stationResponse, tangjeongResponse] = await Promise.all([
      api.GET("/api/v1/stations", { params: { query: { query: null, limit: 100 } } }),
      api.GET("/api/v1/stations", { params: { query: { query: "탕정", limit: 6 } } }),
    ]);
    const { data, error: apiError } = stationResponse;
    if (!data) {
      setStations([]);
      setError(readError(apiError));
    } else {
      const tangjeong = tangjeongResponse.data?.items.find(
        (station) => station.name.replace(/역$/, "") === "탕정",
      );
      const items = tangjeong && !data.items.some((station) => station.id === tangjeong.id)
        ? [...data.items, tangjeong]
        : data.items;
      setStations((current) => [
        ...items,
        ...current.filter((station) => !items.some((item) => item.id === station.id)),
      ]);
      setSelectedStationId((current) =>
        current ?? tangjeong?.id ?? data.items[0]?.id ?? null,
      );
    }
    setLoadingStations(false);
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void loadStations(), 0);
    return () => window.clearTimeout(task);
  }, [loadStations]);

  // 아래 "장소 이름으로 검색" 입력에 역 이름이 매칭되면 함께 제안한다.
  // 위 stations 목록과는 별개 상태라, 타이핑 중에는 현재 선택된 역이 풀리지 않는다.
  useEffect(() => {
    const trimmed = query.trim();
    const task = window.setTimeout(async () => {
      if (!trimmed) {
        setStationSuggestions([]);
        return;
      }
      const { data } = await api.GET("/api/v1/stations", {
        params: { query: { query: trimmed, limit: 6 } },
      });
      setStationSuggestions(data?.items ?? []);
    }, trimmed ? 250 : 0);
    return () => window.clearTimeout(task);
  }, [query]);

  function selectStationFromSearch(station: Station) {
    setStations((current) => (current.some((item) => item.id === station.id) ? current : [...current, station]));
    selectStation(station.id);
    setQuery("");
    setStationSuggestions([]);
  }

  const loadPlaces = useCallback(async () => {
    if (!selectedStationId || categories.length === 0) return;
    setLoadingPlaces(true);
    setError(null);
    const centerQuery = searchCenter
      ? {
          station_id: null,
          latitude: searchCenter.latitude,
          longitude: searchCenter.longitude,
          south: searchCenter.south,
          west: searchCenter.west,
          north: searchCenter.north,
          east: searchCenter.east,
        }
      : {
          station_id: selectedStationId,
          latitude: null,
          longitude: null,
          south: null,
          west: null,
          north: null,
          east: null,
        };
    const { data, error: apiError } = await api.GET("/api/v1/places/nearby", {
      params: {
        query: {
          ...centerQuery,
          radius_meters: radiusMeters,
          category: categories,
          query: query.trim() || null,
          limit: 100,
        },
      },
    });
    if (!data) {
      setPlaces([]);
      setError(readError(apiError));
    } else {
      setPlaces(data.items);
      setSourceMode(data.sourceMode);
      setPlaceNames((current) => ({
        ...current,
        ...Object.fromEntries(data.items.map((item) => [item.id, item.name])),
      }));
      const requestedPlaceId = initialPlaceHandled.current
        ? null
        : new URLSearchParams(window.location.search).get("place");
      const requestedPlace = requestedPlaceId
        ? data.items.find((item) => item.id === requestedPlaceId)
        : null;
      if (requestedPlace) initialPlaceHandled.current = true;
      setSelectedPlace((current) =>
        requestedPlace ?? data.items.find((item) => item.id === current?.id) ?? data.items[0] ?? null,
      );
    }
    setLoadingPlaces(false);
  }, [categories, query, radiusMeters, searchCenter, selectedStationId]);

  useEffect(() => {
    const task = window.setTimeout(() => void loadPlaces(), query ? 350 : 0);
    return () => window.clearTimeout(task);
  }, [loadPlaces, query]);

  useEffect(() => {
    if (!selectedStationId) return;
    void Promise.all([
      api.GET("/api/v1/stations/{station_id}", { params: { path: { station_id: selectedStationId } } }),
      api.GET("/api/v1/stations/{station_id}/departures", {
        params: { path: { station_id: selectedStationId }, query: { limit: 100 } },
      }),
    ]).then(([detail, schedule]) => {
      setStationDetail(detail.data ?? null);
      setDepartures(schedule.data?.items ?? []);
      // 기본 역 목록(최대 100개, 이름순)에 없는 역도 노선도·검색으로 고를 수 있다.
      // 상세 조회가 성공했다는 건 실존하는 역이라는 뜻이니, 목록에 없으면 채워 넣어
      // "역역"처럼 이름이 안 뜨는 문제를 막는다.
      if (detail.data) {
        const station = detail.data;
        setStations((current) => (current.some((item) => item.id === station.id) ? current : [...current, station]));
      }
    });
  }, [selectedStationId]);

  useEffect(() => {
    if (!selectedPlace) return;
    let active = true;
    void api.GET("/api/v1/places/{place_id}", {
      params: { path: { place_id: selectedPlace.id } },
    }).then(({ data }) => {
      if (active) setPlaceDetail(data ?? null);
    });
    return () => { active = false; };
  }, [selectedPlace]);

  useEffect(() => {
    if (!selectedPlace || !selectedStation) return;
    const task = window.setTimeout(() => {
      void api.POST("/api/v1/routes/compare", {
        body: {
          origin: { type: "STATION", id: selectedStation.id },
          destination: { type: "PLACE", id: selectedPlace.id },
          modes: ["WALK"],
        },
      }).then(({ data }) => setRoute(data ?? null));
    }, 250);
    return () => window.clearTimeout(task);
  }, [selectedPlace, selectedStation]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void api.GET("/api/v1/me/favorites").then(({ data }) => {
      setFavoriteStationIds(new Set(data?.stations.map((item) => item.id) ?? []));
    });
  }, [status]);

  useEffect(() => {
    if (!stations.length || initialPlaceHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const placeId = params.get("place");
    if (!placeId) return;
    const stationId = params.get("station");
    const requestedCategory = params.get("category");
    const category = categoryOptions.find((item) => item.value === requestedCategory)?.value;
    if (stationId) {
      const needsStation = selectedStationId !== stationId;
      const needsCategory = Boolean(category && !categories.includes(category));
      if (!needsStation && !needsCategory) return;
      const task = window.setTimeout(() => {
        if (needsStation) setSelectedStationId(stationId);
        if (category) setCategories((current) => current.includes(category) ? current : [...current, category]);
      }, 0);
      return () => window.clearTimeout(task);
    }
    let active = true;
    void api.GET("/api/v1/places/{place_id}", {
      params: { path: { place_id: placeId } },
    }).then(({ data }) => {
      if (!active || !data) return;
      initialPlaceHandled.current = true;
      setSelectedPlace(data);
      setPlaceDetail(data);
      setCategories((current) => current.includes(data.category) ? current : [...current, data.category]);
      const nearest = stations.reduce((best, station) => {
        const distance = (station.latitude - data.latitude) ** 2 + (station.longitude - data.longitude) ** 2;
        return distance < best.distance ? { station, distance } : best;
      }, { station: stations[0], distance: Number.POSITIVE_INFINITY });
      if (nearest.station) setSelectedStationId(nearest.station.id);
      setSearchCenter({
        latitude: data.latitude,
        longitude: data.longitude,
        south: data.latitude - 0.02,
        west: data.longitude - 0.02,
        north: data.latitude + 0.02,
        east: data.longitude + 0.02,
      });
    });
    return () => { active = false; };
  }, [categories, selectedStationId, stations]);


  useEffect(() => {
    if (!plannerPlan) return;
    const missing = plannerPlan.days
      .flatMap((day) => day.items)
      .filter((item) => item.itemType === "PLACE" && item.placeId && !planPlaces[item.placeId])
      .map((item) => item.placeId as string);
    for (const placeId of [...new Set(missing)]) {
      void api.GET("/api/v1/places/{place_id}", { params: { path: { place_id: placeId } } })
        .then(({ data }) => {
          if (data) {
            setPlaceNames((current) => ({ ...current, [placeId]: data.name }));
            setPlanPlaces((current) => ({ ...current, [placeId]: data }));
          }
        });
    }
  }, [planPlaces, plannerPlan]);

  useEffect(() => {
    if (subwayRouteStations.length < 2 || !subwayDepartureTime) return;
    let active = true;
    void calculateSubwayRouteSchedule(subwayRouteStations, subwayDepartureTime)
      .then((schedule) => {
        if (!active) return;
        setSubwaySchedule(schedule);
        setSubwayScheduleStatus("success");
      })
      .catch((scheduleFailure: unknown) => {
        if (!active) return;
        setSubwaySchedule(null);
        setSubwayScheduleError(scheduleFailure instanceof Error ? scheduleFailure.message : "시간표 기반 경로를 계산하지 못했습니다.");
        setSubwayScheduleStatus("error");
      });
    return () => { active = false; };
  }, [subwayDepartureTime, subwayRouteStations]);

  // 시간표 계산과 일정 생성은 각각 비동기로 끝난다. 어느 쪽이 먼저 끝나더라도
  // 두 결과가 모두 준비된 시점에 역별 도착 시각을 일정에 반영한다.
  useEffect(() => {
    if (!subwaySchedule || !plannerPlan || plannerReadOnly) return;
    const times = new Map(
      subwaySchedule.stops
        .filter((stop) => Boolean(stop.time))
        .map((stop) => [stop.id, `${stop.time}:00`]),
    );
    let changed = false;
    const nextPlan: PlanView = {
      ...plannerPlan,
      days: plannerPlan.days.map((day) => ({
        ...day,
        items: day.items.map((item) => {
          if (item.itemType !== "STATION" || !item.stationId) return item;
          const scheduledTime = times.get(item.stationId);
          if (!scheduledTime || item.scheduledTime === scheduledTime) return item;
          changed = true;
          return { ...item, scheduledTime };
        }),
      })),
    };
    if (!changed) return;
    const task = window.setTimeout(() => {
      plannerPlanRef.current = nextPlan;
      setPlannerPlan(nextPlan);
      setPlannerDirty(true);
    }, 0);
    return () => window.clearTimeout(task);
  }, [plannerPlan, plannerReadOnly, subwaySchedule]);

  const persistPlan = useCallback(async (plan: PlanView) => {
    setPlannerPending(true);
    const { data, error: apiError } = await api.PUT("/api/v1/plans/{plan_id}", {
      params: { path: { plan_id: plan.id } },
      headers: { "If-Match": `W/"${plan.version}"` },
      body: toWriteRequest(plan),
    });
    if (data) {
      setPlannerPlan(data);
      setPlannerDirty(false);
    } else {
      setError(readError(apiError));
    }
    setPlannerPending(false);
  }, []);

  useEffect(() => {
    if (plannerReadOnly || !plannerDirty || !plannerPlan || plannerPending) return;
    const task = window.setTimeout(() => void persistPlan(plannerPlan), 650);
    return () => window.clearTimeout(task);
  }, [persistPlan, plannerDirty, plannerPending, plannerPlan, plannerReadOnly]);

  const selectPlace = useCallback((place: Place) => {
    setSelectedPlace(place);
    setInspectorMode("place");
    setRoute(null);
  }, []);

  function selectStation(stationId: string) {
    setSelectedStationId(stationId);
    setStationFocusRequestKey((key) => key + 1);
    setSearchCenter(null);
    setPendingViewport(null);
    setInspectorMode("timetable");
    setTimeTargetItemId(null);
    setExpandedDepartureGroups(new Set());
    setRoute(null);
  }

  function toggleCategory(category: Category) {
    setCategories((current) => {
      if (current.includes(category)) {
        return current.length === 1 ? current : current.filter((item) => item !== category);
      }
      return [...current, category];
    });
  }

  function requireAccount() {
    if (status === "authenticated") return false;
    setAuthPrompt(true);
    return true;
  }

  async function toggleFavoriteStation() {
    if (!selectedStation || requireAccount()) return;
    const isFavorite = favoriteStationIds.has(selectedStation.id);
    const result = isFavorite
      ? await api.DELETE("/api/v1/me/favorites/stations/{station_id}", { params: { path: { station_id: selectedStation.id } } })
      : await api.PUT("/api/v1/me/favorites/stations/{station_id}", { params: { path: { station_id: selectedStation.id } } });
    if (!result.error) {
      setFavoriteStationIds((current) => {
        const next = new Set(current);
        if (isFavorite) next.delete(selectedStation.id);
        else next.add(selectedStation.id);
        return next;
      });
    }
  }

  function replaceSubwayRoute(stationIds: string[]) {
    setSubwayRouteStationIds(stationIds);
    setSubwaySchedule(null);
    setSubwayScheduleError(null);
    setSubwayScheduleStatus(stationIds.length >= 2 ? "loading" : "idle");
  }

  function syncSubwayRouteWithPlan(plan: PlanView, appendedStationId?: string) {
    const stationIds = stationIdsFromPlan(plan);
    if (appendedStationId && !stationIds.includes(appendedStationId)) stationIds.push(appendedStationId);
    const isSameRoute = stationIds.length === subwayRouteStationIds.length
      && stationIds.every((stationId, index) => stationId === subwayRouteStationIds[index]);
    if (!isSameRoute) replaceSubwayRoute(stationIds);
  }

  async function openPlanner() {
    if (requireAccount()) return;
    setPlannerReadOnly(false);
    setRightPanel("planner");
    const { data } = await api.GET("/api/v1/plans", { params: { query: { limit: 50 } } });
    setPlanSummaries(data?.items ?? []);
  }

  async function createPlanWithSelectedPlace(includeSelectedPlace = true) {
    if (!selectedStation || requireAccount()) return;
    setPlannerPending(true);
    const date = dateInSeoul();
    const items: PlanWriteRequest["days"][number]["items"] = [
      { itemType: "STATION", stationId: selectedStation.id },
    ];
    if (includeSelectedPlace && selectedPlace) items.push({ itemType: "PLACE", placeId: selectedPlace.id });
    const { data, error: apiError } = await api.POST("/api/v1/plans", {
      body: {
        title: `${selectedStation.name}역 하루 여행`,
        description: "맵에서 만든 MetroTrip 일정",
        startDate: date,
        endDate: date,
        status: "DRAFT",
        days: [{ dayDate: date, title: "1일차", items }],
      },
    });
    if (data) {
      setPlannerPlan(data);
      replaceSubwayRoute(stationIdsFromPlan(data));
      setRightPanel("planner");
      setNotice("새 일정을 만들었습니다.");
      const summaries = await api.GET("/api/v1/plans", { params: { query: { limit: 50 } } });
      setPlanSummaries(summaries.data?.items ?? []);
    } else setError(readError(apiError));
    setPlannerPending(false);
  }

  async function deleteCurrentPlan() {
    if (!plannerPlan || plannerReadOnly || !window.confirm(`'${plannerPlan.title}' 일정을 삭제할까요? 3일 동안 삭제된 일정에서 복원할 수 있습니다.`)) return;
    setPlannerPending(true);
    const { response } = await api.DELETE("/api/v1/plans/{plan_id}", { params: { path: { plan_id: plannerPlan.id } } });
    if (response.ok) {
      setPlannerPlan(null);
      setPlannerDirty(false);
      setFocusMode(false);
      setNotice("일정을 삭제했습니다. 3일 안에 삭제된 일정에서 복원할 수 있습니다.");
    } else setError("일정을 삭제하지 못했습니다.");
    setPlannerPending(false);
  }

  async function openPlan(planId: string) {
    setPlannerPending(true);
    const { data, error: apiError } = await api.GET("/api/v1/plans/{plan_id}", {
      params: { path: { plan_id: planId } },
    });
    if (data) {
      setPlannerPlan(data);
      setPlannerReadOnly(false);
      replaceSubwayRoute(stationIdsFromPlan(data));
    }
    else setError(readError(apiError));
    setPlannerPending(false);
  }

  useEffect(() => {
    if (status !== "authenticated" || initialPlannerHandled.current || !selectedStation) return;
    const requestedPlan = new URLSearchParams(window.location.search).get("planner");
    if (!requestedPlan) return;
    initialPlannerHandled.current = true;
    void (async () => {
      await openPlanner();
      if (requestedPlan === "create") await createPlanWithSelectedPlace();
      else await openPlan(requestedPlan);
    })();
  // 최초 URL의 일정 편집 요청만 처리한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation, status]);

  useEffect(() => {
    if (initialRecruitmentPlannerHandled.current) return;
    const recruitmentId = new URLSearchParams(window.location.search).get("recruitmentPlan");
    if (!recruitmentId) return;
    initialRecruitmentPlannerHandled.current = true;
    void (async () => {
      setPlannerPending(true);
      const { data, error: apiError } = await api.GET("/api/v1/recruitments/{recruitment_id}/plan", { params: { path: { recruitment_id: recruitmentId } } });
      if (data) {
        setPlannerPlan(data);
        setPlannerReadOnly(true);
        replaceSubwayRoute(stationIdsFromPlan(data));
        setRightPanel("planner");
        setNotice("모집 일정은 조회만 할 수 있습니다.");
      }
      else setError(readError(apiError));
      setPlannerPending(false);
    })();
  }, []);

  async function addSelectedStationToPlan() {
    if (plannerReadOnly) return;
    if (!selectedStation || requireAccount()) return;
    if (!plannerPlan) {
      await createPlanWithSelectedPlace(false);
      return;
    }
    const day = plannerPlan.days[0];
    if (!day) return;
    // 일정에 이미 있는 역이어도 지하철 경로 배열이 누락됐을 수 있으므로 먼저 동기화한다.
    syncSubwayRouteWithPlan(plannerPlan, selectedStation.id);
    if (day.items.some((item) => item.itemType === "STATION" && item.stationId === selectedStation.id)) return;
    const stationItem: PlanItem = {
      id: crypto.randomUUID(), itemType: "STATION", stationId: selectedStation.id, placeId: null,
      routeSnapshot: null, note: null, scheduledTime: null, durationMinutes: null, position: day.items.length + 1,
    };
    setPlannerPlan({ ...plannerPlan, days: plannerPlan.days.map((entry, index) => index === 0 ? { ...entry, items: [...entry.items, stationItem] } : entry) });
    setPlannerDirty(true);
    setRightPanel("planner");
  }

  async function addSelectedSubwayStation() {
    if (!selectedStation) return;
    if (subwayRouteStationIds.includes(selectedStation.id)) {
      setNotice(`${selectedStation.name}역은 이미 지하철 경로에 있습니다.`);
      return;
    }
    const nextRoute = [...subwayRouteStationIds, selectedStation.id];
    setSubwayRouteStationIds(nextRoute);
    setSubwaySchedule(null);
    setSubwayScheduleError(null);
    setSubwayScheduleStatus(nextRoute.length >= 2 ? "loading" : "idle");
    if (status === "authenticated") {
      await addSelectedStationToPlan();
      setNotice(`${selectedStation.name}역을 경로와 일정에 추가했습니다.`);
    } else {
      setNotice(`${selectedStation.name}역을 경로에 추가했습니다. 로그인하면 일정으로 저장할 수 있어요.`);
    }
  }

  function removeSubwayStation(stationId: string) {
    replaceSubwayRoute(subwayRouteStationIds.filter((item) => item !== stationId));
  }

  function resetSubwayRoute() {
    replaceSubwayRoute([]);
  }

  async function addSelectedPlaceToPlan() {
    if (plannerReadOnly) return;
    if (!selectedPlace || !selectedStation) return;
    if (!plannerPlan) {
      await createPlanWithSelectedPlace();
      return;
    }
    const day = plannerPlan.days[0];
    if (!day) return;
    const lastStation = [...day.items].reverse().find((item) => item.itemType === "STATION");
    const additions: PlanItem[] = [];
    if (lastStation?.stationId !== selectedStation.id) {
      additions.push({
        id: crypto.randomUUID(),
        itemType: "STATION",
        stationId: selectedStation.id,
        placeId: null,
        routeSnapshot: null,
        note: null,
        scheduledTime: null,
        durationMinutes: null,
        position: day.items.length + 1,
      });
    }
    additions.push({
      id: crypto.randomUUID(),
      itemType: "PLACE",
      stationId: null,
      placeId: selectedPlace.id,
      routeSnapshot: null,
      note: null,
      scheduledTime: null,
      durationMinutes: 60,
      position: day.items.length + additions.length + 1,
    });
    const next: PlanView = {
      ...plannerPlan,
      days: plannerPlan.days.map((item, index) =>
        index === 0 ? { ...item, items: [...item.items, ...additions] } : item,
      ),
    };
    setPlannerPlan(next);
    setPlannerDirty(true);
    setRightPanel("planner");
  }

  function updatePlanItem(itemId: string, patch: Partial<PlanItem>) {
    if (plannerReadOnly) return;
    setPlannerPlan((plan) => {
      if (!plan) return plan;
      return {
        ...plan,
        days: plan.days.map((day) => ({
          ...day,
          items: day.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
        })),
      };
    });
    setPlannerDirty(true);
  }

  function removePlanItem(itemId: string) {
    if (plannerReadOnly) return;
    setPlannerPlan((plan) => {
      if (!plan) return plan;
      return {
        ...plan,
        days: plan.days.map((day) => ({
          ...day,
          items: day.items
            .filter((item) => item.id !== itemId)
            .map((item, index) => ({ ...item, position: index + 1 })),
        })),
      };
    });
    setPlannerDirty(true);
  }

  function reorderPlanItems(event: DragEndEvent) {
    if (plannerReadOnly) return;
    if (!event.over || event.active.id === event.over.id) return;
    setPlannerPlan((plan) => {
      if (!plan) return plan;
      return {
        ...plan,
        days: plan.days.map((day) => {
          const from = day.items.findIndex((item) => item.id === event.active.id);
          const to = day.items.findIndex((item) => item.id === event.over?.id);
          if (from < 0 || to < 0) return day;
          const items = arrayMove(day.items, from, to);
          return { ...day, items: items.map((item, position) => ({ ...item, position: position + 1 })) };
        }),
      };
    });
    setPlannerDirty(true);
  }

  const focusPlaceIds = useMemo(
    () => plannerPlan?.days.flatMap((day) => day.items)
      .filter((item) => item.itemType === "PLACE" && item.placeId)
      .map((item) => item.placeId as string) ?? [],
    [plannerPlan],
  );

  const mapPath = useMemo<RouteCoordinate[]>(() => {
    if (focusMode && selectedStation) {
      return [
        { latitude: selectedStation.latitude, longitude: selectedStation.longitude },
        ...focusPlaceIds
          .map((id) => mapPlaces.find((place) => place.id === id))
          .filter((place): place is Place => Boolean(place))
          .map((place) => ({ latitude: place.latitude, longitude: place.longitude })),
      ];
    }
    return route?.options.find((option) => option.mode === "WALK")?.path ?? [];
  }, [focusMode, focusPlaceIds, mapPlaces, route, selectedStation]);

  function timelineWarning(items: PlanItem[], index: number) {
    const item = items[index];
    if (!item || item.itemType !== "PLACE" || !item.scheduledTime) return null;
    const precedingStation = [...items.slice(0, index)].reverse().find((entry) => entry.itemType === "STATION" && entry.scheduledTime);
    if (precedingStation?.scheduledTime && item.scheduledTime < precedingStation.scheduledTime) {
      return `앞 역 시각(${precedingStation.scheduledTime.slice(0, 5)})보다 빠릅니다.`;
    }
    return null;
  }

  function applyDepartureTime(value: string) {
    if (!timeTargetItemId) return;
    updatePlanItem(timeTargetItemId, { scheduledTime: value });
    setTimeTargetItemId(null);
    setNotice("시간표에서 선택한 시각을 일정에 반영했습니다.");
  }

  const walking = route?.options.find((option) => option.mode === "WALK");

  return (
    <main className="discoverPage">
      <div className={`discoverLayout ${rightPanel ? "hasRightPanel" : ""}`}>
        <aside className="placePanel">
          <header>
            <div className="stationHeading">
              <div><p className="eyebrow">EXPLORE NEARBY</p><h1>{selectedStation?.name ?? "역"}역</h1></div>
              <button type="button" className="iconButton" aria-label="역 즐겨찾기" aria-pressed={selectedStation ? favoriteStationIds.has(selectedStation.id) : false} onClick={() => void toggleFavoriteStation()}><Star size={18} fill={selectedStation && favoriteStationIds.has(selectedStation.id) ? "currentColor" : "none"} aria-hidden /></button>
            </div>
            <div className="stationQuickActions">
              <span>반경 {radiusMeters >= 1000 ? `${radiusMeters / 1000}km` : `${radiusMeters}m`} · {sourceMode === "REAL" ? "Kakao 장소" : sourceMode === "STALE" ? "캐시 장소" : "개발 데이터"}</span>
              <button type="button" onClick={() => { setInspectorMode("timetable"); setTimeTargetItemId(null); }}><Clock3 size={14} aria-hidden /> 시간표</button>
            </div>
          </header>
          <div className="placeSearch"><label className="srOnly" htmlFor="place-query">장소 또는 역 검색</label><ClearableInput id="place-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="장소 또는 역 이름으로 검색" /></div>
          {stationSuggestions.length > 0 ? <ul className="stationSuggestions" aria-label="검색어와 일치하는 역">
            {stationSuggestions.map((station) => (
              <li key={station.id}>
                <button type="button" onClick={() => selectStationFromSearch(station)}>
                  <TrainFront size={14} aria-hidden /> {station.name}역
                </button>
              </li>
            ))}
          </ul> : null}
          <div className="categoryTabs multi" aria-label="장소 카테고리">
            {categoryOptions.map((item) => <button type="button" key={item.value} aria-pressed={categories.includes(item.value)} onClick={() => toggleCategory(item.value)}>{item.label}</button>)}
          </div>
          <div className="radiusControl"><span>검색 반경</span><div className={`radiusDropdown ${radiusMenuOpen ? "open" : ""}`}>
            <button type="button" className="radiusDropdownTrigger" aria-haspopup="listbox" aria-expanded={radiusMenuOpen} onClick={() => setRadiusMenuOpen((open) => !open)}>{radiusMeters >= 1000 ? `${radiusMeters / 1000}km` : `${radiusMeters}m`}<ChevronRight size={14} aria-hidden /></button>
            <div className="radiusDropdownMenu" role="listbox" aria-label="검색 반경">
              {[500, 1000, 2000, 5000].map((radius) => <button type="button" role="option" aria-selected={radiusMeters === radius} key={radius} onClick={() => { setRadiusMeters(radius); setRadiusMenuOpen(false); }}>{radius >= 1000 ? `${radius / 1000}km` : `${radius}m`}</button>)}
            </div>
          </div></div>
          <p className="resultScope">선택 카테고리별 가까운 장소를 최대 45개까지 조회하며, 같은 조건은 24시간 캐시합니다.</p>
          {error ? <div className="inlineError" role="alert"><p>{error}</p><button type="button" onClick={() => void loadPlaces()}>다시 시도</button></div> : null}
          {loadingPlaces ? <div className="placeSkeletons" aria-label="장소를 불러오는 중">{[1, 2, 3].map((item) => <span key={item} />)}</div> : places.length === 0 ? <div className="emptyState"><strong>조건에 맞는 장소가 없어요</strong><p>카테고리나 검색 반경을 바꿔보세요.</p></div> : (
            <div className="placeList">
              {places.map((place) => <button type="button" key={place.id} className={place.id === selectedPlace?.id ? "selected" : ""} onClick={() => selectPlace(place)}><span className={`categoryDot ${place.category.toLowerCase()}`} /><span><strong>{place.name}</strong><small>{categoryOptions.find((item) => item.value === place.category)?.label ?? place.category} · {Math.round(place.distanceMeters ?? 0)}m</small></span><ChevronRight size={18} aria-hidden /></button>)}
            </div>
          )}
        </aside>

        <aside className="placeInspector">
          {inspectorMode === "timetable" ? <>
            <div className="inspectorTop"><p className="eyebrow">TIMETABLE</p><button type="button" className="iconButton neutral" aria-label="시간표 닫기" onClick={() => setInspectorMode("place")}><X size={18} aria-hidden /></button></div>
            <h2>{selectedStation?.name}역 시간표</h2>
            {timeTargetItemId ? <p className="timePickerNotice">아래 출발 시각을 선택하면 일정의 역 시각으로 적용됩니다.</p> : <p className="providerCaption">출발 시각을 선택하면 일정에서 역 아래 장소의 시간 순서를 확인할 수 있어요.</p>}
            <p className="departureRangeCaption">방면별 최근 열차 3편과 앞으로 3시간 이내 열차를 표시합니다. 예정 열차는 펼치면 방면별 최대 10편까지 볼 수 있습니다.</p>
            <div className="departureDirectionGroups">{timetableDepartures.groups.map((group) => (
              <section className="departureDirection" key={group.key} aria-label={group.label}>
                <strong>{group.label}</strong>
                <div className="departureList inspectorDepartures directionCombinedList">
                {group.past.map(({ departure }) => {
                  const key = `${departure.tripId}-${departure.scheduledAt}`;
                  const displayTime = new Date(departure.scheduledAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
                  return <div className="pastDeparture" key={key}><time>{displayTime}</time><span>{key === timetableDepartures.firstKey ? <b title="첫차">☀️</b> : null}{departure.headsign} 방면</span></div>;
                })}
                {group.future.length ? group.future.slice(0, expandedDepartureGroups.has(group.key) ? 10 : 3).map(({ departure }, futureIndex) => {
                  const key = `${departure.tripId}-${departure.scheduledAt}`;
                  const scheduledTime = new Date(departure.scheduledAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
                  const displayTime = new Date(departure.scheduledAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
                  return <button type="button" className={futureIndex < 3 ? "nearestDeparture" : undefined} key={key} onClick={() => timeTargetItemId ? applyDepartureTime(scheduledTime) : undefined}><time>{displayTime}</time><span>{key === timetableDepartures.firstKey ? <b title="첫차">☀️</b> : null}{key === timetableDepartures.lastKey ? <b title="막차">🌙</b> : null}{departure.headsign} 방면</span></button>;
                }) : null}
                </div>
                {group.future.length > 3 ? <button type="button" className="departureExpandButton" aria-expanded={expandedDepartureGroups.has(group.key)} onClick={() => setExpandedDepartureGroups((current) => { const next = new Set(current); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; })}>{expandedDepartureGroups.has(group.key) ? "접기" : `더 보기 (${group.future.length - 3}편)`}</button> : null}
              </section>
            ))}</div>
            <small>DB 공식 시간표를 기준으로 표시합니다. 지연·운휴 등 실제 운행 상황에 따라 시각이 달라질 수 있습니다.</small>
          </> : selectedPlace ? <>
            <div className="inspectorTop"><p className="eyebrow">PLACE DETAIL</p><button type="button" className="iconButton neutral" aria-label="장소 상세 닫기" onClick={() => setSelectedPlace(null)}><X size={18} aria-hidden /></button></div>
            <h2>{selectedPlace.name}</h2>
            <span className="placeCategoryLabel">{placeDetail?.summary ?? selectedPlace.category}</span>
            <dl className="placeFacts"><div><dt>주소</dt><dd>{selectedPlace.address}</dd></div>{placeDetail?.phone ? <div><dt>전화</dt><dd>{placeDetail.phone}</dd></div> : null}<div><dt>거리</dt><dd>{Math.round(selectedPlace.distanceMeters ?? 0)}m</dd></div></dl>
            {walking ? <div className="walkSummary"><span>역에서 도보</span><strong>{walking.durationMinutes}분</strong><small>{walking.distanceMeters.toLocaleString()}m · {walking.estimated ? "예상" : "실제 보행로"}</small></div> : <div className="walkSummary loading">도보 경로 계산 중…</div>}
            <div className="inspectorActions"><button type="button" className="primaryButton" onClick={() => void addSelectedPlaceToPlan()}><CalendarPlus size={16} aria-hidden /> 일정에 추가</button></div>
            <p className="providerCaption">메뉴·가격·영업시간은 Kakao Local API에서 제공하지 않습니다.</p>
            {authPrompt ? <div className="authPrompt"><p>저장과 일정 기능은 로그인이 필요해요.</p><Link href="/login">로그인하기</Link></div> : null}
          </> : <div className="emptyState"><MapPinned size={30} aria-hidden /><strong>장소를 선택해 주세요</strong><p>목록과 지도 마커가 함께 선택됩니다.</p></div>}
        </aside>

        <div className={`mapStage ${viewMode}Mode`}>
          <div className={`viewModeSwitch ${viewMode}`} role="group" aria-label="탐색 화면 전환">
            <span className="viewModeThumb" aria-hidden />
            <button type="button" aria-pressed={viewMode === "map"} onClick={() => setViewMode("map")}><MapIcon size={15} aria-hidden /> 지도</button>
            <button type="button" aria-pressed={viewMode === "subway"} onClick={() => setViewMode("subway")}><TrainFront size={15} aria-hidden /> 지하철</button>
          </div>
          <div className={`mapModeSurface ${viewMode === "map" ? "active" : "inactive"}`} aria-hidden={viewMode !== "map"}>
            <KakaoMap active={viewMode === "map"} station={selectedStation} stationFocusRequestKey={stationFocusRequestKey} places={mapPlaces} selectedPlaceId={selectedPlace?.id ?? null} radiusMeters={radiusMeters} routePath={mapPath} focusPlaceIds={focusPlaceIds} focusMode={focusMode} onSelectPlace={selectPlace} onViewportChange={setPendingViewport} />
            {pendingViewport && (!searchCenter || Math.abs(pendingViewport.latitude - searchCenter.latitude) > 0.0005 || Math.abs(pendingViewport.longitude - searchCenter.longitude) > 0.0005) ? <button className="searchThisArea" type="button" onClick={() => setSearchCenter(pendingViewport)}>이 영역 검색</button> : null}
            {focusMode ? <div className="focusModeBanner"><strong>일정 순서 보기</strong><span>다른 장소 마커를 숨겼습니다.</span><button type="button" onClick={() => setFocusMode(false)}>종료</button></div> : null}
          </div>
          <div className={`subwayModeSurface ${viewMode === "subway" ? "active" : "inactive"}`} aria-hidden={viewMode !== "subway"}>
            <SubwayRouteBoard
              active={viewMode === "subway"}
              stations={stations}
              selectedStationId={selectedStationId}
              stationFocusRequestKey={stationFocusRequestKey}
              routeStationIds={subwayRouteStationIds}
              departureTime={subwayDepartureTime}
              schedule={subwaySchedule}
              scheduleStatus={subwayScheduleStatus}
              scheduleError={subwayScheduleError}
              onSelectStation={selectStation}
              onRemoveRouteStation={removeSubwayStation}
              onResetRoute={resetSubwayRoute}
              stationsLoading={loadingStations}
              onRetryStations={() => void loadStations()}
            />
          </div>
          <div className="plannerFabGroup">
            <button type="button" className="subwayQuickAdd" aria-label={viewMode === "subway" ? "선택한 역을 경로에 추가" : "현재 역을 일정에 추가"} onClick={() => viewMode === "subway" ? void addSelectedSubwayStation() : void addSelectedStationToPlan()}><Plus size={22} aria-hidden /></button>
            <button type="button" className="plannerFab" aria-label="일정 목록 열기" onClick={() => void openPlanner()}><CalendarClock size={22} aria-hidden /></button>
          </div>
          {notice ? <div key={notice} className="floatingNotice" role="status">{notice}<button type="button" aria-label="알림 닫기" onClick={() => setNotice(null)}><X size={16} aria-hidden /></button></div> : null}
        </div>

        {rightPanel === "planner" ? <aside className="rightDrawer plannerDrawer"><header><div><p className="eyebrow">MAP PLANNER</p><h2>내 일정</h2></div><div className="plannerHeaderActions">{plannerPlan && !plannerReadOnly ? <button type="button" aria-label="일정 삭제" onClick={() => void deleteCurrentPlan()}><Trash2 size={18} aria-hidden /></button> : null}<button type="button" onClick={() => setRightPanel(null)} aria-label="일정 닫기"><X size={20} aria-hidden /></button></div></header>
          {!plannerPlan ? <div className="plannerStart"><p>새 일정은 현재 선택한 역을 시작점으로 만듭니다.</p><button type="button" className="primaryButton" onClick={() => void createPlanWithSelectedPlace()} disabled={plannerPending}><Plus size={16} aria-hidden /> 새 일정 만들기</button></div> : <>
            <div className="plannerTitle"><ClearableInput value={plannerPlan.title} aria-label="일정 제목" disabled={plannerReadOnly} onChange={(event) => { setPlannerPlan({ ...plannerPlan, title: event.target.value }); setPlannerDirty(true); }} /><span>{plannerReadOnly ? "모집 참여자 조회용 일정" : plannerPending ? "저장 중…" : plannerDirty ? "변경됨" : "자동 저장됨"}</span></div>
            <div className="plannerToolbar"><button type="button" aria-pressed={focusMode} onClick={() => setFocusMode((value) => !value)}><MapPinned size={14} aria-hidden /> 일정 순서 보기</button>{!plannerReadOnly ? <><button type="button" onClick={() => void addSelectedStationToPlan()}><Plus size={14} aria-hidden /> 현재 역 추가</button>{selectedPlace ? <button type="button" onClick={() => void addSelectedPlaceToPlan()}><Plus size={14} aria-hidden /> {selectedPlace.name}</button> : null}</> : null}</div>
            {subwayScheduleStatus === "loading" ? <div className="plannerTransitSummary loading"><TrainFront size={16} aria-hidden /><span>실제 시간표로 이동 시간을 계산하는 중…</span></div> : null}
            {subwayScheduleStatus === "success" && subwaySchedule ? <div className="plannerTransitSummary">
              <TrainFront size={16} aria-hidden />
              {subwaySchedule.isFullyTimed ? <>
                <span><strong>{subwaySchedule.departureTime}</strong> 출발</span>
                <i />
                <span><strong>{subwaySchedule.arrivalTime}</strong> 도착</span>
                <b>{subwaySchedule.durationMinutes}분</b>
                <small>DB 실제 시간표 · {subwaySchedule.legs.map((leg) => leg.trainNo).filter(Boolean).join(" → ")}</small>
              </> : <><span>경로는 확인했지만 일부 구간의 시간표가 없습니다.</span><small>{subwaySchedule.stops.map((stop) => stop.name).join(" → ")}</small></>}
            </div> : null}
            {subwayScheduleStatus === "error" && subwayScheduleError ? <div className="plannerTransitSummary error"><TrainFront size={16} aria-hidden /><span>{subwayScheduleError}</span></div> : null}
            <DndContext collisionDetection={closestCenter} onDragEnd={reorderPlanItems}><SortableContext items={plannerPlan.days[0]?.items.map((item) => item.id) ?? []} strategy={verticalListSortingStrategy}><ol className="mapTimeline">{plannerPlan.days[0]?.items.map((item, index, items) => {
              const station = item.stationId ? stations.find((candidate) => candidate.id === item.stationId) : null;
              const label = item.itemType === "STATION" ? `${station?.name ?? "저장한 역"}역` : item.itemType === "PLACE" && item.placeId ? placeNames[item.placeId] ?? "저장한 장소" : item.note ?? "메모";
              const stationItems = items.filter((candidate) => candidate.itemType === "STATION");
              const stationIndex = stationItems.findIndex((candidate) => candidate.id === item.id);
              const stationRole = item.itemType !== "STATION" ? null : stationIndex === 0 ? "출발" : stationIndex === stationItems.length - 1 ? "도착" : "경유";
              return <SortableTimelineItem key={item.id} item={item} index={index} label={label} timeEditing={timeEditingItemId === item.id} warning={timelineWarning(items, index)} stationRole={stationRole} readOnly={plannerReadOnly} onSetTime={(value) => updatePlanItem(item.id, { scheduledTime: value || null })} onOpenTimePicker={() => setTimeEditingItemId(item.id)} onOpenTimetable={() => { setTimeTargetItemId(item.id); setInspectorMode("timetable"); }} onRemove={() => removePlanItem(item.id)} onFocus={() => { if (item.stationId) setSelectedStationId(item.stationId); if (item.placeId) { const place = mapPlaces.find((candidate) => candidate.id === item.placeId); if (place) selectPlace(place); } }} />;
            })}</ol></SortableContext></DndContext>
          </>}
        </aside> : null}
      </div>
    </main>
  );
}
