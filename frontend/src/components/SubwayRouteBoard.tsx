"use client";

import type { components } from "@metrotrip/contracts";
import { Clock3, RotateCcw, TrainFront, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SubwayRouteSchedule } from "@/lib/transitTimetable";
import {
  loadSubwayLineMap,
  REAL_LINE_META,
  type LineMapData,
  type LineMapStation,
  type RealLineId,
} from "@/lib/subwayLineMap";
import {
  loadKakaoMaps,
  type KakaoMapInstance,
  type KakaoMaps,
  type KakaoOverlay,
  type KakaoPolyline,
} from "./KakaoMap";

type Station = components["schemas"]["StationSummary"];

type SubwayRouteBoardProps = {
  active: boolean;
  stations: Station[];
  selectedStationId: string | null;
  stationFocusRequestKey: number;
  routeStationIds: string[];
  departureTime: string;
  schedule: SubwayRouteSchedule | null;
  scheduleStatus: "idle" | "loading" | "success" | "error";
  scheduleError: string | null;
  stationsLoading: boolean;
  onSelectStation: (stationId: string) => void;
  onRemoveRouteStation: (stationId: string) => void;
  onResetRoute: () => void;
  onRetryStations: () => void;
};

function routeRole(index: number, length: number) {
  if (index === 0) return "출발";
  if (index === length - 1) return "도착";
  return "경유";
}

// 서울시청 부근. 노선도를 처음 열었을 때 화면 중심으로 쓴다 (선택한 역이 있으면 그쪽을 우선한다).
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };
// 카카오 지도 축척표 기준 level 7 = 1km. 이 배율로 고정하고 확대/축소 자체를 막는다
// (level 숫자가 작을수록 확대된 상태다).
const FIXED_LEVEL = 7;
const DIMMED_OPACITY = 0.15;

type PolylineRecord = { overlay: KakaoPolyline; line: RealLineId; hitArea: boolean };
type StationRecord = {
  overlay: KakaoOverlay;
  station: LineMapStation;
  wrapper: HTMLButtonElement;
  dot: HTMLSpanElement;
  label: HTMLSpanElement;
};

function stationDotContent(
  station: LineMapStation,
  options: { isSelected: boolean; routeIndex: number | undefined },
  onClick: () => void,
  onHover: (line: RealLineId | null) => void,
) {
  const isTransfer = station.lines.length > 1;
  const color = REAL_LINE_META[station.lines[0]].color;
  const wrapper = document.createElement("button");
  wrapper.type = "button";
  wrapper.className = "subwayMapStation";
  wrapper.setAttribute("aria-label", `${station.name}역 선택`);
  wrapper.addEventListener("click", onClick);
  wrapper.addEventListener("mouseenter", () => onHover(station.lines[0]));
  wrapper.addEventListener("mouseleave", () => onHover(null));

  const dot = document.createElement("span");
  dot.className = "subwayMapDot";
  if (options.routeIndex !== undefined) {
    dot.classList.add("onRoute");
    dot.style.background = color;
    dot.textContent = String(options.routeIndex + 1);
  } else if (isTransfer) {
    dot.classList.add("transfer");
    dot.style.borderColor = color;
    dot.style.color = color;
  } else {
    dot.style.background = color;
  }
  if (options.isSelected) dot.classList.add("selected");
  wrapper.appendChild(dot);

  const label = document.createElement("span");
  label.className = `subwayMapLabel${isTransfer || options.isSelected ? " strong" : ""}`;
  // 평소엔 환승역·선택된 역 이름만 보여준다. 나머지는 해당 노선에 마우스를
  // 올렸을 때만 드러낸다 (applyLineHover) — 안 그러면 193개 이름이
  // 한꺼번에 겹쳐 보여서 너무 산만하다.
  label.style.display = isTransfer || options.isSelected ? "" : "none";
  label.textContent = station.name;
  wrapper.appendChild(label);

  return { wrapper, dot, label };
}

