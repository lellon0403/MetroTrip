# 웹 프론트엔드 아키텍처

## 목표

- 공개 콘텐츠는 빠르게 렌더링·공유·검색 가능해야 한다.
- 지도처럼 상호작용이 큰 부분만 클라이언트 경계로 격리한다.
- API 타입을 손으로 복제하지 않는다.
- URL이 필터·선택·페이지 문맥의 공유 가능한 원장이다.

## 디렉터리

```text
apps/web/src/
├─ app/                       route, layout, loading, error
│  ├─ (public)/
│  ├─ (account)/
│  └─ admin/
├─ features/
│  ├─ station-explorer/
│  ├─ route-search/
│  ├─ plan-editor/
│  ├─ reviews/
│  └─ recruitments/
├─ entities/                  Station, Place, Plan 등 UI 모델
├─ shared/
│  ├─ api/                    생성 클라이언트 wrapper
│  ├─ auth/
│  ├─ map/
│  ├─ ui/
│  └─ lib/
└─ styles/                    token binding, globals
```

라우트 파일은 데이터 조합과 화면 경계만 담당한다. 기능 규칙은 `features`, 재사용 가능한 리소스 표현은 `entities`, 범용 요소는 `shared`에 둔다.

## 렌더링 전략

| 화면 | 전략 | 이유 |
|---|---|---|
| 역·장소·후기·모집 공개 상세 | 서버 렌더링 + 태그 기반 재검증 | SEO·공유·초기 표시 |
| 목록 검색 | 서버 초기 결과 + 클라이언트 전환 | URL 공유와 빠른 필터 |
| 지도 | 동적 로드 클라이언트 컴포넌트 | SDK가 브라우저 의존 |
| 계획 편집·마이·관리자 | 인증 클라이언트 앱 + 서버 가드 | 높은 상호작용, 비공개 |
| 공유 계획 | 서버 렌더링 | 링크 접근성과 캐시 |

캐시는 공개 마스터/콘텐츠 읽기에만 사용하고 사용자별 응답은 공유 캐시하지 않는다. mutation 성공 시 영향을 받는 query와 서버 태그를 명시적으로 무효화한다.

## 상태 소유권

| 상태 | 저장 위치 |
|---|---|
| 필터, 검색어, 선택 ID, 정렬 | URL search params |
| 서버 데이터 | TanStack Query 또는 프레임워크 서버 캐시 |
| 폼 | React Hook Form + 스키마 검증 |
| 지도 viewport·열린 패널 | 기능 로컬 상태 |
| 인증 사용자 | `/me` 조회 결과, 메모리 캐시 |
| 테마·접근성 선호 | 계정 설정 + 쿠키/로컬 fallback |
| 장기 초안 | IndexedDB, 사용자·리소스별 키 |

전역 상태 라이브러리는 여러 라우트가 동시에 수정해야 하는 상태가 실제로 생길 때만 추가한다.

## API 계층

1. `services/api`가 OpenAPI를 생성한다.
2. CI가 breaking change와 schema lint를 검사한다.
3. `packages/contracts`에 TypeScript client·타입을 생성한다.
4. 앱은 생성 함수를 직접 화면에서 부르지 않고 feature query/mutation으로 감싼다.
5. 서버 오류 코드는 사용자 메시지와 관측 이벤트로 매핑한다.

mutation에는 `Idempotency-Key`가 필요한 생성 작업을 지원한다. 401 자동 갱신은 한 요청으로 직렬화하고 재시도는 1회로 제한한다.

## 인증 브라우저 전략

- 리프레시 토큰은 `HttpOnly; Secure; SameSite=Lax` 쿠키로 저장한다.
- 액세스 토큰은 짧게 유지하고 브라우저 영구 저장소에 두지 않는다.
- Next.js 경유 계층은 SSR 인증과 same-origin 세션 교환에만 사용한다.
- CSRF 보호는 same-site 쿠키, Origin 검사, 상태 변경 요청 토큰을 조합한다.
- 상세 정책은 [15_AUTH_SECURITY.md](15_AUTH_SECURITY.md)를 따른다.

## 지도 모듈

- 공급자 SDK를 `MapAdapter` 인터페이스 뒤에 둔다.
- `MarkerLayer`, `RouteLayer`, `Viewport`, `Selection`을 분리한다.
- 지도 이벤트는 throttle하고 `이 영역 검색` 전에는 서버 검색을 반복하지 않는다.
- 지도와 목록 선택은 하나의 resource ID 상태를 공유한다.
- SDK 실패 시 목록은 계속 동작해야 한다.

## 계획 편집

- 서버 `version` 또는 ETag로 낙관적 동시성을 검증한다.
- 정렬은 안정된 항목 ID와 `position`을 사용한다.
- 자동 저장은 짧은 debounce 후 patch command를 보내며 진행 상태를 보여준다.
- 충돌 시 서버 버전 덮어쓰기를 자동 실행하지 않는다.
- 드래그 외에 키보드·버튼 정렬을 제공한다.

## 디자인 시스템

- `packages/design-tokens`가 웹 CSS 변수와 모바일 토큰의 원천이다.
- 공용 컴포넌트는 접근성 동작까지 소유하고, 도메인 문구·API 호출은 포함하지 않는다.
- 페이지 폭은 `content-sm/md/lg/map-full` 컴포넌트로만 지정한다.
- 격리된 컴포넌트 문서화는 Phase 0 중반부터 적용한다.

## 성능 예산

- 공개 목록 초기 JS는 지도 SDK를 제외하고 최소화한다.
- 지도 SDK는 지도 영역이 보이거나 사용자가 열 때 로드한다.
- 이미지는 AVIF/WebP 변형, 크기 지정, 화면 밖 지연 로드.
- 후기 편집기와 관리자 표는 route-level chunk로 분리한다.
- 번들·LCP·INP 회귀를 CI와 실사용 지표로 감시한다.

## 오류와 관측

- route-level 오류 경계, 기능별 부분 오류, mutation 오류를 구분한다.
- 클라이언트 이벤트에는 trace ID, route, resource type, app version을 포함한다.
- 토큰·이메일·본문·정확한 위치는 로그에 넣지 않는다.

## 2026-08-10 맵 상태 경계

- 역 선택, 검색 중심, 선택 카테고리, 반경, 선택 장소, drawer, 일정 집중 모드는 페이지 로컬 상태로 분리한다.
- 지도 SDK 객체와 overlay는 React state에 넣지 않고 ref로 수명주기를 관리한다. 장소 목록은 API 내부 UUID를 단일 식별자로 사용한다.
- 일정은 `PlanView`를 편집한 뒤 650ms debounce와 ETag `If-Match`로 자동 저장한다. 재정렬은 키보드 접근 가능한 위/아래 버튼을 함께 제공한다.
- 홈·후기 공개 목록은 서버 렌더링하고 맵·일정·모집 작성처럼 상호작용이 큰 화면만 client component로 둔다.
