-- =====================================================================
-- 지하철 노선 기반 관광 추천 서비스 (MetroTrip)
-- 초기 데이터 : 장소 이미지
--
-- 근거 문서 : 데이터베이스 명세서 V1.10
-- 대상 테이블 : place_images
-- 건수 : 29건
--
-- 선행 조건 : 05_places
-- =====================================================================

USE metrotrip;

-- 재적재 시 아래 주석을 해제할 것
-- DELETE FROM place_images;
-- ALTER TABLE place_images AUTO_INCREMENT = 1;

-- sort_order = 1 이 대표 이미지. 원본 first_image 를 사용한다.
-- 원본에 이미지가 없는 4건은 제외했다.
-- first_image2 는 동일 이미지의 썸네일이므로 적재하지 않는다.

INSERT INTO place_images (place_id, image_url, sort_order) VALUES
  ( 1, 'http://tong.visitkorea.or.kr/cms/resource/86/2606486_image2_1.jpg', 1),   -- [백년가게]진주회관본관
  ( 2, 'http://tong.visitkorea.or.kr/cms/resource/83/2860583_image2_1.jpg', 1),   -- 동순원 성환본점
  ( 3, 'http://tong.visitkorea.or.kr/cms/resource/95/3067395_image2_1.jpg', 1),   -- 성환이화시장 (1, 6일)
  ( 4, 'http://tong.visitkorea.or.kr/cms/resource/72/2856772_image2_1.jpg', 1),   -- 천안가야밀면
  ( 5, 'http://tong.visitkorea.or.kr/cms/resource/85/2849885_image2_1.jpg', 1),   -- 매주리커피
  ( 6, 'http://tong.visitkorea.or.kr/cms/resource/21/2860521_image2_1.jpg', 1),   -- 광명만두
  ( 7, 'http://tong.visitkorea.or.kr/cms/resource/45/2762945_image2_1.jpg', 1),   -- 천안역전시장
  ( 9, 'http://tong.visitkorea.or.kr/cms/resource/50/2741350_image2_1.jpg', 1),   -- 석산장
  (11, 'http://tong.visitkorea.or.kr/cms/resource/12/3570312_image2_1.jpg', 1),   -- 충청남도교육청학생교육문화원
  (12, 'http://tong.visitkorea.or.kr/cms/resource/54/2792454_image2_1.jpg', 1),   -- 홍두깨칼국수
  (13, 'http://tong.visitkorea.or.kr/cms/resource/28/2850028_image2_1.png', 1),   -- 구암생갈비
  (14, 'http://tong.visitkorea.or.kr/cms/resource/56/2839056_image2_1.jpg', 1),   -- 몽상가인
  (15, 'http://tong.visitkorea.or.kr/cms/resource/18/2857918_image2_1.jpg', 1),   -- 숨 어반
  (16, 'http://tong.visitkorea.or.kr/cms/resource/58/2850358_image2_1.jpg', 1),   -- 수원참갈비
  (17, 'http://tong.visitkorea.or.kr/cms/resource/57/3067557_image2_1.jpg', 1),   -- 점핑고
  (18, 'http://tong.visitkorea.or.kr/cms/resource/84/2762884_image2_1.JPG', 1),   -- 신방공원
  (19, 'http://tong.visitkorea.or.kr/cms/resource/08/2868808_image2_1.jpg', 1),   -- 밀이랑보리랑
  (20, 'http://tong.visitkorea.or.kr/cms/resource/23/3067423_image2_1.jpg', 1),   -- 에코힐링 황톳길
  (21, 'http://tong.visitkorea.or.kr/cms/resource/18/2767118_image2_1.jpg', 1),   -- 이내카페
  (22, 'http://tong.visitkorea.or.kr/cms/resource/78/2868778_image2_1.jpg', 1),   -- 모산수제비
  (23, 'http://tong.visitkorea.or.kr/cms/resource/28/2751928_image2_1.jpg', 1),   -- 신천탕
  (24, 'http://tong.visitkorea.or.kr/cms/resource/31/2858531_image2_1.jpg', 1),   -- 재벌짬뽕
  (25, 'http://tong.visitkorea.or.kr/cms/resource/70/3060070_image2_1.jpg', 1),   -- 온양온천시장
  (26, 'http://tong.visitkorea.or.kr/cms/resource/74/2616374_image2_1.JPG', 1),   -- [백년가게]은정갈비
  (27, 'http://tong.visitkorea.or.kr/cms/resource/80/2640980_image2_1.jpg', 1),   -- 현대갈비
  (28, 'http://tong.visitkorea.or.kr/cms/resource/12/3570112_image2_1.jpg', 1),   -- 이충무공사적비
  (29, 'http://tong.visitkorea.or.kr/cms/resource/93/3337693_image2_1.jpg', 1),   -- 영괴대
  (31, 'http://tong.visitkorea.or.kr/cms/resource/40/3570140_image2_1.jpg', 1),   -- 온양온천지구
  (32, 'http://tong.visitkorea.or.kr/cms/resource/80/3573280_image2_1.jpg', 1);   -- 온양관광호텔 온천탕
