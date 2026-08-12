# CI/CD 구성

> GitHub Actions로 백엔드·프론트엔드를 검증하고, Docker 이미지를 빌드해 배포하는 파이프라인 문서입니다.
>
> 마지막 갱신: 2026-08-11

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
3. **PR 검증은 브랜치 전략과 무관하게 항상 켜져 있다.** `ci-backend.yml`/`ci-frontend.yml`의
   `pull_request:` 트리거는 대상이 `main`이든 `develop`이든 항상 돈다.
4. **GitHub Pages는 쓰지 않는다.** 프론트가 Vite SPA에서 Next.js(App Router) SSR로 바뀌면서
   방향의 문제가 아니라 기술적으로 불가능해졌다 — `next.config.ts`가 `/api/v1/*`를 서버에서
   프록시하고, 여러 페이지가 `force-dynamic`으로 매 요청마다 서버에서 fetch한다. 정적 파일만
   올리는 GitHub Pages로는 애초에 못 돌린다. `.github/workflows/deploy.yml`은 push 트리거를
   지워 비활성화 상태로만 남겨뒀다(재사용 대비, `workflow_dispatch`로만 수동 실행 가능).

## 2. 구조 — 파일 한눈에 보기

| 파일 | 역할 | 트리거 |
|---|---|---|
| `.github/workflows/ci-backend.yml` | ruff 린트 + pytest | `develop` push, `main`/`develop` 대상 PR |
| `.github/workflows/ci-frontend.yml` | eslint + 타입체크 + `next build` | `develop` push, `main`/`develop` 대상 PR |
| `.github/workflows/cd-main.yml` (워크플로 이름: `Test and publish Docker images`) | 자체 테스트(lint·typecheck·pytest) 통과 후 backend·frontend Docker 이미지를 빌드해 Docker Hub에 push | `main` push |
| `.github/workflows/deploy.yml` | GitHub Pages 배포 (예전 방식) | ⛔ 비활성 |
| `backend/Dockerfile` | FastAPI 프로덕션 이미지 | — |
| `frontend/Dockerfile` | Next.js 빌드 → `next start` 3단계 이미지 | — |
| `docker-compose.yml` (루트) | 배포 서버가 `api`+`frontend` 이미지를 pull해서 띄우는 구성 | — |
| `.env.example` (루트) | `docker-compose.yml`이 요구하는 환경변수 목록 | — |

## 3. 워크플로우 상세

### 3.1 ci-backend.yml

**트리거:** `backend/**` 변경 시 `develop` push, `main`/`develop` 대상 PR, 수동 실행
(`workflow_dispatch`).

**검증 순서 (backend 폴더 기준):**
1. Python 3.10 설치 — `backend/Dockerfile`(`python:3.10-slim`)과 버전을 맞춤
2. `pip install -e ".[dev]"` — `pyproject.toml`의 `dev` extra(pytest, ruff, httpx) 설치
3. `ruff check .` — `pyproject.toml`의 `[tool.ruff]` 설정으로 린트
4. `pytest` — `backend/tests/` 전체 실행 (134개)

**MySQL을 안 띄우는 이유:** `backend/tests/*.py`는 전부 `create_engine("sqlite://")` 또는
`create_engine("sqlite:///:memory:")`로 각 테스트가 자체 인메모리 DB를 만들어 쓴다. 실제 MySQL
서비스 컨테이너나 `docker compose up database`가 필요 없다.

다만 `app/database.py`가 모듈 import 시점에 `create_engine(settings.database_url)`을 호출하고,
`Settings.database_url`은 기본값이 없는 필수 필드라 워크플로우의 `env:`에 형식만 유효한 더미 값
(`METROTRIP_DATABASE_URL: mysql+pymysql://ci:ci@localhost:3306/metrotrip_ci`)을 넣어둔다.
`create_engine`은 이 시점에 실제 접속을 시도하지 않으므로 이 값으로 충분하다.

