# MetroTrip

지하철역을 중심으로 주변 장소를 찾고, 실제 열차 시간표를 바탕으로 여행 일정을 만드는 웹 서비스입니다.

자가용 없이 이동하는 사용자가 역을 고르면 반경 1km 안의 장소를 지도에서 탐색할 수 있습니다. 선택한 역은 출발·경유·도착 순서로 일정에 쌓이며, 시간표가 있는 구간은 DB의 동일 열차 번호(`trainNo`)를 연결해 실제 운행 시각을 계산합니다.

> - 기준 브랜치: `develop`
> - 최종 확인: 2026-08-11
> - 현재 데이터 범위: 수도권 1호선 100개 역, 천안·아산 장소 33개, 천안·아산 구간 8개 역 시간표

## 현재 구현 상태

MetroTrip은 더 이상 프론트엔드 단독 목업이 아닙니다. Next.js 프론트엔드, FastAPI 백엔드, MySQL 주 DB와 Oracle 읽기 대체 DB 구조가 함께 구현되어 있습니다.

| 영역 | 현재 상태 |
|---|---|
| 지도 탐색 | 역 검색·선택, 카카오맵 이동, 반경·카테고리별 주변 장소, 장소 상세 |
| 지하철 일정 | 지도/지하철 화면 전환, 출발·경유·도착역 선택, 현재 시각 이후 가장 가까운 실제 열차 계산 |
| 인증·회원 | 이메일 인증 회원가입, 로그인, 토큰 갱신·로그아웃, 비밀번호 재설정, 프로필 수정·탈퇴 |
| 즐겨찾기 | 역 즐겨찾기는 백엔드 저장, 장소 즐겨찾기는 현재 브라우저 로컬 저장 |
| 여행 계획 | 일정 목록·작성·수정·삭제, 지도에서 순서 편집, 읽기 전용 공유 링크 |
| 후기 | 목록·상세·작성·수정·삭제, 일정 연결, 로컬 미디어 업로드 |
| 모집 | 모집글 CRUD, 참여 신청·취소, 승인·거절, 모집 마감 |
| 공지·관리 | 공지 조회·관리, 관리자 장소 변경, 후기·모집글 관리자 삭제 |
| DB 장애 대응 | MySQL 정상 시 주 DB 사용, 장애 시 조회는 Oracle로 전환하고 쓰기는 `503`으로 차단 |

### 시간표 계산 원칙

- 브라우저의 현지 현재 시각을 출발 기준으로 사용합니다.
- 출발역과 도착역의 공식 시간표 API 응답에서 같은 `trainNo`가 있는 열차만 연결합니다.
- 현재 시각 이후 가장 먼저 출발하는 열차를 선택합니다.
- 시간표가 없는 구간은 역당 시간이나 평균값으로 임의 추정하지 않습니다.
- 현재 시간표는 100개 역 중 천안·성환·두정·봉명·쌍용·아산·배방·온양온천 8개 역에만 있습니다.
- 백엔드가 실행되지 않으면 역 목록도 표시되지 않습니다. 화면의 `역 다시 불러오기`보다 먼저 `http://localhost:8000/health`를 확인하세요.

## 화면 경로

| 경로 | 기능 |
|---|---|
| `/` | 공지·추천 장소·진행 중 모집을 조합한 홈 |
| `/discover` | 역·장소 지도 탐색, 시간표 조회, 지하철 일정 경로 편집 |
| `/login` | 로그인·회원가입·비밀번호 재설정 |
| `/plans` | 내 일정 목록과 상세 |
| `/plans/deleted` | 삭제 일정 UI. 현재 백엔드 복원 API는 미지원 |
| `/reviews` | 여행 후기 목록 |
| `/reviews/new` | 일정과 연결한 후기 작성 |
| `/reviews/[reviewId]` | 후기 상세 |
| `/reviews/[reviewId]/edit` | 후기 수정 |
| `/recruitments` | 여행 모집 목록과 작성 |
| `/recruitments/[recruitmentId]` | 모집 상세와 참여 관리 |
| `/my` | 내 일정·후기·즐겨찾기·모집 활동·계정 설정 |
| `/admin` | 관리자 운영 화면. 일부 패널은 현재 백엔드 미지원 |
| `/shared/plans/[token]` | 로그인 없는 읽기 전용 일정 공유 |

## 기술 스택

### 프론트엔드

- Next.js 16 App Router
- React 19, TypeScript 5.9
- Kakao Maps JavaScript SDK
- `openapi-fetch`
- TanStack Query
- dnd-kit
- Tiptap
- Lucide React

