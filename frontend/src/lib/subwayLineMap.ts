type ApiLineStation = {
  stationId: number;
  stationName: string;
  stationOrder: number;
  latitude: number;
  longitude: number;
};

type ApiLineStationsResponse = {
  lineId: number;
  items: ApiLineStation[];
};

/** 실제 세 노선. DB의 line_id 6개가 이 세 노선으로 묶인다. */
export type RealLineId = "line1" | "line2" | "line4";

export const REAL_LINE_META: Record<RealLineId, { label: string; color: string }> = {
  line1: { label: "1호선", color: "#0052a4" },
  line2: { label: "2호선", color: "#00a84d" },
  line4: { label: "4호선", color: "#00a5de" },
};

export const LINE_ID_TO_REAL: Record<number, RealLineId> = {
  1: "line1",
  2: "line1",
  3: "line4",
  4: "line2",
  5: "line2",
  6: "line2",
};

export type LineMapStation = {
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  /** 이 역이 속한 실제 노선들 (2개 이상이면 환승역) */
  lines: RealLineId[];
  /**
   * 이 역이 속한 DB 원본 line_id 목록 (1~6).
   * 시간표 API(`/stations/{id}/timetables?line_id=`)는 이 원본 line_id를 그대로 받는다.
   * 실제 노선(line1/line2/line4) 하나가 원본 line_id 여러 개로 이루어져 있어서
   * (예: 1호선 = 1·2, 2호선 = 4·5·6) 환승 경로를 계산할 때 필요하다.
   */
  rawLineIds: number[];
};

export type LineMapEdge = {
  from: string;
  to: string;
  line: RealLineId;
};

export type LineMapData = {
  stations: Map<string, LineMapStation>;
  edges: LineMapEdge[];
};

function apiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  return configured.replace(/\/api\/v1\/?$/, "");
}

async function fetchLineStations(lineId: number): Promise<ApiLineStation[]> {
  const response = await fetch(`${apiBaseUrl()}/api/v1/lines/${lineId}/stations`);
  if (!response.ok) return [];
  const data = (await response.json()) as ApiLineStationsResponse;
  return data.items;
}

function addStation(
  target: Map<string, LineMapStation>,
  station: ApiLineStation,
  line: RealLineId,
  rawLineId: number,
) {
  const id = String(station.stationId);
  const existing = target.get(id);
  if (existing) {
    if (!existing.lines.includes(line)) existing.lines.push(line);
    if (!existing.rawLineIds.includes(rawLineId)) existing.rawLineIds.push(rawLineId);
    return;
  }
  target.set(id, {
    stationId: id,
    name: station.stationName,
    latitude: station.latitude,
    longitude: station.longitude,
    lines: [line],
    rawLineIds: [rawLineId],
  });
}

function addEdges(edges: LineMapEdge[], stations: ApiLineStation[], line: RealLineId) {
  for (let i = 1; i < stations.length; i++) {
    edges.push({ from: String(stations[i - 1].stationId), to: String(stations[i].stationId), line });
  }
}

/**
 * 6개 line_id 를 실제 위경도 기반 3개 노선(1·2·4호선) 지도로 합친다.
 *
 * 좌표는 역의 실제 위경도를 그대로 쓴다 — 화면에는 Kakao 지도 위에 실제
 * kakao.maps.LatLng 로 그리므로, 같은 역은 어느 노선에서 봐도 같은 위치에
 * 자동으로 겹친다(환승역을 억지로 맞출 필요가 없다).
 *
 * 2호선은 순환선이라 마지막 역에서 첫 역으로 돌아가는 edge를 하나 더 넣는다.
 */
export async function loadSubwayLineMap(): Promise<LineMapData> {
  const [line1, line2, line3, line4, line5, line6] = await Promise.all(
    [1, 2, 3, 4, 5, 6].map(fetchLineStations),
  );

  const stations = new Map<string, LineMapStation>();
  const edges: LineMapEdge[] = [];

  const groups: [ApiLineStation[], number][] = [
    [line1, 1],
    [line2, 2],
    [line3, 3],
    [line4, 4],
    [line5, 5],
    [line6, 6],
  ];

  for (const [list, lineId] of groups) {
    const realLine = LINE_ID_TO_REAL[lineId];
    list.forEach((station) => addStation(stations, station, realLine, lineId));
    addEdges(edges, list, realLine);
  }

  // 2호선 본선(line_id=4)은 순환선이라 마지막 역(충정로) → 첫 역(시청)으로 닫는다.
  if (line4.length > 1) {
    edges.push({ from: String(line4[line4.length - 1].stationId), to: String(line4[0].stationId), line: "line2" });
  }

  return { stations, edges };
}
