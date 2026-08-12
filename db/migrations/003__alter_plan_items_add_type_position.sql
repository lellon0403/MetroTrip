-- =====================================================================
-- 지하철 노선 기반 관광 추천 서비스 (MetroTrip)
-- 마이그레이션 : travel_plan_items 에 item_type · position 추가
--
-- 대상 DBMS : MySQL 8.0
-- 근거 문서 : 데이터베이스 명세서 V1.12
--
-- 배경
--   기존에는 place_id 가 NOT NULL 이라 계획에 장소만 담을 수 있었고,
--   순서는 visit_time 오름차순으로만 결정됐다. 역 자체를 항목으로 넣을 수 없고
--   시각을 입력해야만 순서가 정해지는 구조였다.
--
--   item_type 으로 역(STATION)과 장소(PLACE)를 구분하고, 순서를 position
--   컬럼으로 분리해 시각 없이도 동선을 짜고 드래그로 재배치할 수 있게 한다.
--
-- 원본 : migrate_V1.11_to_V1.12_plan_items.sql (팀 작성)
--        실행 중 발견한 문제 네 가지를 수정했다.
--          (1) UPDATE 에 WHERE 가 없어 워크벤치 safe update mode 에서 Error 1175
--              → PK 조건 추가. 안전 모드를 끄지 않고 실행된다.
--          (2) (1) 이 막히면 position 이 NULL 로 남아 NOT NULL 전환도 연쇄 실패
--              → STEP 2 뒤에 확인 쿼리를 넣어 진행 전에 걸러낸다.
--          (3) POSITION 은 MySQL 내장 함수명이라 워크벤치가 문법 오류로 표시
--              → 백틱으로 감싸고, 파생 테이블 별칭은 rn 으로 변경.
--          (4) station_id 가 ON DELETE SET NULL FK 라 CHECK 에 쓸 수 없어 Error 3823
--              → FK 를 RESTRICT 로 변경. 근거는 STEP 4 주석 참조.
--
-- 이 파일은 여러 번 실행해도 안전하다. 각 단계 앞에 적용 여부를 확인해
-- 이미 반영된 구간은 건너뛴다. 중간에 실패해 일부만 적용된 DB 에도 쓸 수 있다.
-- =====================================================================

USE metrotrip;


-- ---------------------------------------------------------------------
-- STEP 0. 현재 상태 확인
--
-- 아래 결과를 보고 어디까지 적용됐는지 판단한다.
-- 이 파일은 전체를 그대로 실행해도 되지만, 상태를 알고 진행하는 편이 안전하다.
-- ---------------------------------------------------------------------
SELECT column_name, ordinal_position, is_nullable, column_type, column_default
FROM information_schema.columns
WHERE table_schema = 'metrotrip' AND table_name = 'travel_plan_items'
ORDER BY ordinal_position;
-- 완료 시 8개 : plan_item_id / plan_id / item_type / place_id / station_id
--               / position / visit_time / memo
-- place_id · station_id · visit_time 은 YES, position 은 NO

SELECT constraint_name FROM information_schema.check_constraints
WHERE constraint_schema = 'metrotrip' AND constraint_name LIKE 'ck_tpi%';
-- 완료 시 2건 : ck_tpi_item_type / ck_tpi_item_reference

SELECT constraint_name, delete_rule FROM information_schema.referential_constraints
WHERE constraint_schema = 'metrotrip' AND table_name = 'travel_plan_items';
-- 완료 시 station_id 의 delete_rule 이 NO ACTION (= RESTRICT)

-- 기존 행이 ck_tpi_item_reference 를 통과할 수 있는지 확인한다.
-- item_type 은 기본값 PLACE 로 채워지므로 place_id 가 비어 있으면 안 된다.
-- 0 이 아니면 STEP 4 가 실패하므로 데이터를 먼저 정리할 것.
SELECT COUNT(*) AS `정리필요건수` FROM travel_plan_items WHERE place_id IS NULL;


