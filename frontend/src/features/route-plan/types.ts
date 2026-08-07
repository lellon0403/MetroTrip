/**
 * 경로 기능 타입 (docs/SPEC.md 2-2).
 *
 * 나중에 백엔드가 내려줄 `GET /api/v1/routes` 응답 형태를 미리 맞춰 둔 것이다.
 * DB 의 `stations` / `line_stations` 구조에 대응한다.
 * (자세한 내용: docs/BACKEND-HANDOFF.md)
 */

/** 경로에 등장하는 역 */
export type RouteStation = {
  /**
   * 역 식별자.
   *
   * 지금은 역명을 그대로 쓰지만, API 가 붙으면 `stations.station_id` 값이 들어온다.
   * 화면은 이 값을 목록 key 로만 사용하므로 교체해도 영향이 없다.
   */
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** 이 역을 지날 때 타고 있는 노선 */
  line: string;
};

/** 한 노선을 계속 타고 가는 구간. 환승할 때마다 새 구간이 생긴다. */
export type RouteLeg = {
  line: string;
  /** 이 구간에서 지나는 역 (승차역 ~ 하차역, 순서대로) */
  stations: RouteStation[];
};

/**
 * 경로 계산 방식.
 *
 * 카카오·네이버 지하철과 같이 **도착 시각이 가장 이른 경로**(fastest)와
 * **갈아타는 횟수가 가장 적은 경로**(fewestTransfers)를 나눠 보여준다.
 *
 * 정차역 수가 아니라 소요 시간으로 비교한다. 역 사이 소요 시간이 구간마다
 * 다르기 때문에, 시간표가 들어오면 정차역 수 기준과 결과가 달라진다.
 */
export type RouteOptionKind = 'fastest' | 'fewestTransfers';

/** 경로 한 가지 안 */
export type RouteOption = {
  kind: RouteOptionKind;
  /** 환승 단위로 끊은 구간 목록 */
  legs: RouteLeg[];
  /** 전체 경유역 (출발역 ~ 도착역, 순서대로) */
  stations: RouteStation[];
  /** 환승 횟수 */
  transferCount: number;
  /** 이동한 역 간격 수 (정차역 수 - 1) */
  hopCount: number;
  /**
   * 예상 소요시간(분).
   *
   * `train_timetables` 데이터가 없어 실제 대기시간을 반영하지 못하는 **근사치**다.
   * 화면에 반드시 "예상"이라고 표기할 것 (docs/SPEC.md 2-2).
   */
  estimatedMinutes: number;
};

/** 경로 검색 결과 */
export type RouteSearchResult = {
  from: RouteStation;
  to: RouteStation;
  /**
   * 최소 시간·최소 환승 순.
   * 두 방식의 결과가 같으면 한 개만 담긴다 (지금처럼 단일 노선일 때가 그렇다).
   */
  options: RouteOption[];
};

export type RouteSearchStatus = 'idle' | 'loading' | 'success' | 'error';
