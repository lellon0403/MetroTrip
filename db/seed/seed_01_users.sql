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

-- 비밀번호는 전건 'test1234' 의 bcrypt 해시(cost 10)이다. 테스트용이므로 운영 반입 금지.
-- phone 은 명세서 규칙에 따라 하이픈을 제외하고 저장한다.
-- created_at / updated_at 은 DEFAULT CURRENT_TIMESTAMP 이므로 생략한다.
-- user_id 는 AUTO_INCREMENT 로 1~5 가 부여되며, 5번(정하은)이 ADMIN 이다.
-- places.created_by 와 notices.admin_id 는 이 5번을 참조한다.

INSERT INTO users (email, password, name, nickname, phone, role) VALUES
  ('user001@test.com', '$2b$10$zn.CpYPmHOxLiB.YuQJBhu6GwdxPjtITogwvtCzuNQt39mkzJJsSu', '김민준', '민준', '01011110001', 'USER'),
  ('user002@test.com', '$2b$10$zn.CpYPmHOxLiB.YuQJBhu6GwdxPjtITogwvtCzuNQt39mkzJJsSu', '이서연', '서연', '01011110002', 'USER'),
  ('user003@test.com', '$2b$10$zn.CpYPmHOxLiB.YuQJBhu6GwdxPjtITogwvtCzuNQt39mkzJJsSu', '박지훈', '지훈', '01011110003', 'USER'),
  ('user004@test.com', '$2b$10$zn.CpYPmHOxLiB.YuQJBhu6GwdxPjtITogwvtCzuNQt39mkzJJsSu', '최지우', '지우', '01011110004', 'USER'),
  ('user005@test.com', '$2b$10$zn.CpYPmHOxLiB.YuQJBhu6GwdxPjtITogwvtCzuNQt39mkzJJsSu', '정하은', '하은', '01011110005', 'ADMIN');
