import stationsData from '../data/stations.json';
import type { Station } from '../types/station';

/**
 * 역 데이터 접근 계층.
 *
 * 지금은 정적 JSON을 반환하지만, 백엔드가 붙으면 이 파일 내부만 fetch로 교체한다.
 * 컴포넌트는 stations.json을 직접 import 하지 말고 반드시 이 함수를 사용할 것.
 * (자세한 내용: docs/BACKEND-HANDOFF.md)
 *
 * 지금 당장은 동기 처리가 가능하지만, 나중에 API로 바꿔도 호출부를 고치지 않도록
 * 처음부터 async로 선언한다.
 */

const stations = stationsData as Station[];

/** 전체 역 목록을 반환한다. */
export async function getStations(): Promise<Station[]> {
  return stations;
}

/**
 * 역명으로 검색한다.
 * 키워드가 비어 있으면 전체 목록을 반환한다.
 */
export async function searchStations(keyword: string): Promise<Station[]> {
  const trimmed = keyword.trim();
  if (trimmed === '') return stations;

  return stations.filter((station) => station.name.includes(trimmed));
}
