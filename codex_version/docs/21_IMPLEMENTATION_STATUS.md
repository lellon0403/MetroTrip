# Phase A~H 구현 상태

기준일: 2026-08-10

이 문서는 설계 목표와 실제 구현·검증 상태를 구분한다. `REAL`은 실제 코드와 로컬 또는 Docker 인프라를 사용한 증거가 있다는 뜻이며, 외부 공급자나 운영 환경까지 검증됐다는 뜻은 아니다.

## 단계별 상태

| 단계 | 구현 결과 | 현재 검증 |
|---|---|---|
| Phase A | npm workspace, Next/Expo/FastAPI, generated OpenAPI 계약, Alembic, Compose, CI | Compose 구문, API·worker·Web 이미지 build, 전체 컨테이너 기동과 PostGIS·Redis·MinIO·Mailpit health, Web 프록시 200 통과 |
| Phase B | Argon2 identity, refresh 회전·family 재사용 탐지, 비밀번호 재설정, 프로필, 현재 비밀번호+`DELETE` 탈퇴, transit ingestion ledger·fixture | migration `0009 (head)`, seed 2회 반복, 인증·탈퇴·잔존 reset/device 제거 실제 PostgreSQL API 통합 테스트 통과 |
| Phase C | PostGIS 장소 검색, Kakao 지도/목록 UX, 즐겨찾기, fixture·Kakao Local provider, TTL 캐시와 추정 경로 비교 | 999m 포함·1001m 제외 경계 테스트와 GiST 실행 계획, Kakao 공급자 단위 테스트 통과. 실제 Kakao 지도 타일·Kakao Local 장소·다중 카테고리·즐겨찾기·일정 번호 마커를 Docker Web과 브라우저에서 확인 |
| Phase D | 구조화 다일정 계획, 명시적 순서, ETag, UNLISTED 공유·회수·복제, 계획 soft delete | 실제 DB 생성·교체 수정·428/412·공유·복제·공유 즉시 폐기·연결 모집 이력 보존 E2E 통과 |
| Phase E | 후기 CRUD, 구조화 본문, 태그·도움됨, claim/presign/complete 미디어 검증 | 실제 MinIO upload와 checksum·signature 검사 통과. 타 사용자 media 접근·위조 metadata 거부 테스트 통과 |
| Phase F | 모집·신청 상태, row lock 정원 처리, 자동 마감, outbox, 마이페이지 | 제품 여정의 복수 신청·정원 마감과 실제 DB 20개 병렬 수락/정원 5명 테스트에서 초과 0 통과 |
| Phase G | role 기반 관리자, 공지·신고·moderation·감사, Redis rate limit, 구조화 로그/metrics, transactional outbox worker, 백업 도구 | worker 성공·재시도 실제 DB 테스트, 관리자 흐름 E2E, custom-format 백업과 별도 DB 안전 복원·핵심 건수 비교 통과 |
| Phase H | Expo Router 5-tab field UX, SecureStore refresh, 메모리 access, 위치 거부 대체, 사용자별 SQLite 계획 캐시, 오늘 모드, deep link, 후기·모집 상세 | 전체 TypeScript와 Expo Router Web bundle export 통과. Android/iOS 실제 기기는 `NOT VERIFIED` |

## 상태 분류

- `REAL`: 독립 Web/API/Mobile 코드, PostgreSQL/PostGIS schema, Redis rate limit, MinIO S3 계약, generated OpenAPI client, 인증·계획·후기·모집·운영 API, Docker API·worker·Web, same-origin Web proxy, outbox worker.
- `MOCKED`: 천안·아산 장소·교통 fixture, 추정 routing, Mailpit/dev email, credential 없는 push logger.
- `BLOCKED`: 운영 이메일·실 push credential, production domain/cloud, EAS·App Store·Play Console signing 설정.
- `NOT VERIFIED`: 최신 반경 원 수정본의 Docker Web 재빌드 후 500m·1km·2km 화면 확인, Redis 실제 장애 전환, Android/iOS 실제 기기·실 push·universal/app link.

## 완료된 검증

