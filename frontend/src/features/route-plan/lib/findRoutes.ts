import type { Station } from '../../../shared/types/station';
import type {
  RouteLeg,
  RouteOption,
  RouteOptionKind,
  RouteStation,
} from '../types';

/**
 * 경로 탐색 (docs/SPEC.md 2-2).
 *
 * `(역, 타고 있는 노선)` 을 하나의 상태로 두고 다익스트라로 탐색한다.
 * 같은 역에서 노선만 바꾸는 것이 곧 환승이므로, 환승을 자연스럽게 표현할 수 있다.
 *
 * 지금 데이터는 1호선 하나뿐이라 환승이 발생하지 않지만,
 * DB 담당이 다노선 데이터를 API 로 내려주면 코드 수정 없이 그대로 동작한다.
 */

/** 역 한 칸을 지나는 데 걸리는 시간(분). 시간표가 없어 쓰는 근사치. */
export const MINUTES_PER_HOP = 2;

/** 환승 한 번에 걸리는 시간(분). 시간표가 없어 쓰는 근사치. */
export const MINUTES_PER_TRANSFER = 5;

/** 노선별 역 순서. DB 의 `line_stations.station_order` 에 대응한다. */
export type LineOrder = Record<string, string[]>;

type SearchState = {
  station: string;
  line: string;
  /** 지금까지 지나온 역 간격 수 */
  hops: number;
  /** 지금까지의 환승 횟수 */
  transfers: number;
  prev: SearchState | null;
};

/** 노선 그래프. 탐색에 필요한 인접 정보를 미리 만들어 둔다. */
type LineGraph = {
  /** 역명 → 그 역이 속한 노선 목록. 두 개 이상이면 환승역이다. */
  linesByStation: Map<string, string[]>;
  /** `역명|노선` → 그 노선에서 바로 옆에 있는 역명들 */
  neighbors: Map<string, string[]>;
};

const stateKey = (station: string, line: string) => `${station}|${line}`;

/**
 * 노선 순서 데이터로 그래프를 만든다.
 *
 * 좌표를 모르는 역(= `stations` 에 없는 역)은 제외한다.
 * 경유역마다 주변 장소를 보여줘야 하므로 좌표 없는 역은 쓸 수 없다.
 */
function buildGraph(stations: Station[], lineOrder: LineOrder): LineGraph {
  const known = new Set(stations.map((station) => station.name));
  const linesByStation = new Map<string, string[]>();
  const neighbors = new Map<string, string[]>();

  for (const [line, names] of Object.entries(lineOrder)) {
    const ordered = names.filter((name) => known.has(name));

    ordered.forEach((name, index) => {
      const lines = linesByStation.get(name) ?? [];
      if (!lines.includes(line)) lines.push(line);
      linesByStation.set(name, lines);

      const adjacent: string[] = [];
      if (index > 0) adjacent.push(ordered[index - 1]);
      if (index < ordered.length - 1) adjacent.push(ordered[index + 1]);
      neighbors.set(stateKey(name, line), adjacent);
    });
  }

  return { linesByStation, neighbors };
}

/** 지금까지 걸린 시간(분). 시간표가 없어 근사치다. */
function minutesOf(state: SearchState): number {
  return (
    state.hops * MINUTES_PER_HOP + state.transfers * MINUTES_PER_TRANSFER
  );
}

/**
 * 비교 기준을 [1순위, 2순위] 로 돌려준다.
 *
 * 최소 시간은 걸리는 시간을 먼저 보고, 최소 환승은 환승 횟수를 먼저 본다.
 * 정차역 수가 아니라 **시간**으로 비교하므로, 역 사이 소요 시간이 구간마다
 * 다른 실제 시간표가 들어와도 기준이 그대로 유지된다.
 */
function costOf(state: SearchState, kind: RouteOptionKind): [number, number] {
  const minutes = minutesOf(state);
  return kind === 'fastest'
    ? [minutes, state.transfers]
    : [state.transfers, minutes];
}

function isCheaper(a: [number, number], b: [number, number]): boolean {
  return a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1];
}

/** 탐색 상태를 화면에서 쓸 역 정보로 바꾼다. */
function toRouteStation(
  stationByName: Map<string, Station>,
  name: string,
  line: string,
): RouteStation {
  const station = stationByName.get(name);
  return {
    // API 가 붙으면 stations.station_id 가 들어올 자리다.
    id: name,
    name,
    lat: station?.lat ?? 0,
    lng: station?.lng ?? 0,
    line,
  };
}

