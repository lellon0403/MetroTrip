-- =====================================================================
-- 지하철 노선 기반 관광 추천 서비스 (MetroTrip)
-- 더미 데이터 : 여행 후기 · 인원 모집 게시판
--
-- 근거 문서 : 데이터베이스 명세서 V1.12
-- 대상 테이블 : reviews / review_tags / review_media
--              board_posts / post_participants
--
-- 목적 : 화면 확인과 발표 시연에 쓸 데이터. 실제 사용 흐름에 가깝게 구성했다.
--
-- 선행 조건
--   seed_01_users.sql       (회원 5명)
--   seed_02_line1.sql       (천안·아산 구간 역)
--   seed_05_places.sql      (게시글에서 참조하는 추천 장소)
--
-- 참고 : 회원·역·장소를 ID 가 아니라 이메일·역명·장소명으로 조회해 넣는다.
--        AUTO_INCREMENT 값이 환경마다 달라도 그대로 실행된다.
-- =====================================================================

USE metrotrip;

SET @today = CURDATE();


-- ---------------------------------------------------------------------
-- 0. 기존 더미 데이터 삭제
--
-- review_media / review_tags 는 reviews 에 CASCADE 로 묶여 있고,
-- post_participants 는 board_posts 에 CASCADE 로 묶여 있으므로
-- 부모만 지우면 자식도 함께 사라진다. 순서를 지킬 필요가 없다.
-- ---------------------------------------------------------------------
DELETE FROM reviews;
DELETE FROM board_posts;

ALTER TABLE reviews           AUTO_INCREMENT = 1;
ALTER TABLE review_tags       AUTO_INCREMENT = 1;
ALTER TABLE review_media      AUTO_INCREMENT = 1;
ALTER TABLE board_posts       AUTO_INCREMENT = 1;
ALTER TABLE post_participants AUTO_INCREMENT = 1;


-- ---------------------------------------------------------------------
-- 참조값 조회
-- ---------------------------------------------------------------------
-- 실제 가입 회원을 사용한다. 이메일로 조회하므로 user_id 가 달라져도 동작한다.
SET @u1 = (SELECT user_id FROM users WHERE email = 'user001@test.com');
SET @u2 = (SELECT user_id FROM users WHERE email = 'user002@test.com');
SET @u3 = (SELECT user_id FROM users WHERE email = 'user003@test.com');
SET @u4 = (SELECT user_id FROM users WHERE email = 'user004@test.com');
SET @u5 = (SELECT user_id FROM users WHERE email = 'user005@test.com');

-- 조회 실패 시 NULL 이 되어 FK 오류가 나므로 먼저 확인한다. 5 가 나와야 한다.
SELECT COUNT(*) AS 참조회원수
FROM users
WHERE email IN ('user001@test.com', 'user002@test.com', 'user003@test.com',
                'user004@test.com', 'user005@test.com');

SET @st_seoul   = (SELECT station_id FROM stations WHERE station_name = '서울역');
SET @st_cheonan = (SELECT station_id FROM stations WHERE station_name = '천안');
SET @st_onyang  = (SELECT station_id FROM stations WHERE station_name = '온양온천');
SET @st_asan    = (SELECT station_id FROM stations WHERE station_name = '아산');
SET @st_ssang   = (SELECT station_id FROM stations WHERE station_name = '쌍용');
SET @st_seong   = (SELECT station_id FROM stations WHERE station_name = '성환');
SET @st_bae     = (SELECT station_id FROM stations WHERE station_name = '배방');
SET @st_dujeong = (SELECT station_id FROM stations WHERE station_name = '두정');


