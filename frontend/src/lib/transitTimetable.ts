import { LINE_ID_TO_REAL, loadSubwayLineMap, type LineMapData, type LineMapStation, type RealLineId } from "./subwayLineMap";

export type TimetableDayType = "WEEKDAY" | "WEEKEND";
export type TimetableDirection = "UP" | "DOWN";

export type TimetableEntry = {
  timetableId: number;
  trainNo: string | null;
  lineId: number;
  stationId: number;
  dayType: TimetableDayType;
  direction: TimetableDirection;
  arrivalTime: string | null;
  departureTime: string | null;
  destinationStationId: number | null;
  destinationStationName: string | null;
};

export type SubwayRouteStopInput = {
  id: string;
  name: string;
  /**
   * 더 이상 경로 계산에 쓰지 않는다(참고용으로만 남겨 둠).
   * 실제 계산은 stationId로 subwayLineMap의 원본 line_id 목록을 다시 조회해서 한다 —
   * 역 하나가 원본 line_id를 여러 개 가질 수 있어서(예: 1호선 트렁크 구간은 1·2 둘 다)
   * 이 필드 하나만으로는 환승 가능 여부를 판단할 수 없기 때문이다.
   */
  lineId: string;
};

export type SubwayRouteScheduleStop = SubwayRouteStopInput & {
  /** 시간표 데이터가 없어 경로만 찾은 구간이면 null. */
  time: string | null;
  minute: number | null;
  /** 사용자가 고른 역이 아니라, 두 역을 잇기 위해 자동으로 끼워 넣은 환승역이면 true. */
  isTransfer?: boolean;
};

export type SubwayRouteScheduleLeg = {
  fromStationId: string;
  toStationId: string;
  /** 이 구간이 지나는 실제 노선. 시간표가 없어도 경로 탐색만으로 항상 알 수 있다. */
  line: RealLineId;
  /** 시간표 데이터가 없어 열차를 특정하지 못했으면 아래 네 값이 모두 null. */
  trainNo: string | null;
  direction: TimetableDirection | null;
  departureTime: string | null;
  arrivalTime: string | null;
  /** 자정을 넘는 운행도 정확히 계산하기 위한 서비스일 기준 누적 분. */
  departureMinute: number | null;
  arrivalMinute: number | null;
};

export type SubwayRouteSchedule = {
  stops: SubwayRouteScheduleStop[];
  legs: SubwayRouteScheduleLeg[];
  departureTime: string;
  /** 구간 전체가 시간표로 확인됐을 때만 값이 있다. */
  arrivalTime: string | null;
  durationMinutes: number | null;
  dayType: TimetableDayType;
  /** false면 일부 구간이 시간표 없이 노선도 경로 탐색으로만 채워졌다는 뜻. */
  isFullyTimed: boolean;
};

type TimetableListResponse = { items: TimetableEntry[] };

const timetableCache = new Map<string, Promise<TimetableEntry[]>>();

// 노선도 데이터(역별 원본 line_id 목록)는 세션 동안 한 번만 받는다.
let lineMapPromise: Promise<LineMapData> | null = null;
function getLineMap(): Promise<LineMapData> {
  if (!lineMapPromise) lineMapPromise = loadSubwayLineMap();
  return lineMapPromise;
}

