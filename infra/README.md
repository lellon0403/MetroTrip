# 로컬 DB 실행

루트에서 MySQL DB만 실행합니다.

```powershell
Copy-Item infra/.env.example infra/.env
docker compose --env-file infra/.env -f infra/compose.yaml up -d db
```

상태와 로그를 확인합니다.

```powershell
docker compose --env-file infra/.env -f infra/compose.yaml ps
docker compose --env-file infra/.env -f infra/compose.yaml logs -f db
```

DB 접속 정보의 기본값은 다음과 같습니다.

- 호스트: `127.0.0.1`
- 포트: `3307` (컨테이너 내부는 `3306`)
- 데이터베이스: `metrotrip`
- 사용자: `metrotrip`
- 비밀번호: `metrotrip`

백엔드는 한글 결과를 올바르게 읽도록 연결 URL에 `charset=utf8mb4`를 지정합니다.

```powershell
$env:METROTRIP_DATABASE_URL="mysql+pymysql://metrotrip:metrotrip@127.0.0.1:3307/metrotrip?charset=utf8mb4"
```

최초 실행 시 `db/schema/mysql/schema_mysql_V1.11.sql`과 `db/seed` 파일이 UTF-8로 번호 순서대로 적용됩니다.
초기화 스크립트는 빈 Docker 볼륨에서만 실행됩니다.

DB를 중지할 때는 다음 명령을 사용합니다.

```powershell
docker compose --env-file infra/.env -f infra/compose.yaml down
```

`down`은 데이터 볼륨을 보존합니다. 데이터를 지우는 `down -v`는 초기화가 필요할 때만 사용하세요.
