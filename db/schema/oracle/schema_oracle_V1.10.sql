-- =====================================================================
-- 지하철 노선 기반 관광 추천 서비스 (MetroTrip)
-- 테이블 생성 스크립트 — Oracle 백업 DB
--
-- 근거 문서 : 데이터베이스 명세서 V1.10
-- 원본 스크립트 : schema_V1_10.sql (MySQL 8.0)
-- 대상 DBMS : Oracle Database 19c
-- 구성      : 22개 테이블 / PK 22 / UNIQUE 10 / FK 34 / CHECK 23
--             + FK 인덱스 29
--
-- 용도 : MySQL 데이터의 백업 저장 및 MySQL 장애 시 [읽기 전용] 대체 조회.
--        실시간 양방향 복제가 아니며, 이 DB 에서 발생하는 쓰기는
--        주기적 동기화 적재뿐이다. 서비스 트래픽은 SELECT 만 수행한다.
--
-- 원본 대비 변경 사항은 파일 하단 [변환 노트] 참조.
-- 테이블은 FK 의존 순서대로 정렬되어 있다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. 사전 확인 (DBA 계정으로 1회 실행)
-- ---------------------------------------------------------------------
-- 캐릭터셋이 AL32UTF8 인지 반드시 확인한다. KO16MSWIN949 이면
-- MySQL(utf8mb4) 데이터를 무손실로 옮길 수 없다.
--   SELECT parameter, value FROM nls_database_parameters
--    WHERE parameter IN ('NLS_CHARACTERSET', 'NLS_NCHAR_CHARACTERSET');
--
-- 19c 는 CDB/PDB 구조이므로 PDB 에 접속한 상태여야 한다.
-- CDB$ROOT 에 만들면 계정명에 C## 접두사가 강제된다.
--   ALTER SESSION SET CONTAINER = ORCLPDB1;
--   SHOW CON_NAME;
--
-- 스키마 계정 생성. 비밀번호는 실제 값으로 교체하고 커밋하지 않는다.
--   CREATE USER metrotrip IDENTIFIED BY "<PASSWORD>"
--     DEFAULT TABLESPACE users
--     QUOTA UNLIMITED ON users;
--   GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW
--     TO metrotrip;
--
-- 이후 스크립트는 metrotrip 계정으로 실행한다.
--
-- 읽기 전용 계정. 서비스(FastAPI)는 반드시 이 계정으로 접속한다.
-- 테이블 소유자(metrotrip)는 동기화 적재 배치 전용으로만 사용한다.
--   CREATE USER metrotrip_ro IDENTIFIED BY "<PASSWORD>";
--   GRANT CREATE SESSION TO metrotrip_ro;
-- SELECT 권한은 테이블 생성 후 파일 하단 [읽기 전용 권한 부여] 절에서 준다.


-- ---------------------------------------------------------------------
-- 재실행용 초기화 (운영 DB에서는 절대 실행하지 말 것)
-- IDENTITY 를 쓰지 않으므로 별도 시퀀스 정리는 필요 없다.
-- ---------------------------------------------------------------------
-- DROP TABLE post_participants   CASCADE CONSTRAINTS PURGE;
-- DROP TABLE board_posts         CASCADE CONSTRAINTS PURGE;
-- DROP TABLE line_view_logs      CASCADE CONSTRAINTS PURGE;
-- DROP TABLE notices             CASCADE CONSTRAINTS PURGE;
-- DROP TABLE review_tags         CASCADE CONSTRAINTS PURGE;
-- DROP TABLE review_media        CASCADE CONSTRAINTS PURGE;
-- DROP TABLE reviews             CASCADE CONSTRAINTS PURGE;
-- DROP TABLE travel_plan_items   CASCADE CONSTRAINTS PURGE;
-- DROP TABLE travel_plans        CASCADE CONSTRAINTS PURGE;
-- DROP TABLE station_favorites   CASCADE CONSTRAINTS PURGE;
-- DROP TABLE place_images        CASCADE CONSTRAINTS PURGE;
-- DROP TABLE place_stations      CASCADE CONSTRAINTS PURGE;
-- DROP TABLE places              CASCADE CONSTRAINTS PURGE;
-- DROP TABLE train_timetables    CASCADE CONSTRAINTS PURGE;
-- DROP TABLE line_stations       CASCADE CONSTRAINTS PURGE;
-- DROP TABLE stations            CASCADE CONSTRAINTS PURGE;
-- DROP TABLE subway_lines        CASCADE CONSTRAINTS PURGE;
-- DROP TABLE email_verifications CASCADE CONSTRAINTS PURGE;
-- DROP TABLE auth_tokens         CASCADE CONSTRAINTS PURGE;
-- DROP TABLE social_accounts     CASCADE CONSTRAINTS PURGE;
-- DROP TABLE user_agreements     CASCADE CONSTRAINTS PURGE;
-- DROP TABLE users               CASCADE CONSTRAINTS PURGE;


-- =====================================================================
-- 1. users : 회원
-- 근거 요구사항 : UM-001, MB-009, MB-010
-- =====================================================================
CREATE TABLE users (
  user_id      NUMBER(19)          NOT NULL,   -- 회원 식별자
  email        VARCHAR2(255 CHAR)  NOT NULL,   -- 로그인 ID 겸용. 소문자 정규화 후 저장
  password     VARCHAR2(255 CHAR),             -- 단방향 해시 저장. 소셜 전용 계정은 NULL
  name         VARCHAR2(50 CHAR)   NOT NULL,   -- 실명
  nickname     VARCHAR2(30 CHAR)   NOT NULL,   -- 게시판 노출명
  phone        VARCHAR2(20 CHAR),              -- '-' 제외 저장
  role         VARCHAR2(20 CHAR)   DEFAULT 'USER' NOT NULL,        -- USER / ADMIN
  created_at   TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 회원가입 일자 및 시간
  updated_at   TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 수정 시각. 애플리케이션에서 갱신
  CONSTRAINT pk_users          PRIMARY KEY (user_id),
  CONSTRAINT uk_users_email    UNIQUE (email),
  CONSTRAINT uk_users_nickname UNIQUE (nickname),
  CONSTRAINT ck_users_role     CHECK (role IN ('USER', 'ADMIN'))
);


