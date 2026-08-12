"use client";

import type { components } from "@metrotrip/contracts";
import { Clock3, RotateCcw, TrainFront, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { SubwayRouteSchedule } from "@/lib/transitTimetable";

type Station = components["schemas"]["StationSummary"];

type SubwayRouteBoardProps = {
  stations: Station[];
  selectedStationId: string | null;
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

export function SubwayRouteBoard({
  stations,
  selectedStationId,
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
  const railRef = useRef<HTMLDivElement>(null);
  const orderedStations = useMemo(
    () => [...stations].sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name, "ko")),
    [stations],
  );
  const stationsById = useMemo(() => new Map(stations.map((station) => [station.id, station])), [stations]);

  useEffect(() => {
    const selected = railRef.current?.querySelector<HTMLElement>(`[data-station-id="${CSS.escape(selectedStationId ?? "")}"]`);
    selected?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedStationId]);

  return <section className="subwayRouteBoard" aria-label="지하철 경로 선택">
    <header className="subwayBoardHeader">
      <div>
        <p className="eyebrow">TIMETABLE ROUTE</p>
        <h2>시간표로 만드는 지하철 경로</h2>
        <p>역을 선택하고 오른쪽 아래 추가 버튼을 누르세요. 첫 역은 출발, 마지막 역은 도착, 사이는 경유역이 됩니다.</p>
      </div>
      <div className="subwayDepartureInput" aria-live="polite"><Clock3 size={15} aria-hidden /><span>현재 시각</span><time>{departureTime || "--:--"}</time></div>
    </header>

    <div className="subwaySelectedRoute" aria-live="polite">
      <div className="subwaySelectedTopline"><strong>선택한 경로</strong>{routeStationIds.length ? <button type="button" onClick={onResetRoute}><RotateCcw size={14} aria-hidden /> 초기화</button> : null}</div>
      {routeStationIds.length ? <ol>
        {routeStationIds.map((stationId, index) => {
          const station = stationsById.get(stationId);
          const scheduled = schedule?.stops.find((item) => item.id === stationId);
          return <li key={stationId} className={routeRole(index, routeStationIds.length)}>
            <span>{routeRole(index, routeStationIds.length)}</span>
            <strong>{station?.name ?? "선택한 역"}역</strong>
            {scheduled ? <time>{scheduled.time}</time> : null}
            <button type="button" aria-label={`${station?.name ?? "선택한"}역 경로에서 삭제`} onClick={() => onRemoveRouteStation(stationId)}><X size={14} aria-hidden /></button>
          </li>;
        })}
      </ol> : <p className="subwayRouteEmpty">아직 추가한 역이 없습니다. 노선 위에서 역을 고른 뒤 파란 버튼을 눌러주세요.</p>}
      {scheduleStatus === "loading" ? <p className="subwayScheduleState">DB 시간표에서 같은 열차 번호를 찾는 중…</p> : null}
      {scheduleStatus === "success" && schedule ? <div className="subwayScheduleSummary"><TrainFront size={17} aria-hidden /><span>{schedule.departureTime} 출발</span><i /><strong>{schedule.arrivalTime} 도착</strong><small>{schedule.durationMinutes}분 · 열차 {schedule.legs.map((leg) => leg.trainNo).join(" → ")}</small></div> : null}
      {scheduleStatus === "error" && scheduleError ? <p className="subwayScheduleError">{scheduleError}</p> : null}
    </div>

    <div className={`subwayRailViewport ${orderedStations.length ? "" : "empty"}`} ref={railRef}>
      {orderedStations.length ? <div className="subwayStationRail" style={{ "--station-count": orderedStations.length } as React.CSSProperties}>
        {orderedStations.map((station) => {
          const routeIndex = routeStationIds.indexOf(station.id);
          return <button
            type="button"
            key={station.id}
            data-station-id={station.id}
            className={routeIndex >= 0 ? "onRoute" : ""}
            aria-pressed={station.id === selectedStationId}
            onClick={() => onSelectStation(station.id)}
          >
            <span className="subwayRailLine" />
            <span className="subwayStationDot">{routeIndex >= 0 ? routeIndex + 1 : ""}</span>
            <strong>{station.name}</strong>
          </button>;
        })}
      </div> : <div className="subwayStationEmpty" role="status">
        <TrainFront size={24} aria-hidden />
        <strong>{stationsLoading ? "공식 API에서 역을 불러오는 중입니다" : "역 정보를 불러오지 못했습니다"}</strong>
        <p>{stationsLoading ? "잠시만 기다려 주세요." : "백엔드 연결을 확인한 뒤 다시 시도해 주세요."}</p>
        {!stationsLoading ? <button type="button" onClick={onRetryStations}>역 다시 불러오기</button> : null}
      </div>}
    </div>

    <footer className="subwayBoardFooter">
      <span><i /> 1호선 · MetroTrip DB</span>
      <span>시간표가 없는 구간은 임의로 추정하지 않습니다.</span>
    </footer>
  </section>;
}
