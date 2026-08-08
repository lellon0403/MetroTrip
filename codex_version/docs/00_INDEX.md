# MetroTrip Codex 독립 버전 — 문서 인덱스

## 1. 문서 목적

이 디렉터리는 기존 MetroTrip을 그대로 복제하지 않고, 확인된 문제와 자산을 근거로 제품·UX·기술 구조를 다시 설계한 구현 전 명세다. 앱 코드는 포함하지 않는다.

기준일은 2026-08-09이며, 원격 갱신 확인을 위한 `git fetch`는 `.git/FETCH_HEAD` 쓰기 권한 오류로 실패했다. 따라서 저장소 근거는 로컬 `d8334e8` 스냅샷을 기준으로 한다.

## 2. 증거 상태 표기

| 상태 | 의미 | 사용 원칙 |
|---|---|---|
| `CONFIRMED` | 실행 코드, 최신 DDL, 최신 요구사항처럼 직접 확인됨 | 구현 기준으로 사용 가능 |
| `INFERRED` | 여러 근거로 합리적으로 도출했지만 명시적 결정은 아님 | 구현 전에 담당자 확인 권장 |
| `CONFLICT` | 문서·코드·DB 사이에 상충하는 정의가 있음 | 이 문서의 결정과 근거를 함께 기록 |
| `OPEN` | 제품·운영 정책 결정이 아직 필요함 | 구현 차단 여부와 결정 시점을 명시 |

근거 우선순위는 `실행 가능한 코드·DDL·OpenAPI > 최신 명세 > 요구사항 > 계획서 > 과거 산출물 > 추론`이다. 단, 이 문서의 목표 제품은 현행 구현과 별개이므로 현행 사실과 목표 결정을 분리한다.

## 3. 읽은 근거

### Google Drive