function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(-?\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function formatClock(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function serviceDayType(date = new Date()): TimetableDayType {
  const day = date.getDay();
  return day === 0 || day === 6 ? "WEEKEND" : "WEEKDAY";
}

async function fetchTimetables(
  stationId: string,
  lineId: number,
  dayType: TimetableDayType,
  direction: TimetableDirection,
) {
  const key = `${stationId}:${lineId}:${dayType}:${direction}`;
  const cached = timetableCache.get(key);
  if (cached) return cached;

  const request = (async () => {
    const query = new URLSearchParams({
      line_id: String(lineId),
      day_type: dayType,
      direction,
    });
    const response = await fetch(`/api/v1/stations/${encodeURIComponent(stationId)}/timetables?${query}`, {
      headers: { "X-Client-Platform": "web" },
    });
    if (!response.ok) {
      throw new Error(`시간표를 불러오지 못했습니다. (${response.status})`);
    }
    const payload = await response.json() as TimetableListResponse;
    return payload.items ?? [];
  })();

  timetableCache.set(key, request);
  try {
    return await request;
  } catch (error) {
    timetableCache.delete(key);
    throw error;
  }
}

type TrainCandidate = {
  trainNo: string;
  direction: TimetableDirection;
  departureMinute: number;
  arrivalMinute: number;
};

// 이 구간 하나(환승 없이 같은 열차로)를 타는 데 걸리는 시간의 상한선.
// trainNo만 보고 매칭하다 보니, 같은 열차 번호가 다른 날짜/다른 운행에 재사용된 경우
// "출발보다 도착이 빠르면 다음날로 넘긴다"는 보정 로직이 엉뚱하게 다음날 새벽 도착으로
// 계산해버리는 경우가 있었다(예: 금정→성환이 21시간대로 나옴). 정상적인 구간이면
// 아무리 길어도 3시간을 넘지 않으므로, 그보다 길게 나오면 매칭 자체가 잘못된 것으로 보고 버린다.
const MAX_LEG_MINUTES = 180;

/** 같은 원본 line_id 위에서(환승 없이) 다음 열차를 찾는다. */
async function findNextTrainOnLine(
  fromId: string,
  toId: string,
  rawLineId: number,
  earliestMinute: number,
  dayType: TimetableDayType,
): Promise<TrainCandidate | null> {
  const candidates = await Promise.all((["UP", "DOWN"] as const).map(async (direction) => {
    const [fromRows, toRows] = await Promise.all([
      fetchTimetables(fromId, rawLineId, dayType, direction),
      fetchTimetables(toId, rawLineId, dayType, direction),
    ]);
    const destinations = new Map<string, number[]>();
    for (const row of toRows) {
      if (!row.trainNo) continue;
      const minute = parseClock(row.arrivalTime ?? row.departureTime);
      if (minute === null) continue;
      destinations.set(row.trainNo, [...(destinations.get(row.trainNo) ?? []), minute]);
    }

    const matches: TrainCandidate[] = [];
    for (const row of fromRows) {
      if (!row.trainNo) continue;
      const departureMinute = parseClock(row.departureTime ?? row.arrivalTime);
      if (departureMinute === null || departureMinute < earliestMinute) continue;
      for (const rawArrival of destinations.get(row.trainNo) ?? []) {
        let arrivalMinute = rawArrival;
        while (arrivalMinute <= departureMinute) arrivalMinute += 1440;
        if (arrivalMinute - departureMinute > MAX_LEG_MINUTES) continue;
        matches.push({ trainNo: row.trainNo, direction, departureMinute, arrivalMinute });
      }
    }
    return matches;
  }));

  return candidates.flat().sort((a, b) =>
    a.departureMinute - b.departureMinute || a.arrivalMinute - b.arrivalMinute,
  )[0] ?? null;
}

/** 두 역이 원본 line_id를 하나라도 공유하면 그 값을(여러 개면 전부) 돌려준다. */
function sharedRawLineIds(from: LineMapStation, to: LineMapStation): number[] {
  return from.rawLineIds.filter((id) => to.rawLineIds.includes(id));
}

/**
 * from → to 로 갈아탈 수 있는 환승역 후보를 찾는다.
 * "이 역의 원본 line_id가 from 쪽과도 겹치고 to 쪽과도 겹친다"가 조건이다.
 * (같은 실제 노선이라도 1호선 인천/신창처럼 원본 line_id가 갈리는 두 지점을
 * 잇는 구로역 같은 분기점도 이 조건으로 정확히 잡힌다 — 이름만 다른 노선인
 * 경우(1·2·4호선 사이)뿐 아니라 같은 노선의 다른 갈래로 갈아타는 경우도 포함한다.)
 */
function findTransferCandidates(
  from: LineMapStation,
  to: LineMapStation,
  lineMap: LineMapData,
): LineMapStation[] {
  return [...lineMap.stations.values()].filter((station) => {
    if (station.stationId === from.stationId || station.stationId === to.stationId) return false;
    const matchesFrom = station.rawLineIds.some((id) => from.rawLineIds.includes(id));
    const matchesTo = station.rawLineIds.some((id) => to.rawLineIds.includes(id));
    return matchesFrom && matchesTo;
  });
}

type HopResult = {
  legs: SubwayRouteScheduleLeg[];
  /** from은 포함하지 않는다(호출부에서 이미 갖고 있으므로). to, 그리고 있다면 환승역을 담는다. */
  stops: SubwayRouteScheduleStop[];
  arrivalMinute: number;
  /** false면 시간표 없이 노선도 경로 탐색만으로 채운 구간이다. */
  timed: boolean;
};

function lineOf(station: LineMapStation, rawLineId: number): RealLineId {
  return LINE_ID_TO_REAL[rawLineId] ?? station.lines[0];
}

/** from → transfer → to 두 구간을 이어서 계산한다. 실패하면 null. */
async function tryTransferVia(
  from: LineMapStation,
  transfer: LineMapStation,
  to: LineMapStation,
  earliestMinute: number,
  dayType: TimetableDayType,
): Promise<HopResult | null> {
  const firstLegLineIds = sharedRawLineIds(from, transfer);
  if (firstLegLineIds.length === 0) return null;
  const firstAttempts = await Promise.all(
    firstLegLineIds.map(async (rawLineId) => ({
      rawLineId,
      train: await findNextTrainOnLine(from.stationId, transfer.stationId, rawLineId, earliestMinute, dayType),
    })),
  );
  const firstMatch = firstAttempts
    .filter((attempt): attempt is { rawLineId: number; train: TrainCandidate } => attempt.train !== null)
    .sort((a, b) => a.train.arrivalMinute - b.train.arrivalMinute)[0];
  if (!firstMatch) return null;
  const firstTrain = firstMatch.train;

  // 환승 시간을 최소 2분 둔다 (실제 환승 도보 시간의 아주 단순한 근사치).
  const secondLegEarliest = firstTrain.arrivalMinute + 2;
  const secondLegLineIds = sharedRawLineIds(transfer, to);
  if (secondLegLineIds.length === 0) return null;
  const secondAttempts = await Promise.all(
    secondLegLineIds.map(async (rawLineId) => ({
      rawLineId,
      train: await findNextTrainOnLine(transfer.stationId, to.stationId, rawLineId, secondLegEarliest, dayType),
    })),
  );
  const secondMatch = secondAttempts
    .filter((attempt): attempt is { rawLineId: number; train: TrainCandidate } => attempt.train !== null)
    .sort((a, b) => a.train.arrivalMinute - b.train.arrivalMinute)[0];
  if (!secondMatch) return null;
  const secondTrain = secondMatch.train;

  return {
    legs: [
      {
        fromStationId: from.stationId,
        toStationId: transfer.stationId,
        line: lineOf(from, firstMatch.rawLineId),
        trainNo: firstTrain.trainNo,
        direction: firstTrain.direction,
        departureTime: formatClock(firstTrain.departureMinute),
        arrivalTime: formatClock(firstTrain.arrivalMinute),
        departureMinute: firstTrain.departureMinute,
        arrivalMinute: firstTrain.arrivalMinute,
      },
      {
        fromStationId: transfer.stationId,
        toStationId: to.stationId,
        line: lineOf(transfer, secondMatch.rawLineId),
        trainNo: secondTrain.trainNo,
        direction: secondTrain.direction,
        departureTime: formatClock(secondTrain.departureMinute),
        arrivalTime: formatClock(secondTrain.arrivalMinute),
        departureMinute: secondTrain.departureMinute,
        arrivalMinute: secondTrain.arrivalMinute,
      },
    ],
    stops: [
      { id: transfer.stationId, name: transfer.name, lineId: "", time: formatClock(firstTrain.arrivalMinute), minute: firstTrain.arrivalMinute, isTransfer: true },
      { id: to.stationId, name: to.name, lineId: "", time: formatClock(secondTrain.arrivalMinute), minute: secondTrain.arrivalMinute },
    ],
    arrivalMinute: secondTrain.arrivalMinute,
    timed: true,
  };
}

type PathEdge = { from: string; to: string; line: RealLineId };

/**
 * 시간표와 상관없이, 노선도(역-간선 그래프) 위에서 from → to로 가는 경로를
 * 최단 정거장 수 기준으로 찾는다. 실제 노선이 전부 하나로 연결돼 있어서
 * 웬만하면 항상 경로가 나온다 — 시간표 데이터가 없어도 "어느 역에서
 * 환승해야 하는지"는 항상 보여줄 수 있게 하기 위한 fallback이다.
 */
function findTopologicalPath(fromId: string, toId: string, lineMap: LineMapData): PathEdge[] | null {
  if (fromId === toId) return [];
  const adjacency = new Map<string, PathEdge[]>();
  const addEdge = (from: string, to: string, line: RealLineId) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push({ from, to, line });
  };
  for (const edge of lineMap.edges) {
    addEdge(edge.from, edge.to, edge.line);
    addEdge(edge.to, edge.from, edge.line);
  }

  const visited = new Set<string>([fromId]);
  const queue: string[] = [fromId];
  const cameFrom = new Map<string, PathEdge>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === toId) break;
    for (const edge of adjacency.get(current) ?? []) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      cameFrom.set(edge.to, edge);
      queue.push(edge.to);
    }
  }
  if (!visited.has(toId)) return null;

  const path: PathEdge[] = [];
  let cursor = toId;
  while (cursor !== fromId) {
    const edge = cameFrom.get(cursor);
    if (!edge) return null;
    path.unshift(edge);
    cursor = edge.from;
  }
  return path;
}

