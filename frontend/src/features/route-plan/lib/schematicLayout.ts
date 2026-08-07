import type { Station } from '../../../shared/types/station';
import { LINE_SHAPES, type Bearing } from '../data/lineShapes';
import type { LineOrder } from './findRoutes';

/**
 * 역을 도식으로 배치한다 (docs/SPEC.md 2-2 R1).
 *
 * 실제 지하철 노선도와 같은 방식이다. 위경도 그대로 찍으면 서울 도심처럼
 * 역이 촘촘한 구간에서 역 간격이 몇 px 로 줄어 누를 수 없다.
 * (1호선 100개 역 기준 이웃 간격이 1.7px 까지 좁아졌다)
 *
 * 노선이 꺾이는 모양은 `data/lineShapes.ts` 에 **방향과 역 개수**로만 적혀 있다.
 * 좌표를 역마다 찍지 않으므로, 역이 늘거나 줄어도 방향만 맞으면 그대로 그려진다.
 * 모양이 없는 노선은 가로 한 줄로 눕힌다.
 *
 * 좌표 단위는 **화면 픽셀**이다. 지도를 카드보다 넓게 두고 끌어서 본다.
 */

/** 역 사이 간격 */
const SPACING = 52;

/** 모양이 정의되지 않은 노선을 눕힐 때 쓰는 줄 간격 */
const ROW_GAP = 96;

/** 지도 가장자리 여백 */
const PADDING = 56;

/** 8방위를 격자 이동량으로 바꾼다. */
const STEP: Record<Bearing, { x: number; y: number }> = {
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  NE: { x: 1, y: -1 },
  NW: { x: -1, y: -1 },
  SE: { x: 1, y: 1 },
  SW: { x: -1, y: 1 },
};

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

type Point = { x: number; y: number };

/**
 * 정의된 모양을 따라 역을 놓는다.
 *
 * 역이 모양보다 많으면 마지막 방향을 계속 이어 간다.
 * (DB 에 역이 추가돼도 갑자기 겹쳐 쌓이지 않게 하려는 것)
 */
function placeAlongShape(
  names: string[],
  from: Point,
  segments: { bearing: Bearing; count: number }[],
  place: (name: string, point: Point) => void,
) {
  let cursor = from;
  let index = 0;
  let lastStep = STEP.E;

  for (const { bearing, count } of segments) {
    lastStep = STEP[bearing];
    for (let i = 0; i < count && index < names.length; i += 1) {
      cursor = {
        x: cursor.x + lastStep.x * SPACING,
        y: cursor.y + lastStep.y * SPACING,
      };
      place(names[index], cursor);
      index += 1;
    }
  }

  // 모양에 적힌 것보다 역이 많으면 마지막 방향으로 계속 놓는다.
  while (index < names.length) {
    cursor = {
      x: cursor.x + lastStep.x * SPACING,
      y: cursor.y + lastStep.y * SPACING,
    };
    place(names[index], cursor);
    index += 1;
  }
}

export function layoutSchematic(
  stations: Station[],
  lineOrder: LineOrder,
): SchematicLayout {
  const known = new Map(stations.map((station) => [station.name, station]));
  const placed = new Map<string, Point>();

  // 긴 노선을 먼저 깔아야 지선이 거기서 갈라져 나가는 모양이 된다.
  const lines = Object.entries(lineOrder)
    .map(([line, names]) => ({
      line,
      names: names.filter((name) => known.has(name)),
    }))
    .filter((entry) => entry.names.length > 0)
    .sort((a, b) => b.names.length - a.names.length);

  if (lines.length === 0) return EMPTY;

  const set = (name: string, point: Point) => placed.set(name, point);
  let fallbackRow = 0;

  for (const { line, names } of lines) {
    const firstNew = names.findIndex((name) => !placed.has(name));
    if (firstNew === -1) continue;

    const shape = LINE_SHAPES[line];

    // 이 노선이 어디서부터 시작하는지 — 겹치는 구간이 있으면 그 끝에서 이어 간다.
    const anchor =
      firstNew === 0
        ? {
            x: PADDING + (shape?.start?.col ?? 0) * SPACING,
            y: PADDING + (shape?.start?.row ?? fallbackRow) * ROW_GAP,
          }
        : placed.get(names[firstNew - 1])!;

    const rest = names.slice(firstNew);

    if (shape) {
      // 첫 역은 시작 자리에 그대로 놓고, 나머지를 방향대로 이어 놓는다.
      if (firstNew === 0) {
        set(rest[0], anchor);
        placeAlongShape(rest.slice(1), anchor, shape.segments, set);
      } else {
        placeAlongShape(rest, anchor, shape.segments, set);
      }
    } else {
      // 모양이 없는 노선은 가로 한 줄로 눕힌다.
      rest.forEach((name, index) => {
        set(name, {
          x: anchor.x + (index + (firstNew === 0 ? 0 : 1)) * SPACING,
          y: firstNew === 0 ? anchor.y : anchor.y + ROW_GAP,
        });
      });
      fallbackRow += 1;
    }
  }

  const positioned = stations
    .filter((station) => placed.has(station.name))
    .map((station) => ({ ...station, ...placed.get(station.name)! }));

  if (positioned.length === 0) return EMPTY;

  // 음수 좌표가 나올 수 있으므로(서쪽으로 꺾이는 구간) 전체를 양수 영역으로 민다.
  const xs = positioned.map((station) => station.x);
  const ys = positioned.map((station) => station.y);
  const shiftX = PADDING - Math.min(...xs);
  const shiftY = PADDING - Math.min(...ys);

  const shifted = positioned.map((station) => ({
    ...station,
    x: station.x + shiftX,
    y: station.y + shiftY,
  }));
  for (const [name, point] of placed) {
    placed.set(name, { x: point.x + shiftX, y: point.y + shiftY });
  }

  return {
    stations: shifted,
    size: {
      width: Math.max(...shifted.map((s) => s.x)) + PADDING,
      height: Math.max(...shifted.map((s) => s.y)) + PADDING,
    },
    paths: Object.entries(lineOrder).map(([line, names]) => ({
      line,
      points: names
        .map((name) => placed.get(name))
        .filter((point): point is Point => Boolean(point)),
    })),
  };
}