-- =====================================================================
-- 2. user_agreements : 약관 동의 이력
-- 근거 요구사항 : UM-001, CM-010
-- =====================================================================
CREATE TABLE user_agreements (
  agreement_id    NUMBER(19)         NOT NULL,   -- 동의 이력 식별자
  user_id         NUMBER(19)         NOT NULL,   -- users.user_id
  agreement_type  VARCHAR2(30 CHAR)  NOT NULL,   -- TERMS / PRIVACY / LOCATION / MARKETING
  is_agreed       NUMBER(1)          DEFAULT 1 NOT NULL,             -- 1=동의, 0=철회
  agreed_at       TIMESTAMP(0)       DEFAULT SYSTIMESTAMP NOT NULL,  -- 동의·철회 시각
  CONSTRAINT pk_user_agreements                PRIMARY KEY (agreement_id),
  CONSTRAINT ck_user_agreements_agreement_type CHECK (agreement_type IN ('TERMS', 'PRIVACY', 'LOCATION', 'MARKETING')),
  CONSTRAINT ck_user_agreements_is_agreed      CHECK (is_agreed IN (0, 1))
);


-- =====================================================================
-- 3. social_accounts : 소셜 계정 연동
-- 근거 요구사항 : UM-002, MB-002
-- =====================================================================
CREATE TABLE social_accounts (
  social_account_id  NUMBER(19)          NOT NULL,   -- 식별자
  user_id            NUMBER(19)          NOT NULL,   -- users.user_id
  provider           VARCHAR2(20 CHAR)   NOT NULL,   -- KAKAO / NAVER
  provider_user_id   VARCHAR2(100 CHAR)  NOT NULL,   -- 소셜 서비스가 발급한 고유 ID
  connected_at       TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 최초 연동 시각
  CONSTRAINT pk_social_accounts          PRIMARY KEY (social_account_id),
  CONSTRAINT uk_social_provider          UNIQUE (provider, provider_user_id),
  CONSTRAINT ck_social_accounts_provider CHECK (provider IN ('KAKAO', 'NAVER'))
);


-- =====================================================================
-- 4. auth_tokens : 인증 토큰
-- 근거 요구사항 : MB-001, MB-002
-- refresh_token 512 CHAR = 최대 1536 byte. VARCHAR2 한계(4000 byte)와
-- 인덱스 키 한계 이내이므로 UNIQUE 를 그대로 유지할 수 있다.
-- =====================================================================
CREATE TABLE auth_tokens (
  token_id       NUMBER(19)          NOT NULL,   -- 식별자
  user_id        NUMBER(19)          NOT NULL,   -- users.user_id
  refresh_token  VARCHAR2(512 CHAR)  NOT NULL,   -- 해시 저장
  issued_at      TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 토큰 발급 시각
  expires_at     TIMESTAMP(0)        NOT NULL,   -- 만료 시각
  revoked_at     TIMESTAMP(0),                   -- 토큰 무효화 시각
  user_agent     VARCHAR2(255 CHAR),             -- 다중 기기 로그인 식별용
  CONSTRAINT pk_auth_tokens  PRIMARY KEY (token_id),
  CONSTRAINT uk_auth_refresh UNIQUE (refresh_token)
);


-- =====================================================================
-- 5. email_verifications : 이메일 인증
-- 근거 요구사항 : MB-010
-- =====================================================================
CREATE TABLE email_verifications (
  verification_id  NUMBER(19)          NOT NULL,   -- 식별자
  user_id          NUMBER(19),                     -- users.user_id. 가입 전 인증은 NULL
  email            VARCHAR2(255 CHAR)  NOT NULL,   -- 인증번호 발송 대상
  purpose          VARCHAR2(20 CHAR)   NOT NULL,   -- WITHDRAWAL / SIGNUP / PASSWORD_RESET
  code_hash        VARCHAR2(255 CHAR)  NOT NULL,   -- 단방향 해시 저장. 평문 저장 금지
  expires_at       TIMESTAMP(0)        NOT NULL,   -- 발급 시각 + 5분
  attempt_count    NUMBER(10)          DEFAULT 0 NOT NULL,  -- 5회 초과 시 애플리케이션에서 무효화
  verified_at      TIMESTAMP(0),                   -- 인증 성공 시각. NULL이면 미인증
  created_at       TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 발급 시각
  CONSTRAINT pk_email_verifications         PRIMARY KEY (verification_id),
  CONSTRAINT ck_email_verifications_purpose CHECK (purpose IN ('WITHDRAWAL', 'SIGNUP', 'PASSWORD_RESET'))
);


-- =====================================================================
-- 6. subway_lines : 지하철 노선
-- 근거 요구사항 : CM-001, CM-002, CM-003
-- =====================================================================
CREATE TABLE subway_lines (
  line_id        NUMBER(19)         NOT NULL,   -- 노선 식별자
  line_name      VARCHAR2(50 CHAR)  NOT NULL,   -- 예: 2호선
  line_number    VARCHAR2(10 CHAR),             -- 예: 2
  display_order  NUMBER(10)         DEFAULT 0 NOT NULL,  -- 노선도 정렬 순서
  CONSTRAINT pk_subway_lines      PRIMARY KEY (line_id),
  CONSTRAINT uk_subway_lines_name UNIQUE (line_name)
);


-- =====================================================================
-- 7. stations : 지하철 역
-- 근거 요구사항 : CM-004, CM-005, CM-006
-- =====================================================================
CREATE TABLE stations (
  station_id    NUMBER(19)          NOT NULL,   -- 역 식별자
  station_name  VARCHAR2(100 CHAR)  NOT NULL,   -- 부역명(괄호) 제외한 정식 역명
  latitude      NUMBER(10,7)        NOT NULL,   -- 지도 표시 및 반경 계산 기준
  longitude     NUMBER(10,7)        NOT NULL,   -- 지도 표시 및 반경 계산 기준
  address       VARCHAR2(255 CHAR),             -- 역 소재지 도로명 주소
  CONSTRAINT pk_stations PRIMARY KEY (station_id)
);


