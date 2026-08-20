# CI/CD 구성

> GitHub Actions로 백엔드·프론트엔드를 검증하고, Docker 이미지를 빌드해 배포하는 파이프라인 문서입니다.
>
> 마지막 갱신: 2026-08-20

## 1. 전략 — 브랜치별 역할

| 브랜치 | 하는 일 | 안 하는 일 |
|---|---|---|
| `develop` | CI만 — 린트·타입체크·단위/통합 테스트 | 이미지 빌드, 배포 |
| `main` | CI + CD — 검증 통과 후 Docker 이미지 빌드·Docker Hub push | **컨테이너 기동은 안 함** — 배포 서버가 별도로 pull (7장) |

**설계 원칙:**

1. **GitHub Actions는 이미지를 만들어 올리는 데까지만 한다.** 실제로 컨테이너를 (재)기동하는 건
   배포 서버의 몫이다. 그래서 self-hosted runner를 GitHub Actions에 등록하지 않는다 — 워크플로우
   3개 전부 GitHub이 제공하는 `ubuntu-latest`로 끝난다.
2. **main과 develop의 검증 로직은 재사용하지 않고 서로 독립시킨다.** `cd-main.yml`은
   `ci-backend.yml`/`ci-frontend.yml`을 `workflow_call`로 부르지 않고 검증 스텝을 그대로
   인라인했다 — main 파이프라인이 develop 쪽 CI 파일 변경에 영향받지 않게 하려는 것이다. 대가로
   두 쪽이 갈라지지 않도록, 검증 스텝(린트·타입체크·테스트 명령)을 고칠 땐 양쪽 다 봐야 한다.
3. **PR 검증은 변경 경로별로 실행된다.** `main`/`develop` 대상 PR이어도 `backend/**` 또는
   `frontend/**`와 해당 워크플로 파일이 바뀐 경우에만 각 CI가 돈다.
4. **GitHub Pages는 쓰지 않는다.** 프론트가 Vite SPA에서 Next.js(App Router) SSR로 바뀌면서
   방향의 문제가 아니라 기술적으로 불가능해졌다 — `next.config.ts`가 `/api/v1/*`를 서버에서
   프록시하고, 여러 페이지가 `force-dynamic`으로 매 요청마다 서버에서 fetch한다. 정적 파일만
   올리는 GitHub Pages로는 애초에 못 돌린다. `.github/workflows/deploy.yml`은 push 트리거가
   없지만 수동 실행 경로와 존재하지 않는 `frontend/dist` 업로드 설정이 남은 레거시 파일이다.

## 2. 구조 — 파일 한눈에 보기

| 파일 | 역할 | 트리거 |
|---|---|---|
| `.github/workflows/ci-backend.yml` | ruff 린트 + pytest | `develop` push, `main`/`develop` 대상 PR |
| `.github/workflows/ci-frontend.yml` | eslint + 타입체크 + `next build` | `develop` push, `main`/`develop` 대상 PR |
| `.github/workflows/cd-main.yml` (워크플로 이름: `Test and publish Docker images`) | 자체 테스트(lint·typecheck·pytest) 통과 후 backend·frontend Docker 이미지를 빌드해 Docker Hub에 push | `main` push |
| `.github/workflows/deploy.yml` | GitHub Pages 배포 (예전 방식, 현재 사용 금지) | 수동 트리거만 남음 |
| `backend/Dockerfile` | FastAPI 프로덕션 이미지 | — |
| `frontend/Dockerfile` | Next.js standalone 빌드 → `node server.js` 3단계 이미지 | — |
| `compose.yaml` (루트) | 배포 서버가 `api`+`frontend`+`caddy` 이미지를 pull해서 띄우는 구성 | — |
| `deploy/docker/backend.env.example` | Compose의 백엔드 환경변수 예시 | — |

## 3. 워크플로우 상세

### 3.1 ci-backend.yml

**트리거:** `backend/**` 변경 시 `develop` push, `main`/`develop` 대상 PR, 수동 실행
(`workflow_dispatch`).