/** 시간표 없이, 경로(어느 역·어느 노선을 타는지)만 채운 HopResult를 만든다. */
function buildPathOnlyHop(pathEdges: PathEdge[], toName: string, lineMap: LineMapData, earliestMinute: number): HopResult {
  const legs: SubwayRouteScheduleLeg[] = pathEdges.map((edge) => ({
    fromStationId: edge.from,
    toStationId: edge.to,
    line: edge.line,
    trainNo: null,
    direction: null,
    departureTime: null,
    arrivalTime: null,
    departureMinute: null,
    arrivalMinute: null,
  }));

  const stops: SubwayRouteScheduleStop[] = [];
  for (let index = 0; index < pathEdges.length - 1; index += 1) {
    const edge = pathEdges[index];
    const isTransfer = pathEdges[index + 1].line !== edge.line;
    if (!isTransfer) continue;
    const station = lineMap.stations.get(edge.to);
    stops.push({ id: edge.to, name: station?.name ?? edge.to, lineId: "", time: null, minute: null, isTransfer: true });
  }
  const last = pathEdges.at(-1);
  stops.push({ id: last?.to ?? "", name: toName, lineId: "", time: null, minute: null });

  return { legs, stops, arrivalMinute: earliestMinute, timed: false };
}

/**
 * 두 역 사이 한 구간을 계산한다. 같은 원본 line_id를 공유하면 환승 없이,
 * 아니면 가능한 환승역을 전부 시도해서 총 소요시간이 가장 짧은 경로를 고른다.
 */