-- =====================================================================
-- 1. reviews : 여행 후기 (6건)
--
-- rating 은 반개 단위 표현을 위해 1~10 정수로 저장한다. (8 = 별 4개)
-- travel_cost 단위는 원(KRW). plan_id 는 travel_plans 가 비어 있어 NULL.
-- created_at 을 과거로 흩어 두어 최신순 정렬이 의미를 갖게 했다.
-- =====================================================================
INSERT INTO reviews
  (user_id, title, content, start_station_id, end_station_id,
   rating, travel_cost, plan_id, view_count, created_at, updated_at)
VALUES
(@u1, '온양온천 당일치기, 지하철로 충분했어요',
 '서울역에서 1호선 급행 타고 온양온천까지 두 시간 반 걸렸습니다. 생각보다 안 멀어요.\n'
 '역에서 나오면 바로 온천지구라 이동이 편합니다. 온양온천시장에서 점심 먹고 신천탕에서 온천욕 했어요.\n'
 '주말이라 사람이 좀 있었지만 대기할 정도는 아니었습니다. 교통비 포함해서 4만원 안 썼네요.',
 @st_seoul, @st_onyang, 9, 38000, NULL, 142,
 DATE_SUB(@today, INTERVAL 18 DAY), DATE_SUB(@today, INTERVAL 18 DAY)),

(@u2, '천안 빵집 투어 다녀왔습니다',
 '천안역 근처만 돌아도 하루가 부족합니다. 역전시장에서 시작해서 걸어다녔어요.\n'
 '달식당에서 늦은 점심 먹었는데 웨이팅 20분 정도 있었습니다. 평일에 가시는 걸 추천드려요.\n'
 '돌아올 때 급행 시간 놓쳐서 완행 탔더니 한참 걸렸습니다. 시간표 미리 확인하세요.',
 @st_seoul, @st_cheonan, 7, 25000, NULL, 89,
 DATE_SUB(@today, INTERVAL 12 DAY), DATE_SUB(@today, INTERVAL 12 DAY)),

(@u3, '아산 배방 쪽 조용해서 좋았어요',
 '사람 많은 곳 싫어하시는 분들께 추천합니다. 배방역 주변이 한적해요.\n'
 '모산수제비에서 늦은 점심 먹고 근처 걸어다녔습니다. 특별한 관광지는 없지만 그게 좋았어요.\n'
 '다만 역 주변에 카페가 많지는 않습니다. 이내카페 정도.',
 @st_cheonan, @st_bae, 8, 18000, NULL, 47,
 DATE_SUB(@today, INTERVAL 9 DAY), DATE_SUB(@today, INTERVAL 9 DAY)),

(@u4, '쌍용역에서 신방공원까지 걸어봤어요',
 '지도에서는 가까워 보였는데 실제로 걸으니 15분 넘게 걸렸습니다.\n'
 '공원 자체는 산책하기 괜찮았어요. 벤치도 많고 그늘도 있고요.\n'
 '여름에 가실 거면 물 챙겨가세요. 근처에 편의점이 바로 없습니다.',
 @st_cheonan, @st_ssang, 6, 12000, NULL, 33,
 DATE_SUB(@today, INTERVAL 6 DAY), DATE_SUB(@today, INTERVAL 6 DAY)),

(@u1, '성환 이화시장 장날 다녀온 후기',
 '1일과 6일에만 열리는 오일장입니다. 날짜 확인하고 가셔야 해요.\n'
 '역에서 걸어서 5분 정도라 접근성은 좋습니다. 진주회관에서 밥 먹었는데 괜찮았어요.\n'
 '장날 아니면 볼 게 별로 없다고 하니 참고하세요.',
 @st_seoul, @st_seong, 8, 22000, NULL, 61,
 DATE_SUB(@today, INTERVAL 4 DAY), DATE_SUB(@today, INTERVAL 4 DAY)),