**검증 순서 (backend 폴더 기준):**
1. Python 3.10 설치 — `backend/Dockerfile`(`python:3.10-slim`)과 버전을 맞춤
2. `pip install -e ".[dev]"` — `pyproject.toml`의 `dev` extra(pytest, ruff, httpx) 설치
3. `ruff check .` — `pyproject.toml`의 `[tool.ruff]` 설정으로 린트
4. `pytest` — `backend/tests/` 전체 실행 (147개)

**MySQL을 안 띄우는 이유:** DB를 사용하는 테스트는 SQLite 임시 DB를 사용하고, 나머지는 순수
함수나 mock으로 검증한다. 실제 MySQL 서비스 컨테이너는 필요 없다.

다만 `app/database.py`가 모듈 import 시점에 `create_engine(settings.database_url)`을 호출하고,
`Settings.database_url`은 기본값이 없는 필수 필드라 워크플로우의 `env:`에 형식만 유효한 더미 값
(`METROTRIP_DATABASE_URL: mysql+pymysql://ci:ci@localhost:3306/metrotrip_ci`)을 넣어둔다.
`create_engine`은 이 시점에 실제 접속을 시도하지 않으므로 이 값으로 충분하다.

**MySQL/Oracle 이중화(`docs/DB-FAILOVER.md`)가 CI에 영향을 안 주는 이유:** `Settings`의
`oracle_ro_url`/`oracle_sync_url`/`oracle_wallet_dir` 등은 전부 `str | None = None`(Optional)이다.
`oracledb`·`apscheduler`가 `pyproject.toml` 기본 의존성에 있지만, 실제 Oracle 접속을 시도하는
코드는 요청이 들어와 MySQL 헬스체크가 실패할 때만 실행되므로 CI에서는 아무 값 없이 그냥
통과한다. 이 상태로 147개 테스트 전부 통과를 확인했다.

**로컬에서 CI와 똑같이 확인하기:**
```bash
cd backend
ruff check .
METROTRIP_DATABASE_URL="mysql+pymysql://ci:ci@localhost:3306/metrotrip_ci" pytest
```
(`.env`가 이미 있는 로컬 환경이라면 `METROTRIP_DATABASE_URL` 없이 `pytest`만 실행해도 된다.)

### 3.2 ci-frontend.yml

**트리거:** `frontend/**` 변경 시 `develop` push, `main`/`develop` 대상 PR, 수동 실행.

**검증 순서 (frontend 폴더 기준):**
1. Node 24 설치 — `frontend/Dockerfile`(`node:24-alpine`)과 버전을 맞춤
   (`package.json`의 `engines`는 `>=20.9.0`이라 더 낮아도 되지만 배포 이미지와 맞춰둔다)
2. `npm ci` — `package-lock.json` 기준 정확히 동일한 버전 설치
3. `npm run lint` — eslint (`eslint.config.mjs`: eslint-config-next core-web-vitals + typescript)
4. `npm run typecheck` — `tsc --noEmit`
5. `npm run build` — `next build`

빌드 아티팩트는 업로드하지 않는다. Next.js의 `.next/`는 서버 실행용 빌드 산출물이라 GitHub
Pages 시절의 `dist/`와 달리 그 자체로 미리보기가 안 된다.

환경변수(`NEXT_PUBLIC_KAKAO_JS_KEY` 등)는 빌드 시점에 없어도 실패하지 않는다
(`next.config.ts`가 `?? ""`로 폴백) — 값 없이 lint·typecheck·build 전부 통과를 확인했다.
그래서 이 워크플로우엔 시크릿을 주입하지 않는다. 실제 배포 이미지 빌드(`cd-main.yml`)에서는
이 값이 클라이언트 번들에 박혀야 하므로 반드시 필요하다 (3.3절).

**로컬에서 CI와 똑같이 확인하기:**
```bash
cd frontend
npm ci
npm run lint
npm run typecheck
npm run build
```

> 로컬에서도 워크플로와 같은 `lint → typecheck → build` 순서로 확인한다.

### 3.3 cd-main.yml — 테스트 + 이미지 빌드 + Docker Hub push

파일명은 `cd-main.yml`이지만 Actions 탭에 표시되는 워크플로 이름은 `Test and publish Docker
images`다. 팀원이 준 참고 워크플로를 거의 그대로 따르고, 하드코딩돼 있던 Docker Hub 네임스페이스만
저장소 Variable(`DOCKERHUB_NAMESPACE`)로 뺐다.