-- =====================================================================
-- 8. line_stations : 노선-역 매핑
-- 근거 요구사항 : CM-002, CM-005
-- =====================================================================
CREATE TABLE line_stations (
  line_station_id  NUMBER(19)  NOT NULL,   -- 식별자
  line_id          NUMBER(19)  NOT NULL,   -- subway_lines.line_id
  station_id       NUMBER(19)  NOT NULL,   -- stations.station_id
  station_order    NUMBER(10)  NOT NULL,   -- 해당 노선에서의 정렬 순서(상행 기준)
  CONSTRAINT pk_line_stations               PRIMARY KEY (line_station_id),
  CONSTRAINT uk_line_stations               UNIQUE (line_id, station_id),
  CONSTRAINT ck_line_stations_station_order CHECK (station_order >= 1)
);


-- =====================================================================
-- 9. train_timetables : 열차 시간표
-- 근거 요구사항 : CM-009
--
-- [원본과 다름] arrival_time / departure_time 을 TIME 이 아닌
-- VARCHAR2(8 CHAR) 로 정의한다.
--   - Oracle 에는 TIME 타입이 없다.
--   - 원본 데이터에 '24:01:00' 같은 값이 존재하는데 DATE/TIMESTAMP 는
--     24시 이상을 거부한다(ORA-01850).
--   - INTERVAL DAY TO SECOND 는 저장은 되지만 표기가
--     '+00 24:01:00.000000' 으로 바뀌어 MySQL 과 값 비교가 불가능하다.
--   - VARCHAR2 는 원본 문자열을 그대로 보존하고, 'HH24:MI:SS' 고정
--     자리수이므로 사전식 정렬이 MySQL TIME 정렬과 동일하다.
-- =====================================================================
CREATE TABLE train_timetables (
  timetable_id            NUMBER(19)         NOT NULL,   -- 식별자
  train_no                VARCHAR2(20 CHAR),            -- 열차번호(예: K1904)
  line_id                 NUMBER(19)         NOT NULL,  -- subway_lines.line_id
  station_id              NUMBER(19)         NOT NULL,  -- stations.station_id
  day_type                VARCHAR2(10 CHAR)  NOT NULL,  -- WEEKDAY(평일) / WEEKEND(주말)
  direction               VARCHAR2(10 CHAR)  NOT NULL,  -- UP(상행) / DOWN(하행)
  arrival_time            VARCHAR2(8 CHAR),             -- 'HH24:MI:SS'. 시발역은 NULL
  departure_time          VARCHAR2(8 CHAR),             -- 'HH24:MI:SS'. 종착역은 NULL
  destination_station_id  NUMBER(19),                   -- stations.station_id. 차량기지 등은 NULL
  CONSTRAINT pk_train_timetables                PRIMARY KEY (timetable_id),
  CONSTRAINT ck_train_timetables_day_type       CHECK (day_type  IN ('WEEKDAY', 'WEEKEND')),
  CONSTRAINT ck_train_timetables_direction      CHECK (direction IN ('UP', 'DOWN')),
  CONSTRAINT ck_train_timetables_time           CHECK (arrival_time IS NOT NULL OR departure_time IS NOT NULL),
  CONSTRAINT ck_train_timetables_arrival_fmt    CHECK (arrival_time   IS NULL OR REGEXP_LIKE(arrival_time,   '^[0-9]{2}:[0-5][0-9]:[0-5][0-9]$')),
  CONSTRAINT ck_train_timetables_departure_fmt  CHECK (departure_time IS NULL OR REGEXP_LIKE(departure_time, '^[0-9]{2}:[0-5][0-9]:[0-5][0-9]$'))
);


-- =====================================================================
-- 10. places : 추천 장소
-- 근거 요구사항 : AD-001~003, CM-006, CM-007
-- =====================================================================
CREATE TABLE places (
  place_id     NUMBER(19)          NOT NULL,   -- 장소 식별자
  place_name   VARCHAR2(100 CHAR)  NOT NULL,   -- 장소 이름
  category     VARCHAR2(30 CHAR)   NOT NULL,   -- TOUR / RESTAURANT / CAFE / SHOPPING / ETC
  description  CLOB,                           -- 상세 소개
  address      VARCHAR2(255 CHAR)  NOT NULL,   -- 도로명 주소
  latitude     NUMBER(10,7)        NOT NULL,   -- 지도 마커 좌표
  longitude    NUMBER(10,7)        NOT NULL,   -- 지도 마커 좌표
  phone        VARCHAR2(20 CHAR),              -- 장소 연락처
  created_by   NUMBER(19),                     -- users.user_id (role=ADMIN)
  created_at   TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 등록 시각
  updated_at   TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 수정 시각. 애플리케이션에서 갱신
  CONSTRAINT pk_places          PRIMARY KEY (place_id),
  CONSTRAINT ck_places_category CHECK (category IN ('TOUR', 'RESTAURANT', 'CAFE', 'SHOPPING', 'ETC'))
);


-- =====================================================================
-- 11. place_stations : 장소-역 매핑
-- 근거 요구사항 : AD-002, CM-006
-- =====================================================================
CREATE TABLE place_stations (
  place_station_id  NUMBER(19)  NOT NULL,   -- 식별자
  place_id          NUMBER(19)  NOT NULL,   -- places.place_id
  station_id        NUMBER(19)  NOT NULL,   -- stations.station_id. 반경 1km 기준
  CONSTRAINT pk_place_stations PRIMARY KEY (place_station_id)
);