**MySQL/Oracle 이중화(`docs/DB-FAILOVER.md`)가 CI에 영향을 안 주는 이유:** `Settings`의
`oracle_ro_url`/`oracle_sync_url`/`oracle_wallet_dir` 등은 전부 `str | None = None`(Optional)이다.
`oracledb`·`apscheduler`가 `pyproject.toml` 기본 의존성에 있지만, 실제 Oracle 접속을 시도하는
코드는 요청이 들어와 MySQL 헬스체크가 실패할 때만 실행되므로 CI에서는 아무 값 없이 그냥
통과한다. 이 상태로 134개 테스트 전부 통과를 확인했다.

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

> **스텝 순서(린트 → 타입체크 → 빌드)를 바꾸지 마세요.** 자세한 이유는 8장 "다음 할 일"의
> `tsconfig.json` 항목 참고.

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

**아직 안 한 것:** 저장소 설정(6장)을 실제로 넣고 `main`에 한 번 push해서 Docker Hub에 이미지가
실제로 올라가는지 확인하는 절차가 남아 있다. `docker/build-push-action`은 널리 쓰이는 표준
액션이라 설정만 맞으면 동작할 것으로 예상하지만, 이 저장소에서 실행해본 적은 없다.

## 4. Docker 이미지

### 4.1 backend/Dockerfile

`python:3.10-slim` 기반으로 `pip install .` 후 `uvicorn`으로 띄우는 구조다. 워커는 지정을
안 해 기본값 1개인데, `docs/DB-FAILOVER.md` §8.6에 따르면 **반드시 워커 1개**여야 한다
(APScheduler가 `startup` 이벤트에서 동기화 스케줄러를 띄우는데, 워커가 여러 개면 워커마다
중복 실행된다) — 우연이 아니라 요건과 일치하도록 그대로 둔 것이다.

`backend/certs/ca.pem`은 `.gitignore`에 걸려 있어 이미지에 `COPY`하지 않는다. 대신
`docker-compose.yml`에서 배포 서버의 로컬 `backend/certs/`를 볼륨으로 마운트한다 (5장).

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
> 되는 것까지 확인했고, 기존 ruff/pytest(134개)도 그대로 통과한다.

### 4.2 frontend/Dockerfile

3단계 빌드 (`node:24-alpine`):

1. **dependencies** — `npm ci --ignore-scripts`로 `node_modules`만 먼저 준비 (레이어 캐싱용)
2. **build** — 소스 복사 후 `npm run build`(`next build`). `NEXT_PUBLIC_KAKAO_JS_KEY`를 빌드
   인자(`ARG`)로 받는다 — Next.js는 `NEXT_PUBLIC_` 접두사가 붙은 값을 **빌드 시점에 클라이언트
   번들에 그대로 박아 넣고** 런타임에 다시 안 읽으므로, 컨테이너 `environment:`로 넘겨봐야
   소용없다. `API_INTERNAL_BASE_URL`도 `ARG`로 받지만 이건 서버 전용 값이라 실제로는
   **런타임에** 읽힌다(`next.config.ts`의 `rewrites()`가 서버 시작 시 평가) — 빌드 인자는
   Dockerfile의 이름 통일용에 가깝다.
3. **runtime** — `package.json`/`node_modules`/`.next`만 복사해 `npm run start`(`next start
   --port 5173`)로 기동. 정적 파일이 아니라 Node 서버가 계속 떠 있어야 하는 구조라 nginx가
   필요 없다.

컨테이너 포트는 **5173**(`next start --port 5173`), 80이 아니다.

## 5. docker-compose.yml — 배포 구성 (루트)

`api`, `frontend` 두 서비스만 있다. **DB 서비스는 없다** — DB는 외부 PC/클라우드에 별도로
구축해서(개발 기간엔 Aiven) `METROTRIP_DATABASE_URL`로 접속하는 방침이기 때문이다.

각 서비스에 `image:`와 `build:`를 **같이** 뒀다 — 용도가 다르다.

| 용도 | 명령 | 동작 |
|---|---|---|
| 배포 서버 | `docker compose pull && docker compose up -d` | `image:`가 가리키는 `${DOCKERHUB_NAMESPACE}/metrotrip-*:main`을 그대로 받아온다. 서버에서 직접 빌드하지 않는다 |
| 로컬/다른 PC 검증 | `docker compose up -d --build` | `build:` 컨텍스트로 그 자리에서 빌드한다. 2026-08-11에 이 방식으로 실제 검증했다 (7.2절) |

