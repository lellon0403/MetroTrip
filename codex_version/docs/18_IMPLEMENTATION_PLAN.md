# 구현 계획

## 원칙

- 일정이 아니라 의존성 순서로 단계를 나눈다.
- 각 단계는 사용자에게 보이는 수직 기능과 운영·테스트를 함께 끝낸다.
- “API 계약만 생성”을 기능 완료로 보지 않는다.
- 범위를 바꾸면 먼저 요구사항·결정 로그·API·DB 문서를 함께 갱신한다.

## Phase A — 저장소와 계약 기반

| 항목 | 내용 |
|---|---|
| 목표 | 웹·모바일·API가 같은 계약과 디자인 토큰을 사용하는 뼈대 구축 |
| 모듈 | monorepo, web shell, API platform, contracts, design tokens, local infra |
| 선행 | 제품 범위·식별자·인증 저장 전략 승인 |
| 작업 | Next/Expo/FastAPI skeleton, PostgreSQL/PostGIS, Alembic, OpenAPI 생성, CI, 관측 기본 |
| 완료 기준 | 한 명령 local 시작; health/ready; migration up; 계약 client 생성; 웹 공개 route와 모바일 shell 실행; secret scan |

## Phase B — 데이터 원장과 인증

| 항목 | 내용 |
|---|---|
| 목표 | 신뢰 가능한 사용자·교통 마스터와 안전한 세션 제공 |
| 모듈 | identity, transit ingestion, admin source status |
| 선행 | Phase A, 데이터 라이선스, 탈퇴 기본 정책 |
| 작업 | 사용자/identity/session/challenge, refresh rotation/reuse, line/station/calendar/trip/stop-time import |
| 완료 기준 | 가입·로그인·갱신·재설정·재인증 E2E; token 재사용 탐지; 파일럿 데이터 품질 보고서; 자정 시간표 테스트 |

## Phase C — 지도 탐색과 경로

| 항목 | 내용 |
|---|---|
| 목표 | 역 선택부터 주변 장소와 이동 대안 확인까지 핵심 발견 경험 완성 |
| 모듈 | discovery, map adapter, transit reads, routing |
| 선행 | Phase B 교통 데이터, 장소 출처·지도 공급자 결정 |
| 작업 | 역/장소 검색, bounds/radius, 카테고리, 장소 상세, 시간표, 경로 계산, 근거 표시, 즐겨찾기 |
| 완료 기준 | 검색→역→장소 흐름 웹 E2E; 지도 실패 목록 fallback; 1km 경계 검증; 경로 대안·실측/추정 표시; 성능 예산 |

## Phase D — 여행 계획과 공유

| 항목 | 내용 |
|---|---|
| 목표 | 발견한 장소를 실행 가능한 일정으로 만들고 공유·복제 |
| 모듈 | planning, plan editor, share links |
| 선행 | Phase C 역·장소·경로 ID 안정화 |
| 작업 | 계획/일자/항목 CRUD, 명시적 순서, 충돌 검증, ETag, 공유 회수/만료, 복제 |
| 완료 기준 | 경로에서 계획 생성→장소 추가→정렬→공유→복제 E2E; 동시 편집 충돌; 회수 링크 403/410 정책; 키보드 정렬 |

## Phase E — 후기·미디어

| 항목 | 내용 |
|---|---|
| 목표 | 계획과 실제 경험이 다음 사용자의 탐색 자산이 되게 함 |
| 모듈 | reviews, tags, media, search projection |
| 선행 | Phase D 계획 snapshot 정책, 객체 저장소 |
| 작업 | 이미지 사전서명/검사/변형, 후기 CRUD, 구조화 본문, 태그, 검색, 초안 복원 |
| 완료 기준 | 계획 불러오기→이미지→게시 E2E; 악성 파일 격리; 다른 사용자 미디어 거부; 공개 SSR/OG; 삭제·복구 테스트 |

## Phase F — 동행 모집과 마이페이지

| 항목 | 내용 |
|---|---|
| 목표 | 계획 기반 모집과 개인 활동 관리를 완성 |
| 모듈 | recruitments, applications, my pages, outbox |
| 선행 | Phase D 계획, Phase B identity, outbox 기반 |
| 작업 | 모집 CRUD, 신청·취소·수락·거절, 정원 잠금, 내 활동 projection, 알림 outbox 이벤트(P1 전송 UI의 기반) |
| 완료 기준 | 작성→복수 신청→동시 수락→자동 마감 E2E; capacity 초과 0; 삭제 알림 outbox; 마이 영역 부분 오류 복구 |

## Phase G — 운영·출시 강화

| 항목 | 내용 |
|---|---|
| 목표 | 파일럿 사용자를 안전하게 받을 수 있는 운영 상태 |
| 모듈 | moderation, notices, admin, observability, backup |
| 선행 | Phase C~F 수직 기능 |
| 작업 | 장소/공지, 신고/숨김, 감사 로그, rate limit, CSP, SLO 대시보드, 백업 복원, 데이터 동기화 dry-run |
| 완료 기준 | 출시 게이트 전부 통과; 권한 조합 테스트; 복원 리허설; 운영 런북; 지원 지역/기준일 UI 확인 |

## Phase H — 모바일 현장 경험(P1)

| 항목 | 내용 |
|---|---|
| 목표 | 여행 당일 계획·시간표·위치·알림 사용성을 검증 |
| 모듈 | Expo app, secure auth, offline DB, sync queue, deep links, push |
| 선행 | 안정된 API·계약, Phase G 운영 |
| 작업 | 홈/탐색/계획/당일 모드/커뮤니티/마이, foreground 위치, 오프라인 계획, 푸시 |
| 완료 기준 | 실제 기기 offline/권한 거부/딥링크 E2E; secure storage; crash-free 목표; 앱 심사 체크리스트 |

## Phase I — 커뮤니티·확장(P1/P2)

| 항목 | 내용 |
|---|---|
| 목표 | 정보 재사용과 지역 확장을 데이터로 검증 |
| 모듈 | community posts/comments, reactions, social auth, new transit sources, realtime adapter |
| 선행 | moderation 성숙도, 공급자 계약, 사용자 행동 데이터 |
| 작업 | 질문/팁/댓글, 후기 도움됨, 소셜 로그인, 추가 노선, 실시간 adapter |
| 완료 기준 | 각 기능별 별도 출시 게이트와 SLO; 실시간 실패 폴백; 신규 지역 데이터 품질 기준 |

## 병렬화 가능 영역

- Phase B의 identity와 교통 ingestion은 계약·DB 기반 확정 후 병렬 가능.
- Phase C의 지도 UI와 routing 알고리즘은 고정된 station/line fixture로 병렬 가능.
- Phase E 미디어 파이프라인과 후기 편집 UI는 media claim 계약 확정 후 병렬 가능.
- 운영 대시보드·접근성 검증은 마지막에 몰지 않고 모든 단계에 병행한다.

## 중단 조건

- 데이터 라이선스나 지역 커버리지가 확인되지 않음
- 탈퇴·공개 계획·모집 연락 정책이 출시를 법적으로 차단함
- API/DB 계약이 문서와 CI에서 불일치함
- 핵심 흐름을 합성 데이터로만 통과하고 실제 공급 데이터로 검증하지 못함