-- =====================================================================
-- 12. place_images : 장소 이미지
-- 근거 요구사항 : AD-001
-- =====================================================================
CREATE TABLE place_images (
  place_image_id  NUMBER(19)          NOT NULL,   -- 식별자
  place_id        NUMBER(19)          NOT NULL,   -- places.place_id
  image_url       VARCHAR2(500 CHAR)  NOT NULL,   -- 오브젝트 스토리지 경로
  sort_order      NUMBER(10)          NOT NULL,   -- 1부터 순차 부여. 최소값이 대표 이미지
  CONSTRAINT pk_place_images            PRIMARY KEY (place_image_id),
  CONSTRAINT uk_place_images_order      UNIQUE (place_id, sort_order),
  CONSTRAINT ck_place_images_sort_order CHECK (sort_order >= 1)
);


-- =====================================================================
-- 13. station_favorites : 역 즐겨찾기
-- 근거 요구사항 : MB-012, MB-013, MB-014
-- =====================================================================
CREATE TABLE station_favorites (
  favorite_id  NUMBER(19)    NOT NULL,   -- 식별자
  user_id      NUMBER(19)    NOT NULL,   -- users.user_id
  station_id   NUMBER(19)    NOT NULL,   -- stations.station_id
  created_at   TIMESTAMP(0)  DEFAULT SYSTIMESTAMP NOT NULL,  -- 즐겨찾기 추가 시각
  CONSTRAINT pk_station_favorites      PRIMARY KEY (favorite_id),
  CONSTRAINT uk_favorites_user_station UNIQUE (user_id, station_id)
);


-- =====================================================================
-- 14. travel_plans : 여행 동선 계획
-- 근거 요구사항 : MB-008, MB-015~017
-- =====================================================================
CREATE TABLE travel_plans (
  plan_id           NUMBER(19)          NOT NULL,   -- 계획 식별자
  user_id           NUMBER(19)          NOT NULL,   -- users.user_id
  plan_title        VARCHAR2(100 CHAR)  NOT NULL,   -- 계획 제목
  start_station_id  NUMBER(19)          NOT NULL,   -- stations.station_id
  end_station_id    NUMBER(19)          NOT NULL,   -- stations.station_id
  created_at        TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 작성 시각
  updated_at        TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 수정 시각. 애플리케이션에서 갱신
  CONSTRAINT pk_travel_plans PRIMARY KEY (plan_id)
);


-- =====================================================================
-- 15. travel_plan_items : 여행 계획 상세
-- 근거 요구사항 : MB-008, MB-015
-- 동선 순서는 visit_time 오름차순. ORDER BY visit_time, plan_item_id
-- [원본과 다름] visit_time 을 VARCHAR2(8 CHAR) 로 정의 (9번 테이블 주석 참조)
-- =====================================================================
CREATE TABLE travel_plan_items (
  plan_item_id  NUMBER(19)          NOT NULL,   -- 식별자
  plan_id       NUMBER(19)          NOT NULL,   -- travel_plans.plan_id
  place_id      NUMBER(19)          NOT NULL,   -- places.place_id. MB-015 방문 장소
  station_id    NUMBER(19),                     -- stations.station_id. 장소 접근 역
  visit_time    VARCHAR2(8 CHAR)    NOT NULL,   -- 'HH24:MI:SS'. 본 컬럼 오름차순이 동선 순서
  memo          VARCHAR2(255 CHAR),             -- 사용자 메모
  CONSTRAINT pk_travel_plan_items          PRIMARY KEY (plan_item_id),
  CONSTRAINT ck_travel_plan_items_visit_fmt CHECK (REGEXP_LIKE(visit_time, '^[0-9]{2}:[0-5][0-9]:[0-5][0-9]$'))
);


-- =====================================================================
-- 16. reviews : 여행 후기
-- 근거 요구사항 : MB-003, MB-004, MB-005, MB-011, AD-007
-- =====================================================================
CREATE TABLE reviews (
  review_id         NUMBER(19)          NOT NULL,   -- 후기 식별자
  user_id           NUMBER(19)          NOT NULL,   -- users.user_id
  title             VARCHAR2(100 CHAR)  NOT NULL,   -- 게시판 목록 노출 제목
  content           CLOB                NOT NULL,   -- 본문
  start_station_id  NUMBER(19)          NOT NULL,   -- stations.station_id
  end_station_id    NUMBER(19)          NOT NULL,   -- stations.station_id
  rating            NUMBER(3)           NOT NULL,   -- 별점. 반개 단위 표현 위해 1~10 정수
  travel_cost       NUMBER(10),                     -- 단위 원(KRW)
  plan_id           NUMBER(19),                     -- travel_plans.plan_id. 동선 가져오기
  view_count        NUMBER(10)          DEFAULT 0 NOT NULL,  -- 상세 조회 시 증가
  created_at        TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 작성 시각
  updated_at        TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 수정 시각. 애플리케이션에서 갱신
  CONSTRAINT pk_reviews             PRIMARY KEY (review_id),
  CONSTRAINT ck_reviews_rating      CHECK (rating BETWEEN 1 AND 10),
  CONSTRAINT ck_reviews_travel_cost CHECK (travel_cost >= 0),
  CONSTRAINT ck_reviews_view_count  CHECK (view_count >= 0)
);


-- =====================================================================
-- 17. review_media : 후기 첨부 미디어
-- 근거 요구사항 : MB-003
-- =====================================================================
CREATE TABLE review_media (
  media_id    NUMBER(19)          NOT NULL,   -- 식별자
  review_id   NUMBER(19)          NOT NULL,   -- reviews.review_id
  media_url   VARCHAR2(500 CHAR)  NOT NULL,   -- 오브젝트 스토리지 경로
  media_type  VARCHAR2(10 CHAR)   NOT NULL,   -- IMAGE / VIDEO
  CONSTRAINT pk_review_media            PRIMARY KEY (media_id),
  CONSTRAINT ck_review_media_media_type CHECK (media_type IN ('IMAGE', 'VIDEO'))
);