원본 묶음: [2026-2 몰입형 - Google Drive](https://drive.google.com/drive/folders/14vIrqct7QOjg25vE3Iz_SErtaMRbFx_J)

| 자료 | 확인본 | 핵심 용도 | 상태 |
|---|---|---|---|
| [요구사항정의서](https://docs.google.com/spreadsheets/d/1VoXGmwvz8NwPQYi8wy_9lcEH0s8k9UKr7djuU2-z6Ss/edit) | V1.3 | 기능 요구사항과 역할 | `CONFIRMED` |
| [데이터베이스 명세서](https://drive.google.com/file/d/1NQK7qnjLpfx7aLENOjjbnm1csI3ekQQy/view) | V1.10 | 22개 테이블, 제약·인덱스 | `CONFIRMED` |
| ERD | V1.7 | 과거 관계 구조 | `CONFLICT`: V1.10보다 오래됨 |
| [프로젝트 계획서](https://docs.google.com/document/d/1MlQHFs3MgN9aMbEL9d6cPHoQJKAHHlsZg-pmBKghsd4/edit)·제안서 | 최신 Drive 파일 | 문제 정의, 타깃, 초기 기술 구상 | `CONFIRMED`(계획), 구현 근거로는 낮음 |
| [UX/UI 설계도 PDF](https://drive.google.com/file/d/19mocKVcgetLZUpf_8bwwj-jzUUIXaGde/view) | 14쪽 | 지도·계획·후기·즐겨찾기 화면 의도 | `CONFIRMED`(과거 시안) |
| UCD | V1.3 | 방문자·회원·관리자 유스케이스 | `CONFIRMED` |
| 일정 계획서 | 최신 탭 | 과거 일정 | 참고 전용 |

민감 정보인 인증서 파일은 읽지 않았고 근거로 사용하지 않았다.

### 로컬 저장소

| 영역 | 확인 내용 |
|---|---|
| `frontend/` | Vite·React·TypeScript, 반응형 웹, 지도·노선·경로·시간표·인증·마이페이지·후기·모집 화면 |
| `backend/` | FastAPI, 인증·회원·즐겨찾기·후기·모집 실제 구현, 노선·장소·계획·공지 계약만 구현 |
| `db/` | MySQL/Oracle V1.10 DDL, 100개 역·33개 장소·1,690개 시간표 시드, 인덱스 마이그레이션 |
| `docs/` | MVP·연동·UI 규칙·인수인계 문서. 일부는 구현보다 오래됨 |
| `.github/` | `main` 푸시 시 프론트만 GitHub Pages 배포 |
| 검증 | 백엔드 테스트 55개 통과. 프론트 TypeScript 단계는 통과했으나 Vite가 sandbox에서 읽기 금지된 `frontend/.env`를 열지 못해 번들 완료 여부는 미확인 |

## 4. 문서 지도

| 문서 | 답하는 질문 |
|---|---|
| [01_PRODUCT_VISION.md](01_PRODUCT_VISION.md) | 어떤 문제를 누구에게 어떤 방식으로 해결하는가 |
| [02_REQUIREMENTS.md](02_REQUIREMENTS.md) | 기능·비기능 요구사항과 우선순위는 무엇인가 |
| [03_PRODUCT_SCOPE.md](03_PRODUCT_SCOPE.md) | 지금 만들 것과 미룰 것은 무엇인가 |
| [04_USER_FLOWS.md](04_USER_FLOWS.md) | 핵심 사용자 여정은 어떻게 이어지는가 |
| [05_INFORMATION_ARCHITECTURE.md](05_INFORMATION_ARCHITECTURE.md) | 웹·모바일 정보 구조와 내비게이션은 어떻게 다른가 |
| [06_UI_UX_DIRECTION.md](06_UI_UX_DIRECTION.md) | 화면의 시각·상호작용 원칙은 무엇인가 |
| [07_WEB_SPEC.md](07_WEB_SPEC.md) | 웹 화면별 목적·상태·반응형 동작은 무엇인가 |
| [08_MOBILE_SPEC.md](08_MOBILE_SPEC.md) | 모바일 앱의 고유 역할과 화면은 무엇인가 |
| [09_SYSTEM_ARCHITECTURE.md](09_SYSTEM_ARCHITECTURE.md) | 전체 시스템 경계와 데이터 흐름은 무엇인가 |
| [10_FRONTEND_ARCHITECTURE.md](10_FRONTEND_ARCHITECTURE.md) | 웹 코드 구조·상태·데이터 전략은 무엇인가 |
| [11_MOBILE_ARCHITECTURE.md](11_MOBILE_ARCHITECTURE.md) | 모바일 코드·오프라인·딥링크 전략은 무엇인가 |
| [12_BACKEND_ARCHITECTURE.md](12_BACKEND_ARCHITECTURE.md) | API 서버 모듈과 트랜잭션 경계는 무엇인가 |
| [13_API_SPEC.md](13_API_SPEC.md) | 리소스별 API 계약은 무엇인가 |
| [14_DATABASE_DESIGN.md](14_DATABASE_DESIGN.md) | 목표 데이터 모델·제약·인덱스는 무엇인가 |
| [15_AUTH_SECURITY.md](15_AUTH_SECURITY.md) | 인증·권한·보안 정책은 무엇인가 |
| [16_INFRA_DEVOPS.md](16_INFRA_DEVOPS.md) | 환경·배포·관측·복구는 어떻게 구성하는가 |
| [17_TEST_STRATEGY.md](17_TEST_STRATEGY.md) | 무엇을 어느 수준에서 검증하는가 |
| [18_IMPLEMENTATION_PLAN.md](18_IMPLEMENTATION_PLAN.md) | 의존 순서와 단계별 완료 기준은 무엇인가 |
| [19_GAP_ANALYSIS.md](19_GAP_ANALYSIS.md) | 현행과 목표 사이의 차이는 무엇인가 |
| [20_DECISION_LOG.md](20_DECISION_LOG.md) | 주요 선택과 기각한 대안은 무엇인가 |
| [99_OPEN_QUESTIONS.md](99_OPEN_QUESTIONS.md) | 구현 전에 남은 결정은 무엇인가 |

## 5. 일관성 규칙

- 식별자는 API에서 문자열 UUID, DB에서 UUID를 기본으로 한다.
- 시간은 API에서 RFC 3339 UTC, 날짜·역 시간표의 지역 시각은 `Asia/Seoul`과 서비스 일자를 함께 사용한다.
- API JSON은 `camelCase`, DB는 `snake_case`다.
- 목록 API는 커서 페이지네이션을 기본으로 하고 관리자 표 형태만 페이지 번호를 허용한다.
- 삭제는 사용자 콘텐츠에 `soft delete`, 인증 세션·임시 토큰은 즉시 폐기, 법적 보존이 불필요한 민감 데이터는 하드 삭제한다.
- 소스 상태가 바뀌면 먼저 [19_GAP_ANALYSIS.md](19_GAP_ANALYSIS.md)와 [20_DECISION_LOG.md](20_DECISION_LOG.md)를 갱신한다.
