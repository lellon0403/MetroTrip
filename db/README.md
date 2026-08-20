# 데이터베이스

MetroTrip 서비스의 데이터베이스 스키마와 관련 산출물입니다.

> 현재 서비스는 MySQL V1.12를 주 DB로 사용하고 Oracle V1.12를 장애 시 읽기 대체본으로 사용합니다.
> 초기화는 baseline 스키마와 번호순 시드를 적용하며, 기존 DB는 마이그레이션 이력을 순서대로 적용합니다.

---

## 폴더 구성

| 경로 | 내용 |
| --- | --- |
| `schema/mysql/` | 현재 시점의 MySQL 테이블 구조 (baseline, 서비스 주 DB) |
| `schema/oracle/` | Oracle 백업 DB 테이블 구조 (MySQL 장애 시 읽기 전용 대체 조회용) |
| `migrations/` | 스키마 변경 이력. 번호 순서대로 실행 |
| `seed/` | 초기 데이터 |
| `erd/` | ERD 파일 |

---

## 초기 세팅

MySQL 8.0 기준입니다. 스크립트 상단에 `CREATE DATABASE` 문이 포함되어 있으므로 별도 생성이 필요 없습니다.

```sql
CREATE DATABASE IF NOT EXISTS metrotrip
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;
```

`utf8mb4_0900_ai_ci` 는 MySQL 8.0 의 기본 콜레이션입니다. 대소문자·악센트를 구분하지 않으므로
영문 태그 검색과 역명 검색이 의도대로 동작합니다.

### 실행 순서

**새로 만드는 경우**

1. `schema/mysql/schema_mysql_V1.12.sql`
2. `seed/` 하위 파일을 **번호 순서대로**. 파일명 앞 번호가 FK 의존 순서입니다.

Oracle 백업 DB를 별도로 구성하는 경우 `schema/oracle/schema_oracle_V1.12.sql`을 사용합니다 (Oracle Database 19c 기준, MySQL 장애 시 읽기 전용 대체 조회 용도).

| 파일 | 테이블 | 건수 | 선행 |
| --- | --- | --- | --- |
| `seed_01_users.sql` | `users` | 5 | — |
| `seed_02_line1.sql` | `subway_lines` / `stations` / `line_stations` | 2 / 100 / 145 | — |
| `seed_03_line4.sql` | `subway_lines` / `stations` / `line_stations` 추가 | 1 / 47 / 51 | 02 |
| `seed_04_line2.sql` | `subway_lines` / `stations` / `line_stations` 추가 | 3 / 46 / 53 | 02, 03 |
| `seed_05_places.sql` | `places` | 331 | 01 |
| `seed_06_place_stations.sql` | `place_stations` | 331 | 02, 05 |
| `seed_07_place_images.sql` | `place_images` | 29 | 05 |
| `seed_08_train_timetables.sql` | `train_timetables` | 1,690 | 02 |
| `seed_09_boards_dummy.sql` | 후기·모집 데모 데이터 | 후기 6 / 모집글 5 | 01, 02, 05 |

각 파일 상단에 재적재용 `DELETE` 문이 주석으로 들어 있습니다.
`seed_01_users.sql` 의 비밀번호는 전건 `test1234` 의 scrypt 해시이며 테스트 전용입니다.

**이미 만들어둔 DB 가 있는 경우**

`migrations/` 하위 파일을 번호 순서대로 실행합니다.

| 파일 | 내용 |
| --- | --- |
| `001__add_indexes.sql` | 조회 성능용 인덱스 3건 |
| `002__add_travel_plan_share_links.sql` | 여행 계획 공유 링크 테이블 신설 |
| `003__alter_plan_items_add_type_position.sql` | `travel_plan_items` 에 `item_type`·`position` 추가 |

`003` 은 여러 번 실행해도 안전합니다. 각 단계 앞에서 적용 여부를 확인해 이미 반영된 구간은
건너뛰므로, 중간에 실패해 일부만 적용된 DB 에도 그대로 쓸 수 있습니다.
저장소에는 별도 Oracle `003` 마이그레이션이 없으며, 새 Oracle 읽기 대체본은
`schema/oracle/schema_oracle_V1.12.sql` 기준으로 초기화합니다.