(@u2, '천안 야경 보러 갔다가 막차 놓칠 뻔',
 '저녁 늦게까지 있다가 상행 막차 시간을 착각했습니다.\n'
 '평일이랑 주말 시간표가 다르다는 걸 몰랐어요. 다행히 마지막 열차 탔습니다.\n'
 '늦게까지 계실 분들은 꼭 시간표 확인하세요. 광운대행이랑 청량리행이 섞여 있어서 헷갈립니다.',
 @st_seoul, @st_cheonan, 5, 31000, NULL, 208,
 DATE_SUB(@today, INTERVAL 1 DAY), DATE_SUB(@today, INTERVAL 1 DAY));


-- ---------------------------------------------------------------------
-- 1-1. review_tags : 후기 태그 (18건)
--
-- 영문 태그는 애플리케이션에서 소문자로 변환해 저장한다.
-- (review_id, tag_name) 복합 UNIQUE 로 동일 후기 내 중복을 막는다.
-- ---------------------------------------------------------------------
INSERT INTO review_tags (review_id, tag_name)
SELECT r.review_id, t.tag_name FROM reviews r
JOIN (
  SELECT '온양온천 당일치기, 지하철로 충분했어요' AS title, '온천'     AS tag_name UNION ALL
  SELECT '온양온천 당일치기, 지하철로 충분했어요', '당일치기'  UNION ALL
  SELECT '온양온천 당일치기, 지하철로 충분했어요', '가성비'    UNION ALL
  SELECT '천안 빵집 투어 다녀왔습니다',            '맛집'      UNION ALL
  SELECT '천안 빵집 투어 다녀왔습니다',            '천안'      UNION ALL
  SELECT '천안 빵집 투어 다녀왔습니다',            '도보여행'  UNION ALL
  SELECT '아산 배방 쪽 조용해서 좋았어요',         '한적함'    UNION ALL
  SELECT '아산 배방 쪽 조용해서 좋았어요',         '아산'      UNION ALL
  SELECT '쌍용역에서 신방공원까지 걸어봤어요',     '산책'      UNION ALL
  SELECT '쌍용역에서 신방공원까지 걸어봤어요',     '공원'      UNION ALL
  SELECT '쌍용역에서 신방공원까지 걸어봤어요',     '도보여행'  UNION ALL
  SELECT '성환 이화시장 장날 다녀온 후기',         '전통시장'  UNION ALL
  SELECT '성환 이화시장 장날 다녀온 후기',         '맛집'      UNION ALL
  SELECT '성환 이화시장 장날 다녀온 후기',         '오일장'    UNION ALL
  SELECT '천안 야경 보러 갔다가 막차 놓칠 뻔',     '야경'      UNION ALL
  SELECT '천안 야경 보러 갔다가 막차 놓칠 뻔',     '천안'      UNION ALL
  SELECT '천안 야경 보러 갔다가 막차 놓칠 뻔',     '주의사항'
) t ON t.title = r.title;


-- ---------------------------------------------------------------------
-- 1-2. review_media : 후기 첨부 이미지 (4건)
--
-- 실제 파일이 없으므로 오브젝트 스토리지 경로 형식만 흉내낸 값이다.
-- 화면에서 이미지가 깨져 보이는 것이 정상이며, 렌더링 확인용으로만 쓴다.
-- ---------------------------------------------------------------------
INSERT INTO review_media (review_id, media_url, media_type)
SELECT r.review_id, m.media_url, m.media_type FROM reviews r
JOIN (
  SELECT '온양온천 당일치기, 지하철로 충분했어요' AS title,
         'https://storage.metrotrip.kr/reviews/2026/onyang-01.jpg' AS media_url, 'IMAGE' AS media_type UNION ALL
  SELECT '온양온천 당일치기, 지하철로 충분했어요',
         'https://storage.metrotrip.kr/reviews/2026/onyang-02.jpg', 'IMAGE' UNION ALL
  SELECT '천안 빵집 투어 다녀왔습니다',
         'https://storage.metrotrip.kr/reviews/2026/cheonan-01.jpg', 'IMAGE' UNION ALL
  SELECT '성환 이화시장 장날 다녀온 후기',
         'https://storage.metrotrip.kr/reviews/2026/seonghwan-01.jpg', 'IMAGE'
) m ON m.title = r.title;


