# MetroTrip Codex Version

기존 MetroTrip을 참조하되 코드를 공유하지 않는 독립 실행형 구현입니다. 천안·아산 파일럿을 기준으로 웹, FastAPI, PostgreSQL/PostGIS, Redis, S3 호환 저장소, Expo 앱을 한 저장소에서 개발합니다.

## 구성

- `apps/web`: Next.js App Router 웹
- `apps/mobile`: Expo Router 모바일 앱
- `services/api`: FastAPI 모듈형 모놀리스
- `packages/contracts`: OpenAPI에서 생성되는 TypeScript 계약과 API 클라이언트
- `packages/design-tokens`: 웹·모바일 공용 디자인 토큰
- `db`: Alembic 마이그레이션, 시드, 데이터 수집 스크립트
- `infra`: CI 및 운영 보조 자료

## 필요 환경

- Docker Desktop Linux engine + WSL2 backend
- Node.js 24 이상과 npm
- 호스트 API를 실행할 때 Python 3.12
- Windows PowerShell에서는 execution policy 영향을 피하기 위해 예시처럼 `npm.cmd`를 사용

## 전체 스택 시작

```powershell
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
Invoke-WebRequest http://127.0.0.1:3100/api/v1/health/ready -UseBasicParsing
```

`.env`는 로컬 전용이며 커밋하지 않습니다. 기본 웹 주소는 `http://localhost:3100`, 직접 API 문서는 `http://127.0.0.1:8000/docs`, Mailpit은 `http://127.0.0.1:58080`, MinIO console은 `http://127.0.0.1:59001`입니다. API 컨테이너 시작 시 migration과 idempotent seed가 먼저 실행되고, worker는 outbox를 별도 프로세스로 소비합니다.

## 의존 인프라만 Docker로 실행

빠른 코드 재시작이 필요하면 의존 서비스만 Docker로 두고 API/Web/Mobile을 호스트에서 실행할 수 있습니다.

```powershell
docker compose up -d postgres redis minio minio-init mailpit

py -3.12 -m venv services\api\.venv
.\services\api\.venv\Scripts\python.exe -m pip install -e ".\services\api[dev]"
.\services\api\.venv\Scripts\python.exe -m alembic upgrade head
.\services\api\.venv\Scripts\python.exe db\seed\seed.py
.\services\api\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir services\api --reload --port 8000
```

다른 PowerShell에서:

```powershell
npm.cmd install
npm.cmd run contracts:generate
npm.cmd run dev:web
```

모바일 Metro bundler는 `npm.cmd run dev:mobile`로 시작합니다. Android/iOS 실기기는 같은 네트워크에서 접근 가능한 API 주소 설정과 [모바일 릴리스 체크리스트](docs/MOBILE_RELEASE_CHECKLIST.md)를 별도로 확인해야 합니다.

브라우저의 API 요청은 기본적으로 Web과 같은 출처의 `/api/v1`을 사용하고 Next 서버가 API로 전달합니다. 따라서 refresh 쿠키는 교차 출처에 노출되지 않습니다. Docker 내부 프록시 주소는 `API_INTERNAL_BASE_URL=http://api:8000`이며, 외부 API를 직접 쓰는 별도 배포에서만 `NEXT_PUBLIC_API_BASE_URL`을 설정합니다.

## 공급자 상태

`PROVIDER_MODE=fixture`가 기본입니다. 이 모드는 외부 지도·장소·경로 API를 실제 호출하지 않고, 천안·아산 고정 데이터로 동일한 계약을 제공합니다. 화면에는 fixture 데이터를 실제 외부 검색 결과처럼 표시하지 않습니다.

실제 Kakao 지도와 장소 검색을 사용할 때 로컬 `.env`에 아래 환경변수 이름을 설정합니다. 키 값은 저장소나 로그에 남기지 않습니다.

```dotenv
PROVIDER_MODE=kakao
KAKAO_REST_API_KEY=<Kakao REST API 키>
NEXT_PUBLIC_KAKAO_JS_KEY=<Kakao JavaScript 키>
```

REST 키는 API 컨테이너에서만 Kakao Local 호출에 사용합니다. JavaScript 키는 브라우저 지도 SDK 특성상 Web 빌드 결과에 포함되므로 Kakao Developers의 JavaScript SDK 도메인을 `http://localhost:3100`으로 제한해야 합니다. `NEXT_PUBLIC_` 값은 빌드 시 주입되므로 변경 후 Web과 API를 다시 빌드합니다.

```powershell
docker compose up --build -d api web
```

`GET /api/v1/places/nearby`는 Kakao 응답을 `(source_name, external_id)` 기준으로 PostGIS에 갱신하고 기본 15분 동안 재사용합니다. 공급자 장애 시 해당 조건의 기존 데이터가 있으면 `sourceMode=STALE`로 반환하고, 대체 데이터도 없으면 `502 PLACE_PROVIDER_UNAVAILABLE`을 반환합니다.

## 검증

```powershell
npm.cmd run check
.\services\api\.venv\Scripts\python.exe -m ruff check services\api db
.\services\api\.venv\Scripts\python.exe -m pytest services\api\tests
$env:METROTRIP_RUN_POSTGRES_TESTS='1'
.\services\api\.venv\Scripts\python.exe -m pytest services\api\tests
Remove-Item Env:METROTRIP_RUN_POSTGRES_TESTS
$env:__UNSAFE_EXPO_HOME_DIRECTORY=(Resolve-Path .\.expo).Path
npm.cmd exec --workspace @metrotrip/mobile -- expo export --platform web --output-dir ../../dist-web-final
Remove-Item Env:__UNSAFE_EXPO_HOME_DIRECTORY
docker compose config --quiet
```

계약을 바꾼 뒤에는 `npm.cmd run contracts:generate`를 실행하고 생성된 `packages/contracts/src/schema.d.ts`까지 함께 검토합니다. CI는 재생성 결과에 diff가 있으면 실패합니다.

Docker Engine 접근 권한이 없는 실행 계정에서는 `docker compose config --quiet`까지만 검증할 수 있습니다. PostGIS/Redis/MinIO/API/worker/Web 실제 기동과 안전한 백업·복원 리허설은 [운영 런북](infra/RUNBOOK.md)의 체크포인트를 Engine에 접근 가능한 일반 사용자 PowerShell에서 실행합니다.

전체 Compose 스택이 기동된 상태에서는 same-origin 인증 흐름과 탐색→경로→계획→공유·복제→모집 신청·정원 마감→MinIO 미디어→후기까지의 핵심 제품 여정을 각각 검증합니다. 두 스크립트는 검증용 계정을 마지막에 탈퇴 처리합니다.

```powershell
npm.cmd run verify:web-flow
npm.cmd run verify:product-journey
```

## 백업과 종료

```powershell
.\infra\backup.ps1 -OutputDirectory .\backups
.\infra\verify-backup-restore.ps1 -BackupFile .\backups\metrotrip-YYYYMMDD-HHMMSS.dump
docker compose down
```

`docker compose down`은 컨테이너만 중지합니다. 볼륨 삭제 옵션(`-v`)은 데이터를 제거하므로 명시적인 폐기 결정 없이는 사용하지 않습니다.
