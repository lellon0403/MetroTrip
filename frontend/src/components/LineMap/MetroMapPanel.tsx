import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { asset } from '../../lib/asset';

/** public/ 에 넣어 둔 수도권 노선도 이미지 파일명 */
const MAP_IMAGE = 'metro-map.png';

/** 원본 크기를 넘어서까지는 확대하지 않는다 (넘기면 뭉개진다) */
const MAX_SCALE = 1;
const ZOOM_STEP = 1.4;

/**
 * 노선도를 이보다 작게 줄이지 않는다.
 * 폰 화면 폭(약 310px)에 맞추면 역 이름을 전혀 읽을 수 없어서,
 * 좁은 화면에서는 화면 밖으로 나가더라도 이 크기를 유지하고 끌어서 보게 한다.
 */
const MIN_DISPLAY_WIDTH = 900;

type Size = { w: number; h: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 수도권 노선도 뷰어.
 *
 * 스크롤바 대신 지도처럼 **잡아 끌어서** 움직이고 휠로 확대한다.
 * 노선도는 세로로도 긴데 가로 스크롤바만으로는 아래쪽을 보기 어려웠다.
 */
export function MetroMapPanel() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [frame, setFrame] = useState<Size>({ w: 0, h: 0 });
  const [missing, setMissing] = useState(false);

  // scale 은 원본 크기 대비 배율. offset 은 가운데를 기준으로 밀어낸 거리(px).
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  /**
   * 기준 배율 — 가로를 꽉 채운다. 축소 한계이자 처음 보여줄 배율이다.
   *
   * 세로까지 다 넣으면(contain) 노선도가 가로로 훨씬 넓어서 양옆이 크게 비고
   * 역 이름도 작아진다. 그래서 가로를 채우고 세로는 끌어서 보게 했다.
   * 단 좁은 화면에서는 MIN_DISPLAY_WIDTH 아래로는 줄이지 않는다.
   */
  const fitScale =
    natural && frame.w > 0
      ? Math.max(frame.w, MIN_DISPLAY_WIDTH) / natural.w
      : 1;

  /** 확대해서 넘치는 만큼만 움직일 수 있게 잡아 둔다 (화면 밖으로 날아가지 않도록) */
  const clampOffset = useCallback(
    (x: number, y: number, s: number) => {
      if (!natural) return { x: 0, y: 0 };
      const maxX = Math.max(0, (natural.w * s - frame.w) / 2);
      const maxY = Math.max(0, (natural.h * s - frame.h) / 2);
      return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
    },
    [natural, frame],
  );

  // 창 크기가 바뀌면 보이는 영역도 다시 잰다
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setFrame({ w: r.width, h: r.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 이미지를 불러오거나 창 크기가 바뀌면 기준 배율로 되돌린다
  useEffect(() => {
    if (!natural || frame.w === 0) return;
    setScale(Math.max(frame.w, MIN_DISPLAY_WIDTH) / natural.w);
    setOffset({ x: 0, y: 0 });
  }, [natural, frame.w]);

  /** 기준점(보이는 영역 가운데에서 얼마나 떨어진 곳)을 고정한 채 배율만 바꾼다 */
  const zoomAt = useCallback(
    (nextScale: number, px: number, py: number) => {
      const s = clamp(nextScale, fitScale, MAX_SCALE);
      setScale((prev) => {
        setOffset((o) => {
          // 확대 전후로 커서 아래 지점이 그대로 있도록 offset 을 옮긴다
          const ratio = s / prev;
          const nx = px - (px - o.x) * ratio;
          const ny = py - (py - o.y) * ratio;
          return clampOffset(nx, ny, s);
        });
        return s;
      });
    },
    [fitScale, clampOffset],
  );

  // 휠 확대. preventDefault 를 쓰려면 passive 가 아닌 리스너로 직접 붙여야 한다.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left - r.width / 2;
      const py = e.clientY - r.top - r.height / 2;
      setScale((prev) => {
        const next = clamp(
          e.deltaY < 0 ? prev * 1.15 : prev / 1.15,
          fitScale,
          MAX_SCALE,
        );
        setOffset((o) => {
          const ratio = next / prev;
          return clampOffset(
            px - (px - o.x) * ratio,
            py - (py - o.y) * ratio,
            next,
          );
        });
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [fitScale, clampOffset]);

  const canPan = natural
    ? natural.w * scale > frame.w + 1 || natural.h * scale > frame.h + 1
    : false;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canPan) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset(
      clampOffset(dragStart.current.ox + dx, dragStart.current.oy + dy, scale),
    );
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  };

  const zoomByButton = (factor: number) => zoomAt(scale * factor, 0, 0);
  const resetView = () => {
    setScale(fitScale);
    setOffset({ x: 0, y: 0 });
  };

  const zoomPercent = fitScale > 0 ? Math.round((scale / fitScale) * 100) : 100;

  if (missing) {
    return (
      <p className="flex items-start gap-xs rounded-xl border border-outline-variant p-md text-body-md text-tertiary">
        <Icon name="warning" className="shrink-0 text-[18px]" />
        <span>
          <code>public/{MAP_IMAGE}</code> 파일이 없어 노선도를 표시할 수
          없습니다.
        </span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-sm">
        <div className="flex overflow-hidden rounded-lg border border-outline-variant">
          <button
            type="button"
            onClick={() => zoomByButton(1 / ZOOM_STEP)}
            disabled={scale <= fitScale + 0.0001}
            aria-label="축소"
            className="flex h-9 w-9 items-center justify-center border-r border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:opacity-30"
          >
            <Icon name="remove" className="text-[20px]" />
          </button>
          <button
            type="button"
            onClick={() => zoomByButton(ZOOM_STEP)}
            disabled={scale >= MAX_SCALE - 0.0001}
            aria-label="확대"
            className="flex h-9 w-9 items-center justify-center text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:opacity-30"
          >
            <Icon name="add" className="text-[20px]" />
          </button>
        </div>

        <button
          type="button"
          onClick={resetView}
          className="flex h-9 items-center gap-xs rounded-lg border border-outline-variant px-md text-body-md text-on-surface-variant transition-colors hover:bg-surface-container-low"
        >
          <Icon name="fit_screen" className="text-[18px]" />
          기본 크기
        </button>

        <span className="text-mono-table text-on-surface-variant">
          {zoomPercent}%
        </span>

        <p className="text-body-md text-on-surface-variant">
          끌어서 움직이고, 휠로 확대·축소합니다.
        </p>
      </div>

      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative flex h-[72vh] items-center justify-center overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest"
        style={{
          // 브라우저 기본 제스처를 꺼야 드래그가 스크롤로 새지 않는다
          touchAction: 'none',
          cursor: canPan ? (dragging ? 'grabbing' : 'grab') : 'default',
        }}
      >
        <img
          src={asset(MAP_IMAGE)}
          alt="수도권 전철 노선도"
          draggable={false}
          onLoad={(e) =>
            setNatural({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
          onError={() => setMissing(true)}
          className="max-w-none select-none"
          style={{
            width: natural ? natural.w : undefined,
            height: natural ? natural.h : undefined,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            // 드래그 중에는 애니메이션을 빼야 손을 따라온다
            transition: dragging ? 'none' : 'transform 120ms ease-out',
          }}
        />
      </div>
    </div>
  );
}