**트리거:** `main` push, 수동 실행.

**잡 3개 (전부 인라인 — `ci-backend.yml`/`ci-frontend.yml`을 재사용하지 않음, 1장 원칙 2 참고):**

| 잡 | 내용 |
|---|---|
| `test-backend` | `backend/`에서 `pip install -e ".[dev]"` → `pytest -q` → `ruff check .`. `METROTRIP_DATABASE_URL: sqlite:///./ci.db`로 더미 URL을 준다(ci-backend.yml은 MySQL 형식 더미 URL을 쓰는데 여긴 SQLite 형식 — 둘 다 실제 접속은 안 하므로 형식만 맞으면 된다) |
| `test-frontend` | `frontend/`에서 `npm ci` → `npm run typecheck` → `npm run lint`. **`next build`는 안 돈다** — 실제 프로덕션 빌드 검증은 다음 `publish` 잡이 Docker 이미지를 만들면서 하므로(중복 빌드 회피로 보임) |
| `publish` | `needs: [test-backend, test-frontend]`. Docker Hub 로그인 후 backend·frontend 이미지를 각각 빌드해 `<네임스페이스>/metrotrip-backend:main`/`:<커밋 SHA>`, `<네임스페이스>/metrotrip-frontend:main`/`:<커밋 SHA>`로 push |

frontend 이미지 빌드 시 `API_INTERNAL_BASE_URL=http://api:8000`과 `NEXT_PUBLIC_KAKAO_JS_KEY`를
build-arg로 넘긴다 — 후자는 Next.js가 빌드 시점에 클라이언트 번들에 박아 넣으므로 여기서 반드시
필요하다 (4.2절).

## 4. Docker 이미지

### 4.1 backend/Dockerfile

`python:3.10-slim` 기반으로 `pip install .` 후 `uvicorn`으로 띄우는 구조다. 워커는 지정을
안 해 기본값 1개인데, `docs/DB-FAILOVER.md` §8.6에 따르면 **반드시 워커 1개**여야 한다
(APScheduler가 `startup` 이벤트에서 동기화 스케줄러를 띄우는데, 워커가 여러 개면 워커마다
중복 실행된다) — 우연이 아니라 요건과 일치하도록 그대로 둔 것이다.

`backend/certs/`는 이미지에 `COPY`하지 않는다. 대신 `compose.yaml`에서 배포 서버의 해당
디렉터리를 컨테이너의 `/run/certs`로 읽기 전용 마운트한다(5장).

> **`COPY scripts ./scripts`가 있는 이유 (2026-08-11 실제 검증에서 발견한 버그):** 처음엔 이
> 줄이 없었다. Docker로 실제 기동해보니 `api` 컨테이너 로그에 10분마다
> `ModuleNotFoundError: No module named 'scripts'`가 찍혔다 — `app/scheduler.py`의
> `_run_sync_job()`이 실행 시점에 `from scripts.sync_to_oracle import (...)`을 하는데,
> Dockerfile이 `app/`만 이미지에 복사하고 `scripts/`는 복사하지 않았기 때문이다.
> `pyproject.toml`의 `[tool.setuptools.packages.find]`도 `include = ["app*"]`뿐이라
> `scripts`는 패키징 대상도 아니었다. 로컬 `pytest`가 계속 통과했던 건 pytest가
> `backend/`(rootdir)를 `sys.path`에 넣어줘서 우연히 보였을 뿐 — 컨테이너 안(pip로 설치된
> site-packages만 있는 환경)에서는 애초에 안 보였다. `COPY scripts ./scripts` 추가 +
> `pyproject.toml`의 include를 `["app*", "scripts*"]`로 바꿔서 고쳤다. 격리된 venv에
> `pip install .`로 설치해 프로젝트와 무관한 디렉터리에서 `import scripts.sync_to_oracle`이
> 되는 것까지 확인했고, 기존 ruff/pytest도 그대로 통과한다.

### 4.2 frontend/Dockerfile

3단계 빌드 (`node:24-alpine`):