-- =====================================================================
-- 18. review_tags : 후기 태그
-- 근거 요구사항 : MB-003, MB-005, MB-006, MB-007
-- 영문 태그는 애플리케이션에서 소문자로 변환한 뒤 저장한다.
-- MySQL(대소문자 무시)과 Oracle(구분)의 UNIQUE 판정이 다르므로
-- 이 정규화는 선택이 아니라 필수다.
-- =====================================================================
CREATE TABLE review_tags (
  review_tag_id  NUMBER(19)         NOT NULL,   -- 식별자
  review_id      NUMBER(19)         NOT NULL,   -- reviews.review_id
  tag_name       VARCHAR2(30 CHAR)  NOT NULL,   -- MB-006 회원이 직접 입력한 커스텀 태그
  CONSTRAINT pk_review_tags PRIMARY KEY (review_tag_id),
  CONSTRAINT uk_review_tags UNIQUE (review_id, tag_name)
);


-- =====================================================================
-- 19. notices : 공지사항
-- 근거 요구사항 : AD-004, AD-005, AD-006
-- =====================================================================
CREATE TABLE notices (
  notice_id    NUMBER(19)          NOT NULL,   -- 공지 식별자
  admin_id     NUMBER(19),                     -- users.user_id (role=ADMIN)
  title        VARCHAR2(200 CHAR)  NOT NULL,   -- 공지 제목
  content      CLOB                NOT NULL,   -- 공지 본문
  notice_type  VARCHAR2(20 CHAR)   DEFAULT 'BOARD' NOT NULL,  -- ALARM(알림 안내) / BOARD(게시판)
  created_at   TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 등록 시각
  updated_at   TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 수정 시각. 애플리케이션에서 갱신
  CONSTRAINT pk_notices             PRIMARY KEY (notice_id),
  CONSTRAINT ck_notices_notice_type CHECK (notice_type IN ('ALARM', 'BOARD'))
);


-- =====================================================================
-- 20. line_view_logs : 노선 조회 로그
-- 근거 요구사항 : CM-003
-- =====================================================================
CREATE TABLE line_view_logs (
  log_id     NUMBER(19)    NOT NULL,   -- 식별자
  line_id    NUMBER(19)    NOT NULL,   -- subway_lines.line_id
  user_id    NUMBER(19),               -- users.user_id. 비회원은 NULL
  viewed_at  TIMESTAMP(0)  DEFAULT SYSTIMESTAMP NOT NULL,  -- 집계 기준 시각
  CONSTRAINT pk_line_view_logs PRIMARY KEY (log_id)
);


-- =====================================================================
-- 21. board_posts : 인원 모집 게시글
-- 근거 요구사항 : MB-신규 (요구사항 정의서 반영 대기)
-- 정원 초과 방지를 위한 행 잠금은 Oracle 에서도 SELECT ... FOR UPDATE 로
-- 동일하게 동작한다.
-- =====================================================================
CREATE TABLE board_posts (
  post_id           NUMBER(19)          NOT NULL,   -- 게시글 식별자
  user_id           NUMBER(19)          NOT NULL,   -- users.user_id
  title             VARCHAR2(100 CHAR)  NOT NULL,   -- 글 제목
  content           CLOB                NOT NULL,   -- 본문
  view_count        NUMBER(10)          DEFAULT 0 NOT NULL,  -- 상세 조회 시 증가
  recruit_capacity  NUMBER(10)          NOT NULL,   -- 모집 인원 수
  recruit_deadline  DATE                NOT NULL,   -- 모집 마감 날짜. 경과 시 신청 차단
  recruit_status    VARCHAR2(20 CHAR)   DEFAULT 'RECRUITING' NOT NULL,  -- RECRUITING / CLOSED
  meeting_date      DATE,                           -- 실제 모임 날짜(선택)
  plan_id           NUMBER(19),                     -- travel_plans.plan_id. 동선 연계(선택)
  created_at        TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 작성 시각
  updated_at        TIMESTAMP(0)        DEFAULT SYSTIMESTAMP NOT NULL,  -- 수정 시각. 애플리케이션에서 갱신
  CONSTRAINT pk_board_posts                  PRIMARY KEY (post_id),
  CONSTRAINT ck_board_posts_view_count       CHECK (view_count >= 0),
  CONSTRAINT ck_board_posts_recruit_capacity CHECK (recruit_capacity >= 1),
  CONSTRAINT ck_board_posts_recruit_status   CHECK (recruit_status IN ('RECRUITING', 'CLOSED'))
);


-- =====================================================================
-- 22. post_participants : 모집 참여자
-- 근거 요구사항 : MB-신규 (요구사항 정의서 반영 대기)
-- =====================================================================
CREATE TABLE post_participants (
  participant_id  NUMBER(19)         NOT NULL,   -- 참여 신청 식별자
  post_id         NUMBER(19)         NOT NULL,   -- board_posts.post_id
  user_id         NUMBER(19)         NOT NULL,   -- users.user_id
  status          VARCHAR2(20 CHAR)  DEFAULT 'APPLIED' NOT NULL,  -- APPLIED / ACCEPTED / REJECTED / CANCELED
  applied_at      TIMESTAMP(0)       DEFAULT SYSTIMESTAMP NOT NULL,  -- 신청 시각
  responded_at    TIMESTAMP(0),                  -- 수락·거절 처리 시각(미처리 시 NULL)
  CONSTRAINT pk_post_participants        PRIMARY KEY (participant_id),
  CONSTRAINT uk_post_participants        UNIQUE (post_id, user_id),
  CONSTRAINT ck_post_participants_status CHECK (status IN ('APPLIED', 'ACCEPTED', 'REJECTED', 'CANCELED'))
);


-- =====================================================================
-- 외래키 제약 (34건)
-- CASCADE 15 / RESTRICT 12 / SET NULL 7
-- 번호는 데이터베이스 명세서 '관계 정의(FK)' 시트와 일치한다.
--
-- [원본과 다름] Oracle 에는 ON DELETE RESTRICT 구문이 없다.
-- 절을 생략하면 Oracle 기본 동작(NO ACTION, 즉시 검사)이 적용되어
-- MySQL 의 RESTRICT 와 결과가 같다. 12건 모두 절을 생략했다.
-- =====================================================================

