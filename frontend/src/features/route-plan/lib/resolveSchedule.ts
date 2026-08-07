import type { DayType, Timetable } from '../api/timetables';
import type { RouteOption } from '../types';
import { toMinutes } from './clock';
import { MINUTES_PER_TRANSFER, type LineOrder } from './findRoutes';

/**
 * 열차 시간표로 실제 도착 시각을 계산한다 (docs/SPEC.md 2-2).
 *
 * `train_no` 로 같은 열차를 잇기 때문에, 어느 열차를 타면 몇 시에 닿는지
 * 정확히 알 수 있다. (V1.10 에서 `train_no` 컬럼이 생기기 전에는
 * 순서로 추정해야 했다 — docs/BACKEND-HANDOFF.md 참고)
 *
 * 시간표에 없는 구간이면 null 을 돌려주고, 화면은 근사치로 되돌아간다.
 */

/** 하루를 넘어가는 열차를 다루기 위한 분 단위 하루 길이 */
const DAY = 1440;

export type ResolvedSchedule = {
  /** `option.stations` 와 같은 순서의 도착 시각(자정 기준 분) */
  arrivals: number[];
  /**
   * 시간표에 그 역이 없어 앞뒤 역에서 추정한 자리.
   *
   * 시드에 직산·탕정·신창 시간표가 빠져 있어서 필요하다.
   * (docs/BACKEND-HANDOFF.md 에 DB 담당에게 전달할 사항으로 적어 뒀다)
   */
  interpolated: boolean[];
  /** 구간별로 타는 열차 번호 */
  trainNos: string[];
  /** 출발부터 도착까지 걸리는 시간(분) */
  totalMinutes: number;
};

type TrainStops = Map<string, Map<string, number>>;

/** `train_no` 별로 어느 역에 몇 분에 서는지 모아 둔다. */
function indexByTrain(timetables: Timetable[], dayType: DayType): TrainStops {
  const byTrain: TrainStops = new Map();

  for (const row of timetables) {
    if (row.dayType !== dayType) continue;
    const minutes = toMinutes(row.arrivalTime);
    if (minutes === null) continue;

    const stops = byTrain.get(row.trainNo) ?? new Map<string, number>();
    stops.set(row.stationName, minutes);
    byTrain.set(row.trainNo, stops);
  }

  return byTrain;
}

/**
 * 한 구간을 태워 줄 열차 중 가장 빨리 도착하는 것을 고른다.
 *
 * 자정을 넘겨 운행하는 열차가 있으므로, 오늘 시각으로 못 찾으면
 * 하루를 더한 시각으로도 확인한다.
 */
function findTrain(
  byTrain: TrainStops,
  boardStation: string,
  alightStation: string,
  earliestBoarding: number,
): { trainNo: string; board: number; alight: number } | null {
  let best: { trainNo: string; board: number; alight: number } | null = null;

  for (const [trainNo, stops] of byTrain) {
    const boardAt = stops.get(boardStation);
    const alightAt = stops.get(alightStation);
    if (boardAt === undefined || alightAt === undefined) continue;

    // 이 열차가 승차역 → 하차역 방향으로 가는지 확인한다.
    if (alightAt <= boardAt) continue;

    for (const offset of [0, DAY]) {
      const board = boardAt + offset;
      if (board < earliestBoarding) continue;

      const alight = alightAt + offset;
      if (!best || alight < best.alight) best = { trainNo, board, alight };
      break;
    }
  }

  return best;
}

/**
 * 경로 전체의 실제 도착 시각을 계산한다.
 *
 * 환승은 "내린 시각 이후에 오는 다음 열차"를 찾는 식으로 자연스럽게 처리된다.
 * 한 구간이라도 태워 줄 열차가 없으면 null.
 */
export function resolveSchedule(
  option: RouteOption,
  departureMinutes: number,
  timetables: Timetable[],
  dayType: DayType,
  _lineOrder: LineOrder,
): ResolvedSchedule | null {
  if (option.legs.length === 0) return null;

  const byTrain = indexByTrain(timetables, dayType);
  const arrivalByStation = new Map<string, number>();
  const estimatedStations = new Set<string>();
  const trainNos: string[] = [];

  let current = departureMinutes;

  for (const leg of option.legs) {
    const boardStation = leg.stations[0].name;
    const alightStation = leg.stations.at(-1)!.name;

    const train = findTrain(byTrain, boardStation, alightStation, current);
    if (!train) return null;

    const stops = byTrain.get(train.trainNo)!;
    // 이 열차가 실제로 하루를 넘겼는지에 맞춰 중간역 시각도 같이 민다.
    const offset = train.board - stops.get(boardStation)!;

    // 시간표에 없는 역은 일단 비워 두고, 아래에서 앞뒤 역 사이를 나눠 채운다.
    const times: (number | null)[] = leg.stations.map((station) => {
      const at = stops.get(station.name);
      return at === undefined ? null : at + offset;
    });

    for (let i = 0; i < times.length; i += 1) {
      if (times[i] !== null) continue;

      // 시각을 아는 가장 가까운 앞·뒤 역을 찾는다.
      let before = i - 1;
      while (before >= 0 && times[before] === null) before -= 1;
      let after = i + 1;
      while (after < times.length && times[after] === null) after += 1;
      if (before < 0 || after >= times.length) return null;

      // 두 역 사이를 역 수만큼 균등하게 나눈다.
      const span = times[after]! - times[before]!;
      times[i] = times[before]! + Math.round((span * (i - before)) / (after - before));
      estimatedStations.add(leg.stations[i].name);
    }

    leg.stations.forEach((station, index) => {
      arrivalByStation.set(station.name, times[index]!);
    });

    trainNos.push(train.trainNo);
    // 내리자마자 바로 탈 수는 없다. 갈아타는 도보 시간을 두고
    // 그 이후에 오는 열차를 찾는다.
    current = train.alight + MINUTES_PER_TRANSFER;
  }

  const arrivals = option.stations.map(
    (station) => arrivalByStation.get(station.name) ?? Number.NaN,
  );
  if (arrivals.some(Number.isNaN)) return null;

  return {
    arrivals,
    interpolated: option.stations.map((station) =>
      estimatedStations.has(station.name),
    ),
    trainNos,
    totalMinutes: arrivals.at(-1)! - departureMinutes,
  };
}