### 실행 결과 확인

```sql
-- 테이블 23개
SHOW TABLES;

-- PRIMARY KEY 23 / UNIQUE 11 / FOREIGN KEY 35
SELECT constraint_type, COUNT(*)
FROM information_schema.table_constraints
WHERE table_schema = 'metrotrip'
GROUP BY constraint_type;

-- CHECK 24
SELECT COUNT(*) FROM information_schema.check_constraints
WHERE constraint_schema = 'metrotrip';
```

> PK 이름은 MySQL 이 항상 `PRIMARY` 로 저장합니다. 스크립트의 `pk_*` 는 문서용 표기입니다.

---

## 스키마 현황

| 항목 | 수 |
| --- | --- |
| 테이블 | 23 |
| 컬럼 | 148 |
| PRIMARY KEY | 23 |
| UNIQUE | 11 |
| FOREIGN KEY | 35 (CASCADE 16 / RESTRICT 13 / SET NULL 6) |
| CHECK | 24 |

### 테이블 목록

| 도메인 | 테이블 |
| --- | --- |
| 회원 | `users` `user_agreements` `social_accounts` `auth_tokens` `email_verifications` |
| 지하철 | `subway_lines` `stations` `line_stations` `train_timetables` `line_view_logs` |
| 장소 | `places` `place_stations` `place_images` |
| 회원 활동 | `station_favorites` `travel_plans` `travel_plan_items` `travel_plan_share_links` `reviews` `review_media` `review_tags` |
| 게시판 | `board_posts` `post_participants` |
| 공지 | `notices` |

---

## 설계 시 정한 것들

작업 중 자주 되묻게 되는 항목만 추렸습니다. 전체 근거는 데이터베이스 명세서를 참고하세요.

**회원 탈퇴 시 콘텐츠 처리**
회원이 남긴 콘텐츠는 **모두 함께 삭제**합니다. 후기(`reviews`)와 게시글(`board_posts`) 모두
`ON DELETE CASCADE` 이며, 첨부 미디어·태그·참여 신청 내역까지 연쇄로 지워집니다.
예외는 관리자 권한으로 작성한 데이터입니다. `places.created_by` 와 `notices.admin_id` 는
`SET NULL` 로 두어, 관리자 계정이 사라져도 장소·공지는 서비스에 남습니다.

**모집 글 삭제 시 참여 신청 처리**
`post_participants` 는 `board_posts` 에 CASCADE 로 묶여 있어, 작성자가 탈퇴하면 참여 신청 내역이
DB 레벨에서 함께 삭제됩니다. 현재 삭제 흐름은 별도의 참여자 알림을 생성하지 않습니다.

**마스터 테이블 FK 정책**
`subway_lines` `stations` `places` 를 참조하는 FK 는 `ON DELETE RESTRICT` 로 통일했습니다.
예외는 `train_timetables.destination_station_id`(종착역) 하나뿐입니다. 부가 정보이므로 `SET NULL` 입니다.

`travel_plan_items.station_id` 도 예전에는 예외였으나 `SET NULL` → `RESTRICT` 로 바꿨습니다.
`item_type = 'STATION'` 항목의 필수값이 되면서, 역이 삭제되어 NULL 이 되면
`ck_tpi_item_reference` 를 위반하기 때문입니다. MySQL 은 `ON DELETE SET NULL` 인 컬럼을
CHECK 조건에 넣지 못하게 막습니다(Error 3823).

**역 코드를 보유하지 않습니다**
`stations` 에 외부 코드 컬럼이 없습니다. 공공데이터 출처마다 체계가 달라
(서울교통공사 외부코드 / 코레일 역코드) 한 컬럼에 담으면 조인 키로 쓸 수 없기 때문입니다.
역 참조는 `station_id`, 외부 API 조회는 호선·역명·방향 조합으로 처리합니다.
역명은 부역명(괄호)을 제외한 정식 역명으로 저장합니다. `신창(순천향대)` 이 아니라 `신창` 입니다.

