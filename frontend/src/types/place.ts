/**
 * 역 주변 장소.
 *
 * 나중에 백엔드가 내려줄 응답 형태를 미리 맞춰 둔 것이다.
 * (요구사항정의서의 "장소 표시 / 장소 필터 / 관리자 장소 추가·수정·삭제" 항목 기준)
 * 지금은 정적 데이터지만, 필드 이름을 바꾸지 않으면 호출부를 고치지 않아도 된다.
 */
export type Place = {
  id: string;
  /** 장소명 (예: "서브웨이 탕정점") */
  name: string;
  /**
   * 카카오 로컬 카테고리 코드 (docs/SPEC.md 5장)
   * FD6 음식점 / CE7 카페 / AT4 관광명소 / SW8 지하철역
   */
  category: 'FD6' | 'CE7' | 'AT4' | 'SW8';
  /** 카테고리 한글 이름 — 인포윈도우에 그대로 보여준다 */
  categoryName: string;
  address: string;
  lat: number;
  lng: number;
};