-- 1
ALTER TABLE user_agreements ADD CONSTRAINT fk_user_agreements_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;
-- 2
ALTER TABLE social_accounts ADD CONSTRAINT fk_social_accounts_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;
-- 3
ALTER TABLE auth_tokens ADD CONSTRAINT fk_auth_tokens_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;
-- 4
ALTER TABLE email_verifications ADD CONSTRAINT fk_email_verifications_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;
-- 5  (RESTRICT → 절 생략)
ALTER TABLE line_stations ADD CONSTRAINT fk_line_stations_line_id
  FOREIGN KEY (line_id) REFERENCES subway_lines (line_id);
-- 6  (RESTRICT → 절 생략)
ALTER TABLE line_stations ADD CONSTRAINT fk_line_stations_station_id
  FOREIGN KEY (station_id) REFERENCES stations (station_id);
-- 7  (RESTRICT → 절 생략)
ALTER TABLE train_timetables ADD CONSTRAINT fk_train_timetables_line_id
  FOREIGN KEY (line_id) REFERENCES subway_lines (line_id);
-- 8  (RESTRICT → 절 생략)
ALTER TABLE train_timetables ADD CONSTRAINT fk_train_timetables_station_id
  FOREIGN KEY (station_id) REFERENCES stations (station_id);
-- 9
ALTER TABLE train_timetables ADD CONSTRAINT fk_train_timetables_destination_station_id
  FOREIGN KEY (destination_station_id) REFERENCES stations (station_id) ON DELETE SET NULL;
-- 10
ALTER TABLE places ADD CONSTRAINT fk_places_created_by
  FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL;
-- 11
ALTER TABLE place_stations ADD CONSTRAINT fk_place_stations_place_id
  FOREIGN KEY (place_id) REFERENCES places (place_id) ON DELETE CASCADE;
-- 12  (RESTRICT → 절 생략)
ALTER TABLE place_stations ADD CONSTRAINT fk_place_stations_station_id
  FOREIGN KEY (station_id) REFERENCES stations (station_id);
-- 13
ALTER TABLE place_images ADD CONSTRAINT fk_place_images_place_id
  FOREIGN KEY (place_id) REFERENCES places (place_id) ON DELETE CASCADE;
-- 14
ALTER TABLE station_favorites ADD CONSTRAINT fk_station_favorites_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;
-- 15  (RESTRICT → 절 생략)
ALTER TABLE station_favorites ADD CONSTRAINT fk_station_favorites_station_id
  FOREIGN KEY (station_id) REFERENCES stations (station_id);
-- 16
ALTER TABLE travel_plans ADD CONSTRAINT fk_travel_plans_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;
-- 17  (RESTRICT → 절 생략)
ALTER TABLE travel_plans ADD CONSTRAINT fk_travel_plans_start_station_id
  FOREIGN KEY (start_station_id) REFERENCES stations (station_id);
-- 18  (RESTRICT → 절 생략)
ALTER TABLE travel_plans ADD CONSTRAINT fk_travel_plans_end_station_id
  FOREIGN KEY (end_station_id) REFERENCES stations (station_id);
-- 19
ALTER TABLE travel_plan_items ADD CONSTRAINT fk_travel_plan_items_plan_id
  FOREIGN KEY (plan_id) REFERENCES travel_plans (plan_id) ON DELETE CASCADE;
-- 20  (RESTRICT → 절 생략)
ALTER TABLE travel_plan_items ADD CONSTRAINT fk_travel_plan_items_place_id
  FOREIGN KEY (place_id) REFERENCES places (place_id);
-- 21
ALTER TABLE travel_plan_items ADD CONSTRAINT fk_travel_plan_items_station_id
  FOREIGN KEY (station_id) REFERENCES stations (station_id) ON DELETE SET NULL;
-- 22
ALTER TABLE reviews ADD CONSTRAINT fk_reviews_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;
-- 23  (RESTRICT → 절 생략)
ALTER TABLE reviews ADD CONSTRAINT fk_reviews_start_station_id
  FOREIGN KEY (start_station_id) REFERENCES stations (station_id);
-- 24  (RESTRICT → 절 생략)
ALTER TABLE reviews ADD CONSTRAINT fk_reviews_end_station_id
  FOREIGN KEY (end_station_id) REFERENCES stations (station_id);
-- 25
ALTER TABLE reviews ADD CONSTRAINT fk_reviews_plan_id
  FOREIGN KEY (plan_id) REFERENCES travel_plans (plan_id) ON DELETE SET NULL;
-- 26
ALTER TABLE review_media ADD CONSTRAINT fk_review_media_review_id
  FOREIGN KEY (review_id) REFERENCES reviews (review_id) ON DELETE CASCADE;
-- 27
ALTER TABLE review_tags ADD CONSTRAINT fk_review_tags_review_id
  FOREIGN KEY (review_id) REFERENCES reviews (review_id) ON DELETE CASCADE;
-- 28
ALTER TABLE notices ADD CONSTRAINT fk_notices_admin_id
  FOREIGN KEY (admin_id) REFERENCES users (user_id) ON DELETE SET NULL;
-- 29  (RESTRICT → 절 생략)
ALTER TABLE line_view_logs ADD CONSTRAINT fk_line_view_logs_line_id
  FOREIGN KEY (line_id) REFERENCES subway_lines (line_id);
-- 30
ALTER TABLE line_view_logs ADD CONSTRAINT fk_line_view_logs_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE SET NULL;
-- 31
ALTER TABLE board_posts ADD CONSTRAINT fk_board_posts_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;
-- 32
ALTER TABLE board_posts ADD CONSTRAINT fk_board_posts_plan_id
  FOREIGN KEY (plan_id) REFERENCES travel_plans (plan_id) ON DELETE SET NULL;
-- 33
ALTER TABLE post_participants ADD CONSTRAINT fk_post_participants_post_id
  FOREIGN KEY (post_id) REFERENCES board_posts (post_id) ON DELETE CASCADE;
-- 34
ALTER TABLE post_participants ADD CONSTRAINT fk_post_participants_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;