-- =====================================================================
-- 2. board_posts : 인원 모집 게시글 (5건)
--
-- 모든 게시글이 모집 글이다. recruit_capacity / recruit_deadline /
-- recruit_status 는 필수이며, recruit_status 는 DEFAULT 'RECRUITING' 이다.
-- travel_plans 가 비어 있어 plan_id 는 전건 NULL 로 둔다.
--
-- 아래 5건은 모집 상태를 골고루 담아 화면 확인이 가능하도록 구성했다.
--   #1 여유 있는 모집중   #2 정원 임박   #3 정원 충족으로 마감
--   #4 마감일 경과(상태는 RECRUITING)   #5 이제 막 올라온 글
-- =====================================================================
INSERT INTO board_posts
  (user_id, title, content, view_count,
   recruit_capacity, recruit_deadline, recruit_status, meeting_date,
   plan_id, created_at, updated_at)
VALUES
-- #1 여유 있게 모집중 (정원 6, 수락 2)
(@u1, '온양온천 온천욕 같이 가실 분 구해요',
 '9월 첫째 주 토요일에 온양온천 다녀오려고 합니다.\n'
 '서울역에서 급행 타고 갈 예정이고, 온천 하고 시장에서 점심 먹고 오는 코스입니다.\n'
 '온천 처음이신 분도 환영해요. 각자 경비는 개인 부담입니다.',
 47, 6, DATE_ADD(@today, INTERVAL 14 DAY), 'RECRUITING', DATE_ADD(@today, INTERVAL 20 DAY),
 NULL, DATE_SUB(@today, INTERVAL 5 DAY), DATE_SUB(@today, INTERVAL 5 DAY)),

-- #2 정원 임박 (정원 4, 수락 3)
(@u2, '천안 맛집 투어 3명 더 모집합니다',
 '천안역 근처 맛집 돌아다닐 사람 찾습니다. 총 4명 예정이에요.\n'
 '역전시장 → 달식당 → 석산장 순으로 생각 중인데 의견 주시면 반영할게요.\n'
 '평일 낮이라 웨이팅 부담은 덜할 것 같습니다.',
 63, 4, DATE_ADD(@today, INTERVAL 6 DAY), 'RECRUITING', DATE_ADD(@today, INTERVAL 10 DAY),
 NULL, DATE_SUB(@today, INTERVAL 8 DAY), DATE_SUB(@today, INTERVAL 3 DAY)),

-- #3 정원이 차서 마감 (정원 3, 수락 3)
(@u3, '[마감] 아산 배방 조용한 코스 같이 걸어요',
 '배방역 주변 한적한 길 걷는 모임입니다. 인원이 다 차서 마감합니다.\n'
 '참여해주신 분들 감사합니다. 다음에 또 모집할게요.',
 91, 3, DATE_ADD(@today, INTERVAL 3 DAY), 'CLOSED', DATE_ADD(@today, INTERVAL 7 DAY),
 NULL, DATE_SUB(@today, INTERVAL 15 DAY), DATE_SUB(@today, INTERVAL 2 DAY)),

-- #4 마감일이 지났으나 상태는 RECRUITING
--    자동 마감 배치가 없어 실제로 발생하는 상태다.
--    신청 차단과 목록 필터에서 recruit_deadline 조건이 필요한 이유를 보여주는 사례.
(@u4, '성환 오일장 장날 같이 가실 분',
 '성환 이화시장 오일장 구경 가려고 합니다. 1일, 6일에만 열려요.\n'
 '역에서 걸어서 5분이라 부담 없습니다.',
 38, 5, DATE_SUB(@today, INTERVAL 2 DAY), 'RECRUITING', DATE_SUB(@today, INTERVAL 1 DAY),
 NULL, DATE_SUB(@today, INTERVAL 20 DAY), DATE_SUB(@today, INTERVAL 20 DAY)),

