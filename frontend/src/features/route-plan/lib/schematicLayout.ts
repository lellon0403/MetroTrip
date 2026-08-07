import type { Station } from '../../../shared/types/station';
import type { LineOrder } from './findRoutes';

/**
 * 역을 등간격 도식으로 배치한다 (docs/SPEC.md 2-2 R1).
 *
 * 실제 지하철 노선도와 같은 방식이다. 위경도 그대로 찍으면 서울 도심처럼
 * 역이 촘촘한 구간에서 역 간격이 몇 px 로 줄어 누를 수 없다.
 * (1호선 100개 역 기준 이웃 간격이 1.7px 까지 좁아졌다)
 *
 * 지리는 버리지만 좌표를 손으로 찍지 않는 건 그대로라,
 * 노선이 늘어나도 코드를 고칠 필요가 없다.
 *
 * 좌표 단위는 **화면 픽셀**이다. 지도를 카드보다 넓게 두고 끌어서 본다.
 */

/** 역 사이 가로 간격 */
const SPACING = 52;

/** 지선이 갈라져 내려가는 줄 간격 */
const ROW_GAP = 96;

/** 지도 가장자리 여백 */
const PADDING = 56;

export type SchematicStation = Station & { x: number; y: number };

export type SchematicLayout = {
  stations: SchematicStation[];
  /** 배치 전체가 차지하는 크기 (픽셀) */
  size: { width: number; height: number };
  /** 노선별로 이어 그릴 좌표 목록 */
  paths: { line: string; points: { x: number; y: number }[] }[];
};

const EMPTY: SchematicLayout = {
  stations: [],
  size: { width: 0, height: 0 },
  paths: [],
};

export function layoutSchematic(
  stations: Station[],
  lineOrder: LineOrder,
): SchematicLayout {
  const known = new Map(stations.map((station) => [station.name, station]));
  const placed = new Map<string, { x: number; y: number }>();

  // 긴 노선을 먼저 깔아야 지선이 거기서 갈라져 나가는 모양이 된다.
  const lines = Object.entries(lineOrder)
    .map(([line, names]) => ({
      line,
      names: names.filter((name) => known.has(name)),
    }))
    .filter((entry) => entry.names.length > 0)
    .sort((a, b) => b.names.length - a.names.length);

  if (lines.length === 0) return EMPTY;

  let row = 0;

  for (const { names } of lines) {
    const firstNew = names.findIndex((name) => !placed.has(name));
    if (firstNew === -1) continue;

    if (firstNew === 0) {
      // 겹치는 역이 없는 새 노선 — 새 줄에 통째로 깐다.
      names.forEach((name, index) => {
        placed.set(name, {
          x: PADDING + index * SPACING,
          y: PADDING + row * ROW_GAP,
        });
      });
    } else {
      // 앞부분을 다른 노선과 공유한다. 갈라지는 지점부터 새 줄로 내린다.
      const anchor = placed.get(names[firstNew - 1])!;
      names.slice(firstNew).forEach((name, index) => {
        placed.set(name, {
          x: anchor.x + (index + 1) * SPACING,
          y: PADDING + (row + 1) * ROW_GAP,
        });
      });
      row += 1;
    }

    row += 1;
  }

  const positioned = stations
    .filter((station) => placed.has(station.name))
    .map((station) => ({ ...station, ...placed.get(station.name)! }));

  const xs = positioned.map((station) => station.x);
  const ys = positioned.map((station) => station.y);

  return {
    stations: positioned,
    size: {
      width: Math.max(...xs) + PADDING,
      height: Math.max(...ys) + PADDING,
    },
    paths: Object.entries(lineOrder).map(([line, names]) => ({
      line,
      points: names
        .map((name) => placed.get(name))
        .filter((point): point is { x: number; y: number } => Boolean(point)),
    })),
  };
}
