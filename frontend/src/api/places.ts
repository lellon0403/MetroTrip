import placesData from '../data/places.json';
import type { Place } from '../types/place';

/**
 * 역 주변 장소 접근 계층.
 *
 * 백엔드가 붙으면 이 파일 내부만 fetch로 교체한다.
 * 컴포넌트는 places.json을 직접 import 하지 말고 반드시 이 함수를 사용할 것.
 * (stations.ts와 같은 방식 — docs/BACKEND-HANDOFF.md)
 *
 * 발표용이라 지금은 탕정역 두 곳만 채워져 있다.
 * 나머지 역은 빈 배열이 돌아오며, 이는 정상 동작이다.
 */
const placesByStation = placesData as Record<string, Place[]>;

/** 역 이름으로 주변 장소를 가져온다. 데이터가 없으면 빈 배열. */
export async function getPlacesByStation(
  stationName: string,
): Promise<Place[]> {
  return placesByStation[stationName] ?? [];
}