**노선 분기 처리**
물리적으로 갈라지는 노선은 갈래별로 `line_id` 를 나눕니다. 현재 1호선은 인천·신창 2개,
2호선은 본선·성수지선·신정지선 3개 구간이고, 분기 없는 4호선은 1개 구간입니다.
공유역은 `stations`에 1행만 두고 각 구간의 `line_stations`에 중복 매핑합니다.
`station_order` 는 노선 안에서의 순서(상행 기점 기준)이며, 방향은 정렬 순서로 표현합니다.

```sql
-- 인천 방면(하행)
ORDER BY station_order ASC
-- 연천 방면(상행)
ORDER BY station_order DESC
```

**열차 시간표**
`train_no`(열차번호)로 동일 열차의 역별 정차 시각을 묶습니다. 이게 없으면 역 단위 배차표만
조회할 수 있고 A역 → B역 소요 시간은 계산할 수 없습니다.
`arrival_time` 과 `departure_time` 은 **둘 다 NULL 을 허용**합니다. 시발역은 도착시각이,
종착역은 출발시각이 존재하지 않기 때문입니다. 조회 시에는 `COALESCE` 로 처리하세요.

```sql
ORDER BY COALESCE(departure_time, arrival_time)
```

`day_type` 은 `WEEKDAY` / `WEEKEND` 2종입니다. 코레일 광역철도는 토·일 시간표가 동일합니다.
자정 이후 출발 열차(`00:06:00` 등)가 있으므로 "현재 시각 이후 열차" 조회 시 주의가 필요합니다.

**인원 모집 게시판**
`board_posts` 는 인원 모집 전용입니다. 일반 게시판 기능은 서비스 범위에서 제외했습니다.
`recruit_capacity` `recruit_deadline` `recruit_status` 는 모두 **필수**이며,
`recruit_status` 는 `DEFAULT 'RECRUITING'` 이라 생성 시 값을 넣지 않아도 모집중으로 시작합니다.

현재 모집 인원은 `post_participants` 에서 `status = 'ACCEPTED'` 건수를 세어 구합니다.
저장 컬럼이 아니라 **집계값**이라는 점에서 애플리케이션이 지켜야 할 규칙이 세 가지 있습니다.

- **동시 수락 시 정원 초과** — 두 요청이 동시에 정원 검사를 통과할 수 있습니다.
  수락 처리 트랜잭션에서 게시글 행을 `SELECT ... FOR UPDATE` 로 잠가야 합니다.
- **정원이 찼을 때** — 같은 트랜잭션 안에서 `recruit_status` 를 `CLOSED` 로 갱신합니다.
  안 하면 정원이 다 찼는데도 화면에는 모집중으로 남습니다.
- **마감일 경과** — 자동 마감 배치가 없으므로 `recruit_status` 는 `RECRUITING` 인 채로 남습니다.
  신청 차단뿐 아니라 **목록 조회 필터에도** `recruit_deadline` 조건이 들어가야 합니다.

취소·거절 후 재신청은 `(post_id, user_id)` 복합 UNIQUE 때문에 새 행을 넣을 수 없습니다.
기존 행을 `APPLIED` 로 되돌리는 방식으로 처리합니다.

**여행 계획 공유 링크**
`travel_plan_share_links` 는 계획을 읽기 전용으로 공유하는 링크를 담습니다.
**토큰 원문은 저장하지 않고 SHA-256 해시만 보관**하므로 DB 가 유출돼도 링크를 복원할 수 없습니다.
`auth_tokens.refresh_token`, `email_verifications.code_hash` 와 같은 방식입니다.

계획 1건에 여러 링크를 발급할 수 있고, 만료(`expires_at`)와 폐기(`revoked_at`)를 분리해 관리합니다.
유효한 링크 조회 조건은 아래와 같습니다.

```sql
WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()
```

`created_at` 이 `DEFAULT CURRENT_TIMESTAMP` 이므로 **INSERT 시 `created_at` 을 명시해야**
`CHECK (expires_at > created_at)` 이 의도대로 평가됩니다.

**여행 계획 항목**
`travel_plan_items` 는 `item_type` 으로 역(`STATION`)과 장소(`PLACE`)를 구분합니다.
역 자체를 동선에 담을 수 있어 "천안역 → 역전시장 → 달식당 → 온양온천역" 같은 계획을 표현합니다.

