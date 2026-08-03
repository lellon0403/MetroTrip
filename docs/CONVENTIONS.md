# 협업 규칙 (Conventions)

여러 대의 PC에서, Claude Code와 손코딩이 섞여서 작업합니다.
**서로 꼬이지 않게 하는 것이 이 문서의 목적**입니다. 작업 시작 전에 한 번 읽고 시작해 주세요.

> 📌 **Git이 익숙하지 않다면 [GIT-GUIDE.md](GIT-GUIDE.md) 를 먼저 보세요.**
> 이 문서는 "무엇을 지킬지"(규칙), GIT-GUIDE는 "어떻게 하는지"(명령어)를 다룹니다.

---

## 1. 작업 시작 전 3줄 체크리스트

1. `git pull` 먼저. (안 하면 충돌은 100% 납니다)
2. 오늘 내가 만질 파일이 [WORKLOG.md](WORKLOG.md)에서 **다른 사람이 잡고 있는 파일인지** 확인.
3. 브랜치 새로 파고 시작. `main`에 직접 커밋하지 않습니다.

> 명령어가 기억 안 나면 [GIT-GUIDE.md](GIT-GUIDE.md) 3장(매일 하는 작업 흐름)을 그대로 복사해서 쓰세요.

## 2. 브랜치 전략

- `main` — 항상 **동작하는** 상태 유지. 직접 push 금지, PR로만 병합.
- 작업 브랜치: `<타입>/<범위>-<내용>`

```
feat/fe-station-list
feat/fe-kakao-map
fix/fe-marker-duplicate
docs/spec-update
```

타입: `feat` / `fix` / `refactor` / `docs` / `chore`
범위: `fe`(프론트) / `be`(백엔드) / `db` / `infra`

> 프론트 2명(우진, 황지성)이 동시에 작업하므로, **한 브랜치에 두 사람이 같이 커밋하지 않습니다.**
> 기능 단위로 브랜치를 나누고 PR로 합칩니다.

## 3. 커밋 메시지

```
<타입>: <한 줄 요약>

(필요하면) 왜 이렇게 했는지
```

예시:

```
feat: 역 목록 컴포넌트 추가
fix: 역 변경 시 이전 마커가 남는 문제 수정
docs: MVP 범위에서 다크모드 제외 명시
```

- 한글로 써도 됩니다. 팀 내 소통이 우선입니다.
- 커밋은 **작게, 자주**. "하루치 몰아서 1커밋" 금지.

## 4. PR 규칙

- PR 제목 = 커밋 제목과 동일한 형식
- PR 본문에 아래 3가지는 꼭 적기:
  1. **무엇을** 했는지
  2. **어떻게 확인**했는지 (브라우저에서 확인한 화면 / 스크린샷)
  3. 관련 문서 링크 (`docs/SPEC.md`의 어떤 항목인지)
- 리뷰어 1명 이상 승인 후 병합. (급하면 Discord에서 확인받고 사유를 PR에 남기기)
- 병합은 **Squash and merge** 권장 — 히스토리가 깔끔해집니다.

## 5. 파일 담당 구역 (충돌 방지)

> **현재 상태: 담당자 고정 없음.** MVP는 Claude Code로 개발하므로 사람별 구역을 나누지 않습니다.
>
> **브랜치를 나눠 쓰면 같은 시간에 동시 작업해도 됩니다.** 서로의 작업이 덮어써지지 않습니다.
> 다만 **같은 파일을 동시에 고치면 나중에 합칠 때 충돌**이 나므로, 아래 표의 공용 파일만 주의하세요.
> (충돌은 사고가 아니라 정상입니다. 해결법은 [GIT-GUIDE.md](GIT-GUIDE.md) 5장)
>
> 작업 시작 전 [WORKLOG.md](WORKLOG.md)에 **어떤 파일을 만질지** 적어두면 충돌을 미리 피할 수 있습니다.

