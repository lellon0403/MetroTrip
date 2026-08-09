# 백엔드 디렉터리 구조와 책임

이 문서는 `backend/`의 현재 구조와 각 디렉터리의 책임을 설명한다.
코드는 기능별 하위 패키지를 깊게 중첩하지 않고, 역할별 디렉터리에 배치한다.

## 전체 구조

```text
backend/
├─ app/
│  ├─ integrations/
│  ├─ models/
│  ├─ repositories/
│  ├─ routers/
│  ├─ schemas/
│  ├─ services/
│  ├─ config.py
│  ├─ database.py
│  └─ main.py
├─ scripts/
├─ tests/
├─ .dockerignore
├─ .env.example
├─ Dockerfile
├─ pyproject.toml
└─ README.md
```

## `app/`

FastAPI 애플리케이션의 소스 코드가 위치한다.

### `app/main.py`

애플리케이션의 진입점이자 조립 지점이다.

- `FastAPI` 인스턴스 생성
- CORS와 예외 처리기 등록
- OpenAPI 제목, 설명, 태그 설정
- 헬스 체크와 `/api/v1` 라우터 등록

비즈니스 규칙이나 데이터베이스 쿼리는 작성하지 않는다.

### `app/config.py`

환경변수 기반 설정을 관리한다.

- 애플리케이션 이름과 실행 환경
- 디버그 설정
- API 공통 prefix
- 데이터베이스 URL
- CORS 허용 출처

비밀번호나 API 키를 코드에 직접 작성하지 않고 `.env`를 통해 전달한다.

### `app/database.py`

SQLAlchemy 데이터베이스 기반 설정을 관리한다.

- SQLAlchemy `Base`
- 데이터베이스 엔진
- `SessionLocal`
- 요청 단위 세션 의존성 `get_db()`

테이블별 모델과 구체적인 조회 쿼리는 이 파일에 작성하지 않는다.

## 역할별 디렉터리

### `app/routers/`

HTTP 계층을 담당한다.

- URL과 HTTP 메서드 정의
- Path, Query, Body 파라미터 수신
- 인증 의존성 연결
- 요청 스키마를 서비스 호출 인자로 전달
- 서비스 결과를 응답 스키마로 반환
- Swagger의 요약, 설명, 상태 코드 등록

현재 주요 파일:

| 파일 | 책임 |
|---|---|
| `__init__.py` | 도메인 라우터를 하나의 API 라우터로 조립 |
| `contract.py` | Bearer 인증, 관리자 권한 검증, 공통 오류 응답 |
| `health.py` | 서버 상태 확인 |
| `auth.py` | 회원가입, 로그인, 토큰, 로그아웃 |
| `users.py` | 내 정보, 즐겨찾기, 내가 작성한 후기 |
| `transit.py` | 공개 노선·역·시간표·장소 조회와 관리자 장소 변경 |
| `plans.py` | 여행 계획과 읽기 전용 공유 |
| `reviews.py` | 여행 후기, 미디어 업로드와 관리자 후기 삭제 |
| `notices.py` | 공지사항 조회와 관리 |
| `community.py` | 일반·모집 게시글, 참여 신청과 관리자 모집 글 삭제 |

라우터에는 SQLAlchemy 쿼리나 복잡한 상태 변경 규칙을 작성하지 않는다.

### `app/schemas/`

외부 API의 요청과 응답 구조를 Pydantic 모델로 정의한다.

- 필드 타입과 필수 여부
- 문자열 길이와 숫자 범위
- Enum 값
- 요청 데이터 조합 검증
- JSON의 `camelCase` 변환
- Swagger 요청·응답 예시와 설명

파일명은 대응하는 라우터와 동일하게 유지한다. 예를 들어 게시판 API 모델은
`schemas/community.py`에 둔다.

`common.py`에는 공통 오류, 페이지네이션처럼 여러 API에서 공유하는 계약만 둔다.
데이터베이스 전용 속성이나 비즈니스 로직은 작성하지 않는다.

### `app/services/`

비즈니스 규칙과 작업 흐름을 담당한다.

- 권한과 소유자 검증
- 여러 repository 작업의 순서 조정
- 트랜잭션 경계 관리
- 모집 정원, 마감 상태와 같은 도메인 규칙 처리
- 외부 서비스와 데이터베이스 작업의 조합

서비스는 FastAPI의 `Request`나 `JSONResponse`에 의존하지 않는다.
현재 인증, 회원, 여행 계획, 후기, 모집 게시판, 노선·역 도메인의 서비스가 구현되어 있다.
`services/transit.py`는 노선 추천 집계, 조회 기록, 역·시간표·주변 장소 조회와 관리자
장소 등록·수정·삭제의 트랜잭션을 담당한다. 장소 삭제 시 FK 제약을 피하기 위해 해당 장소를
참조하는 계획 항목을 먼저 제거하고 영향받은 계획의 수정 시각을 갱신한다.
`services/plans.py`는 계획 소유권, 역·장소 참조 검증, 일정 스냅샷 동기화, 공유 토큰
발급·검증과 트랜잭션 경계를 담당한다.
후기와 모집 게시판 서비스는 일반 API에서 작성자 소유권을 검증하고, 관리자 삭제 흐름에서는
라우터에서 검증된 관리자 권한을 전제로 작성자와 관계없이 대상 리소스를 삭제한다.