```
position 1 : STATION  천안역
position 2 : PLACE    천안역전시장
position 3 : PLACE    달식당
position 4 : STATION  온양온천역
```

`ck_tpi_item_reference` 가 조합을 강제합니다. STATION 이면 `station_id` 필수에 `place_id` 는 NULL,
PLACE 면 `place_id` 가 필수입니다.

동선 순서는 `position` 오름차순으로 결정합니다. 시각과 분리되어 있어 `visit_time` 없이도
순서를 정할 수 있고, 드래그로 재배치할 때 시각을 건드리지 않아도 됩니다.

```sql
ORDER BY `position`, plan_item_id
```

`POSITION` 은 MySQL 내장 함수명입니다. 실행에는 문제가 없지만 워크벤치 편집기가 문법 오류로
표시하므로 쿼리에서는 백틱으로 감싸는 편이 좋습니다.

`(plan_id, position)` UNIQUE 는 걸지 않았습니다. 드래그 재배치 중 순서를 맞바꾸는 순간
일시적으로 중복이 생겨 제약에 걸릴 수 있기 때문입니다.

**장소 대표 이미지**
`places` 에 썸네일 컬럼이 없습니다. `place_images` 에서 `sort_order` 값이 가장 작은 행이 대표 이미지입니다.
`(place_id, sort_order)` 복합 UNIQUE 로 순서 중복을 막습니다.

**태그 대소문자**
영문 태그는 **애플리케이션에서 소문자로 변환한 뒤** 저장합니다. 검색어에도 같은 변환을 적용해야 합니다.
한글·숫자 태그는 정규화 대상이 아닙니다.

**수정 시각**
`updated_at` 에 `ON UPDATE CURRENT_TIMESTAMP` 를 걸었습니다.
**UPDATE 문에서 값을 넣지 않아도 자동으로 갱신됩니다.** 적용 대상은
`users` `places` `travel_plans` `reviews` `notices` `board_posts` 입니다.

**인덱스**
아래 별도 섹션에서 다룹니다. 후보 목록과 우선순위는 데이터베이스 명세서의 인덱스 시트에 있습니다.

---

## 인덱스

### 인덱스가 하는 일

책 뒤의 색인과 같습니다. 없으면 조건에 맞는 행을 찾기 위해 테이블을 처음부터 끝까지 읽고(풀 스캔),
있으면 해당 위치로 바로 갑니다.

**인덱스는 컬럼이 아닙니다.** 데이터를 담지 않고 기존 컬럼을 정렬해 둔 보조 구조일 뿐입니다.
그래서 아래가 성립합니다.

- `SELECT` 대상이 될 수 없습니다. 쿼리에 인덱스 이름을 쓰지 않습니다
- 인덱스를 만들어도 **쿼리를 고칠 필요가 없습니다.** MySQL 이 알아서 판단해 사용합니다
- 잘못 만들어도 **결과가 틀리지 않습니다.** 느려질 뿐입니다
- `DROP INDEX` 한 줄로 원상복구됩니다

되돌리기가 가장 쉬운 결정이라 부담 없이 실험할 수 있습니다.
반대로 UNIQUE 는 데이터가 쌓인 뒤 추가하면 중복 때문에 실패하므로 성격이 다릅니다.

### 대가

- INSERT·UPDATE·DELETE 마다 인덱스도 함께 갱신 → 쓰기가 느려집니다
- 디스크 공간을 차지합니다
- 너무 많으면 옵티마이저가 엉뚱한 인덱스를 고르기도 합니다

그래서 "일단 다 만들어두자" 는 통하지 않습니다.
**행이 수백 개인 테이블에서는 풀 스캔이 더 빠릅니다.** 인덱스를 만들어도 옵티마이저가 무시합니다.

### FK 컬럼에는 이미 인덱스가 있습니다

InnoDB 는 FK 를 만들 때 자식 컬럼에 인덱스를 자동 생성합니다.
`(user_id, created_at)` 같은 복합 인덱스는 `user_id` 부분이 이미 커버되어 있고
**뒤의 정렬 컬럼만 새로 얻는 것**입니다. 효과를 과대평가하지 마세요.