1. **dependencies** — `npm ci --ignore-scripts`로 `node_modules`만 먼저 준비 (레이어 캐싱용)
2. **build** — 소스 복사 후 `npm run build`(`next build`). `NEXT_PUBLIC_KAKAO_JS_KEY`를 빌드
   인자(`ARG`)로 받는다 — Next.js는 `NEXT_PUBLIC_` 접두사가 붙은 값을 **빌드 시점에 클라이언트
   번들에 그대로 박아 넣고** 런타임에 다시 안 읽으므로, 컨테이너 `environment:`로 넘겨봐야
   소용없다. `API_INTERNAL_BASE_URL`도 `ARG`로 받지만 이건 서버 전용 값이라 실제로는
   **런타임에** 읽힌다(`next.config.ts`의 `rewrites()`가 서버 시작 시 평가) — 빌드 인자는
   Dockerfile의 이름 통일용에 가깝다.
3. **runtime** — `.next/standalone`, `.next/static`, `public`을 복사해 `node server.js`로 기동.
   정적 파일이 아니라 Node 서버가 계속 떠 있어야 하는 구조라 nginx가 필요 없다.

컨테이너 포트는 **5173**, 80이 아니다.

## 5. compose.yaml — 배포 구성 (루트)

`api`, `frontend`, `caddy` 세 서비스가 있다. **DB 서비스는 없다** — DB는 외부 PC/클라우드에 별도로
구축해서(개발 기간엔 Aiven) `METROTRIP_DATABASE_URL`로 접속하는 방침이기 때문이다.

Compose 파일에는 배포용 `image:`만 있고 로컬 `build:`는 없다.

| 용도 | 명령 | 동작 |
|---|---|---|
| 배포 서버 | `docker compose pull && docker compose up -d` | `image:`가 가리키는 `jeonseho00/metrotrip-*:main`을 받아온다. 서버에서 직접 빌드하지 않는다 |
| 배포 구성 확인 | `docker compose config --quiet` | 환경 파일과 Compose 구문을 검증한다 |

**서비스별 세부 사항:**

- 서비스 이름을 `api`로 한 건 **강제**다. `frontend/Dockerfile`의 `API_INTERNAL_BASE_URL`
  기본값이 `http://api:8000`으로 박혀 있어서, 백엔드 서비스 이름을 이걸로 맞추지 않으면
  frontend 컨테이너가 백엔드를 못 찾는다.
- `api`: `env_file`은 기본 `deploy/docker/backend.env`이며 `BACKEND_ENV_FILE`로 바꿀 수 있다. `backend_media`(업로드
  미디어), `backend_var`(`db_failover.py`의 동기화 상태 파일 `var/sync_state.json`) 두 명명
  볼륨으로 컨테이너 재생성 후에도 상태를 보존한다. `./backend/certs`는 컨테이너의
  `/run/certs`로 읽기 전용 마운트한다.
- `frontend`: `cd-main.yml`이 카카오 JavaScript 키와 내부 API 주소를 넣어 빌드한 이미지를 사용한다.
- `caddy`: 80/443을 공개하고 `deploy/docker/Caddyfile`을 사용해 TLS와 리버스 프록시를 담당한다.

백엔드 환경 파일은 `deploy/docker/backend.env.example`을 복사해 서버에만 보관한다.

## 6. 저장소 설정 — Secrets & Variables

`cd-main.yml`(3.3절)이 요구하는 값이다. Settings → Secrets and variables → Actions에서 등록한다.

| 종류 | 이름 | 값 |
|---|---|---|
| Variable | `DOCKERHUB_USERNAME` | Docker Hub 로그인 계정명 (민감하지 않아 Variable) |
| Secret | `DOCKERHUB_TOKEN` | Docker Hub **Access Token** (비밀번호 아님 — Docker Hub → Account Settings → Security에서 발급) |
| Variable | `NEXT_PUBLIC_KAKAO_JS_KEY` | 카카오 JavaScript 키 (클라이언트에 그대로 노출되는 값이라 Secret이 아니라 Variable) |
| Variable | `DOCKERHUB_NAMESPACE` | 이미지 태그 앞에 붙는 네임스페이스. 로그인 계정(`DOCKERHUB_USERNAME`)과 다를 수 있어 별도로 둠 — 팀원 계정을 쓰기로 해서 하드코딩하지 않고 이 값으로 뺐다 |