**서비스별 세부 사항:**

- 서비스 이름을 `api`로 한 건 **강제**다. `frontend/Dockerfile`의 `API_INTERNAL_BASE_URL`
  기본값이 `http://api:8000`으로 박혀 있어서, 백엔드 서비스 이름을 이걸로 맞추지 않으면
  frontend 컨테이너가 백엔드를 못 찾는다.
- `api`: `env_file: .env`로 `METROTRIP_*` 값을 통째로 주입한다. `backend_media`(업로드
  미디어), `backend_var`(`db_failover.py`의 동기화 상태 파일 `var/sync_state.json`) 두 명명
  볼륨으로 컨테이너 재생성 후에도 상태를 보존한다. `./backend/certs`는 읽기전용으로 마운트
  (선택 — SSL 인증서가 필요한 외부 DB를 쓸 때만).
- `frontend`: **`image:`로 pull한 경우 `NEXT_PUBLIC_KAKAO_JS_KEY`는 이미 이미지 빌드
  시점에 박혀 있다** — `cd-main.yml`이 push할 때 이미 넣었기 때문이다. `.env`의
  `NEXT_PUBLIC_KAKAO_JS_KEY`/`build.args`는 `--build`로 로컬 빌드할 때만 쓰인다.
  `environment:`로 `API_INTERNAL_BASE_URL=http://api:8000`은 항상 명시한다(이미지 기본값과
  같지만, 나중에 서비스명이 바뀌면 여기만 고치면 되도록).
- Oracle 지갑(`METROTRIP_ORACLE_WALLET_DIR`)은 아직 실물 파일이 없어 볼륨 마운트를
  추가하지 않았다. `certs`와 같은 방식으로 나중에 추가하면 된다.

**`.env.example` (루트):** `docker-compose.yml`이 요구하는 값 전체 목록이다 —
`DOCKERHUB_NAMESPACE`(이미지 태그), `METROTRIP_*`(backend/api), `NEXT_PUBLIC_KAKAO_JS_KEY`
(로컬 `--build` 검증 시에만). Oracle 관련 값(`METROTRIP_ORACLE_*`)도 비워둔 채로 같이
있는데, 없어도 앱은 정상 기동한다(3.1절 "Oracle 이중화가 CI에 영향을 안 주는 이유"와 같은
이유). 배포 서버에서 이 파일을 `.env`로 복사해 실제 값을 채운다(`.env`는 `.gitignore`로
막혀 있어 저장소에는 안 올라간다).

## 6. 저장소 설정 — Secrets & Variables

`cd-main.yml`(3.3절)이 요구하는 값이다. Settings → Secrets and variables → Actions에서 등록한다.

| 종류 | 이름 | 값 |
|---|---|---|
| Variable | `DOCKERHUB_USERNAME` | Docker Hub 로그인 계정명 (민감하지 않아 Variable) |
| Secret | `DOCKERHUB_TOKEN` | Docker Hub **Access Token** (비밀번호 아님 — Docker Hub → Account Settings → Security에서 발급) |
| Variable | `NEXT_PUBLIC_KAKAO_JS_KEY` | 카카오 JavaScript 키 (클라이언트에 그대로 노출되는 값이라 Secret이 아니라 Variable) |
| Variable | `DOCKERHUB_NAMESPACE` | 이미지 태그 앞에 붙는 네임스페이스. 로그인 계정(`DOCKERHUB_USERNAME`)과 다를 수 있어 별도로 둠 — 팀원 계정을 쓰기로 해서 하드코딩하지 않고 이 값으로 뺐다 |

배포 서버의 루트 `.env`(5장)에 넣는 `DOCKERHUB_NAMESPACE`는 여기 등록한 값과 반드시 같아야 한다.

## 7. 사용 방법

### 7.1 Actions에서 확인하기

- PR을 올리면 GitHub이 자동으로 `Backend CI`/`Frontend CI` 체크를 붙인다. 초록 체크 = 통과,
  빨간 X = 실패 (클릭하면 로그 확인 가능).
- 경로 필터(`paths:`)가 걸려 있어서, backend만 고친 PR에는 `Frontend CI`가 아예 안 뜬다
  (반대도 마찬가지).