| 영역 | 파일/폴더 | 주의사항 |
|---|---|---|
| 지도 | `frontend/src/components/MapView/*` | |
| 역 목록/검색 | `frontend/src/components/StationList/*` | |
| 역 데이터 | `frontend/src/data/stations.json` | **수정 전 공지** — 모두가 참조 |
| 공통 타입 | `frontend/src/types/*` | **단독 수정 금지**, PR 필수 |
| 전역 스타일 | `frontend/src/index.css` | 수정 전 공지 |

> `frontend/src/types/*` 와 `frontend/src/data/stations.json`은 **모두가 참조하는 공용 파일**입니다.
> 여기를 바꾸면 남의 코드가 깨집니다. 바꾸기 전에 반드시 알리세요.

## 6. 문서화 규칙

- 문서는 전부 `docs/` 아래 마크다운으로.
- **기능을 바꾸면 문서도 같은 PR에서 바꿉니다.** (코드만 바뀌고 문서가 남는 게 제일 위험)
- 범위(스코프) 변경은 코드보다 [SPEC.md](SPEC.md) 를 **먼저** 수정.
- 하루 작업이 끝나면 [WORKLOG.md](WORKLOG.md)에 3줄 남기기 (한 것 / 다음 할 것 / 막힌 것).

### 문서 목록

| 문서 | 용도 |
|---|---|
| [GIT-GUIDE.md](GIT-GUIDE.md) | Git/GitHub 사용법 (명령어, 충돌 해결, 사고 복구) |
| [CLAUDE-CODE-WORKFLOW.md](CLAUDE-CODE-WORKFLOW.md) | Claude Code 작업 흐름, 프롬프트 모음 |
| [`CLAUDE.md`](../CLAUDE.md) | Claude Code가 자동으로 읽는 팀 공통 규칙 |
| [SPEC.md](SPEC.md) | MVP 범위 — 개발의 기준 |
| [REQUIREMENTS.md](REQUIREMENTS.md) | 전체 요구사항 + 단계 구분 |
| [CONVENTIONS.md](CONVENTIONS.md) | 이 문서 (협업 규칙) |
| [PRESENTATION.md](PRESENTATION.md) | 발표 구성안 + 데모 시나리오 |
| [BACKEND-HANDOFF.md](BACKEND-HANDOFF.md) | 백엔드 연동 시 교체 지점 |
| [WORKLOG.md](WORKLOG.md) | 날짜별 작업 기록 |

## 7. Claude Code를 쓸 때

> 상세한 작업 흐름과 프롬프트 예시는 [CLAUDE-CODE-WORKFLOW.md](CLAUDE-CODE-WORKFLOW.md) 참고.
> 저장소 루트의 [`CLAUDE.md`](../CLAUDE.md)는 **Claude Code가 자동으로 읽는 팀 공통 규칙**입니다.

여러 PC에서 각자 Claude Code를 돌리면 **같은 파일을 서로 다르게 고쳐놓는 일**이 생깁니다.

- 작업 전 `git pull`, 작업 후 바로 push. 로컬에 오래 들고 있지 않기.
- Claude에게 시킬 때 **"docs/SPEC.md 범위 안에서만"** 이라고 명시하기.
- Claude가 SPEC에 없는 기능(로그인, 다크모드 등)을 제안하면 **거절**하고 P1/P2로 미루기.
- 생성된 코드는 **브라우저에서 직접 동작 확인 후** 커밋. 확인 없이 커밋 금지.
- 라이브러리를 새로 설치했으면 PR 본문에 **왜 필요한지** 적기.

## 8. 환경변수

- `frontend/.env`는 **절대 커밋하지 않습니다.** (`.gitignore`에 포함되어 있음)
- 새 프런트엔드 환경변수를 추가하면 `frontend/.env.example`에 **키 이름만** 추가하고 Discord에 공유.
- 카카오 키가 커밋된 걸 발견하면 즉시 Discord에 알리고 **키를 재발급**합니다.
