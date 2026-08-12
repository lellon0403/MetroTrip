-- =====================================================================
-- 지하철 노선 기반 관광 추천 서비스 (MetroTrip)
-- 초기 데이터 : 회원 (더미)
--
-- 근거 문서 : 데이터베이스 명세서 V1.10
-- 대상 테이블 : users
-- 건수 : 5건
--
-- 선행 조건 : 없음 (최상위)
-- =====================================================================

USE metrotrip;

-- 재적재 시 아래 주석을 해제할 것
-- DELETE FROM users;
-- ALTER TABLE users AUTO_INCREMENT = 1;

-- 비밀번호는 전건 'test1234' 의 scrypt 해시(n=16384, r=8, p=1)이다. 테스트용이므로 운영 반입 금지.
-- phone 은 명세서 규칙에 따라 하이픈을 제외하고 저장한다.
-- created_at / updated_at 은 DEFAULT CURRENT_TIMESTAMP 이므로 생략한다.
-- user_id 는 AUTO_INCREMENT 로 1~5 가 부여되며, 5번(정하은)이 ADMIN 이다.
-- places.created_by 와 notices.admin_id 는 이 5번을 참조한다.

INSERT INTO users (email, password, name, nickname, phone, role) VALUES
  ('user001@test.com', 'scrypt$16384$8$1$2f1aa29cdf3ffd74783348d7d607d23e$f09fb14e002d2951f726b9ec855d41c29a8f3dd9f93978364a25a1fea8ed7d66b97b6f88bc5ba683848bf54aecd4c83c5a558a5343fa62552dae1bce86e781c0', '김민준', '민준', '01011110001', 'USER'),
  ('user002@test.com', 'scrypt$16384$8$1$2f1aa29cdf3ffd74783348d7d607d23e$f09fb14e002d2951f726b9ec855d41c29a8f3dd9f93978364a25a1fea8ed7d66b97b6f88bc5ba683848bf54aecd4c83c5a558a5343fa62552dae1bce86e781c0', '이서연', '서연', '01011110002', 'USER'),
  ('user003@test.com', 'scrypt$16384$8$1$2f1aa29cdf3ffd74783348d7d607d23e$f09fb14e002d2951f726b9ec855d41c29a8f3dd9f93978364a25a1fea8ed7d66b97b6f88bc5ba683848bf54aecd4c83c5a558a5343fa62552dae1bce86e781c0', '박지훈', '지훈', '01011110003', 'USER'),
  ('user004@test.com', 'scrypt$16384$8$1$2f1aa29cdf3ffd74783348d7d607d23e$f09fb14e002d2951f726b9ec855d41c29a8f3dd9f93978364a25a1fea8ed7d66b97b6f88bc5ba683848bf54aecd4c83c5a558a5343fa62552dae1bce86e781c0', '최지우', '지우', '01011110004', 'USER'),
  ('user005@test.com', 'scrypt$16384$8$1$2f1aa29cdf3ffd74783348d7d607d23e$f09fb14e002d2951f726b9ec855d41c29a8f3dd9f93978364a25a1fea8ed7d66b97b6f88bc5ba683848bf54aecd4c83c5a558a5343fa62552dae1bce86e781c0', '정하은', '하은', '01011110005', 'ADMIN');