UNIQUE 제약도 인덱스 역할을 겸합니다. 예를 들어 `uk_line_stations (line_id, station_id)` 가 있으면
`WHERE line_id = ?` 조회는 이미 인덱스를 탑니다.

---

### 현재 적용 — 3건

없으면 실제로 느려지거나, 나중에 만들면 비싸지는 것들입니다.

```sql
-- 역별 배차표의 station_id/day_type/direction 필터
CREATE INDEX idx_timetables_lookup
  ON train_timetables (station_id, day_type, direction, arrival_time);

-- 역명 정확·앞 일치 검색. 현재 중간 일치 검색은 이 인덱스를 사용하지 못한다
CREATE INDEX idx_stations_name ON stations (station_name);

-- 노선 조회 로그. 조회 1회당 1행씩 쌓여 가장 빨리 커진다
-- 성능이 아니라 '시점' 때문에 미리 만든다. 커진 뒤 만들면 그동안 테이블이 잠긴다
CREATE INDEX idx_line_view_logs_time ON line_view_logs (viewed_at, line_id);
```

### 선택 — 조건이 맞으면

```sql
-- 열차 여정 추적(WHERE train_no = 'K1904')을 실제로 쓸 때만
CREATE INDEX idx_timetables_train ON train_timetables (train_no, day_type, direction);

-- 노선도 화면을 자주 그린다면. uk_line_stations 가 line_id 필터까지는 이미 커버한다
CREATE INDEX idx_line_stations_order ON line_stations (line_id, station_order);
```

목록 조회용 4건은 대상 테이블이 비어 있어 지금은 효과가 0 입니다.
다만 **비어 있을 때 만드는 비용도 0** 이므로, 백엔드에서 쿼리 모양이 확정됐다면 미리 넣어도 됩니다.
확정 전이라면 컬럼 순서를 다시 잡게 되므로 미루세요.

```sql
CREATE INDEX idx_board_posts_created ON board_posts (created_at DESC);
CREATE INDEX idx_reviews_created     ON reviews (created_at DESC);
CREATE INDEX idx_review_tags_name    ON review_tags (tag_name, review_id);
CREATE INDEX idx_board_posts_recruit ON board_posts (recruit_status, recruit_deadline);
```

`idx_review_tags_name` 이 `review_id` 를 포함하는 이유는 **커버링 인덱스** 구성 때문입니다.
필요한 컬럼이 인덱스 안에 다 있으면 테이블을 읽지 않고 인덱스만 보고 답합니다.

### 만들지 않습니다

| 인덱스 | 이유 |
| --- | --- |
| `idx_place_stations_lookup` | 수십 행. 풀 스캔이 더 빠름 |
| `idx_email_verif_lookup` | 만료 후 삭제되는 테이블이라 거의 비어 있음 |
| `idx_notices_type` | 공지는 거의 쌓이지 않음 |
| `idx_auth_tokens_active` | FK 자동 인덱스가 `user_id` 를 이미 커버 |
| `idx_post_participants_post` | `uk_post_participants` 가 `post_id` 로 시작 |
| `idx_*_user` 4건 | FK 자동 인덱스 + 회원당 데이터가 소량 |

마지막 항목은 `board_posts` `reviews` `travel_plans` `post_participants` 의 "내 ~ 목록" 인덱스입니다.

---

### 적용 방법

`migrations/` 에 번호 파일로 추가하고 팀 채널에 알립니다.
이전 변경분은 `schema/` 에 병합되어 있으므로 이번 파일이 `001` 입니다.

```sql
-- migrations/001__add_indexes.sql
CREATE INDEX idx_timetables_lookup
  ON train_timetables (station_id, day_type, direction, arrival_time);
CREATE INDEX idx_stations_name ON stations (station_name);
CREATE INDEX idx_line_view_logs_time ON line_view_logs (viewed_at, line_id);

-- rollback:
-- DROP INDEX idx_timetables_lookup ON train_timetables;
-- DROP INDEX idx_stations_name ON stations;
-- DROP INDEX idx_line_view_logs_time ON line_view_logs;
```