- `main`에 push하면 `Test and publish Docker images`(`cd-main.yml`)가 돈다 —
  `test-backend`/`test-frontend`를 통과해야 `publish` 잡이 시작된다.
- 수동으로 돌리고 싶으면: Actions 탭 → 원하는 워크플로우 선택 → **Run workflow**.
- 같은 브랜치/PR에 새 커밋을 올리면 이전 실행은 자동으로 취소된다 (`concurrency` 설정,
  러너 낭비 방지).

### 7.2 Docker로 로컬/다른 PC에서 검증하기

배포 서버(7.3절)와 별개로, Docker가 설치된 아무 PC에서나 이 구성이 실제로 뜨는지 미리 확인할
수 있다. 아래는 배포 서버가 아직 없던 시점에 다른 PC로 1차 검증한 기록이다.

1. **브랜치를 그 PC로 가져온다.** 커밋 → `git push` 후 다른 PC에서
   `git fetch && git checkout <브랜치>`로 받는다.
2. **루트 `.env`를 만든다.** `.env.example`을 복사해서 `.env`로 만들고 최소한
   `METROTRIP_DATABASE_URL`(비어 있으면 `api`가 아예 뜨지 않는다), `METROTRIP_JWT_SECRET`,
   `NEXT_PUBLIC_KAKAO_JS_KEY`는 채운다. 개발 기간 DB(Aiven)를 그대로 쓴다면 `backend/.env`
   값을 그대로 복사해오면 되는데, **같은 Aiven DB에 테스트 신호(회원가입·후기 작성 등)를
   남기게 되니** 테스트가 끝나면 만든 데이터를 지우거나 팀에 미리 알린다.
3. **`backend/certs/ca.pem`을 옮긴다.** `.gitignore`에 걸려 있어 git으로는 안 온다 — scp
   등으로 그 PC의 같은 경로에 복사하고 `METROTRIP_SSL_CA_PATH`도 채운다. (SSL을 요구하지
   않는 DB라면 이 단계와 `docker-compose.yml`의 `./backend/certs` 마운트 줄은 생략해도 된다.)
4. **빌드 & 기동.**
   ```bash
   docker compose up -d --build
   ```
5. **정상 기동 확인.**
   ```bash
   docker compose ps                 # 둘 다 Up 인지
   docker compose logs -f api        # DB 연결·APScheduler 시작 로그 확인
   docker compose logs -f frontend   # next start 로그, /api/v1 프록시 에러 없는지
   curl http://localhost:8000/health            # {"status":"ok"}
   curl http://localhost:8000/api/v1/health/db  # {"routing":"mysql", "last_synced_at": null}
   ```
   그다음 브라우저로 `http://<그 PC 주소>:5173` 접속 — 홈 화면(공지·모집·역 목록)이 실제
   데이터로 뜨는지, 카카오맵이 뜨는지 확인한다.
6. **끝나면 정리.**
   ```bash
   docker compose down       # 컨테이너만 내림 (media/var 볼륨은 남음)
   docker compose down -v    # 볼륨까지 삭제 — 업로드 미디어·동기화 상태까지 지워지니 주의
   ```

**막히면 이렇게 좁힌다:**

| 증상 | 원인 확인 방법 |
|---|---|
| `api`가 아예 안 뜸 (`docker compose ps`에 `Exited`) | `docker compose logs api`에서 `METROTRIP_DATABASE_URL` 관련 예외인지 본다 (필수 필드라 없으면 `Settings` 생성 자체가 실패) |
| `api`는 떴는데 `/health/db`가 500 | DB 접속 문제. 그 PC 네트워크에서 Aiven 호스트로 접속되는지(`nc -vz <host> <port>`), SSL CA 경로가 컨테이너 안에 실제로 보이는지(`docker compose exec api ls /app/certs`) 확인 |
| 프론트는 뜨는데 홈 화면 데이터가 안 뜸 | `frontend` 로그에서 `/api/v1/*` 프록시가 `api:8000`으로 잘 가는지 확인. 서비스명을 `api`가 아닌 다른 이름으로 바꿨다면 `API_INTERNAL_BASE_URL`도 같이 바꿔야 함 |
| 카카오맵만 안 뜸, "NEXT_PUBLIC_KAKAO_JS_KEY 설정이 필요합니다" | 빌드에 값이 안 들어간 것. `.env`만 고치고 `restart`해도 반영 안 됨 — `docker compose up -d --build frontend`로 재빌드 필요 |
| 카카오맵만 안 뜸, "Kakao 지도 SDK를 불러오지 못했습니다" | 값은 들어갔지만 **브라우저가 `dapi.kakao.com` 자체를 못 불러온 것**(스크립트 태그 네트워크 에러). 그 PC/네트워크가 `dapi.kakao.com`에 나가는 경로가 막혀 있거나(방화벽/사내망) 브라우저 광고 차단 확장이 카카오 관련 도메인을 막고 있을 가능성이 큼. 카카오 콘솔의 [JavaScript SDK 도메인] 미등록은 보통 이 메시지가 아니라 스크립트는 로드된 뒤 SDK 초기화 단계에서 실패하는 다른 증상으로 나타남 |

