# MetroTrip Backend

FastAPI 기반 MetroTrip REST API 서버입니다. 애플리케이션의 데이터 모델과 조회 로직은
저장소의 데이터베이스 명세 V1.10을 기준으로 합니다.

## 기술 구성

- FastAPI
- Uvicorn
- Pydantic Settings
- SQLAlchemy 2.x
- PyMySQL
- Pytest
- Ruff

초기 구성에서는 Alembic을 사용하지 않습니다. 개발 데이터베이스는 저장소의 V1.10
MySQL 스키마와 시드 SQL을 직접 적용하여 초기화합니다.

## 디렉터리

```text
backend/
├─ app/
│  ├─ routers/         HTTP 요청·응답과 엔드포인트
│  ├─ models/          SQLAlchemy 데이터베이스 모델
│  ├─ schemas/         Pydantic 요청·응답 모델
│  ├─ services/        비즈니스 규칙
│  ├─ repositories/    데이터 조회·저장
│  ├─ integrations/    외부 서비스 연동
│  ├─ config.py        환경 설정
│  ├─ database.py      SQLAlchemy 연결과 세션
│  └─ main.py          FastAPI 애플리케이션 진입점
├─ scripts/            개발·운영 보조 스크립트
└─ tests/
```

디렉터리별 상세 책임과 의존 방향은 [ARCHITECTURE.md](ARCHITECTURE.md)를 참고합니다.

## 로컬 실행

PowerShell:

```powershell
cd C:\Users\Jeon\git\MetroTrip\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

서버 확인:

```text
GET http://localhost:8000/health
GET http://localhost:8000/docs
```

## API 계약과 Swagger

`http://localhost:8000/docs`에서 API를 실행하고 요청·응답 계약을 확인할 수 있습니다.
원본 OpenAPI JSON은 `http://localhost:8000/openapi.json`에서 제공합니다.

- 공통 Base URL: `/api/v1`
- JSON 필드명: `camelCase`
- 목록 조회: `page`, `size` 페이지네이션
- 인증 필요 API: Swagger의 `Authorize`에 Bearer Access Token 입력
- 실시간 지하철 위치와 길 안내: 백엔드 범위에서 제외
- 현재 좌표 표시: 프론트엔드의 Geolocation API로 처리
- 여행 계획 공유: 로그인 없는 읽기 전용 링크만 지원 예정
- 게시판: 좋아요와 정렬 옵션 제외

인증·회원·즐겨찾기·후기·모집 게시판과 공개 노선·역 조회 API는 구현되어 있습니다.
여행 계획, 공지사항, 관리자 장소 등록·수정·삭제 API는 계약만 정의되어 `501 Not
Implemented`를 반환합니다.

스키마나 엔드포인트를 변경하면 코드와 OpenAPI 검증 테스트를 함께 수정합니다.

### 구현된 노선·역 조회 API

```text
GET  /api/v1/lines
GET  /api/v1/lines/suggestions
POST /api/v1/lines/{line_id}/views

GET  /api/v1/stations
GET  /api/v1/stations/{station_id}
GET  /api/v1/stations/{station_id}/timetables
GET  /api/v1/stations/{station_id}/places
```

- 노선 추천은 최근 1시간 조회 기록을 집계해 상위 3개 노선을 반환합니다.
- 노선 조회 기록은 인증 선택 API입니다. 유효한 Access Token이 있으면 `userId`를,
  인증 헤더가 없으면 `null`을 `line_view_logs`에 저장합니다. 잘못된 토큰은 `401`입니다.
- 역 목록은 이름 검색, 노선 필터, 페이지네이션을 지원하고 좌표와 소속 노선을 함께
  반환합니다. 프론트에서 한 번에 보관하려면 `size=100`으로 조회할 수 있습니다.
- 시간표는 V1.10의 `train_no`를 `trainNo`로 반환합니다. `arrivalTime`과
  `departureTime`은 `24:00:00` 이후 값도 보존하기 위해 `HH:MM:SS` 문자열입니다.
- 주변 장소는 V1.10의 `place_stations`에 연결된 반경 1km 이내 장소를 조회합니다.

### 구현된 회원 관리 흐름

회원 조회는 Access Token만 요구하고, 수정·탈퇴는 Access Token과 목적별 재인증 토큰을
함께 요구합니다.

```text
POST /api/v1/auth/reauthenticate
  purpose: PROFILE_UPDATE | PASSWORD_CHANGE | WITHDRAWAL

GET    /api/v1/users/me
PATCH  /api/v1/users/me
PATCH  /api/v1/users/me/password
DELETE /api/v1/users/me

GET    /api/v1/users/me/favorites
POST   /api/v1/users/me/favorites/{station_id}
DELETE /api/v1/users/me/favorites/{station_id}
```

재인증 토큰은 5분 동안 유효하며 수정·탈퇴 요청의 `X-Reauthentication-Token` 헤더로
전달합니다. 자세한 프론트 연동 규칙은
[백엔드 연동 인수인계 문서](../docs/BACKEND-HANDOFF.md)를 참고합니다.

## 검사

```powershell
pytest
ruff check .
```

현재 전체 자동화 테스트 기준은 70개입니다.

## 데이터베이스

프로젝트 루트에서 DB V1.10 MySQL 스키마를 적용합니다. 스키마가 `metrotrip`
데이터베이스를 생성하므로 데이터베이스명을 별도로 지정하지 않습니다.

```powershell
Get-Content .\db\schema\mysql\schema_mysql_V1.10.sql -Raw |
  mysql -u 사용자명 -p
```

이후 `db/seed/`의 SQL을 파일명 번호 순서대로 적용합니다. 자세한 초기화 순서와 Oracle
대체 스키마는 [DB README](../db/README.md)를 참고합니다.

`Base.metadata.create_all()`은 테스트용 임시 DB에서만 사용하며 팀의 개발 DB 초기화에는
사용하지 않습니다. DB와 애플리케이션의 UTC 통일은 아직 적용 전 검토사항입니다.