-- =====================================================================
-- FK 인덱스 (29건) — Oracle 필수
--
-- MySQL InnoDB 는 FK 생성 시 자식 컬럼 인덱스를 자동 생성하지만
-- Oracle 은 생성하지 않는다. 읽기 전용 DB 이므로 삭제 락 문제는 없으나,
-- 이 스키마의 조회는 대부분 FK 컬럼 조인이다(후기→역, 계획→장소,
-- 시간표→노선). 인덱스가 없으면 장애 전환 중 조회가 전부 풀스캔이 되어
-- 정작 필요한 순간에 응답이 느려진다. 그래서 DDL 과 함께 만든다.
--
-- 아래 5건은 이미 UNIQUE 제약의 선두 컬럼이라 인덱스가 존재하므로 제외했다.
--   line_stations.line_id      (uk_line_stations)
--   place_images.place_id      (uk_place_images_order)
--   station_favorites.user_id  (uk_favorites_user_station)
--   review_tags.review_id      (uk_review_tags)
--   post_participants.post_id  (uk_post_participants)
--
-- 조회 성능용 인덱스는 원본 방침대로 기능 개발 후 migrations/ 에 추가한다.
-- =====================================================================

CREATE INDEX ix_user_agreements_user_id     ON user_agreements (user_id);
CREATE INDEX ix_social_accounts_user_id     ON social_accounts (user_id);
CREATE INDEX ix_auth_tokens_user_id         ON auth_tokens (user_id);
CREATE INDEX ix_email_verifications_user_id ON email_verifications (user_id);
CREATE INDEX ix_line_stations_station_id    ON line_stations (station_id);
CREATE INDEX ix_train_timetables_line_id    ON train_timetables (line_id);
CREATE INDEX ix_train_timetables_station_id ON train_timetables (station_id);
CREATE INDEX ix_train_timetables_dest_id    ON train_timetables (destination_station_id);
CREATE INDEX ix_places_created_by           ON places (created_by);
CREATE INDEX ix_place_stations_place_id     ON place_stations (place_id);
CREATE INDEX ix_place_stations_station_id   ON place_stations (station_id);
CREATE INDEX ix_station_favorites_stn_id    ON station_favorites (station_id);
CREATE INDEX ix_travel_plans_user_id        ON travel_plans (user_id);
CREATE INDEX ix_travel_plans_start_stn_id   ON travel_plans (start_station_id);
CREATE INDEX ix_travel_plans_end_stn_id     ON travel_plans (end_station_id);
CREATE INDEX ix_travel_plan_items_plan_id   ON travel_plan_items (plan_id);
CREATE INDEX ix_travel_plan_items_place_id  ON travel_plan_items (place_id);
CREATE INDEX ix_travel_plan_items_stn_id    ON travel_plan_items (station_id);
CREATE INDEX ix_reviews_user_id             ON reviews (user_id);
CREATE INDEX ix_reviews_start_stn_id        ON reviews (start_station_id);
CREATE INDEX ix_reviews_end_stn_id          ON reviews (end_station_id);
CREATE INDEX ix_reviews_plan_id             ON reviews (plan_id);
CREATE INDEX ix_review_media_review_id      ON review_media (review_id);
CREATE INDEX ix_notices_admin_id            ON notices (admin_id);
CREATE INDEX ix_line_view_logs_line_id      ON line_view_logs (line_id);
CREATE INDEX ix_line_view_logs_user_id      ON line_view_logs (user_id);
CREATE INDEX ix_board_posts_user_id         ON board_posts (user_id);
CREATE INDEX ix_board_posts_plan_id         ON board_posts (plan_id);
CREATE INDEX ix_post_participants_user_id   ON post_participants (user_id);


-- =====================================================================
-- 테이블 주석 (22건)
-- 컬럼 주석은 CREATE TABLE 내 -- 주석으로 대체했다.
-- 명세서 요구로 DB 내 컬럼 주석이 필요하면 COMMENT ON COLUMN 을 추가한다.
-- =====================================================================
COMMENT ON TABLE users               IS '회원';
COMMENT ON TABLE user_agreements     IS '약관 동의 이력';
COMMENT ON TABLE social_accounts     IS '소셜 계정 연동';
COMMENT ON TABLE auth_tokens         IS '인증 토큰';
COMMENT ON TABLE email_verifications IS '이메일 인증';
COMMENT ON TABLE subway_lines        IS '지하철 노선';
COMMENT ON TABLE stations            IS '지하철 역';
COMMENT ON TABLE line_stations       IS '노선-역 매핑';
COMMENT ON TABLE train_timetables    IS '열차 시간표';
COMMENT ON TABLE places              IS '추천 장소';
COMMENT ON TABLE place_stations      IS '장소-역 매핑';
COMMENT ON TABLE place_images        IS '장소 이미지';
COMMENT ON TABLE station_favorites   IS '역 즐겨찾기';
COMMENT ON TABLE travel_plans        IS '여행 동선 계획';
COMMENT ON TABLE travel_plan_items   IS '여행 계획 상세';
COMMENT ON TABLE reviews             IS '여행 후기';
COMMENT ON TABLE review_media        IS '후기 첨부 미디어';
COMMENT ON TABLE review_tags         IS '후기 태그';
COMMENT ON TABLE notices             IS '공지사항';
COMMENT ON TABLE line_view_logs      IS '노선 조회 로그';
COMMENT ON TABLE board_posts         IS '인원 모집 게시글';
COMMENT ON TABLE post_participants   IS '모집 참여자';


-- =====================================================================
-- 읽기 전용 권한 부여
--
-- 테이블 생성 후 metrotrip 계정으로 실행한다.
-- 서비스는 metrotrip_ro 로만 접속하므로, 장애 전환 로직에 버그가 있어
-- INSERT/UPDATE 가 흘러 들어와도 DB 가 ORA-01031 로 차단한다.
-- '읽기 전용'을 코드 규칙이 아니라 권한으로 강제하는 것이 핵심이다.
--
-- 아래 블록을 그대로 실행하면 22개 테이블에 SELECT 권한을 부여한다.
-- =====================================================================

