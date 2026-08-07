import type { PointerEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point, Viewport } from '../types';

const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, scale: 0.88 };
/**
 * 최소 배율.
 *
 * 경로 화면의 노선도는 카드보다 훨씬 크다(1호선 전 구간 기준 2500x2900px).
 * 전체 모양을 한눈에 보려면 0.2 근처까지 줄일 수 있어야 한다.
 */
const MIN_SCALE = 0.15;
const MAX_SCALE = 2.8;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getLocalPoint(
  event: { clientX: number; clientY: number },
  element: SVGSVGElement,
): Point {
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function getDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getCenter(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function useLineMapViewport() {
  /**
   * SVG 엘리먼트.
   *
   * 단순 ref 로 두면 안 된다. 데이터를 불러오는 동안에는 SVG 가 아예 없다가
   * 나중에 붙는데, ref 는 바뀌어도 이펙트가 다시 돌지 않아 휠 리스너가
   * 영영 안 붙는다. state 로 들고 있어야 붙는 시점을 잡을 수 있다.
   */
  const svgNodeRef = useRef<SVGSVGElement | null>(null);
  const [svgNode, setSvgNode] = useState<SVGSVGElement | null>(null);
  const svgRef = useCallback((node: SVGSVGElement | null) => {
    svgNodeRef.current = node;
    setSvgNode(node);
  }, []);
  const pointersRef = useRef(new Map<number, Point>());
  const dragRef = useRef<{ start: Point; viewport: Viewport } | null>(null);
  const pinchRef = useRef<{ distance: number; center: Point; viewport: Viewport } | null>(null);
  const [viewport, setViewport] = useState(INITIAL_VIEWPORT);
  const [dragging, setDragging] = useState(false);

  const zoomAt = useCallback((nextScale: number, point: Point) => {
    setViewport((current) => {
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const ratio = scale / current.scale;
      return {
        scale,
        x: point.x - (point.x - current.x) * ratio,
        y: point.y - (point.y - current.y) * ratio,
      };
    });
  }, []);

  /**
   * 휠 확대.
   *
   * React 의 `onWheel` 은 passive 로 붙어 `preventDefault()` 가 먹지 않는다.
   * 그러면 지도가 확대되는 대신 **페이지가 스크롤된다.**
   * 그래서 `{ passive: false }` 로 직접 붙인다.
   *
   * 배율을 의존성에 넣으면 확대할 때마다 리스너를 다시 붙이게 되므로,
   * 최신 값을 setState 함수형으로 읽는다.
   */
  useEffect(() => {
    const svg = svgNode;
    if (!svg) return;

    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const point = getLocalPoint(event, svg);

      setViewport((current) => {
        const scale = clamp(
          current.scale * (event.deltaY < 0 ? 1.12 : 0.89),
          MIN_SCALE,
          MAX_SCALE,
        );
        const ratio = scale / current.scale;
        return {
          scale,
          x: point.x - (point.x - current.x) * ratio,
          y: point.y - (point.y - current.y) * ratio,
        };
      });
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [svgNode]);

  const onPointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const target = event.target as Element;
    // 역과 말풍선 위에서는 드래그를 시작하지 않는다.
    // 여기서 걸러내지 않으면 setPointerCapture 가 걸려 클릭이 SVG 로 가버리고,
    // 버튼이 눌리지 않는다.
    if (target.closest('[data-station-id], [data-map-control]')) return;
    const svg = svgNodeRef.current;
    if (!svg) return;
    const point = getLocalPoint(event, svg);
    pointersRef.current.set(event.pointerId, point);
    svg.setPointerCapture(event.pointerId);
    if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()];
      pinchRef.current = {
        distance: getDistance(first, second),
        center: getCenter(first, second),
        viewport,
      };
      dragRef.current = null;
    } else {
      dragRef.current = { start: point, viewport };
      setDragging(true);
    }
  }, [viewport]);

  const onPointerMove = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const svg = svgNodeRef.current;
    if (!svg || !pointersRef.current.has(event.pointerId)) return;
    const point = getLocalPoint(event, svg);
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [first, second] = [...pointersRef.current.values()];
      const center = getCenter(first, second);
      const ratio = getDistance(first, second) / pinchRef.current.distance;
      const scale = clamp(pinchRef.current.viewport.scale * ratio, MIN_SCALE, MAX_SCALE);
      setViewport({
        scale,
        x: pinchRef.current.viewport.x + center.x - pinchRef.current.center.x + pinchRef.current.center.x -
          (pinchRef.current.center.x - pinchRef.current.viewport.x) * (scale / pinchRef.current.viewport.scale),
        y: pinchRef.current.viewport.y + center.y - pinchRef.current.center.y + pinchRef.current.center.y -
          (pinchRef.current.center.y - pinchRef.current.viewport.y) * (scale / pinchRef.current.viewport.scale),
      });
      return;
    }
    if (!dragRef.current) return;
    setViewport({
      ...dragRef.current.viewport,
      x: dragRef.current.viewport.x + point.x - dragRef.current.start.x,
      y: dragRef.current.viewport.y + point.y - dragRef.current.start.y,
    });
  }, []);

  const onPointerUp = useCallback((event: PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
    if (pointersRef.current.size === 0) setDragging(false);
    svgNodeRef.current?.releasePointerCapture(event.pointerId);
  }, []);

  /**
   * 지정한 지점이 보이는 영역 한가운데에 오도록 옮긴다.
   *
   * 지도가 화면보다 넓을 때(경로 화면의 도식 노선도) 고른 역으로
   * 시선을 옮기는 데 쓴다.
   */
  const centerOn = useCallback((point: Point) => {
    const svg = svgNodeRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();

    setViewport((current) => ({
      ...current,
      x: rect.width / 2 - point.x * current.scale,
      y: rect.height / 2 - point.y * current.scale,
    }));
  }, []);

  /** 지정한 크기가 화면에 다 들어오도록 배율과 위치를 맞춘다. */
  const fitTo = useCallback((size: { width: number; height: number }) => {
    const svg = svgNodeRef.current;
    if (!svg || size.width <= 0 || size.height <= 0) return;
    const rect = svg.getBoundingClientRect();

    const scale = clamp(
      Math.min(rect.width / size.width, rect.height / size.height),
      MIN_SCALE,
      MAX_SCALE,
    );
    setViewport({
      scale,
      x: (rect.width - size.width * scale) / 2,
      y: (rect.height - size.height * scale) / 2,
    });
  }, []);

  return {
    svgRef,
    svgNode,
    viewport,
    dragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    zoomAt,
    centerOn,
    fitTo,
    resetViewport: () => setViewport(INITIAL_VIEWPORT),
  };
}

export type LineMapViewportState = ReturnType<typeof useLineMapViewport>;