async function resolveHop(
  fromId: string,
  fromName: string,
  toId: string,
  toName: string,
  earliestMinute: number,
  dayType: TimetableDayType,
  lineMap: LineMapData,
): Promise<HopResult> {
  const from = lineMap.stations.get(fromId);
  const to = lineMap.stations.get(toId);
  if (!from || !to) {
    throw new Error(`${fromName}역 또는 ${toName}역의 노선 정보를 찾을 수 없습니다.`);
  }

  const directLineIds = sharedRawLineIds(from, to);
  if (directLineIds.length > 0) {
    const directAttempts = await Promise.all(
      directLineIds.map(async (rawLineId) => ({
        rawLineId,
        train: await findNextTrainOnLine(fromId, toId, rawLineId, earliestMinute, dayType),
      })),
    );
    const directMatch = directAttempts
      .filter((attempt): attempt is { rawLineId: number; train: TrainCandidate } => attempt.train !== null)
      .sort((a, b) => a.train.arrivalMinute - b.train.arrivalMinute)[0];
    if (directMatch) {
      const direct = directMatch.train;
      return {
        legs: [{
          fromStationId: fromId,
          toStationId: toId,
          line: lineOf(from, directMatch.rawLineId),
          trainNo: direct.trainNo,
          direction: direct.direction,
          departureTime: formatClock(direct.departureMinute),
          arrivalTime: formatClock(direct.arrivalMinute),
          departureMinute: direct.departureMinute,
          arrivalMinute: direct.arrivalMinute,
        }],
        stops: [{ id: toId, name: toName, lineId: "", time: formatClock(direct.arrivalMinute), minute: direct.arrivalMinute }],
        arrivalMinute: direct.arrivalMinute,
        timed: true,
      };
    }
    // 같은 노선인데 그 구간 시간표만 비어 있으면(예: 그 시각엔 운행이 없음), 다른 노선을
    // 거쳐 갈아타는 건 의미가 없다 — 그대로 아래 노선도 경로 탐색으로 넘어간다.
  } else {
    // from·to가 원본 line_id를 하나도 안 겹치는 진짜 노선 간 이동일 때만 환승역을 찾는다.
    // (같은 노선일 때도 이 탐색을 돌리면, 그 노선에 속한 역 수십~수백 개가 전부
    // "환승 후보"로 잡혀서 API 요청이 폭발적으로 늘어난다 — 실제로 탕정처럼 노선이
    // 넓은 구간에서 응답이 몇십 초씩 걸리던 원인이 이거였다.)
    const transferCandidates = findTransferCandidates(from, to, lineMap);
    const attempts = await Promise.all(
      transferCandidates.map((transfer) => tryTransferVia(from, transfer, to, earliestMinute, dayType)),
    );
    const successful = attempts.filter((result): result is HopResult => result !== null);
    successful.sort((a, b) => a.arrivalMinute - b.arrivalMinute);

    if (successful.length > 0) return successful[0];
  }

  // 시간표로는 못 찾았어도, 노선도 그래프 위에서 경로 자체는 항상 찾아본다
  // (환승역이 어디인지는 시간표 유무와 상관없이 알 수 있는 정보다).
  const pathEdges = findTopologicalPath(fromId, toId, lineMap);
  if (pathEdges && pathEdges.length > 0) {
    return buildPathOnlyHop(pathEdges, toName, lineMap, earliestMinute);
  }

  throw new Error(`${fromName}역과 ${toName}역을 잇는 경로를 찾을 수 없습니다.`);
}

