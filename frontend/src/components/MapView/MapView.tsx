import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { getPlacesByStation } from '../../api/places';
import { getMarkerImage } from './markerIcons';
import type { Place } from '../../types/place';

type MapViewProps = {
  /** 지도 중심 위도 */
  lat: number;
  /** 지도 중심 경도 */
  lng: number;
  /** 선택된 역 이름 — 이 역의 주변 장소를 마커로 찍는다 */
  stationName: string;
};

/** 인포윈도우 내용. SDK가 HTML 문자열을 받으므로 Tailwind 대신 인라인 스타일을 쓴다. */
function infoWindowHtml(place: Place) {
  // 장소명은 우리 데이터라 안전하지만, 나중에 API 응답으로 바뀌므로 이스케이프해 둔다
  const escape = (text: string) =>
    text.replace(
      /[&<>"]/g,
      (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
    );

  return `
    <div style="padding:10px 14px 14px;width:230px;line-height:1.45;font-family:Inter,system-ui,sans-serif;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.05em;color:#003d9b;">
        ${escape(place.categoryName)}
      </div>
      <div style="margin-top:2px;font-size:14px;font-weight:700;color:#041b3c;">
        ${escape(place.name)}
      </div>
      <div style="margin-top:4px;font-size:12px;color:#434654;">
        ${escape(place.address)}
      </div>
    </div>
  `;
}

/**
 * 지도 확대 레벨. 숫자가 작을수록 확대된다.
 *
 * 레벨과 축척은 실측으로 확인했다 (100px 기준):
 *   1 → 25m   2 → 50m    3 → 100m
 *   4 → 200m  5 → 400m   6 → 800m
 * 축척 표시 기준으로는 레벨 3이 50m, 레벨 5가 250m에 해당한다.
 */
const DEFAULT_LEVEL = 3; // 축척 50m
const MIN_LEVEL = 1; // 확대 한계 (숫자가 작을수록 확대)
const MAX_LEVEL = 5; // 축소 한계 — 축척 250m

/**
 * 소수점 레벨(예: 3.5)은 쓰지 않는다.
 *
 * SDK가 소수 레벨을 받아주기는 하고 좌표 계산도 그에 맞게 나오지만,
 * 타일이 그려지지 않고 축척 표시가 NaN 으로 깨진다. 정식 지원 범위가 아니다.
 * 확대/축소는 카카오 기본 동작(정수 레벨 1칸씩)을 그대로 쓴다.
 */

/**
 * 카카오맵을 표시하는 컴포넌트.
 *
 * SDK는 index.html에서 autoload=false로 로드되므로,
 * kakao.maps.load() 안에서 지도를 생성해야 한다.
 * 지도 위에 확대/축소·재중심 플로팅 컨트롤을 함께 얹는다 (Stitch 디자인).
 */
export function MapView({ lat, lng, stationName }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const markersRef = useRef<kakao.maps.Marker[]>([]);
  const infoWindowRef = useRef<kakao.maps.InfoWindow | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 지도는 SDK 로드 콜백 안에서 만들어지므로, 생성 완료를 상태로 알린다
  const [mapReady, setMapReady] = useState(false);

  // 지도 최초 생성 (1회만)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!window.kakao?.maps) {
      setError(
        '카카오맵 SDK를 불러오지 못했습니다. .env의 VITE_KAKAO_MAP_KEY 값과 개발자 콘솔의 도메인 등록을 확인하세요.',
      );
      return;
    }

    window.kakao.maps.load(() => {
      const map = new window.kakao.maps.Map(container, {
        center: new window.kakao.maps.LatLng(lat, lng),
        level: DEFAULT_LEVEL,
      });

      // 축소 한계를 두는 이유:
      // 크게 축소할수록 채워야 할 타일이 4배씩 늘어 로딩 중 화면이 비어 보인다.
      // 이 앱은 역 주변 1km를 보는 용도라 그 이상 축소할 이유도 없다.
      map.setMinLevel(MIN_LEVEL);
      map.setMaxLevel(MAX_LEVEL);

      mapRef.current = map;
      setMapReady(true);
    });
    // 최초 1회만 생성한다. 이후 좌표 변경은 아래 effect에서 처리.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 좌표가 바뀌면 중심 이동
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.panTo(new window.kakao.maps.LatLng(lat, lng));
  }, [lat, lng]);

  // 선택된 역이 바뀌면 주변 장소 마커를 다시 찍는다
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let cancelled = false;

    getPlacesByStation(stationName).then((places) => {
      if (cancelled) return;

      // 이전 역의 마커와 열려 있던 인포윈도우를 정리
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
      infoWindowRef.current?.close();

      places.forEach((place) => {
        const marker = new window.kakao.maps.Marker({
          position: new window.kakao.maps.LatLng(place.lat, place.lng),
          map,
          title: place.name,
          image: getMarkerImage(place.category),
        });

        window.kakao.maps.event.addListener(marker, 'click', () => {
          // 인포윈도우는 하나만 열어 둔다
          infoWindowRef.current?.close();
          const infoWindow = new window.kakao.maps.InfoWindow({
            content: infoWindowHtml(place),
            removable: true,
          });
          infoWindow.open(map, marker);
          infoWindowRef.current = infoWindow;
        });

        markersRef.current.push(marker);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [stationName, mapReady]);

  const zoom = (delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    const next = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, map.getLevel() + delta));
    map.setLevel(next);
  };

  // 현재 선택된 역으로 다시 중심을 맞춘다 (지도를 옮긴 뒤 제자리로).
  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    map.panTo(new window.kakao.maps.LatLng(lat, lng));
  };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-lg">
        {/* max-w-md 는 16px로 계산된다 — src/index.css 주석 참고 */}
        <p className="max-w-[28rem] text-body-md leading-relaxed text-error">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* 플로팅 지도 컨트롤 (우하단) */}
      <div className="absolute bottom-lg right-lg z-30 flex flex-col gap-sm">
        <button
          type="button"
          onClick={recenter}
          aria-label="선택한 역으로 이동"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-outline-variant bg-white text-primary shadow-lg transition-all hover:bg-surface-container-low active:scale-95"
        >
          <Icon name="my_location" />
        </button>
        <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-white shadow-lg">
          <button
            type="button"
            onClick={() => zoom(-1)}
            aria-label="확대"
            className="flex h-12 w-12 items-center justify-center border-b border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <Icon name="add" />
          </button>
          <button
            type="button"
            onClick={() => zoom(1)}
            aria-label="축소"
            className="flex h-12 w-12 items-center justify-center text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <Icon name="remove" />
          </button>
        </div>
      </div>
    </div>
  );
}
