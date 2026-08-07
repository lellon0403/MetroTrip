import type { Place } from '../types';

/**
 * 카테고리별 마커 색상.
 *
 * 카카오맵은 지도 배경(아파트·학교 라벨 등)의 표시 여부를
 * 커스터마이징하는 기능을 제공하지 않는다 (카카오 개발자 포럼 답변:
 * "지도에 표출된 명칭을 제거하는 기능은 현재 제공하지 않습니다").
 * 대신 우리가 직접 찍는 마커는 색으로 구분해 가시성을 높인다.
 *
 * CE7(카페) 색상은 요구사항에 명시되지 않아 커피색 계열로 임의 지정했다.
 * 바꾸고 싶으면 이 값만 고치면 된다.
 */
const CATEGORY_COLOR: Record<Place['category'], string> = {
  AT4: '#16a34a', // 관광명소 — 초록
  SW8: '#6b7280', // 지하철역 — 회색
  FD6: '#fb7185', // 음식점 — 분홍(고기 느낌)
  CE7: '#92400e', // 카페 — 커피색 (임의 지정)
  SHOPPING: '#7c3aed', // 쇼핑 — 보라 (DB 시드, TourAPI 원본)
  ETC: '#64748b', // 기타 — 회청색 (DB 시드, TourAPI 원본)
};

/** 카테고리 색상의 동글핀 모양 SVG를 만든다. 외부 이미지 파일 없이 인라인으로 처리한다. */
function pinSvg(color: string) {
  return `
    <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 11 16 24 16 24s16-13 16-24C32 7.163 24.837 0 16 0z" fill="${color}"/>
      <circle cx="16" cy="15" r="6" fill="white"/>
    </svg>
  `.trim();
}

// 카테고리당 한 번만 만들면 되므로 캐시해 둔다.
const cache = new Map<Place['category'], kakao.maps.MarkerImage>();

/** 카테고리에 맞는 마커 이미지를 반환한다 (SDK 로드 이후에만 호출할 것). */
export function getMarkerImage(category: Place['category']): kakao.maps.MarkerImage {
  const cached = cache.get(category);
  if (cached) return cached;

  const color = CATEGORY_COLOR[category];
  const src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(pinSvg(color))}`;
  const image = new window.kakao.maps.MarkerImage(
    src,
    new window.kakao.maps.Size(32, 40),
    { offset: new window.kakao.maps.Point(16, 40) },
  );

  cache.set(category, image);
  return image;
}