/** 도착 상태에서 prev 를 거슬러 올라가 경로 한 안을 만든다. */
function buildOption(
  goal: SearchState,
  kind: RouteOptionKind,
  stationByName: Map<string, Station>,
): RouteOption {
  const chain: SearchState[] = [];
  for (let state: SearchState | null = goal; state; state = state.prev) {
    chain.unshift(state);
  }

  // 환승 지점은 같은 역이 노선만 바꿔 두 번 등장한다.
  // 노선이 바뀌는 곳에서 구간을 끊으면, 환승역이 이전 구간의 하차역이자
  // 다음 구간의 승차역으로 양쪽에 들어간다.
  const legs: RouteLeg[] = [];
  const stations: RouteStation[] = [];

  for (const state of chain) {
    const station = toRouteStation(stationByName, state.station, state.line);

    const lastLeg = legs.at(-1);
    if (lastLeg && lastLeg.line === state.line) {
      lastLeg.stations.push(station);
    } else {
      legs.push({ line: state.line, stations: [station] });
    }

    // 환승으로 중복된 역은 전체 경유역 목록에 한 번만 넣는다.
    if (stations.at(-1)?.name !== station.name) stations.push(station);
  }

  return {
    kind,
    // 환승 직후·직전에 생기는 역 한 개짜리 구간은 실제 이동이 아니므로 버린다.
    legs: legs.filter((leg) => leg.stations.length > 1),
    stations,
    transferCount: goal.transfers,
    hopCount: goal.hops,
    estimatedMinutes:
      goal.hops * MINUTES_PER_HOP + goal.transfers * MINUTES_PER_TRANSFER,
  };
}

/** 한 가지 기준으로 최적 경로를 찾는다. 경로가 없으면 null. */
function search(
  graph: LineGraph,
  stationByName: Map<string, Station>,
  fromName: string,
  toName: string,
  kind: RouteOptionKind,
): RouteOption | null {
  const queue: SearchState[] = [];
  const visited = new Set<string>();

  // 출발역이 속한 모든 노선에서 시작한다. 첫 승차는 환승으로 세지 않는다.
  for (const line of graph.linesByStation.get(fromName) ?? []) {
    queue.push({ station: fromName, line, hops: 0, transfers: 0, prev: null });
  }

  while (queue.length > 0) {
    // 역이 수백 개 규모라 선형 탐색으로 충분하다.
    let bestIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (isCheaper(costOf(queue[i], kind), costOf(queue[bestIndex], kind))) {
        bestIndex = i;
      }
    }
    const current = queue.splice(bestIndex, 1)[0];

    const key = stateKey(current.station, current.line);
    if (visited.has(key)) continue;
    visited.add(key);

    if (current.station === toName) {
      return buildOption(current, kind, stationByName);
    }

    // 같은 노선을 따라 옆 역으로 이동
    for (const next of graph.neighbors.get(key) ?? []) {
      queue.push({
        station: next,
        line: current.line,
        hops: current.hops + 1,
        transfers: current.transfers,
        prev: current,
      });
    }

    // 같은 역에서 다른 노선으로 환승
    for (const line of graph.linesByStation.get(current.station) ?? []) {
      if (line === current.line) continue;
      queue.push({
        station: current.station,
        line,
        hops: current.hops,
        transfers: current.transfers + 1,
        prev: current,
      });
    }
  }

  return null;
}

/** 두 안이 실제로 같은 경로인지 비교한다. */
const sameRoute = (a: RouteOption, b: RouteOption) =>
  a.stations.map((station) => station.name).join('>') ===
  b.stations.map((station) => station.name).join('>');

/**
 * 최소 시간·최소 환승 두 안을 계산한다.
 *
 * 두 결과가 같으면(지금처럼 단일 노선일 때) 한 개만 돌려준다.
 * 출발역과 도착역이 같거나 이어지는 경로가 없으면 빈 배열이다.
 */
export function findRouteOptions(
  stations: Station[],
  lineOrder: LineOrder,
  fromName: string,
  toName: string,
): RouteOption[] {
  if (fromName === toName) return [];

  const graph = buildGraph(stations, lineOrder);
  const stationByName = new Map(
    stations.map((station) => [station.name, station]),
  );

  const fastest = search(graph, stationByName, fromName, toName, 'fastest');
  if (!fastest) return [];

  const fewest = search(
    graph,
    stationByName,
    fromName,
    toName,
    'fewestTransfers',
  );
  if (!fewest || sameRoute(fastest, fewest)) return [fastest];

  return [fastest, fewest];
}
