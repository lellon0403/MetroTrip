# MetroTrip

**지하철 노선 기반 관광 추천 서비스** — 자차 없이 지하철만으로 이동하는 사용자를 위해,
역을 선택하면 그 역 **반경 1km 안의 가볼 만한 장소**를 지도에 보여주는 웹 앱입니다.

**배포 주소: https://lellon0403.github.io/MetroTrip/** (`main` 푸시 시 자동 배포)

> 현재 단계: **프론트엔드 MVP + 백엔드 기본 골격 구성**
> 대상 노선: **1호선 천안·아산 구간** 우선 (전체 노선은 최종 목표)
> 만들 범위는 [docs/SPEC.md](docs/SPEC.md)에 정의되어 있습니다. 여기 없는 기능은 지금 만들지 않습니다.

---

## 문서

| 문서 | 언제 보나 |
|---|---|
| [docs/HANDOFF.md](docs/HANDOFF.md) | **다른 PC에서 이어서 작업할 때.** 현재 상태·세팅·함정·배포 |
| [docs/GIT-GUIDE.md](docs/GIT-GUIDE.md) | **Git이 처음이라면 여기부터.** 명령어·충돌 해결·사고 복구 |
| [docs/CLAUDE-CODE-WORKFLOW.md](docs/CLAUDE-CODE-WORKFLOW.md) | Claude Code로 작업하는 흐름과 프롬프트 모음 |
| [docs/SPEC.md](docs/SPEC.md) | **개발 시작 전 필독.** MVP 범위와 구현 순서 |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | **작업 시작 전 필독.** 브랜치·커밋·PR·파일 담당 |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | 전체 요구사항과 P0/P1/P2 단계 구분 |
| [docs/PRESENTATION.md](docs/PRESENTATION.md) | 발표 구성안과 데모 시나리오 |
| [docs/BACKEND-HANDOFF.md](docs/BACKEND-HANDOFF.md) | 백엔드 연동 시 교체 지점 |
| [docs/WORKLOG.md](docs/WORKLOG.md) | 날짜별 작업 기록 |

원본 기획 문서: [요구사항정의서](https://docs.google.com/spreadsheets/d/1VoXGmwvz8NwPQYi8wy_9lcEH0s8k9UKr7djuU2-z6Ss/edit?gid=0#gid=0) · [프로젝트 계획서](https://docs.google.com/document/d/1MlQHFs3MgN9aMbEL9d6cPHoQJKAHHlsZg-pmBKghsd4/edit?tab=t.0)

## 기술 스택

- React + Vite + TypeScript
- 카카오맵 JavaScript SDK + 카카오 로컬(Places) API
- FastAPI + SQLAlchemy + MySQL (백엔드 기본 골격)

## 시작하기

```bash
cd frontend
```

```bash
npm install
```

```bash
npm run dev
```

백엔드 실행 방법은 [backend/README.md](backend/README.md)를 참고하세요.

### 카카오 API 키 설정

1. [카카오 개발자 센터](https://developers.kakao.com/)에서 로그인 후 **내 애플리케이션 → 애플리케이션 추가하기**
2. 생성한 앱 → **앱 키**에서 **JavaScript 키** 복사
3. **플랫폼 → Web 플랫폼 등록**에 사용할 도메인 추가
   - 로컬 개발: `http://localhost:5173`
   - 배포 시: 배포 URL도 함께 등록
4. `frontend/.env.example`을 복사해 `frontend/.env` 파일을 만든 후 아래 내용 작성

```
VITE_KAKAO_MAP_KEY=발급받은_JavaScript_키
```

> `frontend/.env`는 `.gitignore`에 포함되어 있습니다. **절대 커밋하지 마세요.**
> 키가 커밋되면 즉시 팀에 알리고 카카오 콘솔에서 키를 재발급해야 합니다.

## 팀

| 역할 | 담당 |
|---|---|
| PM | 전세호 |
| 백엔드 | 윤홍규 |
| 프론트엔드 | 우진, 황지성 |
| DB | 김유진 |