-- ---------------------------------------------------------------------
-- STEP 1. 컬럼 추가 및 NULL 허용 전환
--
-- position 은 이 시점에 NULL 허용으로 만든다. 기존 행을 채운 뒤
-- STEP 3 에서 NOT NULL 로 바꾼다.
-- ---------------------------------------------------------------------
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'metrotrip' AND table_name = 'travel_plan_items'
     AND column_name = 'item_type') = 0,
  'ALTER TABLE travel_plan_items
     ADD COLUMN item_type  VARCHAR(10) NOT NULL DEFAULT ''PLACE'' AFTER plan_id,
     ADD COLUMN `position` INT         NULL                       AFTER station_id,
     MODIFY COLUMN place_id   BIGINT NULL,
     MODIFY COLUMN visit_time TIME   NULL',
  'SELECT ''STEP 1 건너뜀 — 이미 적용됨'' AS 상태');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;


-- ---------------------------------------------------------------------
-- STEP 2. 기존 행의 position 채우기
--
-- 기존 정렬 기준(visit_time, plan_item_id)을 그대로 사용해 계획별로 1부터 부여한다.
-- 순서가 보존되므로 화면에 보이던 동선이 바뀌지 않는다.
--
-- WHERE 절이 없으면 워크벤치 safe update mode 에서 Error 1175 로 막힌다.
-- PK 조건을 넣어 안전 모드를 끄지 않고도 실행되게 했다.
-- ---------------------------------------------------------------------
UPDATE travel_plan_items target
JOIN (
  SELECT plan_item_id,
         ROW_NUMBER() OVER (PARTITION BY plan_id ORDER BY visit_time, plan_item_id) AS rn
  FROM travel_plan_items
) ranked ON ranked.plan_item_id = target.plan_item_id
SET target.`position` = ranked.rn
WHERE target.plan_item_id > 0;

-- 0 이 아니면 STEP 3 이 실패한다. UPDATE 가 막혔는지 확인할 것.
SELECT COUNT(*) AS `position_미채움` FROM travel_plan_items WHERE `position` IS NULL;


-- ---------------------------------------------------------------------
-- STEP 3. position 을 NOT NULL 로 전환
-- ---------------------------------------------------------------------
ALTER TABLE travel_plan_items
  MODIFY COLUMN `position` INT NOT NULL COMMENT '일정 내 표시 순서. 1부터 부여';


