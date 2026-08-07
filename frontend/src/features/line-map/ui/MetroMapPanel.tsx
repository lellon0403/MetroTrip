import type { KeyboardEvent } from 'react';
import { LINE1_MAP_VIEWBOX, LINE1_STATION_LAYOUT } from '../data/line1MapLayout';
import type { LineMapViewportState } from '../hooks/useLineMapViewport';
import type { Station } from '../../../shared/types/station';
import { Icon } from '../../../shared/ui/Icon';
import { Card } from '../../../shared/ui/Card';
import { Button } from '../../../shared/ui/Button';

type MetroMapPanelProps = {
  stations: Station[];
  selected: Station | null;
  onSelect: (station: Station) => void;
  viewport: LineMapViewportState;
};

type PositionedStation = Station & {
  x: number;
  y: number;
  labelPosition: 'above' | 'below';
};

const BACKGROUND_ROADS = [
  'M 40 130 C 280 70 430 150 610 100 S 980 80 1300 145',
  'M 20 500 C 230 430 420 510 650 465 S 1040 430 1320 505',
  'M 150 30 C 210 180 190 370 270 590',
  'M 530 20 C 470 180 570 360 500 600',
  'M 930 20 C 850 190 960 360 900 600',
];

const BACKGROUND_BLOCKS = [
  { x: 80, y: 180, width: 180, height: 80 },
  { x: 330, y: 390, width: 180, height: 90 },
  { x: 720, y: 100, width: 170, height: 75 },
  { x: 1030, y: 455, width: 200, height: 85 },
];

function getStationsWithLayout(stations: Station[]): PositionedStation[] {
  const stationByName = new Map(stations.map((station) => [station.name, station]));

  return LINE1_STATION_LAYOUT.flatMap((layout) => {
    const station = stationByName.get(layout.stationName);
    return station ? [{ ...station, ...layout }] : [];
  });
}

function getRoutePath(stations: PositionedStation[]) {
  return stations
    .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`)
    .join(' ');
}

function handleStationKeyDown(
  event: KeyboardEvent<SVGGElement>,
  station: Station,
  onSelect: (station: Station) => void,
) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onSelect(station);
}

/** 1호선 천안·아산 구간의 레이어형 인터랙티브 SVG 약도 */
export function MetroMapPanel({ stations, selected, onSelect, viewport: viewportState }: MetroMapPanelProps) {
  const {
    svgRef,
    viewport,
    dragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    zoomAt,
    resetViewport,
  } = viewportState;
  const positions = getStationsWithLayout(stations);
  const routePath = getRoutePath(positions);

  if (stations.length === 0) {
    return (
      <p className="rounded-lg border border-outline-variant p-lg text-body-md text-on-surface-variant">
        노선 정보를 불러오는 중입니다.
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-sm">
      <div className="line-map-toolbar flex flex-wrap items-start justify-between gap-sm">
        <p className="min-w-0 flex-1 text-body-md text-on-surface-variant">
          드래그해서 이동하고, 휠 또는 두 손가락으로 확대·축소할 수 있습니다.
        </p>
        <div className="flex shrink-0 items-center gap-xs">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => zoomAt(viewport.scale / 1.25, { x: 670, y: 310 })}
            aria-label="노선도 축소"
          >
            <Icon name="remove" className="text-[20px]" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => zoomAt(viewport.scale * 1.25, { x: 670, y: 310 })}
            aria-label="노선도 확대"
          >
            <Icon name="add" className="text-[20px]" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetViewport}
          >
            <Icon name="fit_screen" className="text-[18px]" />
            초기화
          </Button>
        </div>
      </div>

      <Card className="line-map-surface metro-map-surface overflow-hidden border-outline-variant/70 shadow-card">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${LINE1_MAP_VIEWBOX.width} ${LINE1_MAP_VIEWBOX.height}`}
          className="block h-[var(--line-map-height)] min-h-0 w-full select-none"
          role="group"
          aria-label="1호선 천안·아산 구간 약도"
          style={{ touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <title>1호선 천안·아산 구간 약도</title>
          <desc>11개 역을 선택할 수 있는 인터랙티브 SVG 노선도입니다.</desc>

          <g className="metro-map-background" aria-hidden="true">
            {BACKGROUND_BLOCKS.map((block) => (
              <rect key={`${block.x}-${block.y}`} {...block} rx="18" />
            ))}
            {BACKGROUND_ROADS.map((path) => (
              <path key={path} d={path} />
            ))}
            <path d="M 80 560 C 310 525 480 570 690 535 S 1040 520 1280 565" />
            <text x="90" y="85">천안·아산 생활권</text>
          </g>

          <g
            className="metro-map-viewport"
            transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}
          >
            <g className="metro-map-route-layer" aria-label="1호선 노선">
              <path d={routePath} className="metro-map-route-halo" />
              <path d={routePath} className="metro-map-route" />
            </g>

            <g className="metro-map-station-layer" aria-label="역">
              {positions.map((station) => {
                const isSelected = selected?.name === station.name;
                return (
                  <g
                    key={station.name}
                    data-station-id={station.name}
                    className={`metro-station${isSelected ? ' selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${station.name}, ${station.line}`}
                    aria-pressed={isSelected}
                    onClick={() => onSelect(station)}
                    onKeyDown={(event) =>
                      handleStationKeyDown(event, station, onSelect)
                    }
                  >
                    {isSelected && (
                      <circle
                        cx={station.x}
                        cy={station.y}
                        r="27"
                        className="metro-station-selected-ring"
                      />
                    )}
                    <circle cx={station.x} cy={station.y} r="15" className="metro-station-dot" />
                  </g>
                );
              })}
            </g>

            <g className="metro-map-label-layer" aria-label="역 이름">
              {positions.map((station) => (
                <text
                  key={station.name}
                  x={station.x}
                  y={station.y + (station.labelPosition === 'above' ? -34 : 52)}
                  textAnchor="middle"
                  className={`metro-station-label${selected?.name === station.name ? ' selected' : ''}`}
                >
                  {station.name}
                </text>
              ))}
            </g>
          </g>
        </svg>
      </Card>

      {selected && (
        <Card className="border-primary/25 bg-primary-container/25 p-md" aria-live="polite">
          <div className="flex items-start justify-between gap-md">
            <div>
              <p className="text-label-caps text-primary">선택한 역</p>
              <h2 className="mt-xs text-headline-sm text-on-surface">{selected.name}</h2>
              <p className="text-body-md text-on-surface-variant">{selected.line}</p>
            </div>
            <Icon name="location_on" className="text-primary" />
          </div>
          <p className="mt-sm text-body-md text-on-surface-variant">
            위도 {selected.lat.toFixed(5)} · 경도 {selected.lng.toFixed(5)}
          </p>
        </Card>
      )}
    </div>
  );
}