### 확인 방법

만들기 전후로 같은 쿼리에 `EXPLAIN` 을 붙여 비교합니다.

```sql
EXPLAIN SELECT arrival_time, departure_time, destination_station_id
FROM train_timetables
WHERE station_id = 93 AND day_type = 'WEEKDAY' AND direction = 'UP';
```

| 칼럼 | 볼 것 |
| --- | --- |
| `key` | 사용된 인덱스 이름. `NULL` 이면 안 타는 것 |
| `rows` | 읽을 것으로 추정한 행 수. 작을수록 좋음 |
| `type` | `ALL` 이면 풀 스캔. `ref` / `range` 면 인덱스 사용 |

현재 만들어진 인덱스 목록은 이렇게 봅니다.

```sql
SELECT table_name, index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS 컬럼
FROM information_schema.statistics
WHERE table_schema = 'metrotrip'
GROUP BY table_name, index_name
ORDER BY table_name, index_name;
```

### 인덱스가 걸리지 않는 경우

만들어도 무력화되는 패턴이 있습니다.

- **컬럼에 함수를 씌울 때** — `ORDER BY COALESCE(departure_time, arrival_time)` 은 정렬에 인덱스를 쓰지 못합니다. 필터링까지만 인덱스가 걸립니다
- **선두 컬럼을 건너뛸 때** — `(station_id, day_type, direction)` 인덱스에 `WHERE day_type = ?` 만 주면 타지 않습니다
- **중간 일치 검색** — `LIKE '%천안%'` 은 인덱스를 못 씁니다. 앞 일치(`'천안%'`)만 가능하며, 중간 일치가 필요하면 FULLTEXT 로 전환해야 합니다

---

## 초기 데이터 현황

| 테이블 | 건수 | 출처 |
| --- | --- | --- |
| `subway_lines` | 6 | 1호선 2구간 / 2호선 3구간 / 4호선 1구간 |
| `stations` | 193 | 국가철도공단 주소데이터 · 전국도시철도역사정보 표준데이터 |
| `line_stations` | 249 | 노선 구간별 공유역 중복 매핑 포함 |
| `places` | 331 | TourAPI 33건 + 카카오 로컬 API 298건 |
| `place_stations` | 331 | 역-장소 거리 기준 매핑 |
| `place_images` | 29 | TourAPI 33건 중 대표 이미지가 있는 장소 |
| `train_timetables` | 1,690 | 국가철도공단 열차 시간표 (기준일자 20260225) |

시간표 원본에는 기준일자가 다른 6개 스냅샷이 누적되어 있습니다.
**유효종료가 비어 있는 현행 스냅샷 1개만 적재**해야 하며, 전부 넣으면 동일 열차가 최대 6번 조회됩니다.

시간표 커버리지는 천안·아산 구간 8개 역(천안·성환·두정·봉명·쌍용·아산·배방·온양온천)입니다.
나머지 185개 역은 시간표가 없습니다.

---

## 하지 말아야 할 것

- 접속 정보·비밀번호를 커밋하지 않습니다. `.env` 를 사용하고 `.env.example` 에 키 이름만 공유합니다.
- 회원 데이터 덤프를 커밋하지 않습니다. 개인정보입니다.
- 운영 중인 DB 에서 `schema/` 의 DROP TABLE 블록을 실행하지 않습니다.

---

## 관련 문서

| 문서 | 위치 |
| --- | --- |
| 데이터베이스 명세서 V1.12 | 팀 공유 드라이브 |
| 요구사항 정의서 V1.3 | [Google Sheets](https://docs.google.com/spreadsheets/d/1VoXGmwvz8NwPQYi8wy_9lcEH0s8k9UKr7djuU2-z6Ss/edit) |
| ERD | `erd/ERD_V1.12.mmd` |
| 백엔드 실행·구조 | [backend/README.md](../backend/README.md) |
| DB 장애 전환 | [docs/DB-FAILOVER.md](../docs/DB-FAILOVER.md) |
| 완료 전 백엔드 인수인계 기록 | [docs/BACKEND-HANDOFF.md](../docs/BACKEND-HANDOFF.md) |

담당: 김유진
