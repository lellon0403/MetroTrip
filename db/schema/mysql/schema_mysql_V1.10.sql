-- =====================================================================
-- 지하철 노선 기반 관광 추천 서비스 (MetroTrip)
-- 테이블 생성 스크립트
--
-- 근거 문서 : 데이터베이스 명세서 V1.10
-- 대상 DBMS : MySQL 8.0
-- 구성      : 22개 테이블 / PK 22 / UNIQUE 10 / FK 34 / CHECK 20 / 인덱스 3
--
-- 비고 : 테이블은 FK 의존 순서대로 정렬되어 있으므로 위에서부터
--        그대로 실행하면 참조 오류가 발생하지 않는다.
--        조회 성능용 인덱스는 파일 마지막에 있다. 추가·변경은 이 파일이 아니라
--        migrations/ 에 번호 파일로 남긴 뒤 이곳에 병합한다.
-- =====================================================================

-- 데이터베이스 생성. MySQL 8.0 의 기본 콜레이션을 사용한다.
CREATE DATABASE IF NOT EXISTS metrotrip
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE metrotrip;

-- ---------------------------------------------------------------------
-- 재실행용 초기화 (운영 DB에서는 절대 실행하지 말 것)
-- ---------------------------------------------------------------------
-- SET FOREIGN_KEY_CHECKS = 0;
-- DROP TABLE IF EXISTS post_participants, board_posts, line_view_logs,
--   notices, review_tags, review_media, reviews, travel_plan_items,
--   travel_plans, station_favorites, place_images, place_stations,
--   places, train_timetables, line_stations, stations, subway_lines,
--   email_verifications, auth_tokens, social_accounts, user_agreements,
--   users;
-- SET FOREIGN_KEY_CHECKS = 1;


