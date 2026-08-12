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
  lineId: string;
};

export type SubwayRouteScheduleStop = SubwayRouteStopInput & {
  time: string;
  minute: number;
};

export type SubwayRouteScheduleLeg = {
  fromStationId: string;
  toStationId: string;
  trainNo: string;
  direction: TimetableDirection;
  departureTime: string;
  arrivalTime: string;
};

export type SubwayRouteSchedule = {
  stops: SubwayRouteScheduleStop[];
  legs: SubwayRouteScheduleLeg[];
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  dayType: TimetableDayType;
};

type TimetableListResponse = { items: TimetableEntry[] };

const timetableCache = new Map<string, Promise<TimetableEntry[]>>();

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
  lineId: string,
  dayType: TimetableDayType,
  direction: TimetableDirection,
) {
  const key = `${stationId}:${lineId}:${dayType}:${direction}`;
  const cached = timetableCache.get(key);
  if (cached) return cached;

  const request = (async () => {
    const query = new URLSearchParams({
      line_id: lineId,
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

async function findNextTrain(
  from: SubwayRouteStopInput,
  to: SubwayRouteStopInput,
  earliestMinute: number,
  dayType: TimetableDayType,
): Promise<TrainCandidate | null> {
  if (!from.lineId || !to.lineId || from.lineId !== to.lineId) {
    throw new Error(`${from.name}역과 ${to.name}역의 공통 노선 정보를 확인할 수 없습니다.`);
  }

  const candidates = await Promise.all((["UP", "DOWN"] as const).map(async (direction) => {
    const [fromRows, toRows] = await Promise.all([
      fetchTimetables(from.id, from.lineId, dayType, direction),
      fetchTimetables(to.id, to.lineId, dayType, direction),
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
        matches.push({ trainNo: row.trainNo, direction, departureMinute, arrivalMinute });
      }
    }
    return matches;
  }));

  return candidates.flat().sort((a, b) =>
    a.departureMinute - b.departureMinute || a.arrivalMinute - b.arrivalMinute,
  )[0] ?? null;
}

export async function calculateSubwayRouteSchedule(
  stops: SubwayRouteStopInput[],
  departureTime: string,
): Promise<SubwayRouteSchedule> {
  if (stops.length < 2) throw new Error("출발역과 도착역을 선택해 주세요.");
  const departureMinute = parseClock(departureTime);
  if (departureMinute === null) throw new Error("출발 시각을 확인해 주세요.");

  const dayType = serviceDayType();
  const legs: SubwayRouteScheduleLeg[] = [];
  const scheduledStops: SubwayRouteScheduleStop[] = [];
  let earliestMinute = departureMinute;

  for (let index = 0; index < stops.length - 1; index += 1) {
    const from = stops[index];
    const to = stops[index + 1];
    const train = await findNextTrain(from, to, earliestMinute, dayType);
    if (!train) {
      throw new Error(`${from.name}역 → ${to.name}역을 잇는 실제 열차 시간표가 없습니다.`);
    }
    if (index === 0) {
      scheduledStops.push({ ...from, time: formatClock(train.departureMinute), minute: train.departureMinute });
    }
    scheduledStops.push({ ...to, time: formatClock(train.arrivalMinute), minute: train.arrivalMinute });
    legs.push({
      fromStationId: from.id,
      toStationId: to.id,
      trainNo: train.trainNo,
      direction: train.direction,
      departureTime: formatClock(train.departureMinute),
      arrivalTime: formatClock(train.arrivalMinute),
    });
    earliestMinute = train.arrivalMinute;
  }

  const actualDeparture = scheduledStops[0].minute;
  const actualArrival = scheduledStops.at(-1)?.minute ?? actualDeparture;
  return {
    stops: scheduledStops,
    legs,
    departureTime: formatClock(actualDeparture),
    arrivalTime: formatClock(actualArrival),
    durationMinutes: actualArrival - departureMinute,
    dayType,
  };
}
