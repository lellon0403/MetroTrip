# MetroTrip Backend

FastAPI 기반 MetroTrip REST API 서버입니다.

## 기술 구성

- FastAPI
- Uvicorn
- Pydantic Settings
- SQLAlchemy 2.x
- PyMySQL
- Pytest
- Ruff

초기 구성에서는 Alembic을 사용하지 않습니다. 데이터베이스는 저장소의
`db/schema/schema_V1.8.sql`을 MySQL에 직접 적용하는 방식으로 초기화합니다.

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

기능을 구현할 때 각 책임 디렉터리에 필요한 파일만 추가합니다.
디렉터리별 상세 책임과 의존 방향은 [ARCHITECTURE.md](ARCHITECTURE.md)를 참고합니다.

```text
app/
├─ routers/community.py
├─ models/community.py
├─ schemas/community.py
├─ services/community.py
└─ repositories/community.py
```

## 로컬 실행

PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

런타임 의존성만 설치하려면 다음 명령을 사용할 수 있습니다.

```powershell
python -m pip install -r requirements.txt
```

서버 확인:

```text
GET http://localhost:8000/health
GET http://localhost:8000/docs
```

## API 계약과 Swagger

`http://localhost:8000/docs`에서 프론트엔드 협업용 API 계약을 확인할 수 있습니다.
원본 OpenAPI JSON은 `http://localhost:8000/openapi.json`에서 제공합니다.

- 공통 Base URL: `/api/v1`
- JSON 필드명: `camelCase`
- 목록 조회: `page`, `size` 페이지네이션
- 인증 필요 API: Swagger의 `Authorize`에 Bearer Access Token 입력
- 현재 상태: `/health` 외 비즈니스 API는 계약만 정의되어 `501` 반환
- 실시간 지하철 위치와 길 안내: 백엔드 범위에서 제외
- 현재 좌표 표시: 프론트엔드의 Geolocation API로 처리
- 여행 계획 공유: 로그인 없는 읽기 전용 링크만 지원
- 게시판: 좋아요와 정렬 옵션 제외

스키마나 엔드포인트를 변경하면 코드와 OpenAPI 검증 테스트를 함께 수정합니다.

## 검사

```powershell
pytest
ruff check .
```

## 데이터베이스

MySQL에 `metrotrip_db`를 만든 후 프로젝트 루트에서 V1.8 스키마를 적용합니다.

```powershell
Get-Content db/schema/schema_V1.8.sql -Raw |
  mysql -u 사용자명 -p metrotrip_db
```

현재 저장소에 V1.8 SQL과 ERD가 추가되기 전까지 DB 모델 구현은 시작하지 않습니다.
개발 DB를 변경한 경우 SQL 파일과 DB 문서를 함께 갱신합니다.

`Base.metadata.create_all()`은 테스트용 임시 DB에서만 사용하며 팀의 개발 DB 초기화에는
사용하지 않습니다.