-- #5 이제 막 올라온 글 (신청 1, 미처리)
(@u5, '천안 야경 보러 갈 사람 모집',
 '천안에서 저녁 먹고 야경 보고 오는 일정입니다.\n'
 '막차 시간 미리 확인해서 놓치지 않게 할게요. 상행 막차가 생각보다 빠릅니다.\n'
 '2명 정도만 더 있으면 좋겠어요.',
 12, 3, DATE_ADD(@today, INTERVAL 20 DAY), 'RECRUITING', DATE_ADD(@today, INTERVAL 25 DAY),
 NULL, DATE_SUB(@today, INTERVAL 1 DAY), DATE_SUB(@today, INTERVAL 1 DAY));


-- ---------------------------------------------------------------------
-- 2-1. post_participants : 모집 참여 신청 (13건)
--
-- 현재 모집 인원은 status = 'ACCEPTED' 건수로 산출한다.
-- (post_id, user_id) 복합 UNIQUE 로 동일 글에 중복 신청을 막는다.
-- 취소·거절 이력이 있어도 행을 지우지 않고 상태만 바꾼다.
--
-- responded_at 은 수락·거절 처리 시각이며 APPLIED 상태에서는 NULL 이다.
-- 작성자 본인은 신청자 목록에 포함하지 않는다.
-- ---------------------------------------------------------------------
INSERT INTO post_participants (post_id, user_id, status, applied_at, responded_at)
SELECT p.post_id, x.user_id, x.status, x.applied_at, x.responded_at
FROM board_posts p
JOIN (
  -- #1 온양온천 : 정원 6 / 수락 2 · 신청 1 · 취소 1
  SELECT '온양온천 온천욕 같이 가실 분 구해요' AS title, @u2 AS user_id, 'ACCEPTED' AS status,
         DATE_SUB(@today, INTERVAL 5 DAY) AS applied_at, DATE_SUB(@today, INTERVAL 4 DAY) AS responded_at UNION ALL
  SELECT '온양온천 온천욕 같이 가실 분 구해요', @u3, 'ACCEPTED',
         DATE_SUB(@today, INTERVAL 4 DAY), DATE_SUB(@today, INTERVAL 4 DAY) UNION ALL
  SELECT '온양온천 온천욕 같이 가실 분 구해요', @u4, 'APPLIED',
         DATE_SUB(@today, INTERVAL 1 DAY), NULL UNION ALL
  SELECT '온양온천 온천욕 같이 가실 분 구해요', @u5, 'CANCELED',
         DATE_SUB(@today, INTERVAL 3 DAY), DATE_SUB(@today, INTERVAL 2 DAY) UNION ALL

  -- #2 천안 맛집 : 정원 4 / 수락 3 · 거절 1  → 한 자리 남음
  SELECT '천안 맛집 투어 3명 더 모집합니다', @u1, 'ACCEPTED',
         DATE_SUB(@today, INTERVAL 7 DAY), DATE_SUB(@today, INTERVAL 7 DAY) UNION ALL
  SELECT '천안 맛집 투어 3명 더 모집합니다', @u3, 'ACCEPTED',
         DATE_SUB(@today, INTERVAL 6 DAY), DATE_SUB(@today, INTERVAL 5 DAY) UNION ALL
  SELECT '천안 맛집 투어 3명 더 모집합니다', @u4, 'ACCEPTED',
         DATE_SUB(@today, INTERVAL 5 DAY), DATE_SUB(@today, INTERVAL 3 DAY) UNION ALL
  SELECT '천안 맛집 투어 3명 더 모집합니다', @u5, 'REJECTED',
         DATE_SUB(@today, INTERVAL 4 DAY), DATE_SUB(@today, INTERVAL 3 DAY) UNION ALL

  -- #3 아산 배방 : 정원 3 / 수락 3  → 정원 충족으로 CLOSED
  SELECT '[마감] 아산 배방 조용한 코스 같이 걸어요', @u1, 'ACCEPTED',
         DATE_SUB(@today, INTERVAL 14 DAY), DATE_SUB(@today, INTERVAL 13 DAY) UNION ALL
  SELECT '[마감] 아산 배방 조용한 코스 같이 걸어요', @u2, 'ACCEPTED',
         DATE_SUB(@today, INTERVAL 12 DAY), DATE_SUB(@today, INTERVAL 11 DAY) UNION ALL
  SELECT '[마감] 아산 배방 조용한 코스 같이 걸어요', @u5, 'ACCEPTED',
         DATE_SUB(@today, INTERVAL 4 DAY), DATE_SUB(@today, INTERVAL 2 DAY) UNION ALL

  -- #4 성환 오일장 : 마감일 경과. 수락 1 · 미처리 1 이 남아 있다
  SELECT '성환 오일장 장날 같이 가실 분', @u1, 'ACCEPTED',
         DATE_SUB(@today, INTERVAL 18 DAY), DATE_SUB(@today, INTERVAL 17 DAY) UNION ALL
  SELECT '성환 오일장 장날 같이 가실 분', @u2, 'APPLIED',
         DATE_SUB(@today, INTERVAL 6 DAY), NULL UNION ALL

  -- #5 천안 야경 : 이제 막 신청 1건
  SELECT '천안 야경 보러 갈 사람 모집', @u1, 'APPLIED',
         DATE_SUB(@today, INTERVAL 1 DAY), NULL
) x ON x.title = p.title;


