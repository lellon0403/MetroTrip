/**
 * 노선의 꺾이는 모양 (docs/SPEC.md 2-2).
 *
 * 실제 지하철 노선도처럼 보이게 하려고, 노선이 어느 방향으로 몇 개 역을
 * 지나는지만 적어 둔다. 좌표를 역마다 찍지 않으므로 데이터가 가볍고,
 * 역이 추가·삭제돼도 방향만 맞으면 그대로 그려진다.
 *
 * 수도권 전철 노선도의 1호선 모양을 따랐다.
 *
 *   연천 ──────────→ 회룡        동쪽 일직선
 *                      ↘         도봉산으로 꺾여 내려감
 *                       ↓        광운대까지 남쪽
 *                      ↙         청량리로 내려꺾임
 *          서울역 ←────           도심을 서쪽으로 가로지름
 *            ↓                    구로까지 남쪽
 *      인천 ←┴→ 신창              구로에서 두 갈래
 *
 * 모양이 정의되지 않은 노선은 가로 한 줄로 눕힌다 (schematicLayout 의 기본값).
 */

/** 8방위. 실제 노선도처럼 45도 단위로만 꺾는다. */
export type Bearing = 'E' | 'W' | 'N' | 'S' | 'NE' | 'NW' | 'SE' | 'SW';

export type LineShape = {
  /**
   * 첫 역을 놓을 자리 (격자 칸).
   * 다른 노선과 구간을 공유하면 그 지점에서 이어지므로 무시된다.
   */
  start?: { col: number; row: number };
  /** 이 방향으로 역을 `count` 개 놓는다 */
  segments: { bearing: Bearing; count: number }[];
};

/**
 * `1호선 (신창)` 은 연천부터 신창까지 전 구간을 정의한다.
 * `1호선 (인천)` 은 구로까지가 겹치므로 **갈라진 뒤만** 정의한다.
 * (긴 노선을 먼저 깔고 지선이 거기서 뻗어나가는 순서로 배치된다)
 */
export const LINE_SHAPES: Record<string, LineShape> = {
  '1호선 (신창)': {
    start: { col: 0, row: 0 },
    segments: [
      { bearing: 'E', count: 14 }, //  전곡 ~ 회룡
      { bearing: 'SE', count: 2 }, //  망월사 ~ 도봉산
      { bearing: 'S', count: 6 }, //   도봉 ~ 광운대
      { bearing: 'SW', count: 5 }, //  석계 ~ 청량리
      { bearing: 'W', count: 9 }, //   제기동 ~ 서울역 (도심 가로지르기)
      { bearing: 'SW', count: 3 }, //  남영 ~ 노량진
      { bearing: 'S', count: 5 }, //   대방 ~ 구로 (여기서 갈라짐)
      { bearing: 'SE', count: 8 }, //  가산디지털단지 ~ 금정
      { bearing: 'S', count: 7 }, //   군포 ~ 세류
      { bearing: 'SE', count: 20 }, // 병점 ~ 신창
    ],
  },

  '1호선 (인천)': {
    segments: [
      { bearing: 'SW', count: 3 }, //  구일 ~ 오류동
      { bearing: 'W', count: 17 }, //  온수 ~ 인천
    ],
  },
};