`DOCKERHUB_NAMESPACE`는 `compose.yaml`의 이미지 네임스페이스인 `jeonseho00`과 일치해야 한다.

## 7. 사용 방법

### 7.1 Actions에서 확인하기

- PR을 올리면 변경 경로에 해당하는 `Backend CI`/`Frontend CI` 체크가 붙는다. 초록 체크 = 통과,
  빨간 X = 실패 (클릭하면 로그 확인 가능).
- 경로 필터(`paths:`)가 걸려 있어서, backend만 고친 PR에는 `Frontend CI`가 아예 안 뜬다
  (반대도 마찬가지).
- `main`에 push하면 `Test and publish Docker images`(`cd-main.yml`)가 돈다 —
  `test-backend`/`test-frontend`를 통과해야 `publish` 잡이 시작된다.
- 수동으로 돌리고 싶으면: Actions 탭 → 원하는 워크플로우 선택 → **Run workflow**.
- 같은 브랜치/PR에 새 커밋을 올리면 이전 실행은 자동으로 취소된다 (`concurrency` 설정,
  러너 낭비 방지).

### 7.2 Compose 구성 검증

루트 `compose.yaml`은 이미지를 직접 빌드하지 않고 Docker Hub의 `main` 태그를 사용합니다.
서버에서 `deploy/docker/backend.env.example`을 `deploy/docker/backend.env`로 복사해 실제 값을
설정하고 인증서를 `backend/certs/`에 배치한 뒤 다음 순서로 확인합니다.

```bash
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=200 caddy frontend api
curl -I https://metrotrip.kro.kr
```

세부 환경변수와 인증서 경로는 [Docker Compose 수동 배포 안내](../deploy/docker/README.md)를 따릅니다.
영속 데이터까지 삭제하는 `docker compose down -v`는 사용하지 않습니다.

### 7.3 서버 배포

**배포 서버 준비 완료 (2026-08-11).** 우분투 서버 + Docker. **메모리 1GB라 k3s(경량
Kubernetes)는 못 돌린다** — 그래서 이 문서가 처음부터 전제해온 "오케스트레이션 없이 순수
`docker compose`만 쓴다" 방향이 그대로 맞다(1장 설계 원칙 1 참고: self-hosted runner도 안
쓰므로 서버에는 어차피 GitHub Actions 관련 데몬이 안 올라간다). 이 메모리 제약은 아래
자동 갱신 방식을 고를 때도 그대로 적용된다 — Watchtower 같은 상시 상주 데몬보다 필요할 때만
실행되는 cron 쪽이 여유 메모리를 덜 먹는다.

**배포 주소는 `https://metrotrip.kro.kr`이다.** 루트 `compose.yaml`의 `caddy` 서비스가
80/443을 공개하고 `deploy/docker/Caddyfile`로 TLS와 리버스 프록시를 담당한다. `api`와
`frontend`는 내부 네트워크에만 노출된다.

- `deploy/docker/backend.env`의 `METROTRIP_CORS_ORIGINS`와
  `METROTRIP_PUBLIC_FRONTEND_URL`은 `https://metrotrip.kro.kr`과 일치해야 한다.
- **카카오맵 JavaScript SDK는 카카오 개발자 콘솔의 [JavaScript 키 → 플랫폼 → 사이트
  도메인]에 등록된 도메인에서만 동작한다.** 배포 키에는 `https://metrotrip.kro.kr`을 등록한다.

**이미지를 pull해서 컨테이너를 (재)기동하는 절차는 아직 이 저장소 어디에도 자동화돼 있지
않다.** 아래 중 하나를 서버 쪽에서 구성해야 한다.

| 방식 | 배포 지연 | 메모리 부담 | 설정 난이도 |
|---|---|---|---|
| cron 주기 실행 | 폴링 주기만큼(예: 5분 간격이면 최대 5분) | 낮음 — 실행되는 순간만 | 낮음 |
| SSH 수동 실행 | 사람이 실행하는 순간 | 없음 | 없음 (자동화 자체가 아님) |
| Watchtower | 폴링 주기 설정에 따름 | 항상 상주 (가볍지만 0은 아님) | 중간 |
| webhook/lambda | 거의 즉시(이벤트 기반) | 서버 자체엔 없음(외부 실행 시) | 높음 |