-- =====================================================================
-- 3. 적재 결과 확인
-- =====================================================================
SELECT 'reviews' AS 테이블, COUNT(*) AS 건수 FROM reviews
UNION ALL SELECT 'review_tags',       COUNT(*) FROM review_tags
UNION ALL SELECT 'review_media',      COUNT(*) FROM review_media
UNION ALL SELECT 'board_posts',       COUNT(*) FROM board_posts
UNION ALL SELECT 'post_participants', COUNT(*) FROM post_participants;
-- 6 / 17 / 4 / 5 / 14

-- 모집 현황 : 정원 대비 수락 인원과 마감일 경과 여부
SELECT p.post_id,
       LEFT(p.title, 24)                          AS 제목,
       u.nickname                                 AS 작성자,
       p.recruit_status                           AS 상태,
       CONCAT(SUM(pp.status = 'ACCEPTED'), ' / ', p.recruit_capacity) AS 인원,
       p.recruit_deadline                         AS 마감일,
       IF(p.recruit_deadline < CURDATE(), '경과', '') AS 비고
FROM board_posts p
JOIN users u ON u.user_id = p.user_id
LEFT JOIN post_participants pp ON pp.post_id = p.post_id
GROUP BY p.post_id, p.title, u.nickname, p.recruit_status, p.recruit_capacity, p.recruit_deadline
ORDER BY p.created_at DESC;

-- 실제로 신청을 받을 수 있는 글만 조회 (마감일 조건 포함)
-- SELECT post_id, title FROM board_posts
-- WHERE recruit_status = 'RECRUITING' AND recruit_deadline >= CURDATE();

-- 후기 목록 (최신순) 과 태그
-- SELECT r.review_id, r.title, u.nickname, r.rating / 2 AS 별점, r.view_count,
--        GROUP_CONCAT(t.tag_name ORDER BY t.review_tag_id SEPARATOR ', ') AS 태그
-- FROM reviews r
-- JOIN users u ON u.user_id = r.user_id
-- LEFT JOIN review_tags t ON t.review_id = r.review_id
-- GROUP BY r.review_id, r.title, u.nickname, r.rating, r.view_count, r.created_at
-- ORDER BY r.created_at DESC;