-- ---------------------------------------------------------------------
-- STEP 4. FK 정책 변경 및 CHECK 추가
--
-- station_id 에는 ON DELETE SET NULL FK 가 걸려 있어 그대로는 CHECK 를 걸 수 없다.
--   Error 3823: Column 'station_id' cannot be used in a check constraint
--               ... needed in a foreign key constraint referential action
--
-- MySQL 은 "FK 가 NULL 로 바꿔버릴 컬럼" 을 CHECK 조건에 넣지 못하게 막는다.
-- 역이 삭제되면 SET NULL 이 발동해 station_id 가 NULL 이 되는데, 그러면
-- item_type = 'STATION' 인 행이 CHECK 를 위반하는 모순이 생기기 때문이다.
--
-- 이전에는 station_id 가 '장소 접근 역' 이라는 부가 정보라 SET NULL 이 맞았으나,
-- 이제 STATION 항목의 필수값이 되었으므로 사라지면 안 되는 값이다.
-- 다른 마스터 테이블 참조와 동일하게 RESTRICT(절 생략)로 통일한다.
--
-- ※ 명세서 관계 정의 21번의 ON DELETE 도 SET NULL → RESTRICT 로 갱신해야 한다.
--    FK 정책 집계가 CASCADE 16 / RESTRICT 13 / SET NULL 6 으로 바뀐다.
-- ---------------------------------------------------------------------
SET @sql = IF(
  (SELECT delete_rule FROM information_schema.referential_constraints
   WHERE constraint_schema = 'metrotrip'
     AND constraint_name = 'fk_travel_plan_items_station_id') = 'SET NULL',
  'ALTER TABLE travel_plan_items DROP FOREIGN KEY fk_travel_plan_items_station_id',
  'SELECT ''FK 변경 건너뜀 — 이미 적용됨'' AS 상태');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.referential_constraints
   WHERE constraint_schema = 'metrotrip'
     AND constraint_name = 'fk_travel_plan_items_station_id') = 0,
  'ALTER TABLE travel_plan_items
     ADD CONSTRAINT fk_travel_plan_items_station_id
     FOREIGN KEY (station_id) REFERENCES stations (station_id)',
  'SELECT ''FK 재생성 건너뜀'' AS 상태');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.check_constraints
   WHERE constraint_schema = 'metrotrip'
     AND constraint_name = 'ck_tpi_item_type') = 0,
  'ALTER TABLE travel_plan_items
     ADD CONSTRAINT ck_tpi_item_type CHECK (item_type IN (''STATION'', ''PLACE''))',
  'SELECT ''ck_tpi_item_type 건너뜀 — 이미 적용됨'' AS 상태');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.check_constraints
   WHERE constraint_schema = 'metrotrip'
     AND constraint_name = 'ck_tpi_item_reference') = 0,
  'ALTER TABLE travel_plan_items
     ADD CONSTRAINT ck_tpi_item_reference
     CHECK ((item_type = ''STATION'' AND station_id IS NOT NULL AND place_id IS NULL)
         OR (item_type = ''PLACE''   AND place_id   IS NOT NULL))',
  'SELECT ''ck_tpi_item_reference 건너뜀 — 이미 적용됨'' AS 상태');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;


-- ---------------------------------------------------------------------
-- STEP 5. 적용 결과 확인
-- ---------------------------------------------------------------------
SELECT column_name, ordinal_position, is_nullable, column_type
FROM information_schema.columns
WHERE table_schema = 'metrotrip' AND table_name = 'travel_plan_items'
ORDER BY ordinal_position;
-- 8개 컬럼. place_id · station_id · visit_time 은 YES, position 은 NO

SELECT constraint_name FROM information_schema.check_constraints
WHERE constraint_schema = 'metrotrip' AND constraint_name LIKE 'ck_tpi%';
-- ck_tpi_item_type / ck_tpi_item_reference

SELECT constraint_name, delete_rule FROM information_schema.referential_constraints
WHERE constraint_schema = 'metrotrip' AND table_name = 'travel_plan_items';
-- plan_id CASCADE / place_id NO ACTION / station_id NO ACTION

SELECT plan_item_id, plan_id, item_type, place_id, station_id, `position`, visit_time
FROM travel_plan_items
ORDER BY plan_id, `position`;
-- 계획별로 position 이 1부터 연속이어야 한다


-- =====================================================================
-- rollback
-- =====================================================================
-- ALTER TABLE travel_plan_items DROP CHECK ck_tpi_item_reference;
-- ALTER TABLE travel_plan_items DROP CHECK ck_tpi_item_type;
-- ALTER TABLE travel_plan_items DROP FOREIGN KEY fk_travel_plan_items_station_id;
-- ALTER TABLE travel_plan_items ADD CONSTRAINT fk_travel_plan_items_station_id
--   FOREIGN KEY (station_id) REFERENCES stations (station_id) ON DELETE SET NULL;
-- ALTER TABLE travel_plan_items DROP COLUMN `position`;
-- ALTER TABLE travel_plan_items DROP COLUMN item_type;
-- ALTER TABLE travel_plan_items
--   MODIFY COLUMN place_id   BIGINT NOT NULL COMMENT 'places.place_id. MB-015 방문 장소',
--   MODIFY COLUMN visit_time TIME   NOT NULL COMMENT '방문 시간. 동선 순서는 본 컬럼 오름차순으로 결정';
