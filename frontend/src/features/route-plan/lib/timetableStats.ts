import type { Timetable } from '../api/timetables';
import { toMinutes } from './clock';
import type { LineOrder } from './findRoutes';

/**
 * 시간표에서 "역간 소요"와 "배차 간격"을 뽑는다 (docs/SPEC.md 2-2).
 *
 * 시간표가 없는 구간은 이 값으로 시각을 추정한다.
 * 상수를 손으로 박아 두면 실제와 크게 어긋난다 — 처음에 `역당 2분`으로 뒀더니
 * 실제(평균 3.75분)의 절반이라 도착 시각이 30~40분씩 빨랐다.
 *
 * 시간표에서 계산하므로, DB 가 시간표를 채울수록 추정도 저절로 정확해진다.
 */

/** 시간표가 아예 없을 때 쓰는 값. 수도권 전철의 대략적인 수치. */
const DEFAULT_MINUTES_PER_HOP = 3.5;
const DEFAULT_HEADWAY = 12;

export type TimetableStats = {
  /** 역 하나를 지나는 데 걸리는 시간(분) */
  minutesPerHop: number;
  /**
   * 열차를 기다리는 시간(분).
   *
   * 언제 도착할지 모르고 역에 갔다면 평균 대기는 배차 간격의 절반이다.
   */
  averageWait: number;
  /** 실제 시간표에서 뽑은 값인지 */
  fromTimetable: boolean;
};

const DEFAULT_STATS: TimetableStats = {
  minutesPerHop: DEFAULT_MINUTES_PER_HOP,
  averageWait: DEFAULT_HEADWAY / 2,
  fromTimetable: false,
};

const median = (values: number[]) =>
  values.length === 0
    ? 0
    : [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

export function computeTimetableStats(
  timetables: Timetable[],
  lineOrder: LineOrder,
): TimetableStats {
  if (timetables.length === 0) return DEFAULT_STATS;

  // 노선 안에서 역이 몇 번째인지 — 두 역이 몇 칸 떨어졌는지 세는 데 쓴다.
  const indexOf = new Map<string, Map<string, number>>();
  for (const [line, names] of Object.entries(lineOrder)) {
    indexOf.set(line, new Map(names.map((name, index) => [name, index])));
  }

  const byTrain = new Map<string, Timetable[]>();
  for (const row of timetables) {
    byTrain.set(row.trainNo, [...(byTrain.get(row.trainNo) ?? []), row]);
  }

  const hopMinutes: number[] = [];

  for (const rows of byTrain.values()) {
    const order = indexOf.get(rows[0].line);
    if (!order) continue;

    const stops = rows
      .map((row) => ({
        at: toMinutes(row.arrivalTime),
        index: order.get(row.stationName),
      }))
      .filter(
        (stop): stop is { at: number; index: number } =>
          stop.at !== null && stop.index !== undefined,
      )
      .sort((a, b) => a.index - b.index);

    for (let i = 1; i < stops.length; i += 1) {
      const minutes = stops[i].at - stops[i - 1].at;
      const hops = stops[i].index - stops[i - 1].index;
      // 자정을 넘긴 열차나 뒤집힌 값은 버린다.
      if (minutes <= 0 || hops <= 0 || minutes > 120) continue;
      hopMinutes.push(minutes / hops);
    }
  }

  // 배차 간격 — 같은 역·같은 방향에 열차가 얼마 간격으로 오는지.
  const gaps: number[] = [];
  const byStop = new Map<string, number[]>();
  for (const row of timetables) {
    const at = toMinutes(row.arrivalTime);
    if (at === null) continue;
    const key = `${row.stationName}|${row.direction}`;
    byStop.set(key, [...(byStop.get(key) ?? []), at]);
  }
  for (const times of byStop.values()) {
    const sorted = [...times].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = sorted[i] - sorted[i - 1];
      // 막차와 첫차 사이 같은 큰 공백은 배차로 보지 않는다.
      if (gap > 0 && gap <= 60) gaps.push(gap);
    }
  }

  if (hopMinutes.length === 0) return DEFAULT_STATS;

  return {
    // 평균은 예외적인 긴 구간에 끌려가므로 중앙값을 쓴다.
    minutesPerHop: median(hopMinutes),
    averageWait:
      gaps.length > 0 ? median(gaps) / 2 : DEFAULT_HEADWAY / 2,
    fromTimetable: true,
  };
}