### `app/repositories/`

데이터베이스 접근을 담당한다.

- SQLAlchemy 조회와 저장
- 목록 필터와 페이지네이션
- 집계 쿼리
- 행 잠금이 필요한 동시성 쿼리

비즈니스 판단은 하지 않고, 서비스가 요청한 데이터를 읽거나 저장한다.
`repositories/transit.py`는 DB V1.10 테이블을 기준으로 노선, 역, 시간표, 주변 장소를
조회하고 노선 조회 기록을 저장한다. 장소와 `place_stations`·`place_images`를 변경하고,
장소 삭제 전 `travel_plan_items` 정리와 영향받은 계획 조회도 담당한다.
`repositories/plans.py`는 계획·일정 조회와 저장, 장소-역 매핑 검증, 공유 링크 조회를
담당한다. 공유 토큰 원문은 저장하지 않고 SHA-256 해시로만 조회한다.

### `app/models/`

DB 명세 V1.10에 대응하는 SQLAlchemy 모델을 둔다.

- 테이블과 컬럼
- PK, FK와 관계
- DB 수준의 제약조건과 인덱스

API 요청·응답 형식은 `schemas/`에서 별도로 관리한다. DB 모델을 그대로 API 응답으로
노출하지 않는다. 테이블과 컬럼이 애플리케이션의 기존 설계와 다르면 DB V1.10을
우선한다.

### `app/integrations/`

애플리케이션 외부 시스템과의 통신을 담당한다.

- OAuth 제공자
- 이메일 발송
- 파일·오브젝트 스토리지
- 외부 지도 또는 장소 API

외부 SDK의 요청과 응답을 이 계층에서 변환하여 서비스가 특정 SDK에 직접 의존하지
않도록 한다. 실제 연동을 추가할 때 필요한 파일만 생성한다.

## `tests/`

자동화된 검증 코드를 둔다.

| 파일 | 책임 |
|---|---|
| `test_health.py` | 서버 상태 API 검증 |
| `test_openapi_contract.py` | 경로, 스키마, 인증과 제외 범위의 회귀 검증 |
| `test_transit_lines.py` | 노선 목록·추천·조회 기록 API와 서비스 검증 |
| `test_transit_stations.py` | 역 목록·상세·시간표·주변 장소 API와 서비스 검증 |
| `test_admin_places.py` | 관리자 장소 등록·수정·삭제와 계획 항목 정리 검증 |
| `test_admin_content.py` | 관리자 후기·모집 게시글 삭제와 권한·CASCADE 검증 |

기능별 서비스와 HTTP 계약을 대상 파일명을 따라 함께 검증한다.

```text
app/services/community.py
tests/test_community_service.py
```

단위 테스트와 API 테스트의 수가 충분히 늘어나기 전에는 `unit/`, `integration/`처럼
하위 디렉터리를 미리 만들지 않는다.

## `scripts/`

반복 실행할 가치가 있는 개발·운영 보조 명령을 둔다.

- 초기 데이터 적재
- 데이터 검증
- OpenAPI 파일 내보내기
- 운영 시 필요한 일회성 작업

애플리케이션 실행에 필수인 로직은 `scripts/`에 두지 않는다.

## 루트 설정 파일

| 파일 | 책임 |
|---|---|
| `.env.example` | 필요한 환경변수와 예시 값 제공 |
| `.dockerignore` | Docker 빌드 컨텍스트 제외 대상 정의 |
| `Dockerfile` | 백엔드 컨테이너 이미지 정의 |
| `pyproject.toml` | Python 버전, 의존성, Pytest와 Ruff 설정 |
| `README.md` | 설치, 실행, Swagger와 DB 초기화 안내 |

`.env`, `.venv`, `__pycache__`, `.pytest_cache`, `.ruff_cache`,
`*.egg-info`는 실행 중 생성되는 로컬 파일이며 저장소 구조에 포함하지 않는다.

## 의존 방향

일반적인 요청 처리 흐름은 다음과 같다.

```text
HTTP 요청
  → routers
  → services
  → repositories
  → models / database
```

외부 서비스가 필요한 경우에는 서비스가 integration을 사용한다.

```text
services → integrations
```

`schemas`는 HTTP 경계의 데이터 계약으로 사용한다. 하위 계층이 라우터에 의존하거나,
repository가 service를 호출하는 역방향 의존은 만들지 않는다.

## 새 기능 추가 기준

예를 들어 게시판 기능을 실제로 구현한다면 필요한 파일만 추가한다.

```text
app/
├─ models/community.py
├─ repositories/community.py
├─ routers/community.py
├─ schemas/community.py
└─ services/community.py
```

각 파일의 역할은 다음과 같다.

1. `schemas/community.py`: 요청과 응답 계약
2. `routers/community.py`: HTTP 엔드포인트
3. `models/community.py`: DB 테이블 매핑
4. `repositories/community.py`: 게시글과 참여 신청 쿼리
5. `services/community.py`: 권한, 모집 상태와 정원 규칙

공유 코드가 실제로 두 곳 이상에서 필요해지기 전에는 별도의 공통 모듈이나 추상화
계층을 만들지 않는다.