**1차 검증 결과 (2026-08-11, Docker 있는 다른 PC에서):** `api`/`frontend` 둘 다 `Up`,
`/health`·`/api/v1/health/db` 정상, 브라우저 홈 화면 데이터 정상 표시. 이 과정에서
`scripts` 모듈 누락 버그를 발견해 고쳤다(4.1절). 카카오맵은 아직 미해결 — "Kakao 지도
SDK를 불러오지 못했습니다" 메시지가 떠서 위 표의 마지막 항목으로 원인을 좁혔지만, 그 PC의
네트워크/브라우저 쪽 확인이 더 필요하다.

### 7.3 서버 배포

**배포 서버 준비 완료 (2026-08-11).** 우분투 서버 + Docker. **메모리 1GB라 k3s(경량
Kubernetes)는 못 돌린다** — 그래서 이 문서가 처음부터 전제해온 "오케스트레이션 없이 순수
`docker compose`만 쓴다" 방향이 그대로 맞다(1장 설계 원칙 1 참고: self-hosted runner도 안
쓰므로 서버에는 어차피 GitHub Actions 관련 데몬이 안 올라간다). 이 메모리 제약은 아래
자동 갱신 방식을 고를 때도 그대로 적용된다 — Watchtower 같은 상시 상주 데몬보다 필요할 때만
실행되는 cron 쪽이 여유 메모리를 덜 먹는다.

**도메인 구매·배포 완료. 주소는 `https://metrotrip.kro.kr` (2026-08-12 확정).** TLS는 기존
nginx/Caddy 리버스 프록시가 종단한다(이 저장소가 관리하는 범위 밖 — 서버에 별도로 이미
구성돼 있음). `docker-compose.yml`의 `api`(8000)/`frontend`(5173) 포트는 그대로 두면 된다 —
리버스 프록시가 `metrotrip.kro.kr:443`을 받아서 내부적으로 이 포트들로 연결해주는 구조이기
때문에 compose 쪽에서 추가로 손댈 건 없다. 프론트만 공개하면 되는 것도 이 구조와 잘 맞는다 —
`next.config.ts`의 rewrites가 이미 `/api/v1/*`를 서버에서 `api:8000`으로 프록시하므로
(4.2절), 리버스 프록시가 `frontend:5173` 하나만 도메인에 연결해도 API 요청까지 전부
커버된다(`api:8000`을 도메인에 직접 노출할 필요가 없다).

- `.env`의 `METROTRIP_CORS_ORIGINS`/`METROTRIP_PUBLIC_FRONTEND_URL`은 `.env.example`에
  이미 `https://metrotrip.kro.kr`로 채워뒀다 — 배포 서버 `.env`도 이 값과 일치해야 한다.
- **카카오맵 JavaScript SDK는 카카오 개발자 콘솔의 [JavaScript 키 → 플랫폼 → 사이트
  도메인]에 등록된 도메인에서만 동작한다.** `metrotrip.kro.kr`을 등록했는지 아직 확인이
  안 됐다 — 등록 안 하면 로컬/테스트 PC에서 잘 뜨던 지도가 실제 배포 도메인에서는 그냥
  안 뜬다(과거 GitHub Pages 배포 때도 이 등록을 빠뜨려서 겪은 적 있음, `docs/HANDOFF.md`
  5장 참고). 8장 체크리스트에 추가함.
