"use client";

import type { components } from "@metrotrip/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KakaoMap } from "@/components/KakaoMap";
import { api } from "@/lib/api";
import { dateInSeoul } from "@/lib/date";
import { useSession } from "@/lib/session";

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

export default function DiscoverPage() {
  const { status } = useSession();
  const [stations, setStations] = useState<Station[]>([]);
  const [stationQuery, setStationQuery] = useState("");
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [stationDetail, setStationDetail] = useState<StationDetail | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [sourceMode, setSourceMode] = useState("MOCKED");
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [placeDetail, setPlaceDetail] = useState<PlaceDetail | null>(null);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [categories, setCategories] = useState<Category[]>(["FOOD", "CAFE"]);
  const [radiusMeters, setRadiusMeters] = useState(1000);
  const [query, setQuery] = useState("");
  const [searchCenter, setSearchCenter] = useState<{ latitude: number; longitude: number; south: number; west: number; north: number; east: number } | null>(null);
  const [pendingViewport, setPendingViewport] = useState<typeof searchCenter>(null);
  const [loadingStations, setLoadingStations] = useState(true);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteComparison | null>(null);
  const [favoritePlaceIds, setFavoritePlaceIds] = useState<Set<string>>(new Set());
  const [favoriteStationIds, setFavoriteStationIds] = useState<Set<string>>(new Set());
  const [authPrompt, setAuthPrompt] = useState(false);
  const [rightPanel, setRightPanel] = useState<"schedule" | "planner" | null>(null);
  const [planSummaries, setPlanSummaries] = useState<PlanSummary[]>([]);
  const [plannerPlan, setPlannerPlan] = useState<PlanView | null>(null);
  const [plannerPending, setPlannerPending] = useState(false);
  const [plannerDirty, setPlannerDirty] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [placeNames, setPlaceNames] = useState<Record<string, string>>({});
  const initialPlaceHandled = useRef(false);

  const selectedStation = useMemo(
    () => stations.find((station) => station.id === selectedStationId) ?? null,
    [stations, selectedStationId],
  );

  const loadStations = useCallback(async () => {
    setLoadingStations(true);
    const { data, error: apiError } = await api.GET("/api/v1/stations", {
      params: { query: { query: stationQuery.trim() || null, limit: 50 } },
    });
    if (!data) {
      setStations([]);
      setError(readError(apiError));
    } else {
      setStations(data.items);
      setSelectedStationId((current) =>
        data.items.some((item) => item.id === current)
          ? current
          : data.items.find((item) => item.name === "천안")?.id ?? data.items[0]?.id ?? null,
      );
    }
    setLoadingStations(false);
  }, [stationQuery]);

  useEffect(() => {
    const task = window.setTimeout(() => void loadStations(), 250);
    return () => window.clearTimeout(task);
  }, [loadStations]);

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
        params: { path: { station_id: selectedStationId }, query: { limit: 8 } },
      }),
    ]).then(([detail, schedule]) => {
      setStationDetail(detail.data ?? null);
      setDepartures(schedule.data?.items ?? []);
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
      setFavoritePlaceIds(new Set(data?.places.map((item) => item.id) ?? []));
      setFavoriteStationIds(new Set(data?.stations.map((item) => item.id) ?? []));
    });
  }, [status]);

  useEffect(() => {
    if (!stations.length || initialPlaceHandled.current) return;
    const placeId = new URLSearchParams(window.location.search).get("place");
    if (!placeId) return;
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
  }, [stations]);


  useEffect(() => {
    if (!plannerPlan) return;
    const missing = plannerPlan.days
      .flatMap((day) => day.items)
      .filter((item) => item.itemType === "PLACE" && item.placeId && !placeNames[item.placeId])
      .map((item) => item.placeId as string);
    for (const placeId of [...new Set(missing)]) {
      void api.GET("/api/v1/places/{place_id}", { params: { path: { place_id: placeId } } })
        .then(({ data }) => {
          if (data) setPlaceNames((current) => ({ ...current, [placeId]: data.name }));
        });
    }
  }, [placeNames, plannerPlan]);

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
    if (!plannerDirty || !plannerPlan || plannerPending) return;
    const task = window.setTimeout(() => void persistPlan(plannerPlan), 650);
    return () => window.clearTimeout(task);
  }, [persistPlan, plannerDirty, plannerPending, plannerPlan]);

  const selectPlace = useCallback((place: Place) => {
    setSelectedPlace(place);
    setRoute(null);
  }, []);

  function selectStation(stationId: string) {
    setSelectedStationId(stationId);
    setSearchCenter(null);
    setPendingViewport(null);
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

  async function toggleFavoritePlace() {
    if (!selectedPlace || requireAccount()) return;
    const isFavorite = favoritePlaceIds.has(selectedPlace.id);
    const result = isFavorite
      ? await api.DELETE("/api/v1/me/favorites/places/{place_id}", { params: { path: { place_id: selectedPlace.id } } })
      : await api.PUT("/api/v1/me/favorites/places/{place_id}", { params: { path: { place_id: selectedPlace.id } } });
    if (result.error) {
      setError(readError(result.error));
      return;
    }
    setFavoritePlaceIds((current) => {
      const next = new Set(current);
      if (isFavorite) next.delete(selectedPlace.id);
      else next.add(selectedPlace.id);
      return next;
    });
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

  async function openPlanner() {
    if (requireAccount()) return;
    setRightPanel("planner");
    const { data } = await api.GET("/api/v1/plans", { params: { query: { limit: 50 } } });
    setPlanSummaries(data?.items ?? []);
  }

  async function createPlanWithSelectedPlace() {
    if (!selectedStation || requireAccount()) return;
    setPlannerPending(true);
    const date = dateInSeoul();
    const items: PlanWriteRequest["days"][number]["items"] = [
      { itemType: "STATION", stationId: selectedStation.id },
    ];
    if (selectedPlace) items.push({ itemType: "PLACE", placeId: selectedPlace.id });
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
      setRightPanel("planner");
      setNotice("새 일정을 만들었습니다.");
      const summaries = await api.GET("/api/v1/plans", { params: { query: { limit: 50 } } });
      setPlanSummaries(summaries.data?.items ?? []);
    } else setError(readError(apiError));
    setPlannerPending(false);
  }

  async function openPlan(planId: string) {
    setPlannerPending(true);
    const { data, error: apiError } = await api.GET("/api/v1/plans/{plan_id}", {
      params: { path: { plan_id: planId } },
    });
    if (data) setPlannerPlan(data);
    else setError(readError(apiError));
    setPlannerPending(false);
  }

  async function addSelectedPlaceToPlan() {
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

  function movePlanItem(itemId: string, delta: -1 | 1) {
    setPlannerPlan((plan) => {
      if (!plan) return plan;
      return {
        ...plan,
        days: plan.days.map((day) => {
          const index = day.items.findIndex((item) => item.id === itemId);
          const target = index + delta;
          if (index < 0 || target < 0 || target >= day.items.length) return day;
          const items = [...day.items];
          const source = items[index];
          const destination = items[target];
          if (!source || !destination) return day;
          items[index] = destination;
          items[target] = source;
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
          .map((id) => places.find((place) => place.id === id))
          .filter((place): place is Place => Boolean(place))
          .map((place) => ({ latitude: place.latitude, longitude: place.longitude })),
      ];
    }
    return route?.options.find((option) => option.mode === "WALK")?.path ?? [];
  }, [focusMode, focusPlaceIds, places, route, selectedStation]);

  const walking = route?.options.find((option) => option.mode === "WALK");

  return (
    <main className="discoverPage">
      <section className="stationStrip" aria-label="역 선택">
        <div className="stationStripInner">
          <span className="lineBadge">1</span>
          <label className="stationSearch"><span className="srOnly">역 검색</span><input value={stationQuery} onChange={(event) => setStationQuery(event.target.value)} placeholder="역 이름 검색" /></label>
          {loadingStations ? <span className="muted">역 목록을 불러오는 중…</span> : stations.map((station) => (
            <button type="button" key={station.id} aria-pressed={station.id === selectedStationId} onClick={() => selectStation(station.id)}>
              {station.name}
            </button>
          ))}
        </div>
      </section>

      <div className={`discoverLayout ${rightPanel ? "hasRightPanel" : ""}`}>
        <aside className="placePanel">
          <header>
            <div className="stationHeading">
              <div><p className="eyebrow">EXPLORE NEARBY</p><h1>{selectedStation?.name ?? "역"}역</h1></div>
              <button type="button" className="iconButton" aria-label="역 즐겨찾기" aria-pressed={selectedStation ? favoriteStationIds.has(selectedStation.id) : false} onClick={() => void toggleFavoriteStation()}>★</button>
            </div>
            <div className="stationQuickActions">
              <span>반경 {radiusMeters >= 1000 ? `${radiusMeters / 1000}km` : `${radiusMeters}m`} · {sourceMode === "REAL" ? "Kakao 장소" : sourceMode === "STALE" ? "캐시 장소" : "개발 데이터"}</span>
              <button type="button" onClick={() => setRightPanel(rightPanel === "schedule" ? null : "schedule")}>시간표</button>
            </div>
          </header>
          <div className="placeSearch"><label className="srOnly" htmlFor="place-query">장소 검색</label><input id="place-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="장소 이름으로 검색" /></div>
          <div className="categoryTabs multi" aria-label="장소 카테고리">
            {categoryOptions.map((item) => <button type="button" key={item.value} aria-pressed={categories.includes(item.value)} onClick={() => toggleCategory(item.value)}>{item.label}</button>)}
          </div>
          <label className="radiusControl">검색 반경<select value={radiusMeters} onChange={(event) => setRadiusMeters(Number(event.target.value))}><option value={500}>500m</option><option value={1000}>1km</option><option value={2000}>2km</option><option value={5000}>5km</option></select></label>
          <p className="resultScope">선택 카테고리별 가까운 장소를 최대 45개까지 조회하며, 같은 조건은 24시간 캐시합니다.</p>
          {error ? <div className="inlineError" role="alert"><p>{error}</p><button type="button" onClick={() => void loadPlaces()}>다시 시도</button></div> : null}
          {loadingPlaces ? <div className="placeSkeletons" aria-label="장소를 불러오는 중">{[1, 2, 3].map((item) => <span key={item} />)}</div> : places.length === 0 ? <div className="emptyState"><strong>조건에 맞는 장소가 없어요</strong><p>카테고리나 검색 반경을 바꿔보세요.</p></div> : (
            <div className="placeList">
              {places.map((place) => <button type="button" key={place.id} className={place.id === selectedPlace?.id ? "selected" : ""} onClick={() => selectPlace(place)}><span className={`categoryDot ${place.category.toLowerCase()}`} /><span><strong>{place.name}</strong><small>{categoryOptions.find((item) => item.value === place.category)?.label ?? place.category} · {Math.round(place.distanceMeters ?? 0)}m</small></span><span aria-hidden>{favoritePlaceIds.has(place.id) ? "★" : "→"}</span></button>)}
            </div>
          )}
        </aside>

        <aside className="placeInspector">
          {selectedPlace ? <>
            <div className="inspectorTop"><p className="eyebrow">PLACE DETAIL</p><button type="button" className="favoriteIcon" aria-label={favoritePlaceIds.has(selectedPlace.id) ? "즐겨찾기 해제" : "즐겨찾기"} aria-pressed={favoritePlaceIds.has(selectedPlace.id)} onClick={() => void toggleFavoritePlace()}>{favoritePlaceIds.has(selectedPlace.id) ? "★" : "☆"}</button></div>
            <h2>{selectedPlace.name}</h2>
            <span className="placeCategoryLabel">{placeDetail?.summary ?? selectedPlace.category}</span>
            <dl className="placeFacts"><div><dt>주소</dt><dd>{selectedPlace.address}</dd></div>{placeDetail?.phone ? <div><dt>전화</dt><dd>{placeDetail.phone}</dd></div> : null}<div><dt>거리</dt><dd>{Math.round(selectedPlace.distanceMeters ?? 0)}m</dd></div></dl>
            {walking ? <div className="walkSummary"><span>역에서 도보</span><strong>{walking.durationMinutes}분</strong><small>{walking.distanceMeters.toLocaleString()}m · {walking.estimated ? "예상" : "실제 보행로"}</small></div> : <div className="walkSummary loading">도보 경로 계산 중…</div>}
            <div className="inspectorActions"><button type="button" className="primaryButton" onClick={() => void addSelectedPlaceToPlan()}>일정에 추가</button><button type="button" className="outlineButton" onClick={() => void openPlanner()}>일정 열기</button></div>
            <p className="providerCaption">메뉴·가격·영업시간은 Kakao Local API에서 제공하지 않습니다.</p>
            {authPrompt ? <div className="authPrompt"><p>저장과 일정 기능은 로그인이 필요해요.</p><Link href="/login">로그인하기</Link></div> : null}
          </> : <div className="emptyState"><strong>장소를 선택해 주세요</strong><p>목록과 지도 마커가 함께 선택됩니다.</p></div>}
        </aside>

        <div className="mapStage">
          <KakaoMap station={selectedStation} places={places} selectedPlaceId={selectedPlace?.id ?? null} radiusMeters={radiusMeters} favoritePlaceIds={favoritePlaceIds} routePath={mapPath} focusPlaceIds={focusPlaceIds} focusMode={focusMode} onSelectPlace={selectPlace} onViewportChange={setPendingViewport} />
          {pendingViewport && (!searchCenter || Math.abs(pendingViewport.latitude - searchCenter.latitude) > 0.0005 || Math.abs(pendingViewport.longitude - searchCenter.longitude) > 0.0005) ? <button className="searchThisArea" type="button" onClick={() => setSearchCenter(pendingViewport)}>이 영역 검색</button> : null}
          {focusMode ? <div className="focusModeBanner"><strong>일정 순서 보기</strong><span>다른 장소 마커를 숨겼습니다.</span><button type="button" onClick={() => setFocusMode(false)}>종료</button></div> : null}
        </div>

        {rightPanel === "schedule" ? <aside className="rightDrawer scheduleDrawer"><header><div><p className="eyebrow">TIMETABLE</p><h2>{selectedStation?.name}역 시간표</h2></div><button type="button" onClick={() => setRightPanel(null)} aria-label="닫기">×</button></header>{stationDetail?.address ? <p className="stationAddress">{stationDetail.address}</p> : null}<div className="departureList">{departures.length ? departures.map((departure) => <div key={`${departure.tripId}-${departure.scheduledAt}`}><time>{new Date(departure.scheduledAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</time><span>{departure.headsign} 방면</span></div>) : <p>예정된 열차가 없습니다.</p>}</div><small>fixture 시간표 · 실시간 아님</small></aside> : null}

        {rightPanel === "planner" ? <aside className="rightDrawer plannerDrawer"><header><div><p className="eyebrow">MAP PLANNER</p><h2>내 일정</h2></div><button type="button" onClick={() => setRightPanel(null)} aria-label="닫기">×</button></header>
          {!plannerPlan ? <div className="plannerStart"><p>기존 일정을 열거나 현재 역에서 새로 시작하세요.</p><button type="button" className="primaryButton" onClick={() => void createPlanWithSelectedPlace()} disabled={plannerPending}>새 일정 만들기</button><div className="planPicker">{planSummaries.map((plan) => <button type="button" key={plan.id} onClick={() => void openPlan(plan.id)}><strong>{plan.title}</strong><small>{plan.startDate}</small></button>)}</div></div> : <>
            <div className="plannerTitle"><input value={plannerPlan.title} aria-label="일정 제목" onChange={(event) => { setPlannerPlan({ ...plannerPlan, title: event.target.value }); setPlannerDirty(true); }} /><span>{plannerPending ? "저장 중…" : plannerDirty ? "변경됨" : "자동 저장됨"}</span></div>
            <div className="plannerToolbar"><button type="button" aria-pressed={focusMode} onClick={() => setFocusMode((value) => !value)}>일정 순서 보기</button>{selectedPlace ? <button type="button" onClick={() => void addSelectedPlaceToPlan()}>+ {selectedPlace.name}</button> : null}</div>
            <ol className="mapTimeline">{plannerPlan.days[0]?.items.map((item, index) => {
              const station = item.stationId ? stations.find((candidate) => candidate.id === item.stationId) : null;
              const label = item.itemType === "STATION" ? `${station?.name ?? "저장한 역"}역` : item.itemType === "PLACE" && item.placeId ? placeNames[item.placeId] ?? "저장한 장소" : item.note ?? "메모";
              return <li key={item.id} className={item.itemType.toLowerCase()}><button type="button" className="timelineNode" aria-label={`${index + 1}번 ${label} 지도에서 보기`} onClick={() => { if (item.stationId) setSelectedStationId(item.stationId); if (item.placeId) { const place = places.find((candidate) => candidate.id === item.placeId); if (place) selectPlace(place); } }}>{item.itemType === "STATION" ? "●" : index + 1}</button><div><strong>{label}</strong>{item.itemType === "PLACE" ? <label>시간<input type="time" value={item.scheduledTime?.slice(0, 5) ?? ""} onChange={(event) => updatePlanItem(item.id, { scheduledTime: event.target.value || null })} /></label> : <small>{item.itemType === "STATION" ? "이 역에서 이동 시작" : "메모"}</small>}</div><div className="timelineActions"><button type="button" onClick={() => movePlanItem(item.id, -1)} disabled={index === 0}>↑</button><button type="button" onClick={() => movePlanItem(item.id, 1)} disabled={index === (plannerPlan.days[0]?.items.length ?? 1) - 1}>↓</button><button type="button" onClick={() => removePlanItem(item.id)}>×</button></div></li>;
            })}</ol>
          </>}
        </aside> : null}
      </div>
      {notice ? <div className="floatingNotice" role="status">{notice}<button type="button" onClick={() => setNotice(null)}>×</button></div> : null}
    </main>
  );
}
