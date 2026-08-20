"use client";

import type { components } from "@metrotrip/contracts";
import { useEffect, useRef, useState } from "react";

type Station = components["schemas"]["StationSummary"];
type Place = components["schemas"]["PlaceSummary"];
type RouteCoordinate = components["schemas"]["RouteCoordinate"];

export interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

interface KakaoBounds {
  getSouthWest(): KakaoLatLng;
  getNorthEast(): KakaoLatLng;
}

export interface KakaoMapInstance {
  relayout(): void;
  setCenter(position: KakaoLatLng): void;
  getCenter(): KakaoLatLng;
  getBounds(): KakaoBounds;
  setLevel(level: number): void;
  getLevel(): number;
  panTo(position: KakaoLatLng): void;
  /** level 숫자가 작을수록 확대된 상태다. 이 값보다 더 확대(더 작은 level)하지 못하게 막는다. */
  setMinLevel(level: number): void;
  /** 이 값보다 더 축소(더 큰 level)하지 못하게 막는다. */
  setMaxLevel(level: number): void;
  /** false로 주면 휠 스크롤·더블클릭·핀치 확대/축소를 전부 막는다(현재 level에 고정). */
  setZoomable(zoomable: boolean): void;
}

export interface KakaoOverlay {
  setMap(map: KakaoMapInstance | null): void;
}

export interface KakaoPolyline extends KakaoOverlay {
  setOptions(options: { strokeOpacity?: number; strokeColor?: string; strokeWeight?: number }): void;
}

export interface KakaoMaps {
  load(callback: () => void): void;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number; disableDoubleClickZoom?: boolean },
  ) => KakaoMapInstance;
  CustomOverlay: new (options: {
    content: HTMLElement;
    map: KakaoMapInstance;
    position: KakaoLatLng;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
  }) => KakaoOverlay;
  Circle: new (options: {
    center: KakaoLatLng;
    radius: number;
    strokeWeight: number;
    strokeColor: string;
    strokeOpacity: number;
    fillColor: string;
    fillOpacity: number;
  }) => KakaoOverlay;
  Polyline: new (options: {
    path: KakaoLatLng[];
    strokeWeight: number;
    strokeColor: string;
    strokeOpacity: number;
    strokeStyle: string;
  }) => KakaoPolyline;
  event: {
    addListener(target: KakaoMapInstance | KakaoPolyline, event: string, callback: () => void): void;
  };
}

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

let sdkPromise: Promise<KakaoMaps> | null = null;

export function loadKakaoMaps(appKey: string): Promise<KakaoMaps> {
  if (window.kakao?.maps) {
    return new Promise((resolve) => window.kakao?.maps.load(() => resolve(window.kakao!.maps)));
  }
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-metrotrip-kakao-map]");
    const script = existing ?? document.createElement("script");
    const timeout = window.setTimeout(
      () => reject(new Error("Kakao 지도 응답이 없습니다. SDK 도메인 설정을 확인해 주세요.")),
      10_000,
    );
    const finish = () => {
      if (!window.kakao?.maps) {
        window.clearTimeout(timeout);
        reject(new Error("Kakao 지도 SDK를 초기화하지 못했습니다."));
        return;
      }
      window.kakao.maps.load(() => {
        window.clearTimeout(timeout);
        resolve(window.kakao!.maps);
      });
    };
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Kakao 지도 SDK를 불러오지 못했습니다.")), { once: true });
      return;
    }
    script.dataset.metrotripKakaoMap = "true";
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Kakao 지도 SDK를 불러오지 못했습니다.")), { once: true });
    document.head.appendChild(script);
  });
  return sdkPromise;
}

function placeMarkerContent(
  place: Place,
  options: { selected: boolean; sequence?: number },
  onSelect: () => void,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = [
    "kakaoPlaceMarker",
    options.selected ? "selected" : "",
    options.sequence ? "itinerary" : "",
  ].filter(Boolean).join(" ");
  button.setAttribute("aria-label", `${place.name} 선택`);
  button.title = place.name;
  button.addEventListener("click", onSelect);
  const dot = document.createElement("span");
  dot.textContent = options.sequence ? String(options.sequence) : options.selected ? place.name : "";
  button.appendChild(dot);
  return button;
}

function stationMarkerContent(station: Station) {
  const marker = document.createElement("div");
  marker.className = "kakaoStationMarker";
  marker.setAttribute("aria-label", `${station.name}역`);
  marker.textContent = `${station.name}역`;
  return marker;
}

