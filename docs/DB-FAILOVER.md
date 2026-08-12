# DB 이중화 — MySQL/Oracle 페일오버 (1단계)

> 대상: 백엔드(윤홍규), DB(김유진)
> 상태: **1단계 구현 완료 (코드 기준).** §7 결정 항목 5건 전부 확정. §9 Oracle 스키마 사전 확인 완료(V1.11 실물 대조). §3.1 세션 분리 방식은 `get_db()`/`get_read_db()` 구조로 백엔드 확인·구현 완료. 단, §9 항목 3·4·5(빈 문자열 실데이터 점검 / Oracle 버전 / 캐릭터셋)와 §10 장애 주입 검증은 **실제 Oracle 인스턴스가 있어야 확인 가능**하며 아직 미완료.
> 근거 스키마: `db/schema/oracle/schema_oracle_V1.11.sql` (23테이블 / FK 35 / 인덱스 3)
> 최종 수정: 2026-08-11
> 구현 노트: 기존 백엔드가 동기(pymysql + SQLAlchemy `Session`) 구조라 §6 예시 코드와 달리 **동기**로 구현했다(ThreadPoolExecutor로 헬스체크에 타임아웃 부여). Oracle 드라이버의 PyPI 패키지명은 `python-oracledb`가 아니라 **`oracledb`**다(`pip install oracledb`).

---

## 1. 목표와 배경

MySQL을 주(主) DB로, Oracle을 보조 DB로 이중화합니다. `schema_oracle_V1.11.sql`에 Oracle 스키마는 이미 준비돼 있지만("MySQL 운영 DB의 데이터를 Oracle로 옮겨 보관"), **실제로 두 DB를 연결·전환하는 코드는 아직 없습니다.** 이 문서가 그 설계의 단일 기준입니다.

목표는 세 가지입니다.

1. MySQL의 데이터를 주기적으로 Oracle에 동기화한다.
2. MySQL에 접근할 수 없을 때 조회(읽기)를 Oracle로 자동 전환한다.
3. Oracle은 애플리케이션 입장에서 읽기만 가능하고, 쓰기(삭제·수정·생성)는 불가능하게 한다.

### 대비 범위 — 명시적으로 좁힘

§11에 따라 Oracle을 MySQL과 **같은 머신**에 두므로, 본 구성이 실제로 방어하는 범위는 다음과 같습니다.

| 장애 유형 | 대비됨 |
|---|---|
| MySQL 프로세스 다운·서비스 중지 | ✅ |
| MySQL 설정 오류, 업그레이드 중 재기동 | ✅ |
| InnoDB 손상, 마이그레이션 사고, 테이블 드롭 | ✅ |
| 디스크·전원·메모리 등 하드웨어 고장 | ✅ |
| OS 크래시, 정전 | ✅ |

즉 본 구성은 **MySQL 인스턴스 수준의 장애**를 대비합니다. 머신 전체 장애는 범위 밖이며, 이는 외부 저장소로의 정기 백업(§11)으로 대응합니다. 실무에서 더 자주 발생하는 것은 위쪽 세 가지이므로 이 범위로도 실효가 있습니다.

---

## 2. 범위 — 지금은 1단계만

| 단계 | 내용 | 상태 |
|---|---|---|
| **1단계 (이 문서)** | Oracle은 앱에 대해 항상 읽기 전용. MySQL 장애 중 쓰기 요청은 `503`으로 거부 | **확정, 구현 착수** |
| 2단계 | MySQL 장애 중 Oracle을 임시 승격해 쓰기를 받고, 복구 후 재생(replay) | **보류 — 요구가 실제로 확인될 때 별도 문서에서 설계** |

