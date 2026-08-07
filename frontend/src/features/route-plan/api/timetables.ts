import timetableData from '../data/timetables.json';

/**
 * 열차 시간표 접근 계층.
 *
 * DB 담당이 올린 시드(`db/seed/seed_08_train_timetables.sql`)를
 * `scripts/convertSeed.mjs` 로 변환해 정적 JSON 으로 쓰고 있다.
 * 백엔드 API 가 붙으면 **이 파일 내부만** 아래 호출로 교체한다.
 *
 *   GET /api/v1/stations/{station_id}/timetables?line_id=&day_type=&direction=
 *
 * (routes.ts / places.ts 와 같은 방식 — docs/BACKEND-HANDOFF.md)
 */

/**
 * DB `train_timetables.day_type` 과 같은 값.
 * 코레일 광역철도는 토·일 시간표가 같아 평일/주말 2종이다 (V1.10).
 */
export type DayType = 'WEEKDAY' | 'WEEKEND';

/** DB `train_timetables.direction` 과 같은 값 */
export type Direction = 'UP' | 'DOWN';

/** 한 열차가 한 역에 서는 시각 */
export type Timetable = {
  /** 같은 열차를 잇는 열쇠. V1.10 에서 추가된 `train_no`. */
  trainNo: string;
  line: string;
  stationName: string;
  dayType: DayType;
  direction: Direction;
  /** "HH:MM" */
  arrivalTime: string;
  /** 종착역. 없으면 null */
  destination: string | null;
};

const timetables = timetableData as Timetable[];

/** 오늘 날짜에 해당하는 요일 구분. 공휴일은 아직 구분하지 않는다. */
export function getTodayDayType(): DayType {
  const day = new Date().getDay();
  return day === 0 || day === 6 ? 'WEEKEND' : 'WEEKDAY';
}

/** 해당 요일 구분의 시간표가 있는지 알려준다. */
export async function hasTimetableData(dayType: DayType): Promise<boolean> {
  return timetables.some((row) => row.dayType === dayType);
}

/** 해당 요일 구분의 시간표 전체를 가져온다. */
export async function getTimetables(dayType: DayType): Promise<Timetable[]> {
  return timetables.filter((row) => row.dayType === dayType);
}
