-- =====================================================================
-- 지하철 노선 기반 관광 추천 서비스 (MetroTrip)
-- 마이그레이션 : 조회 성능용 인덱스 추가
--
-- 대상 DBMS : MySQL 8.0
-- 근거 문서 : 데이터베이스 명세서 V1.10 인덱스 시트
--
-- 배경
--   PK / UNIQUE / FK 인덱스만 있는 상태에서 조회 경로에 맞춘 인덱스를 추가한다.
--   InnoDB 는 FK 를 만들 때 자식 컬럼에 인덱스를 자동 생성하므로,
--   FK 컬럼을 선두로 하는 인덱스는 뒤쪽 정렬 컬럼만 새로 얻는다는 점을 감안해
--   실제로 효과가 있는 것만 골랐다.
--
-- 판단 기준
--   수백 행 규모의 테이블은 풀 스캔이 더 빠르므로 제외했다.
--   비어 있는 테이블은 지금 만드는 비용이 0 이지만, 쿼리 모양이 확정되지 않아
--   컬럼 순서를 다시 잡을 가능성이 있는 것은 보류했다.
-- =====================================================================

USE metrotrip;


-- ---------------------------------------------------------------------
-- 적용 전 상태 확인
-- ---------------------------------------------------------------------
SELECT table_name, index_name,
       GROUP_CONCAT(column_name ORDER BY seq_in_index) AS 컬럼
FROM information_schema.statistics
WHERE table_schema = 'metrotrip'
  AND table_name IN ('train_timetables', 'stations', 'line_view_logs')
GROUP BY table_name, index_name
ORDER BY table_name, index_name;


-- =====================================================================
-- 1. idx_timetables_lookup
--
-- 역별 배차표 조회. train_timetables 는 현재 가장 큰 테이블이며,
-- 인덱스가 없으면 매 조회마다 전체를 훑는다.
--
--   SELECT arrival_time, departure_time, destination_station_id
--   FROM train_timetables
--   WHERE station_id = ? AND day_type = ? AND direction = ?
--
-- 등호 조건 3개를 앞에 두고 정렬 컬럼을 뒤에 배치했다.
-- 순서를 바꾸면 인덱스를 타지 않는다.
-- =====================================================================
CREATE INDEX idx_timetables_lookup
  ON train_timetables (station_id, day_type, direction, arrival_time);


-- =====================================================================
-- 2. idx_stations_name
--
-- 역명 검색. 서비스의 첫 진입 경로이고 노선 추가에 따라 계속 늘어난다.
-- 앞 일치 검색(LIKE '천안%') 전제이며, 중간 일치가 필요해지면
-- FULLTEXT 인덱스로 전환해야 한다.
-- =====================================================================
CREATE INDEX idx_stations_name ON stations (station_name);


-- =====================================================================
-- 3. idx_line_view_logs_time
--
-- 인기 노선 집계(CM-003). 조회 1회당 1행씩 쌓여 가장 빨리 커지는 테이블이다.
-- 성능보다 '시점' 때문에 미리 만든다. 수십만 행이 된 뒤 만들면
-- 인덱스 생성 동안 테이블 전체를 읽어야 한다.
--
-- 기간 조건이 선두여야 한다. (viewed_at, line_id) 순서를 바꾸면 걸리지 않는다.
-- =====================================================================
CREATE INDEX idx_line_view_logs_time ON line_view_logs (viewed_at, line_id);


-- =====================================================================
-- 보류 항목
--
-- 아래는 조건이 맞을 때 별도 마이그레이션으로 추가한다.
-- 지금 넣지 않는 이유를 함께 남긴다.
-- =====================================================================

-- 열차 여정 추적(WHERE train_no = 'K1904')을 실제로 사용할 때만 필요
-- CREATE INDEX idx_timetables_train ON train_timetables (train_no, day_type, direction);

-- 노선도 화면을 자주 그린다면. uk_line_stations 가 line_id 필터까지는 이미 커버
-- CREATE INDEX idx_line_stations_order ON line_stations (line_id, station_order);

-- 목록 조회용. 대상 테이블이 비어 있고 백엔드 쿼리 모양이 미확정
-- CREATE INDEX idx_board_posts_created ON board_posts (created_at DESC);
-- CREATE INDEX idx_reviews_created     ON reviews (created_at DESC);
-- CREATE INDEX idx_review_tags_name    ON review_tags (tag_name, review_id);
-- CREATE INDEX idx_board_posts_recruit ON board_posts (recruit_status, recruit_deadline);


-- ---------------------------------------------------------------------
-- 적용 결과 확인
-- ---------------------------------------------------------------------
-- 인덱스 생성 여부
-- SELECT table_name, index_name,
--        GROUP_CONCAT(column_name ORDER BY seq_in_index) AS 컬럼
-- FROM information_schema.statistics
-- WHERE table_schema = 'metrotrip' AND index_name LIKE 'idx_%'
-- GROUP BY table_name, index_name;

-- 실제로 사용되는지 확인. key 에 인덱스명이 뜨고 rows 가 작아야 한다
-- EXPLAIN SELECT arrival_time, departure_time, destination_station_id
-- FROM train_timetables
-- WHERE station_id = 93 AND day_type = 'WEEKDAY' AND direction = 'UP';

-- 인덱스가 차지하는 공간
-- SELECT table_name,
--        ROUND(data_length / 1024, 1)  AS 데이터_KB,
--        ROUND(index_length / 1024, 1) AS 인덱스_KB
-- FROM information_schema.tables
-- WHERE table_schema = 'metrotrip' AND index_length > 0
-- ORDER BY index_length DESC;


-- =====================================================================
-- rollback
-- =====================================================================
-- DROP INDEX idx_timetables_lookup   ON train_timetables;
-- DROP INDEX idx_stations_name       ON stations;
-- DROP INDEX idx_line_view_logs_time ON line_view_logs;