-- BEGIN
--   FOR t IN (SELECT table_name FROM user_tables) LOOP
--     EXECUTE IMMEDIATE 'GRANT SELECT ON ' || t.table_name || ' TO metrotrip_ro';
--   END LOOP;
-- END;
-- /

-- 부여 결과 확인 (22행이 나와야 한다)
--   SELECT COUNT(*) FROM user_tab_privs
--    WHERE grantee = 'METROTRIP_RO' AND privilege = 'SELECT';


-- =====================================================================
-- [변환 노트] MySQL 원본 대비 달라진 점과 그 이유
-- =====================================================================
--
-- 1. AUTO_INCREMENT → 채번 없는 NUMBER(19) NOT NULL
--    이 DB 는 읽기 전용이므로 신규 ID 를 발급할 일이 없다.
--    PK 값은 동기화 배치가 MySQL 원본 ID 를 그대로 넣는다.
--    IDENTITY 를 쓰지 않으므로 적재 후 시퀀스 재동기화도 필요 없다.
--
--    ※ 훗날 Oracle 을 쓰기 가능으로 승격한다면 그때 아래를 실행한다.
--        ALTER TABLE users MODIFY user_id
--          GENERATED BY DEFAULT ON NULL AS IDENTITY (START WITH LIMIT VALUE);
--
-- 2. ON UPDATE CURRENT_TIMESTAMP 는 대응하지 않았다.
--    Oracle 에서 UPDATE 가 발생하지 않으므로 자동 갱신이 필요 없다.
--    updated_at 은 MySQL 이 기록한 값을 그대로 복사해 보관한다.
--    → MySQL 원본 스키마는 수정할 필요가 없다.
--
-- 3. TIME → VARCHAR2(8 CHAR) : 9번 테이블 주석 참조.
--    조회 시 문자열 비교를 그대로 쓴다.
--      WHERE departure_time >= '14:30:00'
--    MySQL 에서도 TIME 컬럼에 문자열 비교가 동작하므로 쿼리는 공용이다.
--
-- 4. VARCHAR2 는 전부 CHAR 의미로 선언했다.
--    Oracle 기본은 BYTE 의미이고 AL32UTF8 한글은 3바이트이므로
--    VARCHAR2(50) 이면 한글 16자만 들어간다.
--    세션 설정(NLS_LENGTH_SEMANTICS)에 의존하지 않고 컬럼마다 명시했다.
--
-- 5. TEXT → CLOB
--    CLOB 은 ORDER BY / GROUP BY / DISTINCT 에 직접 쓸 수 없다.
--    목록 조회에서 content 를 정렬 키로 쓰지 않도록 주의한다.
--
-- 6. ON DELETE RESTRICT 12건은 절을 생략했다(위 FK 섹션 주석 참조).
--
-- 7. 식별자에 따옴표를 쓰지 않았다.
--    Oracle 은 무따옴표 식별자를 대문자로 정규화하고, SQLAlchemy 도
--    전부 소문자인 이름은 따옴표 없이 전송하므로 자동으로 일치한다.
--    "users" 처럼 따옴표로 만들면 이후 모든 쿼리에 따옴표가 필요해진다.
--
--
-- [적재 전 반드시 처리할 데이터 이슈]
--
-- A. 빈 문자열
--    Oracle 은 '' 을 NULL 로 취급한다. NOT NULL 컬럼에 '' 이 들어 있으면
--    ORA-01400 으로 적재가 실패한다. 사전 점검:
--      SELECT 'users.name' AS col, COUNT(*) FROM users WHERE name = ''
--      UNION ALL SELECT 'reviews.title', COUNT(*) FROM reviews WHERE title = '';
--      -- (MySQL 에서 실행)
--
-- B. 대소문자 구분
--    MySQL utf8mb4_0900_ai_ci 는 대소문자를 무시하지만 Oracle 은 구분한다.
--    email / nickname / tag_name 은 애플리케이션에서 소문자로 정규화한다.
--    MySQL 에 'Hong' 과 'hong' 이 공존할 수 없었으므로 적재는 성공하지만,
--    반대로 Oracle 로 전환된 순간 로그인 조회가 실패할 수 있다.
--
-- C. 적재 순서
--    FK 때문에 위 테이블 정의 순서대로 넣는다. 대량 적재 시에는
--    FK 를 비활성화하고 넣은 뒤 되돌리는 편이 빠르다.
--      ALTER TABLE <child> DISABLE CONSTRAINT <fk_name>;
--      -- 적재 --
--      ALTER TABLE <child> ENABLE  CONSTRAINT <fk_name>;  -- 이때 전체 검증
--
-- D. 세션 타임존
--    DEFAULT SYSTIMESTAMP 는 이 DB 에서 실제로 동작할 일이 없다
--    (동기화 배치가 모든 컬럼 값을 명시적으로 넣기 때문).
--    다만 배치가 MySQL 에서 읽은 datetime 을 변환 없이 그대로 넣어야
--    두 DB 의 created_at 이 일치한다. 커넥터의 타임존 변환 옵션을 끌 것.
--
-- E. CLOB 조회 (python-oracledb)
--    기본 설정에서 CLOB 컬럼은 str 이 아니라 LOB 객체로 반환되어
--    Pydantic 직렬화 단계에서 깨진다. reviews.content, board_posts.content,
--    notices.content, places.description 4개가 해당된다.
--    커넥션 생성 전에 한 번만 설정하면 str 로 받는다.
--      import oracledb
--      oracledb.defaults.fetch_lobs = False
--
-- F. 동기화 주기와 복구 목표 시점(RPO)
--    마지막 동기화 이후 MySQL 이 죽으면 그 사이 데이터는 이 DB 에 없다.
--    동기화 주기가 곧 서비스 스펙이므로 요구사항 정의서에 명시한다.
--      예) '장애 시 최대 N시간 이전 시점의 데이터까지 조회 가능'
--    역·노선·시간표 등 마스터 테이블은 변경이 드물어 전체 교체로,
--    users·reviews·travel_plans 등은 updated_at 기준 증분으로 나누면
--    적재 시간을 크게 줄일 수 있다.
-- =====================================================================