**방식별 특징:**

- **cron 주기 실행** — crontab에 `docker compose pull && docker compose up -d`를 몇 분
  간격으로 등록. 이미지 다이제스트가 그대로면 `up -d`가 컨테이너를 재생성하지 않으므로,
  안 바뀐 주기엔 그냥 조용히 끝난다(불필요한 재시작 없음). 상주 프로세스가 없어 1GB
  서버에 가장 안전하고, 스크립트 한 줄 + crontab 한 줄로 끝나 설정도 가장 단순하다.
  단점은 실시간이 아니라는 것뿐 — 이 프로젝트 규모에서 몇 분 지연은 문제가 안 된다.
- **SSH 수동 실행** — 설정이 아예 필요 없어 지금 당장 쓸 수 있지만, 사람이 깜빡하면
  배포가 안 되고 팀원 모두가 서버 접근권한과 명령어를 알아야 한다. cron/webhook을
  붙이기 전 임시 단계, 또는 배포 빈도가 아주 낮을 때만 적합하다.
- **Watchtower** — 이미지 감시 컨테이너를 상시 띄워 pull·재기동·이전 이미지 정리까지
  자동으로 해준다. 편하지만 Docker 소켓을 마운트해야 해서 사실상 호스트 전체 제어권을
  그 컨테이너에 주는 셈이고(보안 고려사항), 컨테이너 자체가 메모리를 상시 점유한다 —
  1GB 서버에선 여유가 빠듯해질 수 있다.
- **webhook/lambda** — Docker Hub push 이벤트를 받아 서버에 SSH로 명령을 전달. 가장
  빠르지만 구성 요소가 제일 많다(리시버 + 인증 + 네트워크 도달성). 서버가 공인
  IP·고정 도메인 없이 집/사설망 뒤에 있다면 외부에서 SSH로 들어올 경로 자체를 새로
  뚫어야 해서(포트포워딩·방화벽) 설정 난이도와 보안 위험이 같이 올라간다.

**결정 (2026-08-12): cron으로 간다.** 지금 메모리 1GB에서 상주 프로세스를 안 늘리는 게
제일 중요해서다. **서버 하드웨어 여유가 늘어나면 Watchtower로 바꾸는 것도 고려한다** —
pull·재기동·이미지 정리를 직접 스크립트로 짤 필요가 없어져 운영 부담이 줄기 때문이다.
지금 당장은 아래처럼 cron 스크립트로 구성한다.

**cron 설정 예시:**
```bash
#!/usr/bin/env bash
# /opt/metrotrip/deploy.sh — 배포 서버에 저장, crontab에 등록해서 쓴다.
set -euo pipefail
cd /opt/metrotrip   # compose.yaml과 deploy/docker/backend.env가 있는 저장소 루트

docker compose pull
docker compose up -d
docker image prune -f   # 옛날 이미지 계속 쌓이는 것 방지 (디스크 여유도 넉넉하지 않을 수 있음)
```
```cron
# crontab -e 로 등록. 5분마다 확인 — 이미지가 안 바뀌었으면 docker compose up -d가
# 컨테이너를 재생성하지 않으므로 대부분의 실행은 사실상 아무 일도 안 하고 끝난다.
*/5 * * * * /opt/metrotrip/deploy.sh >> /var/log/metrotrip-deploy.log 2>&1
```
로그 파일(`/var/log/metrotrip-deploy.log`)을 남겨둬야 나중에 "언제부터 새 이미지가 안
올라갔지?" 같은 걸 확인할 수 있다. 경로·주기는 실제 서버 상황에 맞게 조정한다.

**배포 서버 쪽에서 준비해야 할 것 (공통):**
1. 이 저장소를 clone
2. `deploy/docker/backend.env.example`을 `deploy/docker/backend.env`로 복사하고 실제 값 입력
3. Docker Hub 저장소가 private이면 서버에서 `docker login` 1회 필요
4. MySQL CA와 Oracle Wallet을 `backend/certs/` 아래에 직접 배치
5. `docker compose pull && docker compose up -d`