### 백엔드

- Python 3.10+
- FastAPI, Uvicorn
- SQLAlchemy 2.x, Pydantic Settings
- PyMySQL, Oracle Database Python Driver
- APScheduler
- Pytest, Ruff

### 데이터베이스·인프라

- MySQL 8.0 주 데이터베이스
- Oracle 19c/OCI Autonomous Database 읽기 대체본
- MySQL → Oracle 단방향 주기 동기화
- 프론트엔드·백엔드 개별 Dockerfile

## 프로젝트 구조

```text
MetroTrip/
├─ frontend/
│  ├─ app/                    Next.js App Router 페이지와 전역 스타일
│  ├─ src/components/         공용 UI, Kakao 지도, 지하철 경로 보드
│  ├─ src/contracts/          프론트 화면용 API 타입
│  ├─ src/lib/                API, 세션, 기존 FastAPI 변환, 시간표 계산
│  ├─ src/styles/             디자인 토큰
│  ├─ next.config.ts          API rewrite, 환경변수 호환, 보안 헤더
│  └─ Dockerfile
├─ backend/
│  ├─ app/routers/            HTTP 엔드포인트
│  ├─ app/schemas/            Pydantic 요청·응답 계약
│  ├─ app/services/           비즈니스 규칙과 트랜잭션 흐름
│  ├─ app/repositories/       SQLAlchemy 조회·저장
│  ├─ app/models/             DB 모델
│  ├─ app/integrations/       이메일·파일·보안 연동
│  ├─ app/db_failover.py      MySQL 상태 판정과 Oracle 읽기 전환
│  ├─ app/scheduler.py        MySQL → Oracle 동기화 스케줄러
│  ├─ scripts/                동기화 CLI
│  ├─ tests/                  API·서비스·DB 장애 대응 테스트
│  └─ Dockerfile
├─ db/
│  ├─ schema/mysql/           MySQL V1.11 기준 스키마
│  ├─ schema/oracle/          Oracle V1.11 대체 스키마
│  ├─ seed/                   번호 순서 초기 데이터
│  ├─ migrations/             스키마 변경 이력
│  └─ erd/                    Mermaid ERD
├─ docs/                      요구사항·인수인계·협업·DB 이중화 문서
└─ .github/workflows/         기존 GitHub Pages 워크플로
```

일반적인 요청 흐름은 다음과 같습니다.

```text
브라우저
  → Next.js App Router
  → frontend/src/lib/api.ts
  → legacyApiAdapter.ts (현재 UI와 FastAPI 계약 차이 변환)
  → FastAPI router
  → service
  → repository
  → MySQL 또는 읽기 전용 Oracle
```

## 로컬 실행

### 사전 준비

- Node.js 20.9 이상
- npm
- Python 3.10 이상
- MySQL 8.0 또는 팀 개발 DB 접속 정보
- Kakao Maps JavaScript 키
- 선택: Oracle 19c/OCI Autonomous DB와 Wallet

프로젝트 전체 기능을 보려면 `DB → 백엔드 → 프론트엔드` 순서로 준비합니다.

### 1. 저장소와 브랜치

```powershell
git clone https://github.com/lellon0403/MetroTrip.git
cd MetroTrip
git switch develop
git pull origin develop
```

팀 작업은 `develop`에서 기능 브랜치를 만든 뒤 진행합니다. 브랜치·커밋·PR 규칙은 [협업 규칙](docs/CONVENTIONS.md)을 따릅니다.

### 2. MySQL 초기화

새 DB는 다음 순서로 적용합니다.

1. `db/schema/mysql/schema_mysql_V1.11.sql`
2. `db/seed/seed_01_users.sql`
3. `db/seed/seed_02_subway_lines.sql`
4. `db/seed/seed_03_stations.sql`
5. `db/seed/seed_04_line_stations.sql`
6. `db/seed/seed_05_places.sql`
7. `db/seed/seed_06_place_stations.sql`
8. `db/seed/seed_07_place_images.sql`
9. `db/seed/seed_08_train_timetables.sql`

스키마 파일이 `metrotrip` 데이터베이스를 생성합니다. 기존 DB를 갱신할 때는 스키마를 다시 실행하지 말고 `db/migrations/`를 번호 순서대로 적용합니다. 자세한 내용은 [DB README](db/README.md)를 참고하세요.

### 3. 백엔드 환경변수

```powershell
cd backend
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
```

`backend/.env`에서 최소한 다음 값을 실제 환경에 맞게 바꿉니다.