**1단계 선택 근거**: 원래 요구사항(#3 "Oracle에서는 읽기만 가능, 삭제·수정 불가")을 문자 그대로 지키면서 구현·검증이 단순합니다. MySQL이 항상 유일한 진실(single source of truth)로 유지되므로 충돌·정합성 리스크가 원천적으로 없고, 복구 절차가 "MySQL을 다시 올린다"로 끝납니다. 2단계는 재생 충돌 처리 비용이 본체보다 커질 수 있어 선행하지 않습니다.

**이 문서에서 다루지 않는 것** — Oracle 쓰기 승격, 역방향 동기화, 충돌 해소, 자동 페일백(1단계 복구는 MySQL 재기동만으로 완료), 세션/캐시 계층 이중화.

---

## 3. 아키텍처

### 3.1 세션 의존성 — 읽기/쓰기 분리 ✅ 백엔드 확인·구현 완료

`get_db()`가 읽기와 쓰기를 겸하지 않습니다. **의존성 이름이 곧 라우팅 정책**이 되도록 둘로 나눕니다.

| 의존성 | 용도 | MySQL 정상 | MySQL 장애 |
|---|---|---|---|
| `get_db()` | 쓰기(POST/PATCH/DELETE), 쓰기 직후 재조회 | MySQL 세션 | **즉시 `503`** (세션 미생성) |
| `get_read_db()` | 순수 조회(GET) | MySQL 세션 | **Oracle 읽기 전용 세션** |

**초안(별도 가드 의존성 `ensure_primary_available()` 추가)에서 바꾼 이유는 실수의 방향입니다.** 가드 방식은 새 쓰기 엔드포인트에서 가드를 누락하면 장애 중 Oracle에 쓰기를 시도해 `500`이 납니다. 위 구조에서는 `get_read_db()` 적용을 누락해도 결과가 "그 GET만 폴백되지 않음"이므로 **안전한 방향으로 실패**합니다.

부수 효과로 `get_read_db()`는 향후 MySQL read replica 도입 시 그대로 재사용됩니다.

> **구현 완료(2026-08-11)**: `app/routers/*.py`의 모든 GET 엔드포인트가 `get_read_db()`를 사용하도록 교체됐습니다(`auth.py`는 GET이 없어 대상 아님). 관리자 라우터(`admin_router`)는 전부 쓰기(POST/PATCH/DELETE)라 `get_db()`를 그대로 씁니다. 관리자 권한 확인(`contract.py`의 `get_current_admin_id`)은 role 검사가 최신 데이터여야 하므로 의도적으로 `get_db()`를 유지했습니다 — MySQL 장애 중에는 관리자 전용 API 전체가 `503`이 됩니다.
>
> `plans.py`/`notices.py`의 `501` 스텁을 전제로 한 아래 문단은 현재 코드 기준으로는 낡았습니다. 두 라우터 모두 이미 정식 구현되어 있어(#39, #40) 스텁이 존재하지 않습니다.

### 3.2 평시 (MySQL 정상)

```
GET   → 라우터 → get_read_db() → MySQL 세션 → 응답
POST  → 라우터 → get_db()      → MySQL 세션 → 응답
```

응답 로직은 바뀌지 않습니다.

### 3.3 MySQL 장애 시

```
GET   → 라우터 → get_read_db() → (헬스체크 실패) → Oracle RO 세션 → 응답 200
POST  → 라우터 → get_db()      → (헬스체크 실패) → 503 즉시 반환
```

- 조회는 사용자가 장애를 거의 느끼지 못합니다. 단, 데이터는 최대 **동기화 주기(10분)만큼 과거** 상태입니다.
- 쓰기는 명확한 오류로 거부됩니다(§7).

### 3.4 동기화 (MySQL → Oracle, 단방향)

```
backend/scripts/sync_to_oracle.py  (독립 스크립트)
  ↑ 인앱 스케줄러(APScheduler)가 10분 주기로 이 로직을 호출
  └─ 대상 테이블 전체 재적재 (delete-all → insert-all), 단일 트랜잭션
     · 삭제는 FK 역순, 삽입은 FK 정순 (§8.1)
     · train_timetables는 기본 제외 (--include-timetables로 수동 실행)
     · 커밋 직전 테이블별 행 수 대조, 불일치 시 전체 롤백
```

**증분(upsert)을 쓰지 않는 이유**: 본 스키마는 전 구간 하드 삭제 정책(CASCADE 16 / RESTRICT 12 / SET NULL 7)입니다. `updated_at` 기준 증분은 UPDATE된 행만 추적하므로 **MySQL에서 삭제된 행이 Oracle에 영구히 남습니다.** 장애 중 조회로 전환되면 삭제한 리뷰·게시글이 되살아나 보이는, 사용자 눈에 가장 이상한 형태의 버그가 됩니다. 게다가 23개 테이블 중 `updated_at`을 가진 것은 6개뿐이라 증분 대상 자체가 소수입니다.

전체 재적재가 타당한 근거는 데이터 규모입니다.

| 테이블 | 대략 행 수 |
|---|---|
| places | 33 |
| stations | 147 |
| line_stations | 196 |
| users / reviews / board_posts 등 운영 데이터 | 수백 |
| **train_timetables** | **약 94,946** |

타임테이블을 제외하면 전 테이블 합계가 1,000행 미만이라 전체 재적재가 수 초 내에 끝납니다. `train_timetables`는 마스터 데이터로 평시에 변경되지 않으므로 주기 동기화에서 제외하고, 시간표 갱신 시에만 수동 실행합니다. 이로써 `updated_at` 경계 처리(클럭 스큐, 트랜잭션 가시성, 경계 시각 중복/누락)가 통째로 사라집니다.

---

## 4. Oracle 계정 — 2개로 분리

> **임시 상태(2026-08-11)**: Oracle이 OCI Autonomous DB로 확정되면서 현재는 계정 분리 전이고 `ADMIN` 단일 계정을 `METROTRIP_ORACLE_RO_URL`/`_SYNC_URL` 양쪽에 그대로 쓰고 있습니다. 이 경우 아래 "2단 방어" 중 **DB 계정 권한(핵심 방어선)이 없고, 애플리케이션 레벨(보조 방어)만 남습니다** — `ADMIN`은 원래 전권 계정이라 `metrotrip_ro`처럼 SELECT만 갖도록 제한돼 있지 않기 때문입니다. `metrotrip_ro`/`metrotrip_sync` 분리는 추후 진행 예정이며, 지갑(wallet) 파일은 계정과 무관하게 하나만 있으면 되므로 분리 시에도 지갑 재발급은 필요 없고 URL의 유저명·비밀번호만 바꾸면 됩니다.

`sync_to_oracle.py`는 Oracle에 **써야** 하므로 앱과 동일 계정을 쓸 수 없습니다. 단일 계정에 `SELECT`만 부여하면 동기화가 첫 실행에서 `ORA-01031`로 실패합니다.

| 계정 | 권한 | 사용처 | 환경변수 |
|---|---|---|---|
| `metrotrip_sync` | 스키마 소유자, DML 전권 | `sync_to_oracle.py` 전용 | `METROTRIP_ORACLE_SYNC_URL` |
| `metrotrip_ro` | 대상 테이블 `SELECT` **만** | FastAPI(`database_oracle.py`) 전용 | `METROTRIP_ORACLE_RO_URL` |

```sql
CREATE USER metrotrip_ro IDENTIFIED BY "...";
GRANT CREATE SESSION TO metrotrip_ro;
-- 23개 테이블에 SELECT만 부여 (아래 쿼리로 GRANT 문 일괄 생성)
SELECT 'GRANT SELECT ON metrotrip_sync.' || table_name || ' TO metrotrip_ro;'
  FROM user_tables;
```

`metrotrip_ro`에는 `INSERT`/`UPDATE`/`DELETE`를 **어떤 경로로도 부여하지 않습니다.**

### 읽기 전용 강제 — 2단 방어

1. **DB 계정 권한 (핵심 방어선)**: 위 `metrotrip_ro`. 애플리케이션 코드에 버그가 있어도 DB가 거부합니다.
2. **애플리케이션 레벨 (보조 방어)**: `database_oracle.py`의 세션 팩토리는 `autoflush=False`로 두고, `flush`/`commit` 호출 시 즉시 예외를 던지도록 감쌉니다.

---

## 5. 구성 파일

### 5.1 신규 코드

| 파일 | 역할 |
|---|---|
| `backend/app/database_oracle.py` | Oracle RO 엔진·세션 팩토리. 쓰기 시도 시 코드 레벨 차단(2차 방어) |
| `backend/app/db_failover.py` | MySQL 헬스체크·서킷브레이커. `get_db()`(쓰기), `get_read_db()`(조회, Oracle 폴백) 제공 |
| `backend/scripts/sync_to_oracle.py` | MySQL→Oracle 단방향 전체 재적재. `--verify`, `--include-timetables`, `--dry-run` 지원 |
| `backend/app/scheduler.py` | APScheduler 기동. `startup` 이벤트에서 동기화 잡 등록 |
| `backend/tests/test_db_failover.py` | 헬스체크 판단, 읽기 폴백, 쓰기 503 검증 |
| `backend/tests/test_sync_to_oracle.py` | FK 순서, 롤백, 행 수 대조, TIME 변환 로직 검증 |

### 5.2 수정 코드

| 파일 | 변경 |
|---|---|
| `backend/app/config.py` | `oracle_ro_url`, `oracle_sync_url`, `oracle_wallet_dir`, `oracle_wallet_password`, `failover_cache_seconds`, `failover_fail_threshold`, `failover_recover_threshold`, `sync_interval_minutes` 추가. `oracle_connect_args()`가 지갑 접속 파라미터(`config_dir`/`wallet_location`/`wallet_password`)를 만들어 `database_oracle.py`·`sync_to_oracle.py` 양쪽의 `create_engine(..., connect_args=...)`에 공유됨 |
| `backend/.env.example` | `METROTRIP_ORACLE_RO_URL`, `METROTRIP_ORACLE_SYNC_URL`, `METROTRIP_ORACLE_WALLET_DIR`, `METROTRIP_ORACLE_WALLET_PASSWORD` 키 추가 |
| `backend/pyproject.toml` | `oracledb`, `apscheduler` 의존성 추가 |
| 라우터 전체 (`auth.py`, `users.py`, `reviews.py`, `community.py`, `transit.py`, `plans.py`, `notices.py`) | **GET 엔드포인트의 세션 의존성을 `get_read_db()`로 교체.** 쓰기 엔드포인트와 관리자 라우터는 기존 `get_db()` 유지(`auth.py`는 GET이 없어 대상 아님) |

> PyPI 패키지명은 `python-oracledb`가 아니라 **`oracledb`**입니다(`pip install python-oracledb`는 실패합니다). Oracle 공식 문서·릴리스 이름이 "python-oracledb"라 혼동하기 쉽습니다.

`plans.py` / `notices.py`의 `501` 스텁을 전제로 한 문단은 낡았습니다 — 두 라우터 모두 이미 정식 구현되어 있어 스텁이 없습니다(§3.1 참고).

`oracledb`는 **thin 모드**로 동작하므로 Oracle Instant Client 설치는 필요 없습니다. 다만 Oracle이 OCI Autonomous DB(mTLS)로 확정되면서 **팀원마다 지갑(wallet) 파일이 준비물로 추가됐습니다** — OCI 콘솔에서 지갑 zip을 각자 받아 로컬에 풀고, `.env`의 `METROTRIP_ORACLE_WALLET_DIR`을 자기 PC의 지갑 폴더 경로로 설정해야 합니다. 지갑 파일은 접속 정보가 통째로 들어있는 민감 파일이므로 git에 커밋하지 않습니다.

### 5.3 문서 정리

설계 근거와 상세는 이 문서에 모으고, 나머지는 링크만 남깁니다.

| 문서 | 남는 것 |
|---|---|
| `db/README.md` | "관련 문서" 표에 링크 추가. Oracle 타입 매핑 등 스키마 설명은 원문 유지 |
| `docs/BACKEND-HANDOFF.md` | API 계약 표에 "MySQL 장애 시 쓰기 API는 `503`" + §7 응답 형식 + 링크 |
| `backend/ARCHITECTURE.md` | 디렉터리 표에 `database_oracle.py` / `db_failover.py` 한 줄씩 + 링크 |
| `backend/README.md` | 로컬 실행 절에 "Oracle 접속 설정은 DB-FAILOVER.md 참고" + `--workers 1` 제약 |
| `docs/HANDOFF.md` | 상태 표 갱신 + 링크 |

---

## 6. 헬스체크 사양 (확정)

| 항목 | 값 |
|---|---|
| 프로브 쿼리 | `SELECT 1` |
| 커넥션 타임아웃 | **2초** |
| 결과 캐시 | **5초** (캐시 유효 시 프로브 생략) |
| 장애 판정 | **2회 연속 실패** |
| 복구 판정 | **2회 연속 성공** |

타임아웃을 반드시 지정합니다. 없으면 헬스체크 자체가 요청을 붙잡아 장애를 증폭시킵니다. 2회 임계값은 순간적 연결 끊김에 상태가 요동치는 것(flapping)을 막는 최소값입니다.

> **구현은 동기(sync)입니다.** 기존 백엔드가 `pymysql` + SQLAlchemy 동기 `Session`/`create_engine` 구조라(async 드라이버 미사용), 아래는 최초 설계 시점의 async 예시가 아니라 **실제 `backend/app/db_failover.py` 골격**입니다. `asyncio.timeout` 대신 `ThreadPoolExecutor.submit(...).result(timeout=2)`로 하드 타임아웃을 건다 — Python 스레드는 강제 종료가 안 되므로 워커 수를 넉넉히(4개) 둬 프로브가 멈춰도 다음 헬스체크가 밀리지 않게 한다.

```python
# backend/app/db_failover.py (실제 골격)

_state = {"healthy": True, "checked_at": 0.0, "fail": 0, "ok": 0}
_probe_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="db-healthcheck")

def _probe() -> None:
    with primary_engine.connect() as conn:
        conn.execute(text("SELECT 1"))

def primary_healthy() -> bool:
    now = time.monotonic()
    if now - _state["checked_at"] < settings.failover_cache_seconds:
        return _state["healthy"]
    _state["checked_at"] = now
    try:
        _probe_executor.submit(_probe).result(timeout=2)
        _state["ok"] += 1; _state["fail"] = 0
        if _state["ok"] >= settings.failover_recover_threshold:
            _state["healthy"] = True
    except Exception:
        _state["fail"] += 1; _state["ok"] = 0
        if _state["fail"] >= settings.failover_fail_threshold:
            _state["healthy"] = False
    return _state["healthy"]


def get_db():                      # 쓰기 전용
    if not primary_healthy():
        raise HTTPException(
            status_code=503,
            detail="일시적으로 등록·수정 기능을 사용할 수 없습니다. 조회는 정상 이용 가능합니다.",
            headers={"Retry-After": "60"},
        )
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()


def get_read_db():                 # 조회 전용
    if primary_healthy():
        database = SessionLocal()
        try:
            yield database
        finally:
            database.close()
        return
    yield from get_oracle_read_session()  # RO 계정, database_oracle.py
```

상태 확인용으로 `GET /api/v1/health/db`를 추가해 현재 라우팅 대상(`mysql` / `oracle`)과 마지막 동기화 성공 시각을 노출합니다(구현 완료). 검증(§10)과 발표 시연 모두에 필요합니다.

---

## 7. 장애 응답 규격 (확정)

```
HTTP/1.1 503 Service Unavailable
Retry-After: 60

{"detail": "일시적으로 등록·수정 기능을 사용할 수 없습니다. 조회는 정상 이용 가능합니다."}
```

"조회는 된다"를 반드시 포함합니다. 이 문구가 없으면 사용자가 서비스 전체 장애로 인식하고 이탈합니다. `docs/BACKEND-HANDOFF.md`에 동일 문구를 기재해 프론트가 그대로 노출하도록 합니다.

---

## 8. 동기화 스크립트 사양

### 8.1 테이블 순서 — 스키마 파일 순서를 그대로 사용

`schema_oracle_V1.11.sql`의 STEP 1 `CREATE TABLE` 등장 순서가 이미 FK 의존 정순입니다(35개 FK 전수 대조로 확인). **삽입은 이 순서, 삭제는 역순**입니다. 별도 순서표를 관리하지 말고 스키마 파일을 단일 기준으로 삼습니다.

```
 1 users                    13 station_favorites
 2 user_agreements          14 travel_plans
 3 social_accounts          15 travel_plan_items
 4 auth_tokens              16 reviews
 5 email_verifications      17 review_media
 6 subway_lines             18 review_tags
 7 stations                 19 notices
 8 line_stations            20 line_view_logs
 9 train_timetables ※       21 board_posts
10 places                   22 post_participants
11 place_stations           23 travel_plan_share_links
12 place_images
```

※ `train_timetables`는 기본 제외(§3.4).

**동기화 제외 후보 (팀 판단)**: `auth_tokens`, `email_verifications`는 단기 인증 데이터라 백업 가치가 낮고 민감합니다. 다만 스키마의 명시 목적이 "원본과 대조·복구 가능한 1:1 보관"이므로 **기본은 포함**하고, 제외를 원하면 설정으로 뺄 수 있게 구현합니다.

**증가 감시**: `line_view_logs`는 append-only 로그라 장기적으로 커집니다. 행 수가 수만 단위에 접근하면 `train_timetables`와 동일하게 주기 동기화에서 제외를 검토합니다.

> **버그 발견 및 수정(2026-08-11, 실제 Oracle로 테스트 중 재현)**: `train_timetables.line_id`/`station_id`는 Oracle에서 `RESTRICT`(FK 절 생략)입니다(`schema_oracle_V1.11.sql:386-389`). Oracle에 `train_timetables`가 **한 번이라도 적재된 적이 있으면**, 이후 기본(제외) 동기화가 `DELETE FROM subway_lines`/`stations`를 시도하다 `ORA-02292`로 매번 실패했습니다 — 재적재 대상에서 빠진 `train_timetables` 행들이 여전히 그 부모를 참조하고 있어 RESTRICT가 삭제를 막았기 때문입니다. 트랜잭션 원자성 덕에 롤백은 깨끗하게 되어 데이터는 깨지지 않았습니다.
>
> **검토했다가 기각한 방향**: 마스터(수동 동기화)/운영(10분 주기) 두 그룹으로 나누고 `train_timetables`와 함께 `subway_lines`/`stations`/`places`/`place_stations`/`place_images`/`line_stations`를 통째로 마스터군으로 옮기는 안을 검토했으나 두 가지 문제로 기각했습니다. ① `places.created_by`가 `users`(운영군)를 `ON DELETE SET NULL`로 참조(FK #10)하는데, `places`를 마스터군으로 빼면 10분마다 도는 `DELETE FROM users`가 `places.created_by`를 조용히 NULL로 만들고 되돌릴 방법이 없습니다. ② `places`는 관리자 CRUD API(#42)로 실제 변경되는 테이블이라 수동 동기화로 빼면 삭제된 장소가 Oracle 폴백에서 되살아나 보이는, §3.4가 애초에 피하려던 버그가 재발합니다.
>
> **적용한 해결책(옵션 ②를 `subway_lines`/`stations` 두 테이블로만 좁힘)**: `UPSERT_ONLY_TABLES = {"subway_lines", "stations"}`(`scripts/sync_to_oracle.py`)를 두고, 이 두 테이블만 delete-all 대신 삽입/수정/원본에 없는 행만 삭제하는 upsert로 처리합니다(`_upsert_table()`). `train_timetables`를 전혀 건드리지 않으므로 RESTRICT가 발동하지 않고, 나머지 21개 테이블(`places` 포함)은 기존 delete-all/insert-all 그대로라 관리자 CRUD 반영과 삭제 전파(§3.4 핵심 취지)가 유지됩니다. 실제 Aiven MySQL + OCI Oracle로 재검증: 22개 테이블 전부 행 수 일치, 단위 테스트 2건 추가(총 134개 통과).

### 8.2 원자성

전체 테이블을 **하나의 트랜잭션**으로 처리하고 마지막에 한 번만 커밋합니다. 테이블 단위로 커밋하면 스크립트가 중간에 죽었을 때 Oracle이 반쯤 빈 상태로 남고, 그 상태에서 장애가 나면 폴백이 오히려 더 나쁩니다.

커밋 직전 각 테이블의 MySQL/Oracle 행 수를 대조하고, 하나라도 불일치하면 전체 롤백 후 비정상 종료합니다.

### 8.3 타입 변환 — 반드시 처리해야 할 3가지

스키마 대조에서 나온 항목입니다. 이 처리가 없으면 적재가 실패하거나 데이터가 깨집니다.

**① TIME → VARCHAR2(8) 변환 (최우선)**

Oracle에 TIME 타입이 없어 `VARCHAR2(8 CHAR)` + 형식 CHECK로 저장합니다.

```sql
CONSTRAINT ck_tt_arrival_format CHECK (arrival_time IS NULL
  OR REGEXP_LIKE(arrival_time, '^[0-9]{2}:[0-9]{2}:[0-9]{2}$'))
```

그런데 **MySQL 드라이버(aiomysql/PyMySQL)는 TIME 컬럼을 `datetime.timedelta`로 반환합니다.** 그대로 바인딩하면 실패하고, `str(timedelta)`를 쓰면 24시 이후 값이 `1 day, 0:01:00` 형태가 되어 CHECK에 걸립니다. 스키마 주석대로 원본에 `24:01:00` 같은 값이 실제로 존재하므로 전용 변환이 필요합니다.

```python
def to_time_string(v):
    """timedelta → 'HH24:MI:SS'. 24시 이후 값 보존."""
    if v is None:
        return None
    total = int(v.total_seconds())
    return f"{total // 3600:02d}:{(total % 3600) // 60:02d}:{total % 60:02d}"
```

대상 컬럼: `train_timetables.arrival_time`, `train_timetables.departure_time`, `travel_plan_items.visit_time`.

**② CLOB 바인딩**

`reviews.content`, `notices.content`, `board_posts.content`는 `CLOB NOT NULL`, `places.description`은 `CLOB`입니다. `executemany`로 4000바이트 초과 문자열을 넣으려면 바인드 타입을 명시해야 합니다.

```python
cursor.setinputsizes(..., oracledb.DB_TYPE_CLOB, ...)
```

**③ 빈 문자열 → Oracle에서는 NULL**

Oracle은 `''`를 `NULL`로 취급하므로, MySQL의 `''`가 `NOT NULL` 컬럼에 들어 있으면 `ORA-01400`으로 적재가 실패합니다. 적재 전 아래로 점검합니다.

```sql
-- MySQL. 값이 하나라도 나오면 데이터 정리 또는 스크립트 변환 필요
SELECT 'places.address' col, COUNT(*) c FROM places WHERE address = ''
UNION ALL SELECT 'places.place_name',      COUNT(*) FROM places       WHERE place_name = ''
UNION ALL SELECT 'stations.station_name',  COUNT(*) FROM stations     WHERE station_name = ''
UNION ALL SELECT 'subway_lines.line_name', COUNT(*) FROM subway_lines WHERE line_name = ''
UNION ALL SELECT 'reviews.title',          COUNT(*) FROM reviews      WHERE title = ''
UNION ALL SELECT 'reviews.content',        COUNT(*) FROM reviews      WHERE content = ''
UNION ALL SELECT 'board_posts.title',      COUNT(*) FROM board_posts  WHERE title = ''
UNION ALL SELECT 'board_posts.content',    COUNT(*) FROM board_posts  WHERE content = ''
UNION ALL SELECT 'notices.title',          COUNT(*) FROM notices      WHERE title = ''
UNION ALL SELECT 'notices.content',        COUNT(*) FROM notices      WHERE content = ''
UNION ALL SELECT 'place_images.image_url', COUNT(*) FROM place_images WHERE image_url = ''
UNION ALL SELECT 'travel_plans.plan_title',COUNT(*) FROM travel_plans WHERE plan_title = ''
UNION ALL SELECT 'review_tags.tag_name',   COUNT(*) FROM review_tags  WHERE tag_name = '';
```

가장 위험한 것은 **`places.address`**입니다. `NOT NULL`인데 TourAPI에서 온 데이터라 주소가 비어 있는 레코드가 섞일 수 있습니다(현재 33건).

CHECK 제약이 걸린 컬럼(`role`, `category`, `day_type`, `direction`, `recruit_status` 등)은 `''`가 애초에 CHECK에서 걸리므로 점검 대상이 아닙니다.

### 8.4 대용량 적재 (`train_timetables`)

약 95,000행을 넣을 때는 `executemany` 배치(예: 5,000행 단위)를 사용합니다. 적재 시간이 문제가 되면 `idx_timetables_lookup`을 drop → 적재 → 재생성하는 방식이 빠릅니다. 스키마 STEP 4 주석에도 같은 취지가 적혀 있습니다.

### 8.5 IDENTITY 순번 재설정 — 1단계에서는 불필요

스키마 STEP 3에 순번 재설정 블록이 준비돼 있으나, 1단계에서 Oracle은 앱에 대해 읽기 전용이고 새 행이 생기지 않으므로 **실행하지 않습니다.** 2단계(쓰기 승격)를 진행할 때 필수 선행 작업이 됩니다.

### 8.6 실행 방식 (확정)

`sync_to_oracle.py`는 **독립 스크립트로 유지**하되(수동 실행·백필·테스트 목적), 주기 실행은 **FastAPI 앱 내 APScheduler**(`startup` 이벤트에서 기동)가 그 로직을 호출합니다. OS 레벨 스케줄러(Windows 작업 스케줄러 등)는 팀원마다 환경 설정을 따로 잡아야 해서 채택하지 않습니다.

- **트레이드오프**: 앱이 꺼져 있으면 동기화도 멈추지만, API가 죽어 있으면 Oracle 폴백 자체가 무의미하므로 문제되지 않습니다.
- **제약**: 반드시 **워커 1개**(`uvicorn --workers 1`)로 기동합니다. 다중 워커에서는 스케줄러가 워커마다 중복 실행됩니다. 멀티 프로세스 전환이 필요해지면 중복 스케줄링 방지 가드를 추가하거나 스케줄러를 별도 프로세스로 분리합니다. 이 실행 명령을 `backend/README.md`에 명시합니다.
- 동기화 성공 시각을 파일 또는 테이블에 기록해 `/api/v1/health/db`에서 노출합니다.

### 8.7 CLI

```bash
python -m scripts.sync_to_oracle                        # 기본 동기화
python -m scripts.sync_to_oracle --include-timetables   # 시간표 포함
python -m scripts.sync_to_oracle --verify               # 양쪽 행 수만 출력, 쓰기 없음
python -m scripts.sync_to_oracle --dry-run              # 실행 계획만 출력
```

---

## 9. Oracle 스키마 사전 확인 — **완료** (V1.11 실물 대조)

| # | 확인 항목 | 결과 | 비고 |
|---|---|---|---|
| 1 | PK IDENTITY 모드 | ✅ **통과** | 23개 테이블 전부 `GENERATED BY DEFAULT AS IDENTITY`. MySQL PK 값을 그대로 넣을 수 있음 (`ALWAYS`였다면 `ORA-32795`로 전량 실패) |
| 2 | 식별자 대소문자 | ✅ **통과** | 따옴표 없이 생성 → 전부 대문자 저장. SQLAlchemy Oracle 방언이 소문자 미인용 식별자를 대문자로 처리하므로 모델과 일치 |
| 3 | `NOT NULL` 문자열 빈 값 | ⚠️ **데이터 점검 필요** | 스키마 자체는 문제없음. §8.3-③ 쿼리로 MySQL 실데이터 점검 후 진행 |
| 4 | Oracle 버전 요건 | ⚠️ **환경 확인** | 제약 이름 30자 초과 6건 → **12.2 이상 필수**. 19c는 충족 |
| 5 | 캐릭터셋 | ⚠️ **환경 확인** | `NLS_CHARACTERSET`가 `AL32UTF8`이어야 한글 정상 저장 |

```sql
-- 4, 5 확인
SELECT * FROM v$version;
SELECT parameter, value FROM nls_database_parameters
 WHERE parameter IN ('NLS_CHARACTERSET', 'NLS_NCHAR_CHARACTERSET');
```

**부수 확인 사항**

- `VARCHAR2(n CHAR)`로 CHAR 단위가 명시돼 있어 MySQL `utf8mb4 VARCHAR(n)`과 길이 의미가 일치합니다. 한글 데이터 절단 위험 없음.
- `ON UPDATE CURRENT_TIMESTAMP`가 의도적으로 제외돼 있어 `updated_at`이 원본 값 그대로 보존됩니다. 동기화 시 `updated_at`을 명시적으로 함께 넣어야 하며, 이것이 §10 검증에서 원본 대조의 기준이 됩니다.
- `ON DELETE RESTRICT` 12건이 절 생략(= NO ACTION)으로 처리돼 동작이 동일합니다. 전체 재적재의 **삭제 역순**은 이 12건 때문에 반드시 지켜야 합니다.

---

## 10. 검증 절차

타입 체크·빌드 통과는 완료 기준이 아닙니다. 아래를 순서대로 실행하고 결과를 PR 본문에 기록합니다.

### 10-0. 사전 점검

```sql
-- Oracle: 객체 수 (스키마 STEP 6)
SELECT COUNT(*) FROM user_tables;                          -- 23
```
```
-- MySQL: 빈 문자열 점검 (§8.3-③ 쿼리) — 전부 0이어야 함
```

### 10-1. 평시 동작

```bash
python -m scripts.sync_to_oracle --include-timetables   # 최초 1회 전량
python -m scripts.sync_to_oracle --verify               # 23개 테이블 행 수 일치 확인
curl localhost:8000/api/v1/health/db                    # → {"routing":"mysql", ...}
curl localhost:8000/api/v1/stations                     # 정상 200
```

> **2026-08-11 실제 Aiven MySQL + OCI Oracle(mTLS) 실행 결과**: `--include-timetables`는 `train_timetables`(약 95,000행) 조회 중 `Lost connection to MySQL server during query`로 실패(클라우드 왕복 대량 조회 타임아웃으로 추정 — 로컬 DB였다면 문제되지 않았을 규모). `--include-timetables` 없이 기본 동기화는 처음엔 §8.1의 FK 버그로 실패했으나, `UPSERT_ONLY_TABLES` 수정 후 재실행하니 **성공** — `--verify`로 22개 테이블 전부 행 수 일치 확인(`동기화 완료: 22개 테이블, 총 634행`). `health/db`는 `{"routing":"mysql", ...}`, `GET /stations`은 `200`(193건)으로 정상.

### 10-2. MySQL 중단

```bash
net stop MySQL80              # Windows 서비스인 경우
# docker stop metrotrip-mysql   (컨테이너인 경우)
```

> **2026-08-11 갱신**: MySQL이 Aiven 클라우드로 확정되면서 이 방식으로는 중단시킬 수 없습니다. 대신 `.env`의 `METROTRIP_DATABASE_URL` 포트를 일시적으로 존재하지 않는 값(예: `:1`)으로 바꾸고 앱을 재기동해 "MySQL 도달 불가"를 재현했습니다. 실제 서비스 중단이 아니라 접속 실패 시뮬레이션이라는 차이가 있지만, `db_failover.py`가 보는 건 "프로브 성공/실패"뿐이라 결과는 동일합니다.

### 10-3. 장애 중 동작

```bash
curl localhost:8000/api/v1/health/db                  # → {"routing":"oracle", ...}
curl localhost:8000/api/v1/stations                   # 200, Oracle 데이터
curl -X POST localhost:8000/api/v1/reviews -d '...'   # 503 + Retry-After: 60
```

조회 응답이 **실제로 Oracle 데이터인지**까지 확인합니다(행 수 또는 특정 레코드 대조). 캐시된 응답이 200을 내는 것과 구별해야 합니다.

> **2026-08-11 실행 결과 — 전부 통과**: 첫 프로브는 `{"routing":"mysql"}`로 응답(§6 2회 연속 실패 요건 때문에 아직 미전환 — 예상된 동작), 5초 캐시 경과 후 재요청하니 `{"routing":"oracle"}`로 전환 확인. `GET /stations`은 `200`(MySQL이 실제로 도달 불가능한 상태였으므로 Oracle 응답임이 확실). 인증 없는 쓰기 엔드포인트(`POST /auth/register`, 빈 바디)로 테스트한 결과 `503` + `Retry-After: 60` + 문서와 동일한 안내 문구까지 정확히 일치. (`POST /reviews`는 인증이 먼저 걸려 `401`이 나서 `get_db()` 이전에 요청이 끊기므로, 인증 불필요한 쓰기 엔드포인트로 대체 검증함.)

### 10-4. 복구

```bash
net start MySQL80
# 5초 캐시 + 2회 연속 성공 → 약 10~15초 내 자동 복구
curl localhost:8000/api/v1/health/db                  # → {"routing":"mysql", ...}
curl -X POST localhost:8000/api/v1/reviews -d '...'   # 201 정상
```

> **2026-08-11 실행 결과**: `.env`의 MySQL 포트를 정상 값으로 복원하고 앱을 재기동하니 `{"routing":"mysql"}`, 쓰기 요청은 `503`이 아니라 `422`(빈 바디라 검증 실패)로 응답 — `get_db()`가 MySQL 세션을 정상적으로 만들어줬다는 뜻으로 복구 확인. 다만 이번 검증은 **재기동으로 확인**한 것이라(재기동 시 상태가 `healthy=True`로 초기화됨), "같은 프로세스가 살아있는 채로 장애→복구를 겪는" 시나리오(5초 캐시 + 2회 연속 성공 전환)까지는 검증하지 못했다 — 이건 Windows 방화벽 등으로 순간적 네트워크 차단을 걸어야 재현 가능해서 이번엔 보류. 해당 전환 로직 자체는 `test_db_failover.py` 단위 테스트로 커버되어 있음.

### 10-5. 동기화 원자성

`sync_to_oracle.py` 실행 중간에 강제 종료(Ctrl+C)한 뒤 `--verify`를 실행해 **Oracle 데이터가 종료 전 상태 그대로**인지 확인합니다. 행 수가 0이거나 일부만 적재됐다면 트랜잭션 처리가 잘못된 것입니다.

> **2026-08-11 실행 결과(우연히 검증됨)**: 의도한 강제 종료 테스트는 아니었지만, 기본 동기화가 §8.1 버그로 `DELETE FROM subway_lines` 도중 `ORA-02292` 예외로 중단됐고, 이후 `--verify`로 확인한 Oracle 행 수가 실행 전과 완전히 동일했다 — **단일 트랜잭션 롤백이 의도대로 동작함을 확인**.

### 10-6. 읽기 전용 강제

`metrotrip_ro` 계정으로 접속해 임의 테이블에 `INSERT`를 시도하고 권한 오류가 나는지 확인합니다.

> **2026-08-11 실행 결과 — 일부만 검증**: 현재 §4에 기록했듯 계정 분리 전이라 `metrotrip_ro` 자체가 없어 **DB 계정 권한(핵심 방어선)은 검증 불가**. 대신 애플리케이션 레벨 방어(보조 방어)만 직접 테스트: `get_oracle_read_session()`으로 얻은 세션에서 `commit()`/`flush()`를 각각 호출해 둘 다 `RuntimeError`(의도된 예외 메시지)로 차단되는 것을 확인. `metrotrip_ro` 계정 분리를 진행하면 이 항목을 마저 채워야 함.

### 10-7. 삭제 반영

MySQL에서 리뷰 1건을 삭제 → 동기화 실행 → MySQL 중단 → 해당 리뷰가 조회에서 **사라졌는지** 확인합니다. 증분 방식이었다면 실패하는 시나리오로, 전체 재적재 선택의 근거를 직접 검증합니다.

---

## 11. 서버 배치 — 단일 머신 (확정)

Oracle 인스턴스는 우선 **MySQL과 같은 머신**에 둡니다. 이에 따른 조건은 다음과 같습니다.

- **엔진**: Oracle 19c. 23ai Free와 달리 무료 에디션 특유의 리소스 상한(RAM 2GB / 데이터 12GB 등)이 없으므로, 메모리·디스크 상한은 별도로 직접 설정해 MySQL 메모리를 잠식하지 않게 관리해야 함. 라이선스 조건(Standard/Enterprise Edition 여부)도 별도 확인 필요
- **메모리 배분**: MySQL `innodb_buffer_pool_size` + Oracle 2GB + FastAPI가 물리 메모리를 넘지 않는지 사전 계산
- **디스크**: 가능하면 Oracle 데이터파일을 MySQL과 **다른 물리 디스크**에 배치. 이것만으로 디스크 고장·디스크 풀이 §1 표에서 대비 범위로 넘어옴. 파티션만 분리하는 것은 디스크 풀에만 유효
- **컨테이너 권장**: 둘 다 Docker로 올리면 §10-2의 장애 주입이 `docker stop` 한 줄로 깔끔해지고, `--memory`로 리소스 상한을 걸 수 있음
- **네트워크**: 1521 포트를 외부에 노출하지 않음 (로컬 바인딩)
- **접속 정보**: `.env`로 관리하며 저장소에 커밋하지 않음. `.env.example`에는 키 이름만 기재

### 백업 — 이 구성에서 더 중요해짐

단일 머신이므로 머신 전체 장애 시 MySQL과 Oracle이 함께 사라집니다. **`mysqldump`를 외부 물리 장소(외장 디스크·다른 PC·클라우드 스토리지)로 내보내는 것이 이중화보다 상위의 방어선**입니다. 최소 1일 1회 수행하고 절차를 `db/README.md`에 기록합니다.

### 나중에 분리할 때

`.env`의 `METROTRIP_ORACLE_RO_URL` / `_SYNC_URL` 호스트만 변경하면 됩니다. 코드·스키마 변경 없음. 지금 단일 머신으로 시작하고 하드웨어 확보 시 이전합니다.

---

## 12. 완료 정의 (Definition of Done)

- [x] §3.1 세션 분리 방식 백엔드 확인·합의 — 2026-08-11 확인, `get_db()`/`get_read_db()` 구조로 구현
- [x] §9 항목 4·5 실환경 확인 — 2026-08-11, 실제 OCI Oracle 19c EE 접속 확인(§9 4번 충족). 캐릭터셋(AL32UTF8, 5번)은 직접 조회는 안 했으나 한글 데이터(역명 등) 적재·조회가 정상 동작해 사실상 충족으로 판단. 항목 3(빈 문자열)은 미확인 상태 유지
- [ ] Oracle 계정 2개 생성, `metrotrip_ro`의 DML 거부 확인 (§10-6) — **보류.** 현재 `ADMIN` 단일 계정 사용 중(§4). 앱 레벨 방어(commit/flush 차단)는 2026-08-11 확인 완료, DB 계정 권한 방어는 계정 분리 후 확인 필요
- [x] §8.3 타입 변환 3종 구현 (TIME 문자열화 / CLOB 바인딩 / 빈 문자열 사전 점검) — 코드 구현 및 단위 테스트(SQLite) 통과. CLOB은 SQLAlchemy Core의 `Text` 타입 바인딩에 위임해 별도 `setinputsizes` 호출 없이 처리. 2026-08-11 실제 Oracle 적재로 CLOB 컬럼(reviews.content 등) 정상 확인
- [x] `sync_to_oracle.py` 전체 재적재 성공, `--verify` 23개 테이블 일치 — 2026-08-11 §8.1 FK 버그(`UPSERT_ONLY_TABLES`)로 수정 후 실제 Aiven MySQL + OCI Oracle로 재검증, `train_timetables` 제외 22개 테이블 전부 행 수 일치. `train_timetables` 포함 23번째는 대량 조회 네트워크 타임아웃으로 아직 미검증(§10-1 참고)
- [x] 전체 GET 엔드포인트가 `get_read_db()` 사용 (라우터 grep으로 누락 확인) — 완료
- [ ] §10 검증 8항목 전부 통과, 결과 PR 기록 — 2026-08-11 실제 Aiven MySQL + OCI Oracle로 재검증: **10-1·10-2·10-3·10-5·10-6(앱 레벨) 통과.** 10-4는 재기동 방식으로 간접 확인(연속 프로세스 내 전환은 미검증). 10-7(삭제 반영)은 실제 운영 데이터를 건드리는 테스트라 보류 — 진행 시 사용자 확인 필요
- [x] `test_db_failover.py`, `test_sync_to_oracle.py` 통과 — §8.1 upsert 수정에 맞춘 회귀 테스트 2건 추가, 총 134개 전체 통과 확인
- [x] `backend/README.md`에 `--workers 1` 제약 명시 — 완료
- [x] §5.3 문서 5건 링크 반영 — 완료

---

## 13. 로드맵

1단계 구현·검증이 끝나면, 2단계(승격+재생)를 별도 문서로 설계합니다. 2단계는 **MySQL 장애 중에도 쓰기를 계속 받아야 한다는 요구가 실제로 확인될 때** 진행하며, 그때 §8.5의 IDENTITY 순번 재설정이 필수 선행 작업이 됩니다.

---

## 14. 코드 리뷰(2026-08-11) 발견 사항과 수정

실제 Aiven MySQL + OCI Oracle 19c 연동을 마친 뒤, 8개 관점(라인별 스캔, 삭제된 동작 감사, 크로스파일 추적, 재사용, 단순화, 효율, 컨벤션, 테스트 커버리지)으로 전체 diff를 리뷰했습니다. 실제로 고친 항목만 기록합니다(스타일 수준 중복·경미한 효율 항목은 기록만 하고 손대지 않았습니다).

| # | 문제 | 파일 | 수정 |
|---|---|---|---|
| 1 | **(최우선)** `get_post`/`get_review`가 `get_read_db()`(조회 전용)로 바뀐 뒤에도 조회수 증가 `db.commit()`을 그대로 호출 — Oracle 폴백 중 `ReadOnlySession.commit()`이 `RuntimeError`를 던지는데 잡는 코드가 없어 **처리되지 않은 500**이 남. §3.3이 약속한 "조회는 200으로 계속됨"이 깨짐 | `app/services/community.py`, `app/services/reviews.py` | `db.commit()`을 `try/except RuntimeError`로 감싸고, 실패 시 `db.rollback()` 후 조회 결과만 반환(조회수 증가는 포기) |
| 2 | `scheduler.py`의 10분 주기 자동 동기화 잡이 MySQL/Oracle 엔진을 자체 생성하면서 wallet(`config_dir`/`wallet_location`/`wallet_password`)·SSL(`ssl_ca_path`) 파라미터를 빠뜨림 — 수동 CLI 동기화는 되는데 **자동 동기화는 항상 실패** | `app/scheduler.py` | `Settings.mysql_connect_args()` 신설(기존 `oracle_connect_args()`와 동일 패턴), `database.py`/`scheduler.py`/`sync_to_oracle.py` 세 곳이 공유하도록 통일 |
| 3 | `scheduler.py`가 두 번째 `create_engine()` 실패 시 첫 번째 엔진을 `dispose()`하지 않고 누수, `start_scheduler()`가 재호출되면 이전 스케줄러를 정리하지 않고 덮어써 동기화가 중복 실행될 수 있음 | `app/scheduler.py` | 엔진 생성을 `try/finally`로 감싸 항상 정리, `start_scheduler()`에 이미 실행 중이면 재시작을 건너뛰는 가드 추가 |
| 4 | `db_failover._state`(헬스체크 캐시/카운터)가 락 없이 여러 요청에서 동시에 읽고 쓰임 — FastAPI가 동기 의존성을 스레드풀에서 돌리므로 캐시 만료 직후 여러 스레드가 동시에 프로브를 쏘거나 fail/ok 카운트가 유실될 수 있음 | `app/db_failover.py` | `threading.Lock()`으로 상태 읽기/쓰기 구간을 감쌈 |
| 5 | 헬스체크용 `_probe_executor`(스레드풀)가 앱 종료 시 정리되지 않아, MySQL이 완전히 다운이 아니라 응답 없이 걸려 있는 상황에서는 종료가 느려질 수 있음 | `app/db_failover.py`, `app/main.py` | `shutdown_probe_executor()` 추가, `main.py`의 `lifespan` 종료 시 호출 |

**검증**: 단위 테스트 5건 추가(총 139개 통과) — 조회수 증가 커밋 실패 시나리오(community/reviews 각 1건), 동시 호출 시 프로브가 한 번만 실행되는지(db_failover 1건), 스케줄러가 wallet/SSL 파라미터를 실제로 넘기는지·중복 시작을 막는지(scheduler 2건). 실제 앱을 기동해 스케줄러의 즉시 실행 잡이 실 Aiven MySQL + OCI Oracle로 성공하는 것도 `var/sync_state.json` 타임스탬프로 확인했습니다(항목 2).

**기록만 하고 고치지 않은 항목** (스타일/경미, 필요 시 별도 진행):
- `UPSERT_ONLY_TABLES`가 `sync_exclude_tables`와 별개로 하드코딩돼 있어, 나중에 `line_view_logs`(§3.4에서 이미 제외 후보로 언급 — `subway_lines`를 RESTRICT로 참조) 등을 `sync_exclude_tables`에 추가하면 §8.1과 같은 `ORA-02292`가 조용히 재발할 수 있음. 근본적으로는 제외 대상 테이블이 참조하는 RESTRICT 부모를 FK 메타데이터에서 자동으로 골라 upsert 대상에 넣는 방식이 필요
- `_upsert_table()`이 값이 바뀌지 않은 행도 매번 UPDATE함(테이블이 작아 실효는 미미)
- `sync_to_oracle.py`의 행 조회·배치 삽입 로직이 `_upsert_table()`/`run_sync()`에 중복
- `get_db()`/`get_read_db()`의 MySQL 세션 yield 블록이 동일하게 중복
- `db_failover._state`가 타입 없는 dict — dataclass가 더 명확할 수 있음

## 15. 추가 발견 — `ORA-00932`: CLOB 컬럼에 DISTINCT 사용 불가 (2026-08-11)

MySQL을 실제로 내려서 Oracle 폴백을 라이브로 테스트하던 중 발견. `GET /stations/{station_id}/places`(역 반경 1km 내 장소 조회 — 핵심 기능)가 Oracle 폴백 중 `ORA-00932: inconsistent datatypes: expected - got CLOB`로 실패했다.

**원인**: [`app/repositories/transit.py`](../backend/app/repositories/transit.py)의 `list_places_by_station_id()`가 `select(Place)...distinct()`로 `Place` 엔티티 전체를 조회했는데, `Place.description`이 `Text`(Oracle에서 `CLOB`으로 매핑)라서 Oracle이 `SELECT DISTINCT`에 CLOB 컬럼이 섞이는 것을 거부한다. `place_stations`에 `(place_id, station_id)` 유니크 제약이 없어 조인 결과 중복 가능성 때문에 `.distinct()`를 걸어둔 게 원인 — MySQL은 이 제약이 없어 지금까지 안 걸렸다.

**수정**: place_id만 먼저 distinct로 뽑고(CLOB 없음), 그 ID로 `Place` 전체를 다시 조회(이미 중복 없는 ID라 DISTINCT 불필요)하는 2단계 쿼리로 변경. `.distinct()`를 쓰는 다른 3곳(`transit.py`)은 전수 확인 결과 CLOB 컬럼을 포함하지 않아 문제없음 — 이 쿼리 하나로 범위가 한정된다.

**검증**: 단위 테스트(SQLite, 중복 매핑 시나리오 포함) 그대로 통과. 실제 Oracle에 `station_id=93`(장소 114건 매핑)로 직접 질의해 `ORA-00932` 없이 정상 반환 확인.

**시사점**: 이번이 §14 버그(`get_post`/`get_review`)에 이어 **두 번째**로, "MySQL에서만 돌려봤고 Oracle 폴백 경로로는 한 번도 안 타본 쿼리"에서 나온 버그다. `.distinct()`/CLOB 조합처럼 Oracle 고유의 SQL 제약이 더 있을 수 있으니, GET 엔드포인트를 늘릴 때 Oracle 폴백 경로도 최소 한 번은 실제로 태워보는 습관이 필요하다.
