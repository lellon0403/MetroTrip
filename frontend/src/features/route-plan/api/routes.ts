import { getStations } from '../../../shared/lib/stations';
import lineOrderData from '../data/lineOrder.json';
import { findRouteOptions, type LineOrder } from '../lib/findRoutes';
import type { RouteSearchResult, RouteStation } from '../types';

/**
 * 경로 조회 접근 계층.
 *
 * 지금은 프론트가 정적 데이터로 직접 그래프 탐색을 한다.
 * 백엔드에 `GET /api/v1/routes` 가 생기면 **이 파일 내부만** fetch 로 교체한다.
 * 컴포넌트는 lineOrder.json 을 직접 import 하지 말고 반드시 이 함수를 사용할 것.
 * (stations.ts / places.ts 와 같은 방식 — docs/BACKEND-HANDOFF.md)
 *
 * 노선 순서 데이터는 DB 담당이 API 로 제공하기로 협의되어 있다 (2026-08-04).
 * 그전까지는 1호선 천안·아산 구간만 들어 있어 환승이 발생하지 않는다.
 */

const lineOrder = lineOrderData as LineOrder;

/** 노선 순서 데이터에 들어 있는 노선 수. 화면 안내 문구에 쓴다. */
export async function getRouteLineCount(): Promise<number> {
  return Object.keys(lineOrder).length;
}

/**
 * 노선별 역 순서를 반환한다.
 *
 * 지도에서 역과 역을 잇는 선을 그리는 데 쓴다.
 * 컴포넌트가 lineOrder.json 을 직접 import 하지 않도록 이 함수를 거친다.
 */
export async function getLineOrder(): Promise<LineOrder> {
  return lineOrder;
}

/**
 * 출발역 → 도착역 경로를 찾는다.
 *
 * 두 역이 같거나 이어지는 경로가 없으면 `options` 가 빈 배열로 돌아온다.
 * 역 이름을 찾을 수 없으면 null.
 */
export async function searchRoutes(
  fromName: string,
  toName: string,
): Promise<RouteSearchResult | null> {
  const stations = await getStations();

  const from = stations.find((station) => station.name === fromName);
  const to = stations.find((station) => station.name === toName);
  if (!from || !to) return null;

  const toRouteStation = (station: typeof from): RouteStation => ({
    id: station.name,
    name: station.name,
    lat: station.lat,
    lng: station.lng,
    line: station.line,
  });

  return {
    from: toRouteStation(from),
    to: toRouteStation(to),
    options: findRouteOptions(stations, lineOrder, fromName, toName),
  };
}
