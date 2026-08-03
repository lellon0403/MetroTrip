/**
 * 카카오맵 JavaScript SDK 타입 선언 (MVP에서 쓰는 것만 최소한으로).
 *
 * SDK는 index.html의 script 태그로 로드되므로 npm 패키지가 없다.
 * 그래서 window.kakao 를 직접 선언해서 쓴다.
 * 필요한 기능이 늘어나면 여기에 추가할 것.
 */

declare global {
  interface Window {
    kakao: typeof kakao;
  }

  namespace kakao.maps {
    /** SDK 로드 완료 후 콜백 실행 (autoload=false 일 때 필수) */
    function load(callback: () => void): void;

    /** 위경도 좌표 */
    class LatLng {
      constructor(lat: number, lng: number);
      getLat(): number;
      getLng(): number;
    }

    interface MapOptions {
      center: LatLng;
      /** 숫자가 작을수록 확대. 1~14 정수만 사용할 것 (소수는 타일이 깨진다) */
      level: number;
    }

    /** 지도 */
    class Map {
      constructor(container: HTMLElement, options: MapOptions);
      /** 부드럽게 중심 이동 */
      panTo(latlng: LatLng): void;
      /** 즉시 중심 이동 */
      setCenter(latlng: LatLng): void;
      getCenter(): LatLng;
      setLevel(level: number): void;
      getLevel(): number;
      /** 확대 한계 (가장 크게 확대했을 때의 레벨) */
      setMinLevel(level: number): void;
      /** 축소 한계 (가장 작게 축소했을 때의 레벨) */
      setMaxLevel(level: number): void;
    }

    /** 픽셀 크기 (마커 이미지 크기 지정용) */
    class Size {
      constructor(width: number, height: number);
    }

    /** 픽셀 좌표 (마커 이미지의 기준점 지정용) */
    class Point {
      constructor(x: number, y: number);
    }

    interface MarkerImageOptions {
      /** 이미지 안에서 좌표가 가리키는 지점 (기본은 좌상단) */
      offset?: Point;
    }

    /** 마커 아이콘 이미지 (카테고리별 색상 구분에 사용) */
    class MarkerImage {
      constructor(src: string, size: Size, options?: MarkerImageOptions);
    }

    interface MarkerOptions {
      position: LatLng;
      map?: Map;
      title?: string;
      /** 지정하지 않으면 카카오 기본 빨간 핀이 쓰인다 */
      image?: MarkerImage;
    }

    /** 마커 */
    class Marker {
      constructor(options: MarkerOptions);
      setMap(map: Map | null): void;
      getPosition(): LatLng;
    }

    interface InfoWindowOptions {
      content: string | HTMLElement;
      position?: LatLng;
      removable?: boolean;
    }

    /** 인포윈도우 */
    class InfoWindow {
      constructor(options: InfoWindowOptions);
      open(map: Map, marker?: Marker): void;
      close(): void;
    }

    /** 이벤트 등록 */
    namespace event {
      function addListener(
        target: object,
        type: string,
        handler: (...args: unknown[]) => void,
      ): void;
    }
  }
}

export {};