export function KakaoMap({
  active,
  station,
  stationFocusRequestKey,
  places,
  selectedPlaceId,
  radiusMeters,
  routePath,
  focusPlaceIds,
  focusMode,
  onSelectPlace,
  onViewportChange,
}: {
  active: boolean;
  station: Station | null;
  stationFocusRequestKey: number;
  places: Place[];
  selectedPlaceId: string | null;
  radiusMeters: number;
  routePath: RouteCoordinate[];
  focusPlaceIds: string[];
  focusMode: boolean;
  onSelectPlace: (place: Place) => void;
  onViewportChange: (viewport: {
    latitude: number;
    longitude: number;
    south: number;
    west: number;
    north: number;
    east: number;
  }) => void;
}) {
  const appKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "";
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMapInstance | null>(null);
  const stationRef = useRef<string | null>(null);
  const stationFocusRequestRef = useRef(-1);
  const overlaysRef = useRef<KakaoOverlay[]>([]);
  const viewportCallbackRef = useRef(onViewportChange);
  const skipNextIdleRef = useRef(true);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(appKey ? "loading" : "error");
  const [message, setMessage] = useState(appKey ? "Kakao 지도를 불러오는 중…" : "NEXT_PUBLIC_KAKAO_JS_KEY 설정이 필요합니다.");

  useEffect(() => {
    if (!active || !mapRef.current) return;
    const task = window.setTimeout(() => mapRef.current?.relayout(), 0);
    return () => window.clearTimeout(task);
  }, [active]);

  useEffect(() => {
    viewportCallbackRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    if (!station || !containerRef.current || !appKey) return;
    let active = true;
    void loadKakaoMaps(appKey)
      .then((maps) => {
        if (!active || !containerRef.current) return;
        const stationCenter = new maps.LatLng(station.latitude, station.longitude);
        const isNewMap = !mapRef.current;
        const map = mapRef.current ?? new maps.Map(containerRef.current, { center: stationCenter, level: 4 });
        mapRef.current = map;
        map.relayout();
        if (stationRef.current !== station.id || stationFocusRequestRef.current !== stationFocusRequestKey) {
          skipNextIdleRef.current = true;
          map.setCenter(stationCenter);
          stationRef.current = station.id;
          stationFocusRequestRef.current = stationFocusRequestKey;
        }
        if (isNewMap) {
          maps.event.addListener(map, "idle", () => {
            if (skipNextIdleRef.current) {
              skipNextIdleRef.current = false;
              return;
            }
            const center = map.getCenter();
            const bounds = map.getBounds();
            const southWest = bounds.getSouthWest();
            const northEast = bounds.getNorthEast();
            viewportCallbackRef.current({
              latitude: center.getLat(),
              longitude: center.getLng(),
              south: southWest.getLat(),
              west: southWest.getLng(),
              north: northEast.getLat(),
              east: northEast.getLng(),
            });
          });
        }

        for (const overlay of overlaysRef.current) overlay.setMap(null);
        const radiusCircle = new maps.Circle({
          center: stationCenter,
          radius: radiusMeters,
          strokeWeight: 2,
          strokeColor: "#175cd3",
          strokeOpacity: 0.65,
          fillColor: "#84adff",
          fillOpacity: 0.12,
        });
        radiusCircle.setMap(map);
        const overlays: KakaoOverlay[] = [
          radiusCircle,
          new maps.CustomOverlay({
            map,
            position: stationCenter,
            content: stationMarkerContent(station),
            xAnchor: 0.5,
            yAnchor: 1,
            zIndex: 6,
          }),
        ];

        const visiblePlaces = focusMode
          ? places.filter((place) => focusPlaceIds.includes(place.id))
          : places;
        for (const place of visiblePlaces) {
          const sequence = focusMode ? focusPlaceIds.indexOf(place.id) + 1 : undefined;
          const selected = place.id === selectedPlaceId;
          overlays.push(
            new maps.CustomOverlay({
              map,
              position: new maps.LatLng(place.latitude, place.longitude),
              content: placeMarkerContent(
                place,
                { selected, ...(sequence ? { sequence } : {}) },
                () => onSelectPlace(place),
              ),
              xAnchor: 0.5,
              yAnchor: 1,
              zIndex: sequence || selected ? 8 : 3,
            }),
          );
        }

        const selectedPlace = visiblePlaces.find((place) => place.id === selectedPlaceId);
        if (selectedPlace) {
          skipNextIdleRef.current = true;
          map.panTo(new maps.LatLng(selectedPlace.latitude, selectedPlace.longitude));
        }

        if (routePath.length > 1) {
          const polyline = new maps.Polyline({
            path: routePath.map((point) => new maps.LatLng(point.latitude, point.longitude)),
            strokeWeight: 5,
            strokeColor: "#175cd3",
            strokeOpacity: 0.82,
            strokeStyle: "solid",
          });
          polyline.setMap(map);
          overlays.push(polyline);
        }
        overlaysRef.current = overlays;
        setStatus("ready");
        setMessage("Kakao Map · 실제 위치");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Kakao 지도를 표시하지 못했습니다.");
      });
    return () => { active = false; };
  }, [appKey, focusMode, focusPlaceIds, onSelectPlace, places, radiusMeters, routePath, selectedPlaceId, station, stationFocusRequestKey]);

  return (
    <section className="kakaoMap" aria-label="Kakao 장소 지도">
      <div ref={containerRef} className="kakaoMapCanvas" />
      <div className={`mapStatus ${status}`} role={status === "error" ? "alert" : "status"}>
        <strong>{status === "error" ? "지도 연결 확인 필요" : "Kakao Map"}</strong>
        <span>{message}</span>
      </div>
    </section>
  );
}