export function SubwayRouteBoard({
  active,
  stations,
  selectedStationId,
  stationFocusRequestKey,
  routeStationIds,
  departureTime,
  schedule,
  scheduleStatus,
  scheduleError,
  stationsLoading,
  onSelectStation,
  onRemoveRouteStation,
  onResetRoute,
  onRetryStations,
}: SubwayRouteBoardProps) {
  const stationsById = useMemo(() => new Map(stations.map((station) => [station.id, station])), [stations]);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapsRef = useRef<KakaoMaps | null>(null);
  const mapRef = useRef<KakaoMapInstance | null>(null);
  const polylinesRef = useRef<PolylineRecord[]>([]);
  const stationRecordsRef = useRef<StationRecord[]>([]);
  const centeredOnceRef = useRef(false);
  const [lineMap, setLineMap] = useState<LineMapData | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mapMessage, setMapMessage] = useState("노선도를 불러오는 중입니다");

  const appKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "";

  // 노선 하나를 진하게, 나머지를 흐리게 만든다. React state로 관리하지 않고
  // 이벤트 핸들러에서 직접 DOM/폴리라인 속성을 바꾼다 — 193역·244선 전체를
  // 리렌더마다 다시 그리면 느리고 깜빡인다.
  function applyLineHover(line: RealLineId | null) {
    for (const { overlay, line: polylineLine, hitArea } of polylinesRef.current) {
      if (hitArea) continue;
      overlay.setOptions({ strokeOpacity: !line || line === polylineLine ? 0.85 : DIMMED_OPACITY });
    }
    for (const { station, wrapper, label } of stationRecordsRef.current) {
      const belongsToHovered = !line || station.lines.includes(line);
      wrapper.style.opacity = belongsToHovered ? "1" : String(DIMMED_OPACITY);
      const isTransfer = station.lines.length > 1;
      // 강조된 노선의 역은 이름을 보여주고, 원래도 보이던 환승역 이름은 계속 보인다.
      label.style.display = isTransfer || (line !== null && belongsToHovered) ? "" : "none";
    }
  }

  // 노선 데이터는 한 번만 받는다.
  useEffect(() => {
    let active = true;
    loadSubwayLineMap()
      .then((data) => active && setLineMap(data))
      .catch(() => active && setMapStatus("error"));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!active || !mapRef.current) return;
    const task = window.setTimeout(() => mapRef.current?.relayout(), 0);
    return () => window.clearTimeout(task);
  }, [active]);

  const routeIndexByStation = useMemo(() => {
    const map = new Map<string, number>();
    routeStationIds.forEach((id, index) => map.set(id, index));
    return map;
  }, [routeStationIds]);

  // "선택한 경로" 칩 목록. 계산된 schedule이 있으면 자동으로 끼워 넣은 환승역까지 포함해서 보여주고
  // (원래는 routeStationIds만 돌아서 환승역이 아예 안 보였다), 아직 없으면 사용자가 고른 역만 보여준다.
  // 칩 배지 색은 그 역에서 타게 되는 실제 노선 색이라, 어디서 몇 호선으로 바뀌는지 한눈에 보인다.
  const displayStops = useMemo(() => {
    if (schedule) {
      return schedule.stops.map((stop, index) => {
        const isLast = index === schedule.stops.length - 1;
        const role: "출발" | "도착" | "환승" | "경유" =
          index === 0 ? "출발" : isLast ? "도착" : stop.isTransfer ? "환승" : "경유";
        const line = index < schedule.legs.length ? schedule.legs[index].line : schedule.legs.at(-1)?.line;
        return {
          id: stop.id,
          name: stop.name,
          time: stop.time,
          role,
          line,
          removable: routeStationIds.includes(stop.id),
        };
      });
    }
    return routeStationIds.map((stationId, index) => ({
      id: stationId,
      name: stationsById.get(stationId)?.name ?? "선택한 역",
      time: null as string | null,
      role: routeRole(index, routeStationIds.length) as "출발" | "도착" | "환승" | "경유",
      line: undefined as RealLineId | undefined,
      removable: true,
    }));
  }, [schedule, routeStationIds, stationsById]);

  // 시간표 없이 경로만 찾았을 때, 어떤 노선을 순서대로 타는지(연속된 같은 노선은 하나로 묶어서) 보여준다.
  const routeLineSequence = useMemo(() => {
    if (!schedule) return [] as RealLineId[];
    const sequence: RealLineId[] = [];
    for (const leg of schedule.legs) {
      if (sequence.at(-1) !== leg.line) sequence.push(leg.line);
    }
    return sequence;
  }, [schedule]);

  // 지도 생성 (최초 1회) + 노선/역/선택 상태가 바뀔 때마다 오버레이를 다시 그린다.
  useEffect(() => {
    if (!containerRef.current || !appKey || !lineMap) return;
    let active = true;

    void loadKakaoMaps(appKey)
      .then((maps) => {
        if (!active || !containerRef.current) return;
        mapsRef.current = maps;

        if (!mapRef.current) {
          mapRef.current = new maps.Map(containerRef.current, {
            center: new maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
            level: FIXED_LEVEL,
            disableDoubleClickZoom: true,
          });
          // 너무 확대하면 카카오 지도 자체의 건물·상호명 라벨이 잔뜩 나와서 노선도 글자와
          // 뒤섞여 산만해진다. 휠 스크롤·더블클릭·핀치 전부 막아서 1km 축척(FIXED_LEVEL)에
          // 완전히 고정한다 — min/max를 같은 값으로 둬서 프로그램적으로도 못 벗어나게 한다.
          mapRef.current.setMinLevel(FIXED_LEVEL);
          mapRef.current.setMaxLevel(FIXED_LEVEL);
          mapRef.current.setZoomable(false);
        }
        const map = mapRef.current;
        map.relayout();

        for (const { overlay } of polylinesRef.current) overlay.setMap(null);
        for (const { overlay } of stationRecordsRef.current) overlay.setMap(null);
        const polylines: PolylineRecord[] = [];
        const stationRecords: StationRecord[] = [];

        for (const edge of lineMap.edges) {
          const from = lineMap.stations.get(edge.from);
          const to = lineMap.stations.get(edge.to);
          if (!from || !to) continue;
          const polyline = new maps.Polyline({
            path: [new maps.LatLng(from.latitude, from.longitude), new maps.LatLng(to.latitude, to.longitude)],
            strokeWeight: 4,
            strokeColor: REAL_LINE_META[edge.line].color,
            strokeOpacity: 0.85,
            strokeStyle: "solid",
          });
          polyline.setMap(map);
          polylines.push({ overlay: polyline, line: edge.line, hitArea: false });

          // 화면에 보이는 선은 그대로 두고, 마우스 판정 범위만 넓힌 투명 선을 겹친다.
          // 사용자가 가는 선을 정밀하게 조준하지 않아도 노선 강조가 동작한다.
          const hitPolyline = new maps.Polyline({
            path: [new maps.LatLng(from.latitude, from.longitude), new maps.LatLng(to.latitude, to.longitude)],
            strokeWeight: 22,
            strokeColor: REAL_LINE_META[edge.line].color,
            strokeOpacity: 0.01,
            strokeStyle: "solid",
          });
          hitPolyline.setMap(map);
          maps.event.addListener(hitPolyline, "mouseover", () => applyLineHover(edge.line));
          maps.event.addListener(hitPolyline, "mouseout", () => applyLineHover(null));
          polylines.push({ overlay: hitPolyline, line: edge.line, hitArea: true });
        }

        for (const station of lineMap.stations.values()) {
          const { wrapper, dot, label } = stationDotContent(
            station,
            { isSelected: station.stationId === selectedStationId, routeIndex: routeIndexByStation.get(station.stationId) },
            () => onSelectStation(station.stationId),
            applyLineHover,
          );
          const overlay = new maps.CustomOverlay({
            map,
            position: new maps.LatLng(station.latitude, station.longitude),
            content: wrapper,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: station.stationId === selectedStationId ? 20 : station.lines.length > 1 ? 10 : 1,
          });
          stationRecords.push({ overlay, station, wrapper, dot, label });
        }

        polylinesRef.current = polylines;
        stationRecordsRef.current = stationRecords;
        setMapStatus("ready");
        setMapMessage("Kakao Map · 실제 위치 기반 노선도");

        if (!centeredOnceRef.current && selectedStationId) {
          const target = lineMap.stations.get(selectedStationId);
          if (target) {
            // level은 FIXED_LEVEL로 고정돼 있으니 중심만 옮긴다.
            map.setCenter(new maps.LatLng(target.latitude, target.longitude));
            centeredOnceRef.current = true;
          }
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMapStatus("error");
        setMapMessage(error instanceof Error ? error.message : "Kakao 지도를 표시하지 못했습니다.");
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey, lineMap, selectedStationId, routeIndexByStation]);

  // 선택한 역이 바뀌면 그쪽으로 부드럽게 이동한다 (최초 진입 이후).
  useEffect(() => {
    if (!centeredOnceRef.current || !mapRef.current || !mapsRef.current || !lineMap || !selectedStationId) return;
    const target = lineMap.stations.get(selectedStationId);
    if (!target) return;
    mapRef.current.setLevel(FIXED_LEVEL);
    mapRef.current.panTo(new mapsRef.current.LatLng(target.latitude, target.longitude));
  }, [selectedStationId, stationFocusRequestKey, lineMap]);

  return <section className="subwayRouteBoard" aria-label="지하철 경로 선택">
    <header className="subwayBoardHeader">
      <div>
        <p className="eyebrow">TIMETABLE ROUTE</p>
        <h2>시간표로 만드는 지하철 경로</h2>
        <p>노선도에서 역을 고르고 오른쪽 아래 추가 버튼을 누르세요. 첫 역은 출발, 마지막 역은 도착, 사이는 경유역이 됩니다.</p>
      </div>
      <div className="subwayDepartureInput" aria-live="polite"><Clock3 size={15} aria-hidden /><span>현재 시각</span><time>{departureTime || "--:--"}</time></div>
    </header>

    <div className="subwaySelectedRoute" aria-live="polite">
      <div className="subwaySelectedTopline"><strong>선택한 경로</strong>{routeStationIds.length ? <button type="button" onClick={onResetRoute}><RotateCcw size={14} aria-hidden /> 초기화</button> : null}</div>
      {routeStationIds.length ? <ol>
        {displayStops.map((stop, index) => (
          <li key={`${stop.id}-${index}`} className={stop.role}>
            <span style={stop.line ? { background: REAL_LINE_META[stop.line].color } : undefined}>{stop.role}</span>
            <strong>{stop.name}역</strong>
            {stop.time ? <time>{stop.time}</time> : null}
            {stop.removable
              ? <button type="button" aria-label={`${stop.name}역 경로에서 삭제`} onClick={() => onRemoveRouteStation(stop.id)}><X size={14} aria-hidden /></button>
              : <span className="subwayTransferBadge" aria-hidden><TrainFront size={12} /></span>}
          </li>
        ))}
      </ol> : <p className="subwayRouteEmpty">아직 추가한 역이 없습니다. 노선 위에서 역을 고른 뒤 파란 버튼을 눌러주세요.</p>}
      {scheduleStatus === "loading" ? <p className="subwayScheduleState">DB 시간표에서 같은 열차 번호를 찾는 중…</p> : null}
      {scheduleStatus === "success" && schedule ? (
        schedule.isFullyTimed ? (
          <div className="subwayScheduleSummary"><TrainFront size={17} aria-hidden /><span>{schedule.departureTime} 출발</span><i /><strong>{schedule.arrivalTime} 도착</strong><small>{schedule.durationMinutes}분 · 열차 {schedule.legs.map((leg) => leg.trainNo).join(" → ")}</small></div>
        ) : (
          <div className="subwayScheduleSummary pathOnly">
            <TrainFront size={17} aria-hidden />
            <span>경로만 확인됨</span>
            <i />
            <strong>{routeLineSequence.map((line) => REAL_LINE_META[line].label).join(" → ")}</strong>
            <small>일부 구간에 시간표 데이터가 없어 정확한 시각은 계산할 수 없습니다. 어느 역에서 환승하는지만 안내합니다.</small>
          </div>
        )
      ) : null}
      {scheduleStatus === "error" && scheduleError ? <p className="subwayScheduleError">{scheduleError}</p> : null}
    </div>

    <div className="subwayRailViewport">
      {!stations.length && !stationsLoading ? <div className="subwayStationEmpty" role="status">
        <TrainFront size={24} aria-hidden />
        <strong>역 정보를 불러오지 못했습니다</strong>
        <p>백엔드 연결을 확인한 뒤 다시 시도해 주세요.</p>
        <button type="button" onClick={onRetryStations}>역 다시 불러오기</button>
      </div> : !appKey ? <div className="subwayStationEmpty" role="status">
        <TrainFront size={24} aria-hidden />
        <strong>NEXT_PUBLIC_KAKAO_JS_KEY 설정이 필요합니다</strong>
      </div> : <>
        <div ref={containerRef} className="subwayLineMapCanvas" />
        <div className={`mapStatus ${mapStatus}`} role={mapStatus === "error" ? "alert" : "status"}>
          <strong>{mapStatus === "error" ? "지도 연결 확인 필요" : "Kakao Map"}</strong>
          <span>{mapMessage}</span>
        </div>
      </>}
    </div>

  </section>;
}
