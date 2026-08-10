# MetroTrip 운영 런북

## 로컬 기동

`docker compose up --build -d` 후 `docker compose ps`에서 postgres, redis, minio, mailpit, api가 healthy이고 worker와 web이 `Up`인지 확인한다. 웹은 `http://localhost:3100`, 브라우저와 같은 경로로 확인하는 API readiness는 `http://localhost:3100/api/v1/health/ready`다.

### 전체 스택 검증 체크포인트

Docker Engine에 접근 가능한 일반 사용자 PowerShell에서 저장소의 `codex_version`으로 이동한 뒤 실행한다.

```powershell
docker compose pull
docker compose up --build -d
docker compose ps
docker compose exec -T postgres pg_isready -U metrotrip -d metrotrip
docker compose exec -T postgres psql -U metrotrip -d metrotrip -c "SELECT postgis_full_version();"
docker compose exec -T redis redis-cli ping
Invoke-WebRequest http://127.0.0.1:59000/minio/health/live -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest http://127.0.0.1:58080/api/v1/info -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest http://127.0.0.1:8000/api/v1/health/ready -UseBasicParsing | Select-Object StatusCode,Content
Invoke-WebRequest http://127.0.0.1:3100 -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest http://127.0.0.1:3100/api/v1/health/ready -UseBasicParsing | Select-Object StatusCode,Content
docker compose exec -T api python -m alembic current
docker compose logs --tail 50 worker
docker compose exec -T postgres psql -U metrotrip -d metrotrip -c "SELECT count(*) FILTER (WHERE processed_at IS NULL) AS pending, count(*) FILTER (WHERE processed_at IS NOT NULL) AS processed FROM outbox_events;"
docker compose exec -T postgres psql -U metrotrip -d metrotrip -c "SELECT count(*) AS stations FROM transit_stations; SELECT count(*) AS places FROM places; SELECT count(*) AS plans FROM plans; SELECT count(*) AS reviews FROM reviews; SELECT count(*) AS recruitments FROM recruitments;"
npm.cmd run verify:web-flow
npm.cmd run verify:product-journey
```

`verify:web-flow`는 Web same-origin 프록시의 쿠키·refresh 재사용 탐지·탈퇴 흐름을, `verify:product-journey`는 탐색→경로→계획 ETag→공유·복제→모집 신청·정원 마감→MinIO 업로드→후기·좋아요→정리 흐름을 검증한다. 모든 서비스가 기동된 뒤에도 `api`가 unhealthy이면 `docker compose logs --tail 200 api postgres redis minio minio-init`로 원인을 확인한다. 검증을 마친 뒤 보존이 필요 없는 개발 환경은 `docker compose down`으로 중지한다. 볼륨 삭제는 별도 승인 없이 실행하지 않는다.

## 장애 분리

- PostgreSQL 오류: 쓰기 중단, API readiness 실패. 복구 전 mutation을 재시도하지 않는다.
- Redis 오류: readiness 실패와 rate-limit fail-open 경고를 확인한다. DB 원장 기능은 유지한다.
- MinIO 오류: 이미지 claim/complete를 중단하고 텍스트 후기 기능은 유지한다.
- 외부 공급자 오류: fixture 모드는 `MOCKED`, 실 공급자는 `REAL` 상태와 기준 시각을 UI에 표시한다.

## 백업·복원

`./infra/backup.ps1`로 PostgreSQL custom-format(`.dump`) 백업을 생성한다. PowerShell 텍스트 파이프를 사용하지 않아 SQL 인코딩과 바이너리가 변형되지 않는다. 복원은 운영 DB가 아닌 임시 검증 DB에서 연습한다. 검증 스크립트는 원본 DB를 변경하지 않고 무작위 이름의 DB를 만들고, 핵심 테이블 건수와 Alembic version을 비교한 후 그 검증 DB만 제거한다.

```powershell
.\infra\backup.ps1 -OutputDirectory .\backups
Get-ChildItem .\backups\metrotrip-*.dump | Sort-Object LastWriteTime -Descending | Select-Object -First 1
.\infra\verify-backup-restore.ps1 -BackupFile .\backups\metrotrip-YYYYMMDD-HHMMSS.dump
```

실제 DB 교체가 필요한 재난 복구에서만 `restore.ps1 -ConfirmRestore`를 사용한다. 목표는 초기 RPO 24시간, RTO 4시간이다.

## 보안 점검

- 기본 JWT·push 암호화 secret은 로컬 전용이며 배포 환경에서 반드시 교체한다.
- 관리자 작업은 role 검사와 audit log를 통과해야 한다.
- `npm audit`의 Expo/Metro 개발 도구 취약점은 upstream 호환 버전이 나오기 전 격리하며, 사용자 업로드는 서버의 MIME·크기 검사와 객체 저장소 claim만 허용한다.