-- =====================================================================
-- 1. users : 회원
-- 근거 요구사항 : UM-001, MB-009, MB-010
-- =====================================================================
CREATE TABLE users (
  user_id      BIGINT       NOT NULL AUTO_INCREMENT COMMENT '회원 식별자',
  email        VARCHAR(255) NOT NULL                COMMENT '로그인 ID 겸용',
  password     VARCHAR(255) NULL                    COMMENT '단방향 해시 저장. 소셜 전용 계정은 NULL',
  name         VARCHAR(50)  NOT NULL                COMMENT '실명',
  nickname     VARCHAR(30)  NOT NULL                COMMENT '게시판 노출명',
  phone        VARCHAR(20)  NULL                    COMMENT '''-'' 제외 저장',
  role         VARCHAR(20)  NOT NULL DEFAULT 'USER' COMMENT 'USER / ADMIN',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '회원가입 일자 및 시간',
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정 시각 자동 갱신',
  CONSTRAINT pk_users         PRIMARY KEY (user_id),
  CONSTRAINT uk_users_email   UNIQUE (email),
  CONSTRAINT uk_users_nickname UNIQUE (nickname),
  CONSTRAINT ck_users_role    CHECK (role IN ('USER', 'ADMIN'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='회원';


-- =====================================================================
-- 2. user_agreements : 약관 동의 이력
-- 근거 요구사항 : UM-001, CM-010
-- =====================================================================
CREATE TABLE user_agreements (
  agreement_id    BIGINT      NOT NULL AUTO_INCREMENT COMMENT '동의 이력 식별자',
  user_id         BIGINT      NOT NULL                COMMENT 'users.user_id',
  agreement_type  VARCHAR(30) NOT NULL                COMMENT 'TERMS / PRIVACY / LOCATION / MARKETING',
  is_agreed       TINYINT(1)  NOT NULL DEFAULT 1      COMMENT '1=동의, 0=철회',
  agreed_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '동의·철회 시각',
  CONSTRAINT pk_user_agreements                PRIMARY KEY (agreement_id),
  CONSTRAINT ck_user_agreements_agreement_type CHECK (agreement_type IN ('TERMS', 'PRIVACY', 'LOCATION', 'MARKETING')),
  CONSTRAINT ck_user_agreements_is_agreed      CHECK (is_agreed IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='약관 동의 이력';


-- =====================================================================
-- 3. social_accounts : 소셜 계정 연동
-- 근거 요구사항 : UM-002, MB-002
-- =====================================================================
CREATE TABLE social_accounts (
  social_account_id  BIGINT       NOT NULL AUTO_INCREMENT COMMENT '식별자',
  user_id            BIGINT       NOT NULL                COMMENT 'users.user_id',
  provider           VARCHAR(20)  NOT NULL                COMMENT 'KAKAO / NAVER',
  provider_user_id   VARCHAR(100) NOT NULL                COMMENT '소셜 서비스가 발급한 고유 ID',
  connected_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '최초 연동 시각',
  CONSTRAINT pk_social_accounts       PRIMARY KEY (social_account_id),
  CONSTRAINT uk_social_provider       UNIQUE (provider, provider_user_id),
  CONSTRAINT ck_social_accounts_provider CHECK (provider IN ('KAKAO', 'NAVER'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='소셜 계정 연동';


-- =====================================================================
-- 4. auth_tokens : 인증 토큰
-- 근거 요구사항 : MB-001, MB-002
-- =====================================================================
CREATE TABLE auth_tokens (
  token_id       BIGINT       NOT NULL AUTO_INCREMENT COMMENT '식별자',
  user_id        BIGINT       NOT NULL                COMMENT 'users.user_id',
  refresh_token  VARCHAR(512) NOT NULL                COMMENT '해시 저장',
  issued_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '토큰 발급 시각',
  expires_at     DATETIME     NOT NULL                COMMENT '만료 시각',
  revoked_at     DATETIME     NULL                    COMMENT '토큰 무효화 시각',
  user_agent     VARCHAR(255) NULL                    COMMENT '다중 기기 로그인 식별용',
  CONSTRAINT pk_auth_tokens   PRIMARY KEY (token_id),
  CONSTRAINT uk_auth_refresh  UNIQUE (refresh_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='인증 토큰';


-- =====================================================================
-- 5. email_verifications : 이메일 인증
-- 근거 요구사항 : MB-010
-- =====================================================================
CREATE TABLE email_verifications (
  verification_id  BIGINT       NOT NULL AUTO_INCREMENT COMMENT '식별자',
  user_id          BIGINT       NULL                    COMMENT 'users.user_id. 가입 전 인증은 NULL',
  email            VARCHAR(255) NOT NULL                COMMENT '인증번호 발송 대상',
  purpose          VARCHAR(20)  NOT NULL                COMMENT 'WITHDRAWAL / SIGNUP / PASSWORD_RESET',
  code_hash        VARCHAR(255) NOT NULL                COMMENT '단방향 해시 저장. 평문 저장 금지',
  expires_at       DATETIME     NOT NULL                COMMENT '발급 시각 + 5분',
  attempt_count    INT          NOT NULL DEFAULT 0      COMMENT '무차별 대입 차단용. 5회 초과 시 애플리케이션에서 무효화',
  verified_at      DATETIME     NULL                    COMMENT '인증 성공 시각. NULL이면 미인증',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '발급 시각',
  CONSTRAINT pk_email_verifications         PRIMARY KEY (verification_id),
  CONSTRAINT ck_email_verifications_purpose CHECK (purpose IN ('WITHDRAWAL', 'SIGNUP', 'PASSWORD_RESET'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='이메일 인증';


-- =====================================================================
-- 6. subway_lines : 지하철 노선
-- 근거 요구사항 : CM-001, CM-002, CM-003
-- =====================================================================
CREATE TABLE subway_lines (
  line_id        BIGINT      NOT NULL AUTO_INCREMENT COMMENT '노선 식별자',
  line_name      VARCHAR(50) NOT NULL                COMMENT '예: 2호선',
  line_number    VARCHAR(10) NULL                    COMMENT '예: 2',
  display_order  INT         NOT NULL DEFAULT 0      COMMENT '노선도 정렬 순서',
  CONSTRAINT pk_subway_lines      PRIMARY KEY (line_id),
  CONSTRAINT uk_subway_lines_name UNIQUE (line_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='지하철 노선';


-- =====================================================================
-- 7. stations : 지하철 역
-- 근거 요구사항 : CM-004, CM-005, CM-006
-- 외부 코드(station_code)는 V1.9 에서 삭제했다. 공공데이터 출처별로 체계가 달라
-- (서울교통공사 외부코드 / 코레일 역코드) 단일 컬럼으로 조인 키를 만들 수 없다.
-- 외부 API 조회는 호선·역명·방향 조합으로 처리하며, 시간표 연동이 필요해지면
-- line_stations 에 노선-역 단위 코드를 추가한다.
-- =====================================================================
CREATE TABLE stations (
  station_id    BIGINT        NOT NULL AUTO_INCREMENT COMMENT '역 식별자',
  station_name  VARCHAR(100)  NOT NULL                COMMENT '역 검색 대상. 부역명(괄호) 제외한 정식 역명',
  latitude      DECIMAL(10,7) NOT NULL                COMMENT '지도 표시 및 반경 계산 기준',
  longitude     DECIMAL(10,7) NOT NULL                COMMENT '지도 표시 및 반경 계산 기준',
  address       VARCHAR(255)  NULL                    COMMENT '역 소재지 도로명 주소',
  CONSTRAINT pk_stations PRIMARY KEY (station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='지하철 역';


-- =====================================================================
-- 8. line_stations : 노선-역 매핑
-- 근거 요구사항 : CM-002, CM-005
-- =====================================================================
CREATE TABLE line_stations (
  line_station_id  BIGINT NOT NULL AUTO_INCREMENT COMMENT '식별자',
  line_id          BIGINT NOT NULL                COMMENT 'subway_lines.line_id',
  station_id       BIGINT NOT NULL                COMMENT 'stations.station_id',
  station_order    INT    NOT NULL                COMMENT '해당 노선에서의 정렬 순서(상행 기준)',
  CONSTRAINT pk_line_stations                PRIMARY KEY (line_station_id),
  CONSTRAINT uk_line_stations                UNIQUE (line_id, station_id),
  CONSTRAINT ck_line_stations_station_order  CHECK (station_order >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='노선-역 매핑';


-- =====================================================================
-- 9. train_timetables : 열차 시간표
-- 근거 요구사항 : CM-009
--
-- train_no  : 동일 열차의 역별 정차 시각을 묶는 키. 없으면 역 단위 배차표만
--             조회할 수 있고 열차 여정 추적(A역 → B역 소요 시간)은 불가능하다.
-- 시각 컬럼 : 시발역은 도착시각이, 종착역은 출발시각이 존재하지 않으므로
--             두 컬럼 모두 NULL 을 허용한다. 최소 한쪽은 값이 있어야 한다.
-- day_type  : 코레일 광역철도는 토·일 시간표가 동일하여 평일/주말 2종이다.
-- 24시 이후 : 원본에 24:01:00 같은 값이 존재한다. MySQL TIME 이 수용하지만
--             '현재 시각 이후 열차' 조회 시 자정 넘김 처리가 필요하다.
-- =====================================================================
CREATE TABLE train_timetables (
  timetable_id            BIGINT      NOT NULL AUTO_INCREMENT COMMENT '식별자',
  train_no                VARCHAR(20) NULL                    COMMENT '열차번호(예: K1904). 동일 열차의 역별 정차 시각을 묶는 키',
  line_id                 BIGINT      NOT NULL                COMMENT 'subway_lines.line_id',
  station_id              BIGINT      NOT NULL                COMMENT 'stations.station_id',
  day_type                VARCHAR(10) NOT NULL                COMMENT 'WEEKDAY(평일) / WEEKEND(주말)',
  direction               VARCHAR(10) NOT NULL                COMMENT 'UP(상행) / DOWN(하행)',
  arrival_time            TIME        NULL                    COMMENT '해당 역 도착 시각. 시발역은 NULL',
  departure_time          TIME        NULL                    COMMENT '해당 역 출발 시각. 종착역은 NULL',
  destination_station_id  BIGINT      NULL                    COMMENT 'stations.station_id. 차량기지 등 역이 아닌 값은 NULL',
  CONSTRAINT pk_train_timetables            PRIMARY KEY (timetable_id),
  CONSTRAINT ck_train_timetables_day_type   CHECK (day_type  IN ('WEEKDAY', 'WEEKEND')),
  CONSTRAINT ck_train_timetables_direction  CHECK (direction IN ('UP', 'DOWN')),
  CONSTRAINT ck_train_timetables_time       CHECK (arrival_time IS NOT NULL OR departure_time IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='열차 시간표';


-- =====================================================================
-- 10. places : 추천 장소
-- 근거 요구사항 : AD-001~003, CM-006, CM-007
-- =====================================================================
CREATE TABLE places (
  place_id     BIGINT        NOT NULL AUTO_INCREMENT COMMENT '장소 식별자',
  place_name   VARCHAR(100)  NOT NULL                COMMENT '장소 이름',
  category     VARCHAR(30)   NOT NULL                COMMENT 'TOUR / RESTAURANT / CAFE / SHOPPING / ETC',
  description  TEXT          NULL                    COMMENT '상세 소개',
  address      VARCHAR(255)  NOT NULL                COMMENT '도로명 주소',
  latitude     DECIMAL(10,7) NOT NULL                COMMENT '지도 마커 좌표',
  longitude    DECIMAL(10,7) NOT NULL                COMMENT '지도 마커 좌표',
  phone        VARCHAR(20)   NULL                    COMMENT '장소 연락처',
  created_by   BIGINT        NULL                    COMMENT 'users.user_id (role=ADMIN)',
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록 시각',
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정 시각 자동 갱신',
  CONSTRAINT pk_places          PRIMARY KEY (place_id),
  CONSTRAINT ck_places_category CHECK (category IN ('TOUR', 'RESTAURANT', 'CAFE', 'SHOPPING', 'ETC'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='추천 장소';


-- =====================================================================
-- 11. place_stations : 장소-역 매핑
-- 근거 요구사항 : AD-002, CM-006
-- =====================================================================
CREATE TABLE place_stations (
  place_station_id  BIGINT NOT NULL AUTO_INCREMENT COMMENT '식별자',
  place_id          BIGINT NOT NULL                COMMENT 'places.place_id',
  station_id        BIGINT NOT NULL                COMMENT 'stations.station_id. 반경 1km 기준',
  CONSTRAINT pk_place_stations PRIMARY KEY (place_station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='장소-역 매핑';


-- =====================================================================
-- 12. place_images : 장소 이미지
-- 근거 요구사항 : AD-001
-- sort_order 값이 가장 작은 행을 대표 이미지로 사용
-- =====================================================================
CREATE TABLE place_images (
  place_image_id  BIGINT       NOT NULL AUTO_INCREMENT COMMENT '식별자',
  place_id        BIGINT       NOT NULL                COMMENT 'places.place_id',
  image_url       VARCHAR(500) NOT NULL                COMMENT '오브젝트 스토리지 경로',
  sort_order      INT          NOT NULL                COMMENT '1부터 순차 부여. 값이 가장 작은 행이 대표 이미지',
  CONSTRAINT pk_place_images             PRIMARY KEY (place_image_id),
  CONSTRAINT uk_place_images_order       UNIQUE (place_id, sort_order),
  CONSTRAINT ck_place_images_sort_order  CHECK (sort_order >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='장소 이미지';


-- =====================================================================
-- 13. station_favorites : 역 즐겨찾기
-- 근거 요구사항 : MB-012, MB-013, MB-014
-- =====================================================================
CREATE TABLE station_favorites (
  favorite_id  BIGINT   NOT NULL AUTO_INCREMENT COMMENT '식별자',
  user_id      BIGINT   NOT NULL                COMMENT 'users.user_id',
  station_id   BIGINT   NOT NULL                COMMENT 'stations.station_id',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '즐겨찾기 추가 시각',
  CONSTRAINT pk_station_favorites      PRIMARY KEY (favorite_id),
  CONSTRAINT uk_favorites_user_station UNIQUE (user_id, station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='역 즐겨찾기';


-- =====================================================================
-- 14. travel_plans : 여행 동선 계획
-- 근거 요구사항 : MB-008, MB-015~017
-- =====================================================================
CREATE TABLE travel_plans (
  plan_id           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '계획 식별자',
  user_id           BIGINT       NOT NULL                COMMENT 'users.user_id',
  plan_title        VARCHAR(100) NOT NULL                COMMENT '계획 제목',
  start_station_id  BIGINT       NOT NULL                COMMENT 'stations.station_id',
  end_station_id    BIGINT       NOT NULL                COMMENT 'stations.station_id',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '작성 시각',
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정 시각 자동 갱신',
  CONSTRAINT pk_travel_plans PRIMARY KEY (plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='여행 동선 계획';


-- =====================================================================
-- 15. travel_plan_items : 여행 계획 상세
-- 근거 요구사항 : MB-008, MB-015
-- 동선 순서는 visit_time 오름차순. 조회 시 ORDER BY visit_time, plan_item_id
-- =====================================================================
CREATE TABLE travel_plan_items (
  plan_item_id  BIGINT       NOT NULL AUTO_INCREMENT COMMENT '식별자',
  plan_id       BIGINT       NOT NULL                COMMENT 'travel_plans.plan_id',
  place_id      BIGINT       NOT NULL                COMMENT 'places.place_id. MB-015 방문 장소',
  station_id    BIGINT       NULL                    COMMENT 'stations.station_id. 장소 접근 역',
  visit_time    TIME         NOT NULL                COMMENT '방문 시간. 동선 순서는 본 컬럼 오름차순으로 결정',
  memo          VARCHAR(255) NULL                    COMMENT '사용자 메모',
  CONSTRAINT pk_travel_plan_items PRIMARY KEY (plan_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='여행 계획 상세';


-- =====================================================================
-- 16. reviews : 여행 후기
-- 근거 요구사항 : MB-003, MB-004, MB-005, MB-011, AD-007
-- =====================================================================
CREATE TABLE reviews (
  review_id         BIGINT       NOT NULL AUTO_INCREMENT COMMENT '후기 식별자',
  user_id           BIGINT       NOT NULL                COMMENT 'users.user_id',
  title             VARCHAR(100) NOT NULL                COMMENT '글 제목. 게시판 목록 노출 제목',
  content           TEXT         NOT NULL                COMMENT '본문',
  start_station_id  BIGINT       NOT NULL                COMMENT 'stations.station_id',
  end_station_id    BIGINT       NOT NULL                COMMENT 'stations.station_id',
  rating            TINYINT      NOT NULL                COMMENT '별점. 반개 단위 표현을 위해 1~10 정수로 저장',
  travel_cost       INT          NULL                    COMMENT '단위 원(KRW)',
  plan_id           BIGINT       NULL                    COMMENT 'travel_plans.plan_id. 동선 가져오기',
  view_count        INT          NOT NULL DEFAULT 0      COMMENT '상세 조회 시 증가',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '작성 시각',
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정 시각 자동 갱신',
  CONSTRAINT pk_reviews             PRIMARY KEY (review_id),
  CONSTRAINT ck_reviews_rating      CHECK (rating BETWEEN 1 AND 10),
  CONSTRAINT ck_reviews_travel_cost CHECK (travel_cost >= 0),
  CONSTRAINT ck_reviews_view_count  CHECK (view_count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='여행 후기';


-- =====================================================================
-- 17. review_media : 후기 첨부 미디어
-- 근거 요구사항 : MB-003
-- =====================================================================
CREATE TABLE review_media (
  media_id    BIGINT       NOT NULL AUTO_INCREMENT COMMENT '식별자',
  review_id   BIGINT       NOT NULL                COMMENT 'reviews.review_id',
  media_url   VARCHAR(500) NOT NULL                COMMENT '오브젝트 스토리지 경로',
  media_type  VARCHAR(10)  NOT NULL                COMMENT 'IMAGE / VIDEO',
  CONSTRAINT pk_review_media            PRIMARY KEY (media_id),
  CONSTRAINT ck_review_media_media_type CHECK (media_type IN ('IMAGE', 'VIDEO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='후기 첨부 미디어';


-- =====================================================================
-- 18. review_tags : 후기 태그
-- 근거 요구사항 : MB-003, MB-005, MB-006, MB-007
-- 영문 태그는 애플리케이션에서 소문자로 변환한 뒤 저장한다
-- =====================================================================
CREATE TABLE review_tags (
  review_tag_id  BIGINT      NOT NULL AUTO_INCREMENT COMMENT '식별자',
  review_id      BIGINT      NOT NULL                COMMENT 'reviews.review_id',
  tag_name       VARCHAR(30) NOT NULL                COMMENT 'MB-006 회원이 직접 입력한 커스텀 태그',
  CONSTRAINT pk_review_tags PRIMARY KEY (review_tag_id),
  CONSTRAINT uk_review_tags UNIQUE (review_id, tag_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='후기 태그';


-- =====================================================================
-- 19. notices : 공지사항
-- 근거 요구사항 : AD-004, AD-005, AD-006
-- =====================================================================
CREATE TABLE notices (
  notice_id    BIGINT       NOT NULL AUTO_INCREMENT COMMENT '공지 식별자',
  admin_id     BIGINT       NULL                    COMMENT 'users.user_id (role=ADMIN)',
  title        VARCHAR(200) NOT NULL                COMMENT '공지 제목',
  content      TEXT         NOT NULL                COMMENT '공지 본문',
  notice_type  VARCHAR(20)  NOT NULL DEFAULT 'BOARD' COMMENT 'ALARM(알림 안내) / BOARD(게시판)',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록 시각',
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정 시각 자동 갱신',
  CONSTRAINT pk_notices             PRIMARY KEY (notice_id),
  CONSTRAINT ck_notices_notice_type CHECK (notice_type IN ('ALARM', 'BOARD'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='공지사항';


-- =====================================================================
-- 20. line_view_logs : 노선 조회 로그
-- 근거 요구사항 : CM-003
-- =====================================================================
CREATE TABLE line_view_logs (
  log_id     BIGINT   NOT NULL AUTO_INCREMENT COMMENT '식별자',
  line_id    BIGINT   NOT NULL                COMMENT 'subway_lines.line_id',
  user_id    BIGINT   NULL                    COMMENT 'users.user_id. 비회원은 NULL',
  viewed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '집계 기준 시각',
  CONSTRAINT pk_line_view_logs PRIMARY KEY (log_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='노선 조회 로그';


-- =====================================================================
-- 21. board_posts : 인원 모집 게시글
-- 근거 요구사항 : MB-신규 (요구사항 정의서 반영 대기)
--
-- 일반 게시판 기능을 제외하고 인원 모집 전용으로 운영한다. 따라서
-- 모집 정원·마감일·상태가 모두 필수이며 조건부 NULL 규칙이 존재하지 않는다.
--
-- recruit_status : 생성 시 DEFAULT 'RECRUITING'. 정원이 차면 수락 처리
--                  트랜잭션 안에서 CLOSED 로 갱신한다.
--                  현재 인원은 post_participants 의 ACCEPTED 건수로 산출하므로
--                  동시 수락 시 정원 초과를 막으려면 게시글 행을 잠가야 한다.
--                  (SELECT ... FOR UPDATE)
-- recruit_deadline : 경과하면 recruit_status 가 RECRUITING 이어도 신청을 차단한다.
--                  자동 마감 배치가 없으므로 목록 조회 필터에도 같은 조건이 필요하다.
-- =====================================================================
CREATE TABLE board_posts (
  post_id           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '게시글 식별자',
  user_id           BIGINT       NOT NULL                COMMENT 'users.user_id. 작성자 탈퇴 시 게시글도 함께 삭제',
  title             VARCHAR(100) NOT NULL                COMMENT '글 제목',
  content           TEXT         NOT NULL                COMMENT '본문',
  view_count        INT          NOT NULL DEFAULT 0      COMMENT '상세 조회 시 증가',
  recruit_capacity  INT          NOT NULL                COMMENT '모집 인원 수',
  recruit_deadline  DATE         NOT NULL                COMMENT '모집 마감 날짜. 경과 시 신청 차단',
  recruit_status    VARCHAR(20)  NOT NULL DEFAULT 'RECRUITING' COMMENT 'RECRUITING(모집중) / CLOSED(마감)',
  meeting_date      DATE         NULL                    COMMENT '실제 모임 날짜(선택)',
  plan_id           BIGINT       NULL                    COMMENT 'travel_plans.plan_id. 동선 연계(선택)',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '작성 시각',
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정 시각 자동 갱신',
  CONSTRAINT pk_board_posts                   PRIMARY KEY (post_id),
  CONSTRAINT ck_board_posts_view_count        CHECK (view_count >= 0),
  CONSTRAINT ck_board_posts_recruit_capacity  CHECK (recruit_capacity >= 1),
  CONSTRAINT ck_board_posts_recruit_status    CHECK (recruit_status IN ('RECRUITING', 'CLOSED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='인원 모집 게시글';


-- =====================================================================
-- 22. post_participants : 모집 참여자
-- 근거 요구사항 : MB-신규 (요구사항 정의서 반영 대기)
-- 현재 모집 인원은 status = 'ACCEPTED' 건수로 산출한다.
-- 취소·거절 후 재신청은 복합 UNIQUE 때문에 새 행을 넣을 수 없으므로
-- 기존 행을 APPLIED 로 되돌리는 방식으로 처리한다.
-- =====================================================================
CREATE TABLE post_participants (
  participant_id  BIGINT      NOT NULL AUTO_INCREMENT COMMENT '참여 신청 식별자',
  post_id         BIGINT      NOT NULL                COMMENT 'board_posts.post_id',
  user_id         BIGINT      NOT NULL                COMMENT 'users.user_id',
  status          VARCHAR(20) NOT NULL DEFAULT 'APPLIED' COMMENT 'APPLIED(신청) / ACCEPTED(수락) / REJECTED(거절) / CANCELED(취소)',
  applied_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '신청 시각',
  responded_at    DATETIME    NULL                    COMMENT '수락·거절 처리 시각(미처리 시 NULL)',
  CONSTRAINT pk_post_participants     PRIMARY KEY (participant_id),
  CONSTRAINT uk_post_participants     UNIQUE (post_id, user_id),
  CONSTRAINT ck_post_participants_status CHECK (status IN ('APPLIED', 'ACCEPTED', 'REJECTED', 'CANCELED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='모집 참여자';


-- =====================================================================
-- 외래키 제약 (34건)
-- CASCADE 15 / RESTRICT 12 / SET NULL 7
-- 번호는 데이터베이스 명세서 '관계 정의(FK)' 시트와 일치한다.
-- =====================================================================

-- 1
ALTER TABLE user_agreements ADD CONSTRAINT fk_user_agreements_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;              -- 회원 1명은 여러 동의 이력을 가짐
-- 2
ALTER TABLE social_accounts ADD CONSTRAINT fk_social_accounts_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;              -- 회원 1명은 카카오·네이버 계정을 각각 연동
-- 3
ALTER TABLE auth_tokens ADD CONSTRAINT fk_auth_tokens_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;              -- 회원 1명은 기기별 토큰을 여러 개 보유
-- 4
ALTER TABLE email_verifications ADD CONSTRAINT fk_email_verifications_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;              -- 가입 전 인증은 NULL
-- 5
ALTER TABLE line_stations ADD CONSTRAINT fk_line_stations_line_id
  FOREIGN KEY (line_id) REFERENCES subway_lines (line_id) ON DELETE RESTRICT;      -- 노선 마스터 참조
-- 6
ALTER TABLE line_stations ADD CONSTRAINT fk_line_stations_station_id
  FOREIGN KEY (station_id) REFERENCES stations (station_id) ON DELETE RESTRICT;    -- 역 마스터 참조
-- 7
ALTER TABLE train_timetables ADD CONSTRAINT fk_train_timetables_line_id
  FOREIGN KEY (line_id) REFERENCES subway_lines (line_id) ON DELETE RESTRICT;      -- 노선별 시간표
-- 8
ALTER TABLE train_timetables ADD CONSTRAINT fk_train_timetables_station_id
  FOREIGN KEY (station_id) REFERENCES stations (station_id) ON DELETE RESTRICT;    -- 역별 도착 시각
-- 9
ALTER TABLE train_timetables ADD CONSTRAINT fk_train_timetables_destination_station_id
  FOREIGN KEY (destination_station_id) REFERENCES stations (station_id) ON DELETE SET NULL;  -- 종착역은 부가 정보이므로 NULL 허용
-- 10
ALTER TABLE places ADD CONSTRAINT fk_places_created_by
  FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL;          -- 장소 등록 관리자 참조
-- 11
ALTER TABLE place_stations ADD CONSTRAINT fk_place_stations_place_id
  FOREIGN KEY (place_id) REFERENCES places (place_id) ON DELETE CASCADE;           -- 장소 1개는 여러 인근 역과 연결
-- 12
ALTER TABLE place_stations ADD CONSTRAINT fk_place_stations_station_id
  FOREIGN KEY (station_id) REFERENCES stations (station_id) ON DELETE RESTRICT;    -- 역 1개 주변에 여러 장소가 존재
-- 13
ALTER TABLE place_images ADD CONSTRAINT fk_place_images_place_id
  FOREIGN KEY (place_id) REFERENCES places (place_id) ON DELETE CASCADE;           -- 장소 1개는 여러 이미지를 가짐
-- 14
ALTER TABLE station_favorites ADD CONSTRAINT fk_station_favorites_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;              -- 회원 1명은 여러 역을 즐겨찾기
-- 15
ALTER TABLE station_favorites ADD CONSTRAINT fk_station_favorites_station_id
  FOREIGN KEY (station_id) REFERENCES stations (station_id) ON DELETE RESTRICT;    -- NULL 허용 시 복합 UNIQUE가 무력화되므로 RESTRICT
-- 16
ALTER TABLE travel_plans ADD CONSTRAINT fk_travel_plans_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;              -- 회원 1명은 여러 계획을 작성
-- 17
ALTER TABLE travel_plans ADD CONSTRAINT fk_travel_plans_start_station_id
  FOREIGN KEY (start_station_id) REFERENCES stations (station_id) ON DELETE RESTRICT;  -- 출발역 참조
-- 18
ALTER TABLE travel_plans ADD CONSTRAINT fk_travel_plans_end_station_id
  FOREIGN KEY (end_station_id) REFERENCES stations (station_id) ON DELETE RESTRICT;    -- 도착역 참조
-- 19
ALTER TABLE travel_plan_items ADD CONSTRAINT fk_travel_plan_items_plan_id
  FOREIGN KEY (plan_id) REFERENCES travel_plans (plan_id) ON DELETE CASCADE;       -- 계획 1건은 여러 방문 장소를 가짐
-- 20
ALTER TABLE travel_plan_items ADD CONSTRAINT fk_travel_plan_items_place_id
  FOREIGN KEY (place_id) REFERENCES places (place_id) ON DELETE RESTRICT;          -- 회원 계획이 참조 중인 장소
-- 21
ALTER TABLE travel_plan_items ADD CONSTRAINT fk_travel_plan_items_station_id
  FOREIGN KEY (station_id) REFERENCES stations (station_id) ON DELETE SET NULL;    -- 경유역은 부가 정보이므로 NULL 허용
-- 22
ALTER TABLE reviews ADD CONSTRAINT fk_reviews_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;              -- 회원 1명은 여러 후기를 작성
-- 23
ALTER TABLE reviews ADD CONSTRAINT fk_reviews_start_station_id
  FOREIGN KEY (start_station_id) REFERENCES stations (station_id) ON DELETE RESTRICT;  -- 출발역 참조
-- 24
ALTER TABLE reviews ADD CONSTRAINT fk_reviews_end_station_id
  FOREIGN KEY (end_station_id) REFERENCES stations (station_id) ON DELETE RESTRICT;    -- 도착역 참조
-- 25
ALTER TABLE reviews ADD CONSTRAINT fk_reviews_plan_id
  FOREIGN KEY (plan_id) REFERENCES travel_plans (plan_id) ON DELETE SET NULL;      -- 후기에 가져온 여행 동선 계획
-- 26
ALTER TABLE review_media ADD CONSTRAINT fk_review_media_review_id
  FOREIGN KEY (review_id) REFERENCES reviews (review_id) ON DELETE CASCADE;        -- 후기 1건은 여러 첨부 파일을 가짐
-- 27
ALTER TABLE review_tags ADD CONSTRAINT fk_review_tags_review_id
  FOREIGN KEY (review_id) REFERENCES reviews (review_id) ON DELETE CASCADE;        -- 후기 1건은 여러 태그를 가짐
-- 28
ALTER TABLE notices ADD CONSTRAINT fk_notices_admin_id
  FOREIGN KEY (admin_id) REFERENCES users (user_id) ON DELETE SET NULL;            -- 공지사항 작성 관리자 참조
-- 29
ALTER TABLE line_view_logs ADD CONSTRAINT fk_line_view_logs_line_id
  FOREIGN KEY (line_id) REFERENCES subway_lines (line_id) ON DELETE RESTRICT;      -- 노선별 조회 로그
-- 30
ALTER TABLE line_view_logs ADD CONSTRAINT fk_line_view_logs_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE SET NULL;             -- 비회원 조회는 NULL
-- 31
ALTER TABLE board_posts ADD CONSTRAINT fk_board_posts_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;              -- 작성자 탈퇴 시 게시글 삭제
-- 32
ALTER TABLE board_posts ADD CONSTRAINT fk_board_posts_plan_id
  FOREIGN KEY (plan_id) REFERENCES travel_plans (plan_id) ON DELETE SET NULL;      -- 연계 계획 삭제 시 NULL(게시글 유지)
-- 33
ALTER TABLE post_participants ADD CONSTRAINT fk_post_participants_post_id
  FOREIGN KEY (post_id) REFERENCES board_posts (post_id) ON DELETE CASCADE;        -- 모집 글 삭제 시 참여 신청 내역도 함께 삭제
-- 34
ALTER TABLE post_participants ADD CONSTRAINT fk_post_participants_user_id
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;              -- 신청자 탈퇴 시 신청 내역 삭제(개인 데이터)


-- =====================================================================
-- 조회 성능용 인덱스 (3건)
--
-- PK / UNIQUE / FK 인덱스는 위에서 이미 만들어진다.
-- InnoDB 는 FK 를 만들 때 자식 컬럼에 인덱스를 자동 생성하므로,
-- FK 컬럼을 선두로 하는 인덱스는 뒤쪽 정렬 컬럼만 새로 얻는다.
-- 수백 행 규모의 테이블은 풀 스캔이 더 빠르므로 대상에서 제외했다.
--
-- 이력 : migrations/001__add_indexes.sql
-- =====================================================================

-- 역별 배차표 조회. train_timetables 는 가장 큰 테이블이며 인덱스가 없으면
-- 매 조회마다 전체를 훑는다. 등호 조건 3개 뒤에 정렬 컬럼을 배치했으며
-- 순서를 바꾸면 인덱스를 타지 않는다.
CREATE INDEX idx_timetables_lookup
  ON train_timetables (station_id, day_type, direction, arrival_time);

-- 역명 검색. 서비스의 첫 진입 경로이고 노선 추가에 따라 계속 늘어난다.
-- 앞 일치 검색 전제이며, 중간 일치가 필요해지면 FULLTEXT 로 전환한다.
CREATE INDEX idx_stations_name ON stations (station_name);

-- 인기 노선 집계(CM-003). 조회 1회당 1행씩 쌓여 가장 빨리 커지는 테이블이다.
-- 기간 조건이 선두여야 하며, 순서를 바꾸면 걸리지 않는다.
CREATE INDEX idx_line_view_logs_time ON line_view_logs (viewed_at, line_id);


-- ---------------------------------------------------------------------
-- 보류 항목 — 조건이 맞으면 migrations/ 에 추가한 뒤 이곳에 병합한다
-- ---------------------------------------------------------------------
-- 열차 여정 추적(WHERE train_no = ?)을 실제로 사용할 때
-- CREATE INDEX idx_timetables_train ON train_timetables (train_no, day_type, direction);
--
-- 노선도 화면을 자주 그린다면. uk_line_stations 가 line_id 필터까지는 이미 커버
-- CREATE INDEX idx_line_stations_order ON line_stations (line_id, station_order);
--
-- 목록 조회용. 대상 테이블이 비어 있고 백엔드 쿼리 모양이 미확정
-- CREATE INDEX idx_board_posts_created ON board_posts (created_at DESC);
-- CREATE INDEX idx_reviews_created     ON reviews (created_at DESC);
-- CREATE INDEX idx_review_tags_name    ON review_tags (tag_name, review_id);
-- CREATE INDEX idx_board_posts_recruit ON board_posts (recruit_status, recruit_deadline);
