/**
 * 수도권 전철 노선 색.
 *
 * 카카오·네이버 지하철과 같은 색을 쓴다. 사람들이 이미 아는 색이라
 * 다른 색을 쓰면 같은 노선인지 알아보기 어렵다.
 * (공식 노선 색상 — 1호선 남색, 2호선 초록 …)
 *
 * 노선 이름이 `1호선 (인천)` 처럼 갈래 표시를 달고 오므로
 * 앞의 숫자만 뽑아서 찾는다. 두 갈래 모두 같은 1호선 색이 된다.
 */

const LINE_COLORS: Record<string, string> = {
  '1': '#0052A4',
  '2': '#00A84D',
  '3': '#EF7C1C',
  '4': '#00A5DE',
  '5': '#996CAC',
  '6': '#CD7C2F',
  '7': '#747F00',
  '8': '#E6186C',
  '9': '#BB8336',
};

/** 노선 색을 못 찾았을 때 쓰는 회색 */
const FALLBACK = '#6B7280';

export function getLineColor(lineName: string): string {
  const matched = /(\d+)\s*호선/.exec(lineName);
  return (matched && LINE_COLORS[matched[1]]) || FALLBACK;
}
