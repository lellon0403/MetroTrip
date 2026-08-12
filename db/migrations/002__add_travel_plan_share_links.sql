-- =====================================================================
-- 지하철 노선 기반 관광 추천 서비스 (MetroTrip)
-- 마이그레이션 : travel_plan_share_links 신설
--
-- 대상 DBMS : MySQL 8.0
-- 근거 문서 : 데이터베이스 명세서 V1.11
-- 근거 요구사항 : MB-018 (여행 계획 공유)
--
-- 배경
--   여행 계획을 읽기 전용으로 공유하는 기능에 필요한 토큰 저장소가 없었다.
--   travel_plans 에 컬럼으로 붙이면 링크를 하나만 발급할 수 있고 폐기 후
--   재발급 시 이력이 사라지므로, 별도 테이블로 분리한다.
--
-- 설계
--   토큰 원문은 저장하지 않고 SHA-256 해시(hex 64자)만 보관한다.
--   DB 가 유출되어도 공유 링크를 복원할 수 없다.
--   auth_tokens.refresh_token, email_verifications.code_hash 와 같은 방식이다.
--
--   만료(expires_at)와 폐기(revoked_at)를 분리했다.
--   만료는 발급 시 정해지고, 폐기는 사용자가 임의 시점에 수행한다.
--
--   plan_id 는 CASCADE 이므로 계획 삭제 시 링크도 사라진다.
--   회원 탈퇴 → travel_plans 삭제 → 공유 링크 삭제로 이어져
--   "탈퇴 시 회원 콘텐츠 전부 삭제" 원칙과 일치한다.
-- =====================================================================

USE metrotrip;


-- ---------------------------------------------------------------------
-- STEP 1. 테이블 생성
-- ---------------------------------------------------------------------
CREATE TABLE travel_plan_share_links (
  share_link_id  BIGINT      NOT NULL AUTO_INCREMENT COMMENT '공유 링크 식별자',
  plan_id        BIGINT      NOT NULL                COMMENT 'travel_plans.plan_id',
  token_hash     VARCHAR(64) NOT NULL                COMMENT '공유 토큰 SHA-256 해시(hex). 원문은 저장하지 않음',
  created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '발급 시각',
  expires_at     DATETIME    NOT NULL                COMMENT '만료 시각',
  revoked_at     DATETIME    NULL                    COMMENT '폐기 시각. NULL이면 미폐기',
  CONSTRAINT pk_travel_plan_share_links            PRIMARY KEY (share_link_id),
  CONSTRAINT uk_travel_plan_share_links_token_hash UNIQUE (token_hash),
  CONSTRAINT ck_travel_plan_share_links_expires_at CHECK (expires_at > created_at),
  CONSTRAINT ck_travel_plan_share_links_revoked_at CHECK (revoked_at IS NULL OR revoked_at >= created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='여행 계획 공유 링크';


-- ---------------------------------------------------------------------
-- STEP 2. 외래키
-- ---------------------------------------------------------------------
ALTER TABLE travel_plan_share_links
  ADD CONSTRAINT fk_travel_plan_share_links_plan_id
  FOREIGN KEY (plan_id) REFERENCES travel_plans (plan_id) ON DELETE CASCADE;


-- ---------------------------------------------------------------------
-- STEP 3. CHECK 동작 확인  ※ 반드시 실행할 것
--
-- created_at 이 DEFAULT CURRENT_TIMESTAMP 이므로, INSERT 에서 이 컬럼을
-- 생략하면 CHECK 평가 시점에 기본값이 적용되지 않을 수 있다.
-- 아래 두 형태를 넣어보고 어느 쪽이 통과하는지 확인한 뒤,
-- 백엔드에 INSERT 방식을 알려줄 것.
-- ---------------------------------------------------------------------
-- -- (A) created_at 생략 — 동작이 보장되지 않는 형태
-- INSERT INTO travel_plan_share_links (plan_id, token_hash, expires_at)
-- VALUES (1, REPEAT('a', 64), DATE_ADD(NOW(), INTERVAL 7 DAY));
--
-- -- (B) created_at 명시 — 권장 형태
-- INSERT INTO travel_plan_share_links (plan_id, token_hash, created_at, expires_at)
-- VALUES (1, REPEAT('b', 64), NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY));
--
-- DELETE FROM travel_plan_share_links;


-- ---------------------------------------------------------------------
-- STEP 4. 적용 결과 확인
-- ---------------------------------------------------------------------
SELECT column_name, ordinal_position, is_nullable, column_type, column_comment
FROM information_schema.columns
WHERE table_schema = 'metrotrip' AND table_name = 'travel_plan_share_links'
ORDER BY ordinal_position;
-- 6개 컬럼

SELECT constraint_type, COUNT(*)
FROM information_schema.table_constraints
WHERE table_schema = 'metrotrip'
GROUP BY constraint_type;
-- PRIMARY KEY 23 / UNIQUE 11 / FOREIGN KEY 35

SELECT COUNT(*) FROM information_schema.check_constraints
WHERE constraint_schema = 'metrotrip';
-- 22


-- =====================================================================
-- rollback
-- =====================================================================
-- DROP TABLE travel_plan_share_links;
