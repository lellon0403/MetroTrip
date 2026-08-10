/** 지하철 역 정보 */
export type Station = {
  id: number;
  /** 역명 (예: "탕정역") */
  name: string;
  /** 위도 */
  lat: number;
  /** 경도 */
  lng: number;
  /** 노선명 (예: "1호선") */
  line: string;
};