- Infrastructure: 사용자 PowerShell에서 PostgreSQL 17/PostGIS 3.5.2, Redis `PONG`, MinIO health 200, Mailpit 200, API·worker·Web 이미지 build와 전체 스택 health 통과.
- API static: Ruff check와 format check 87개 Python 파일 통과.
- API test: 기본 모드 31개 통과·실 DB 전용 5개 skip, `METROTRIP_RUN_POSTGRES_TESTS=1`에서 총 36개 통과.
- Database: Alembic `0009 (head)`, seed 2회 동일 checksum, 역 10개·장소 12개, PostGIS 1km 경계, 20개 병렬 모집 수락, 계획 soft delete 통과.
- API E2E: same-origin 인증·refresh rotation/reuse·프로필·탈퇴부터 탐색·즐겨찾기·경로·계획·공유·모집 정원·MinIO 미디어·후기까지 전체 제품 여정 통과.
- Worker: `FOR UPDATE SKIP LOCKED`, 처리 성공, 실패 metadata와 지수 backoff 재예약을 실제 PostgreSQL에서 확인했고 현재 outbox는 모두 처리됨.
- Security/degradation: production 개발 secret 부팅 거부, JWT issuer/audience 필수 검증, optional Redis/MinIO 장애 시 degraded readiness와 PostgreSQL 장애 시 503 테스트 통과.
- Contract: FastAPI OpenAPI 재생성 전후 generated TypeScript SHA-256 동일, operation ID 검사와 Web/Mobile 전체 TypeScript 통과.
- Web: ESLint, Next.js production build 14 routes, desktop·390px 실제 browser 렌더링, same-origin refresh 후 full reload 세션 유지, 주요 overflow·navigation·loading/empty/error 확인.
- Mobile: Expo SDK 57 TypeScript와 Expo Router Web bundle export 통과.
- Operations: `docker compose config --quiet`, Docker 이미지 build/run, custom-format backup 생성과 격리 복원 비교(`10,12,20,10,5,5,0008`), PowerShell UTF-8 BOM·parser 통과.

## 알려진 제한

- Kakao SDK와 실 장소 공급자는 `http://localhost:3100`에서 실 호출을 확인했다. 카카오 허용 도메인에 등록되지 않은 `127.0.0.1` 주소는 SDK가 실패할 수 있다.
- 모바일은 [MOBILE_RELEASE_CHECKLIST.md](MOBILE_RELEASE_CHECKLIST.md)의 native permission, keyboard, safe area, offline queue, deep link, push 검증이 남아 있다.
- `npm audit`은 2026-08-09 기준 critical 0, high 47, moderate 7을 보고한다. 대부분 Expo/React Native/Metro와 OpenAPI 도구의 transitive 경로이며 현재 호환 버전에서 `fixAvailable: false`인 핵심 경로가 있어 강제 downgrade를 적용하지 않았다.
- 실제 Redis 장애 전환은 별도 실행 증거가 필요하다.
- Kakao Local은 REST 키 비노출, 24시간 조건 ledger 기반 PostGIS 캐시, 장애 시 STALE/502 경계를 구현했지만 실제 자격 증명·쿼터·도메인 허용과 라이선스 표시는 아직 검증하지 않았다.

전체 Docker 스택과 안전한 복원 체크포인트는 2026-08-09 사용자 PowerShell 출력과 로컬 HTTP 재검증을 근거로 통과 판정했다.

## 2026-08-10 제품 경험 보강 상태

- 구현: 홈 aggregation, 메뉴 용어, 맵 FOOD+CAFE 기본 복수 필터·반경 원·즐겨찾기 마커·장소 inspector·시간표/일정 drawer·번호 집중 모드, 후기 masonry/단일 역, 모집 feed/정렬, 이벤트 관리.
- 데이터/API: migration 0009 실제 적용, OpenAPI와 TypeScript 재생성, 로컬 API readiness와 `/home`, 복수 카테고리 장소, 도보 예상 경로, 모집 인기순 실호출 통과.
- 정적/단위 검증: Ruff 전체 통과, 기본 Python 38 passed·5 DB 환경 skip, 실제 PostgreSQL 모드 43 passed, Web/Mobile/contracts 타입 검사, ESLint, JS 단위 4개, Next production build 14 routes 통과.
- 브라우저 검증: 최신 production Web에서 홈 aggregation, 실제 Kakao 지도 타일·장소, 맵 FOOD+CAFE 기본값과 다중 카테고리, 장소 inspector·도보 예상, 즐겨찾기, 시간표·일정 drawer·순번 집중 모드, 후기 검색·상세, 모집 feed를 실제 API 데이터로 확인했다. 상세 링크 사전 로딩을 끄고 후기 목록 조회 시 view count 불변·상세 진입 시 1회 증가도 확인했다. 390×844 viewport에서 홈·모바일 하단 탐색을 확인했다.
- 인프라: 55432/56379/59000/8000/3100 포트 및 PostgreSQL·Redis·MinIO readiness `ok`; `docker compose --env-file NUL config --quiet` 통과.
- 남은 확인: `KakaoMap.tsx`의 `radiusCircle.setMap(map)` 수정본으로 Web 이미지를 다시 빌드한 뒤 반경 원과 500m·1km·2km 변경을 최종 확인한다. 실 지도 타일·장소·즐겨찾기·순번 마커는 이미 검증했다.