export async function calculateSubwayRouteSchedule(
  stops: SubwayRouteStopInput[],
  departureTime: string,
): Promise<SubwayRouteSchedule> {
  if (stops.length < 2) throw new Error("출발역과 도착역을 선택해 주세요.");
  const departureMinute = parseClock(departureTime);
  if (departureMinute === null) throw new Error("출발 시각을 확인해 주세요.");

  const dayType = serviceDayType();
  const lineMap = await getLineMap();

  const legs: SubwayRouteScheduleLeg[] = [];
  const scheduledStops: SubwayRouteScheduleStop[] = [
    { ...stops[0], time: formatClock(departureMinute), minute: departureMinute },
  ];
  let earliestMinute = departureMinute;
  let fullyTimed = true;

  for (let index = 0; index < stops.length - 1; index += 1) {
    const from = stops[index];
    const to = stops[index + 1];
    const hop = await resolveHop(from.id, from.name, to.id, to.name, earliestMinute, dayType, lineMap);
    if (!hop.timed) fullyTimed = false;
    legs.push(...hop.legs);
    // hop.stops의 마지막 항목은 항상 to역이다. lineId는 원래 사용자가 고른 stop의 값을 그대로 쓴다
    // (resolveHop 내부에서는 lineId를 모르니 빈 문자열로 채워 뒀다).
    scheduledStops.push(...hop.stops.slice(0, -1), { ...hop.stops.at(-1)!, lineId: to.lineId });
    // 시간을 모르는 구간을 지나면 그 뒤로는 "몇 시에 그 역을 지났는지" 자체를 알 수 없으므로
    // 기준 시각을 더 이상 앞으로 당기지 않는다(다음 구간도 같은 기준으로 최선을 다해 탐색한다).
    if (hop.timed) earliestMinute = hop.arrivalMinute;
  }

  // 검색 기준 시각은 "이 시각 이후 가장 빠른 열차"를 찾기 위한 값일 뿐 실제 출발시각이 아니다.
  // 열차 번호로 양 끝 역 시간표를 매칭한 첫 구간의 실제 출발시각을 경로와 일정의 출발로 사용한다.
  const actualDeparture = legs.find((leg) => leg.departureMinute !== null)?.departureMinute ?? departureMinute;
  scheduledStops[0] = {
    ...scheduledStops[0],
    time: formatClock(actualDeparture),
    minute: actualDeparture,
  };
  const lastMinute = scheduledStops.at(-1)?.minute ?? null;
  const actualArrival = fullyTimed ? lastMinute : null;
  return {
    stops: scheduledStops,
    legs,
    departureTime: formatClock(actualDeparture),
    arrivalTime: actualArrival !== null ? formatClock(actualArrival) : null,
    durationMinutes: actualArrival !== null ? actualArrival - actualDeparture : null,
    dayType,
    isFullyTimed: fullyTimed,
  };
}