```dotenv
METROTRIP_DATABASE_URL=mysql+pymysql://사용자:비밀번호@호스트:3306/metrotrip?charset=utf8mb4
METROTRIP_JWT_SECRET=32자_이상의_무작위_문자열
METROTRIP_CORS_ORIGINS=["http://localhost:5173"]
METROTRIP_PUBLIC_FRONTEND_URL=http://localhost:5173
```

Aiven처럼 TLS가 필수인 MySQL은 `METROTRIP_SSL_CA_PATH`도 지정합니다. Oracle 대체 조회를 사용하지 않는 로컬 환경에서는 `METROTRIP_ORACLE_*` 값을 비워 둘 수 있습니다.

### 4. 백엔드 실행

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

앱 기동 시 Oracle 동기화 스케줄러도 함께 시작되므로 운영 환경에서도 워커는 1개만 사용합니다. 여러 워커를 띄우면 동기화 작업이 중복 실행될 수 있습니다.

확인 주소:

- 서버 상태: [http://localhost:8000/health](http://localhost:8000/health)
- DB 라우팅 상태: [http://localhost:8000/api/v1/health/db](http://localhost:8000/api/v1/health/db)
- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- OpenAPI JSON: [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json)

### 5. 프론트엔드 환경변수

새 PowerShell 창에서 실행합니다.

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
```

`frontend/.env.local`을 다음처럼 설정합니다.

```dotenv
NEXT_PUBLIC_KAKAO_JS_KEY=카카오_JavaScript_키
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

카카오 개발자 콘솔의 JavaScript SDK 도메인에 `http://localhost:5173`을 등록해야 합니다. 키 이름은 `NEXT_PUBLIC_KAKAO_JS_KEY`가 맞으며 `NEXP_PUBLIC_...`가 아닙니다.

이전 환경과의 호환을 위해 `VITE_KAKAO_MAP_KEY`, `VITE_API_BASE_URL`도 `next.config.ts`에서 읽지만, 새 환경은 `NEXT_PUBLIC_*` 이름을 사용합니다. 루트 `.env`는 Next.js가 자동으로 읽지 않으므로 프론트 값은 `frontend/.env.local`에 둡니다.

### 6. 프론트엔드 실행

```powershell
cd frontend
npm run dev
```

브라우저에서 [http://localhost:5173](http://localhost:5173)을 엽니다.

역 목록이 비어 있고 `백엔드 요청을 처리하지 못했습니다`가 표시되면 프론트 문제가 아니라 먼저 다음을 확인합니다.

1. `http://localhost:8000/health`가 `200`인지
2. `backend/.env`의 `METROTRIP_DATABASE_URL`이 올바른지
3. MySQL 또는 Oracle 조회 DB에 역 데이터가 적재되어 있는지
4. 다른 PC에서 접속 중이면 API 주소와 `METROTRIP_CORS_ORIGINS`가 해당 LAN 주소를 포함하는지

## 환경변수 요약

| 위치 | 변수 | 용도 |
|---|---|---|
| 프론트 | `NEXT_PUBLIC_KAKAO_JS_KEY` | Kakao Maps JavaScript SDK 키 |
| 프론트 | `NEXT_PUBLIC_API_BASE_URL` | 브라우저·Next rewrite가 사용할 백엔드 주소 |
| 프론트 서버 | `API_INTERNAL_BASE_URL` | 컨테이너 내부 백엔드 주소 |
| 백엔드 | `METROTRIP_DATABASE_URL` | MySQL SQLAlchemy URL |
| 백엔드 | `METROTRIP_SSL_CA_PATH` | TLS MySQL CA 인증서 경로 |
| 백엔드 | `METROTRIP_JWT_SECRET` | Access/Refresh Token 서명 키 |
| 백엔드 | `METROTRIP_CORS_ORIGINS` | 허용 프론트 출처 JSON 배열 |
| 백엔드 | `METROTRIP_EMAIL_MODE` | `console` 또는 SMTP 이메일 모드 |
| 백엔드 | `METROTRIP_PUBLIC_FRONTEND_URL` | 공유 일정 URL의 프론트 주소 |
| 백엔드 | `METROTRIP_ORACLE_RO_URL` | 장애 시 조회용 Oracle 계정 |
| 백엔드 | `METROTRIP_ORACLE_SYNC_URL` | MySQL → Oracle 동기화 계정 |
| 백엔드 | `METROTRIP_ORACLE_WALLET_DIR` | OCI Wallet 디렉터리 |
| 백엔드 | `METROTRIP_SYNC_INTERVAL_MINUTES` | 동기화 주기, 기본 10분 |

`.env`, `.env.local`, API 키, DB 비밀번호, Wallet은 커밋하지 않습니다.

## 주요 백엔드 API

모든 업무 API의 기본 prefix는 `/api/v1`이며 JSON 필드는 `camelCase`입니다. 정확한 요청·응답은 실행 중인 Swagger를 기준으로 합니다.

| 그룹 | 대표 기능 |
|---|---|
| `/auth` | 이메일 인증, 회원가입, 로그인, 토큰 갱신·로그아웃, 재인증, 비밀번호 재설정 |
| `/users/me` | 내 정보, 비밀번호·프로필 변경, 탈퇴, 역 즐겨찾기, 내 활동 조회 |
| `/lines` | 노선 목록, 최근 조회 기반 추천, 조회 기록 |
| `/stations` | 역 목록·검색·상세, 시간표, 반경 1km 장소 |
| `/plans` | 여행 계획 CRUD, 공유 링크 발급 |
| `/shared-plans` | 인증 없는 읽기 전용 공유 일정 |
| `/reviews` | 후기 CRUD와 미디어 연결 |
| `/review-media` | 후기 미디어 업로드 흐름 |
| `/notices` | 공지·이벤트 조회 |
| `/posts` | 모집글 CRUD와 참여 신청·상태 관리 |
| `/admin/*` | 공지·장소 관리, 후기·모집글 삭제 |

## 데이터 현황

현재 MySQL/Oracle V1.11 스키마는 23개 테이블로 구성됩니다.

| 데이터 | 건수 | 비고 |
|---|---:|---|
| 사용자 시드 | 5 | 테스트 계정 |
| 지하철 노선 | 2 | 1호선 인천 방면·신창 방면 |
| 역 | 100 | 수도권 1호선 범위 |
| 노선-역 매핑 | 145 | 공유 구간 중복 포함 |
| 장소 | 33 | 한국관광공사 TourAPI 천안·아산 데이터 |
| 장소 이미지 | 29 | 대표 이미지가 없는 4건 제외 |
| 열차 시간표 | 1,690 | 국가철도공단, 기준일자 2026-02-25 |

시간표 커버리지는 8개 역뿐이므로 다른 역을 포함한 경로는 계산되지 않는 것이 현재 정책상 정상입니다. 데이터가 없는 결과를 추정값으로 꾸미지 않습니다.

## MySQL/Oracle 장애 대응

- 평상시 읽기·쓰기는 MySQL을 사용합니다.
- MySQL 상태 확인은 짧게 캐시하며 연속 실패 임계값을 넘으면 장애로 판정합니다.
- 장애 중 조회 요청은 Oracle 읽기 전용 세션으로 전환합니다.
- 장애 중 쓰기 요청은 데이터 불일치를 막기 위해 `503`과 `Retry-After`를 반환합니다.
- APScheduler가 MySQL 데이터를 Oracle로 주기 동기화합니다.
- Oracle 설정이 없으면 로컬에서는 스케줄러와 폴백을 사용하지 않고 MySQL만 사용합니다.

상세 설계, 실제 Aiven MySQL·OCI Oracle 검증 결과와 남은 운영 과제는 [DB 장애 대응 문서](docs/DB-FAILOVER.md)를 참고하세요.

## 검사

프론트엔드:

```powershell
cd frontend
npm run lint
npm run typecheck
npm run build
```

백엔드:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest
ruff check .
```

백엔드 문서에 기록된 최신 자동화 테스트 기준은 139개입니다. 실제 동작 확인 없이 빌드나 타입 검사만으로 완료 처리하지 않습니다.

## 현재 제한 사항

| 항목 | 현재 처리 |
|---|---|
| 시간표 없는 역 | 계산 불가를 표시하며 임의 추정하지 않음 |
| 실시간 열차 위치 | 미지원. DB 정적 시간표 기반 |
| 전체 수도권 노선 | 미지원. 현재 데이터는 1호선 두 방면 중심 |
| 좌표·지도 경계 장소 검색 | 가장 가까운 역의 반경 1km API로 변환 |
| 장소 단건 API | 같은 화면에서 불러온 장소 캐시 사용 |
| 장소 즐겨찾기 | 브라우저 `localStorage` 사용 |
| 도보 경로 | 직선거리 기반 로컬 추정 |
| 일정 중간 경유역 | 브라우저 호환 메타데이터에 보조 저장 |
| 삭제 일정 복원 | 백엔드 API 미지원 |
| 후기 좋아요·신고 | 백엔드 API 미지원 |
| 모집 질문·신고 | 백엔드 API 미지원 |
| 관리자 신고·감사·동기화 화면 | 일부 빈 응답 또는 `501` |
| 후기 미디어 물리 파일 정리 | 관리자 삭제 시 아직 미지원 |

미지원 기능은 성공한 것처럼 표시하지 않고 `NOT_SUPPORTED_BY_CURRENT_BACKEND` 오류를 반환합니다. 프론트와 현재 FastAPI의 계약 차이는 [프론트 API 연동 현황](docs/FRONTEND-API-INTEGRATION.md)에 정리되어 있습니다.

## Docker와 배포 상태

`frontend/Dockerfile`과 `backend/Dockerfile`은 각각 Next.js 서버와 FastAPI 서버 이미지를 만듭니다. 저장소에는 두 컨테이너와 DB를 한 번에 실행하는 Compose 파일은 아직 없습니다.

`.github/workflows/deploy.yml`은 이전 Vite 정적 사이트의 `frontend/dist`를 GitHub Pages에 올리던 설정입니다. 현재 Next.js 16 서버 빌드는 `.next`를 생성하므로 이 워크플로와 기존 GitHub Pages 주소를 최신 배포본으로 간주하면 안 됩니다. 실제 배포 전에는 다음 중 하나로 배포 구성을 교체해야 합니다.

- Next.js를 지원하는 서버형 플랫폼에 프론트 배포
- `frontend/Dockerfile`과 `backend/Dockerfile`을 사용하는 컨테이너 배포
- 모든 동적 기능을 대체할 별도 정적 export 구조 설계

배포 환경에서는 `API_INTERNAL_BASE_URL`, `NEXT_PUBLIC_KAKAO_JS_KEY`, `METROTRIP_PUBLIC_FRONTEND_URL`, CORS와 DB 비밀값을 배포 플랫폼의 Secret으로 주입합니다.

## 문서 안내

| 문서 | 용도 |
|---|---|
| [AGENTS.md](AGENTS.md) | Codex가 따르는 팀 공통 작업·Git·검증 규칙 |
| [docs/HANDOFF.md](docs/HANDOFF.md) | 다른 PC에서 이어받을 현재 상태와 실행 시 주의점 |
| [docs/SPEC.md](docs/SPEC.md) | 프론트엔드 범위와 화면 동작 기준 |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | 전체 요구사항과 단계 구분 |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | 브랜치·커밋·PR·파일 협업 규칙 |
| [docs/GIT-GUIDE.md](docs/GIT-GUIDE.md) | Git이 익숙하지 않은 팀원을 위한 작업 흐름 |
| [docs/CLAUDE-CODE-WORKFLOW.md](docs/CLAUDE-CODE-WORKFLOW.md) | Claude Code를 이용한 팀 작업 흐름과 예시 |
| [docs/FRONTEND-API-INTEGRATION.md](docs/FRONTEND-API-INTEGRATION.md) | Next UI와 FastAPI 계약 변환·제한 사항 |
| [docs/BACKEND-HANDOFF.md](docs/BACKEND-HANDOFF.md) | 백엔드 API 계약과 프론트 연동 지점 |
| [docs/DB-FAILOVER.md](docs/DB-FAILOVER.md) | MySQL/Oracle 동기화와 장애 대응 설계 |
| [backend/README.md](backend/README.md) | 백엔드 설치·실행·API·검사 안내 |
| [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md) | 백엔드 계층별 책임과 의존 방향 |
| [db/README.md](db/README.md) | DB V1.11 초기화·시드·인덱스·미결 사항 |
| [docs/WORKLOG.md](docs/WORKLOG.md) | 날짜별 작업 기록 |
| [docs/PRESENTATION.md](docs/PRESENTATION.md) | 발표 구성과 데모 시나리오 |

원본 기획 문서: [요구사항 정의서](https://docs.google.com/spreadsheets/d/1VoXGmwvz8NwPQYi8wy_9lcEH0s8k9UKr7djuU2-z6Ss/edit?gid=0#gid=0) · [프로젝트 계획서](https://docs.google.com/document/d/1MlQHFs3MgN9aMbEL9d6cPHoQJKAHHlsZg-pmBKghsd4/edit?tab=t.0)

## 팀

| 역할 | 담당 |
|---|---|
| PM | 전세호 |
| 백엔드 | 윤홍규 |
| 프론트엔드 | 우진, 황지성 |
| DB | 김유진 |