- **업로드 미디어 URL이 깨질 위험 (미확인, 아직 안 고침).** `backend/app/services/reviews.py`의
  `create_media_upload`가 `request.url_for(...)`로 절대 URL을 만드는데, `backend/Dockerfile`의
  uvicorn 실행에 `--proxy-headers`가 없고 `main.py`에도 `ProxyHeadersMiddleware`가 없다.
  리버스 프록시가 `X-Forwarded-Proto`/`Host`를 보내줘도 uvicorn이 신뢰하지 않으면, 후기
  이미지 업로드 URL이 `https://metrotrip.kro.kr/...`가 아니라 프록시→컨테이너 사이의 내부
  연결 정보(예: `http://127.0.0.1:8000/...`)로 만들어져 외부에서 접근이 안 될 수 있다.
  실제로 후기 사진을 올려서 그 URL이 `metrotrip.kro.kr`로 나오는지 확인 필요 — 깨져 있으면
  `backend/Dockerfile`의 `CMD`에 `--proxy-headers`를 추가하는 게 표준적인 해결책이다
  (리버스 프록시가 보낸 포워딩 헤더를 우분투 서버 내부망에서만 신뢰하도록
  `--forwarded-allow-ips`도 함께 좁히는 걸 권장). 8장 체크리스트에 추가함.

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
cd /opt/metrotrip   # docker-compose.yml과 .env가 있는 경로로 바꿀 것

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
1. 이 저장소를 clone (또는 `docker-compose.yml`/`.env`만 복사)
2. 루트 `.env` 작성 (`.env.example` 참고) — `DOCKERHUB_NAMESPACE`는 6장 Variable과 반드시 같아야 함
3. Docker Hub 저장소가 private이면 서버에서 `docker login` 1회 필요
4. `backend/certs/ca.pem`(SSL 필요 시), Oracle 지갑(준비되면) 직접 배치
5. `docker compose pull && docker compose up -d`

## 8. 다음 할 일

- [ ] **Docker Hub 저장소 설정 등록 + 실제 push 확인.** 6장의 값(`DOCKERHUB_USERNAME`,
      `DOCKERHUB_TOKEN`, `NEXT_PUBLIC_KAKAO_JS_KEY`, `DOCKERHUB_NAMESPACE`)을 Settings →
      Secrets and variables → Actions에 등록하고, `main`에 한 번 push해서 `cd-main.yml`이
      실제로 Docker Hub까지 이미지를 올리는지 확인한다.
- [ ] **cron 배포 스크립트를 실제 서버에 설치·검증 (7.3절).** 방식은 cron으로 결정됨
      (하드웨어 여유가 늘면 Watchtower로 전환 고려). 7.3절의 `deploy.sh` + crontab 예시를
      실제 서버 경로에 맞게 올리고, `main` push 후 몇 분 안에 실제로 컨테이너가
      갱신되는지 끝까지 검증한다.
- [ ] **카카오 개발자 콘솔에 `metrotrip.kro.kr` 등록 확인 (7.3절).** [JavaScript 키 →
      플랫폼 → 사이트 도메인]에 등록했는지 아직 확인이 안 됐다. 등록 안 하면 카카오맵이
      그 도메인에서만 안 뜬다 — 로컬/테스트 PC에서 멀쩡히 뜨던 것과 다른 증상이라
      헷갈리기 쉽다.
- [ ] **업로드 미디어 URL이 `metrotrip.kro.kr`로 제대로 나오는지 확인 (7.3절).** 후기 사진을
      실제로 올려서 응답의 `mediaUrl`이 `https://metrotrip.kro.kr/...`인지 확인한다. 내부
      연결 정보로 깨져 있으면 `backend/Dockerfile`의 uvicorn `CMD`에 `--proxy-headers`
      (+ `--forwarded-allow-ips`)를 추가해야 한다 — 아직 코드에 반영 안 함.
- [ ] **Oracle 지갑 볼륨 마운트 추가.** 실물 지갑 파일이 아직 없다. 준비되면 `certs`와 같은
      방식으로 `docker-compose.yml`에 볼륨 마운트를 추가한다 (5장).