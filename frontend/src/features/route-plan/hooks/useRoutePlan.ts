import { useCallback, useEffect, useMemo, useState } from 'react';
import { getStations } from '../../../shared/lib/stations';
import type { Station } from '../../../shared/types/station';
import { getLineOrder, searchRoutes } from '../api/routes';
import {
  getTimetables,
  getTodayDayType,
  type Timetable,
} from '../api/timetables';
import type { LineOrder } from '../lib/findRoutes';
import {
  buildSchedule,
  currentClock,
  toMinutes,
  type RouteSchedule,
} from '../lib/routeSchedule';
import { computeTimetableStats } from '../lib/timetableStats';
import type {
  RouteOptionKind,
  RouteSearchResult,
  RouteSearchStatus,
} from '../types';

/**
 * 경로 화면 상태 (docs/SPEC.md 2-2).
 *
 * 출발·도착역이 바뀌면 경로를 다시 계산하고, 계산된 안 중 하나를 확정해 둔다.
 */

/** 처음 보여줄 구간. 탕정역을 경유해 장소 추천까지 확인할 수 있는 구간으로 골랐다. */
const DEFAULT_FROM = '천안역';
const DEFAULT_TO = '온양온천역';

export function useRoutePlan() {
  const [stations, setStations] = useState<Station[]>([]);
  const [lineOrder, setLineOrder] = useState<LineOrder>({});
  const [fromName, setFromName] = useState(DEFAULT_FROM);
  const [toName, setToName] = useState(DEFAULT_TO);
  const [result, setResult] = useState<RouteSearchResult | null>(null);
  const [status, setStatus] = useState<RouteSearchStatus>('idle');
  const [selectedKind, setSelectedKind] = useState<RouteOptionKind | null>(null);
  /** 출발 시각 "HH:MM". 기본값은 지금 시각. */
  const [departureAt, setDepartureAt] = useState(currentClock);
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const dayType = getTodayDayType();

  useEffect(() => {
    let alive = true;
    getStations().then((loaded) => {
      if (alive) setStations(loaded);
    });
    getLineOrder().then((loaded) => {
      if (alive) setLineOrder(loaded);
    });
    getTimetables(dayType).then((loaded) => {
      if (alive) setTimetables(loaded);
    });
    return () => {
      alive = false;
    };
  }, [dayType]);

  useEffect(() => {
    let alive = true;
    setStatus('loading');

    searchRoutes(fromName, toName)
      .then((found) => {
        if (!alive) return;
        setResult(found);
        // 계산 결과가 바뀌면 첫 번째 안(최소 시간)을 기본으로 확정한다.
        setSelectedKind(found?.options[0]?.kind ?? null);
        setStatus('success');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });

    return () => {
      alive = false;
    };
  }, [fromName, toName]);

  const swap = useCallback(() => {
    setFromName(toName);
    setToName(fromName);
  }, [fromName, toName]);

  /**
   * 지도에서 역을 골랐을 때 출발·도착에 반영한다.
   *
   * 이미 반대쪽으로 지정된 역을 다시 고르면 두 역을 맞바꾼다.
   * (출발=도착이 되어 "경로 없음"으로 빠지는 것을 막는다)
   */
  const pickStation = useCallback(
    (stationName: string, kind: 'from' | 'to') => {
      if (kind === 'from') {
        if (stationName === toName) setToName(fromName);
        setFromName(stationName);
        return;
      }
      if (stationName === fromName) setFromName(toName);
      setToName(stationName);
    },
    [fromName, toName],
  );

  const selectedOption = useMemo(
    () =>
      result?.options.find((option) => option.kind === selectedKind) ?? null,
    [result, selectedKind],
  );

  /** 지도에서 굵게 강조할 경유역 이름 */
  const routeStationNames = useMemo(
    () => selectedOption?.stations.map((station) => station.name) ?? [],
    [selectedOption],
  );

  /**
   * 시간표가 있는 역.
   *
   * 이 역들만 실제 열차를 따라간 정확한 시각을 줄 수 있다.
   * 지도에서 눈에 띄게 그려 어디가 정확한지 알 수 있게 한다.
   */
  const timetableStations = useMemo(
    () => new Set(timetables.map((row) => row.stationName)),
    [timetables],
  );

  /**
   * 역간 소요·배차 간격을 실제 시간표에서 뽑아 둔다.
   * 시간표가 없는 구간의 시각을 추정하는 데 쓴다.
   */
  const stats = useMemo(
    () => computeTimetableStats(timetables, lineOrder),
    [timetables, lineOrder],
  );

  /**
   * 안별 도착 시각.
   *
   * 시간표가 있으면 실제 열차를 따라간 시각, 없으면 위 통계로 추정한다.
   * 비교 카드가 "언제 도착하는지"로 두 안을 견주므로 안마다 따로 계산한다.
   */
  const schedules = useMemo(() => {
    const departureMinutes = toMinutes(departureAt);
    const byKind = new Map<RouteOptionKind, RouteSchedule>();
    if (departureMinutes === null || !result) return byKind;

    for (const option of result.options) {
      byKind.set(
        option.kind,
        buildSchedule(
          option,
          departureMinutes,
          timetables,
          dayType,
          lineOrder,
          stats,
        ),
      );
    }
    return byKind;
  }, [result, departureAt, timetables, dayType, lineOrder, stats]);

  const selectedSchedule = selectedKind
    ? (schedules.get(selectedKind) ?? null)
    : null;

  return {
    stations,
    lineOrder,
    fromName,
    toName,
    pickStation,
    swap,
    status,
    result,
    selectedKind,
    setSelectedKind,
    selectedOption,
    routeStationNames,
    departureAt,
    setDepartureAt,
    schedules,
    selectedSchedule,
    stats,
    timetableStations,
  };
}
