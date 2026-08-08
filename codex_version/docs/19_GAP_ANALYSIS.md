# 현행 대비 격차 분석

## 1. 분석 기준선

- 로컬 브랜치: `experiment/codex-rebuild`
- 커밋: `d8334e8` (`origin/develop`, 로컬 `develop`과 같은 포인터)
- 원격 fetch: `.git/FETCH_HEAD` 권한 오류로 실패해 원격 최신성 미확인
- 백엔드 테스트: 55개 통과
- 프론트: `npm.cmd` 실행에서 TypeScript 단계는 통과했으나 Vite가 sandbox 정책상 읽을 수 없는 `frontend/.env`에서 `EPERM`이 발생해 번들 완료 여부는 미확인
- 작업 트리의 기존 미추적 `AGENT.md`, 런타임 로그는 본 작업과 무관하며 수정하지 않음

## 2. 현행 구현 요약

### 프론트

`CONFIRMED`

- Vite·React·TypeScript·Tailwind 기반 반응형 SPA
- 노선도, 역 지도, 경로 비교·타임라인, 시간표, 로그인/가입/재설정, 마이페이지, 후기 CRUD UI, 모집 CRUD·신청 UI
- 후기·모집·회원은 실제 API 호출
- access/refresh 자동 갱신과 동시 refresh 직렬화 구현
- 역 100개, 노선 2개, 시간표 1,690개는 DB 시드를 변환한 정적 JSON
- 장소는 탕정역 2개 정적 데이터
- 자체 history 기반 라우터; SSR 없음

### 백엔드

| 영역 | 상태 |
|---|---|
| health | 실제 구현 |
| 이메일 가입·로그인·refresh·logout·비밀번호 재설정·재인증 | 실제 구현 |
| 프로필·비밀번호·탈퇴 | 실제 구현 |
| 역 즐겨찾기, 내 후기/모집/참여 목록 | 실제 구현 |
| 후기 CRUD·검색·로컬 미디어 | 실제 구현 |
| 모집 CRUD·신청·수락/거절 | 실제 구현 |
| 노선·역·시간표·장소·관리자 장소 | OpenAPI 계약만, 501 |
| 여행 계획·공유 | 계약만, 501 |
| 공지·관리자 공지 | 계약만, 501 |

### DB

- MySQL/Oracle V1.10, 22개 테이블
- 사용자·교통·장소·즐겨찾기·계획·후기·모집·공지 구조
- 100개 역이 있으나 시간표는 천안·아산 8개 역 중심이며 다른 구간은 비어 있음
- 장소 원본 `content_id`, 급행 구분, 계획 날짜·명시적 순번, 후기 좋아요, 장소 즐겨찾기, 알림·신고·감사 테이블이 없음

## 3. 기능별 격차

| 영역 | 현행 | 목표 | 격차/조치 |
|---|---|---|---|
| 인증 | 이메일·refresh 구현 | 웹 cookie/모바일 secure, family reuse | 저장 전략·재사용 탐지·키 회전 교체 |
| 프로필 | 이름/닉네임/비밀번호/탈퇴 | 이미지·세션·약관·정책 삭제 | 세션 UI와 탈퇴 정책 필요 |
| 소셜 로그인 | 없음 | 카카오/네이버 P1 | identity 모델·OAuth 보안 추가 |
| 역 검색 | 프론트 정적 | 서버 검색·동명이역 | transit API/DB 구현 |
| 노선도 | 정적 이미지/도식 | 구조화·접근 가능 | line topology API와 대체 목록 |
| 시간표 | 정적 일부 | 캘린더·서비스 일자 | 현 enum/스키마 충돌 해소 |
| 실시간 | 없음 | P2 adapter | 데이터 공급자·SLA 미정 |
| 지도·장소 | Kakao 지도+2개 정적 | 서버 공간 검색·출처 | PostGIS·장소 동기화 필요 |
| 카테고리 필터 | UI 일부 | URL·bounds·openNow | 서버 필터와 복구 상태 |
| 즐겨찾기 | 역만 | 역+장소 | DB/API 확장 |
| 경로 | 프론트 정적 계산 | 서버 버전 계산 | routing 모듈·근거 계약 |
| 계획 | UI 구상/501 계약 | 날짜·순서·공유·복제 | 전체 구현, 현 DB 재설계 |
| 후기 | CRUD·검색·이미지 | SSR·반응·안전한 미디어 | 객체 저장소, 구조 본문, reaction |
| 태그 | 후기별 문자열 | canonical tag resource | tags 테이블·검색 |
| 커뮤니티 | 모집만 | 토론/댓글 P1 | 별도 모듈·moderation 선행 |
| 모집 | 실제 구현 | 상태 이력·알림·원자 정원 | 동시성·outbox·감사 강화 |
| 마이페이지 | 여러 API 연결 | 계획·알림·세션 통합 | projection과 부분 오류 |
| 알림 | 없음 | 인앱/푸시/이메일 | 전체 신규 |
| 관리자 | 계약만, 인증만 요구 | scope·감사·신고 | 현재는 ADMIN 역할 검사도 없어 보안 격차 큼 |
| 다크 모드 | 토큰 구현 | 웹/모바일 공통 토큰 | 토큰 패키지·대비 검증 |
| 모바일 | 반응형 웹만 | Expo 앱 | 전체 신규 |

## 4. 확인된 계약 충돌

| 충돌 | 근거 | 목표 결정 |
|---|---|---|
| `day_type` | DB/프론트 `WEEKDAY/WEEKEND`, 백엔드 `WEEKDAY/SATURDAY/HOLIDAY` | service calendar + exception date |
| station code | V1.10 DB에서 삭제, 백엔드 `StationSummary`에는 nullable field | source별 external ID 테이블 |
| 시간표 컬럼 | DB는 train_no·arrival/departure nullable, 백엔드는 train_no/departure 없음·arrival 필수 | trip/stop_time 모델 |
| DB 문서 버전 | 일부 backend model docstring/README가 V1.8을 참조, 실제 DDL V1.10 | migration/ORM/contract 동시 생성·검사 |
| 후기 좋아요 | Drive 요구사항·현행 UI 표시 의도, DB/API 없음 | P1 review reactions |
| 일반 커뮤니티 | 제품 방향에는 필요, 최신 DB는 모집 전용 | 모집 P0, 일반 글/댓글 P1 분리 |
| 탈퇴 | 최신 DDL은 소유 콘텐츠 CASCADE, 목표 커뮤니티는 익명 맥락 보존 필요 | 정책 결정 후 SET NULL/익명화 기본안 |
| 계획 순서 | 현행 visit_time 암묵 정렬, 같은 시간 unique도 미정 | 명시적 position + 선택 시각 |
| 공유 링크 | OpenAPI 계약은 있으나 V1.10 DB 테이블 없음 | plan_share_links 신설 |

## 5. 보안·운영 격차

- `CONFLICT` 프론트 토큰을 localStorage에 저장해 XSS 시 장기 refresh까지 노출될 수 있다.
- `CONFIRMED` 현행 admin router는 인증 의존성만 있고 실제 role/scope 검사가 없다.
- 수동 JWT 구현은 기본 서명·만료를 처리하지만 표준 claim 검증·키 회전·family reuse 탐지가 없다.
- 로컬 디스크 미디어는 다중 인스턴스·격리·검사·CDN을 지원하지 않는다.
- 배포 workflow는 `main`의 프론트 GitHub Pages만 배포하며 API/DB/worker/staging이 없다.
- migration은 시작됐지만 Alembic 같은 앱 배포 통합 체계가 없다.
- 구조화 관측, 감사 로그, 신고 처리, 복구 리허설이 없다.

## 6. 재사용 가치

| 자산 | 재사용 방식 |
|---|---|
| FastAPI 도메인 서비스 테스트 | 목표 유스케이스의 회귀 fixture와 규칙 참고 |
| refresh 회전·동시 프론트 요청 아이디어 | 새 저장 전략에서 패턴 재사용 |
| DB 100개 역·노선 위상·시간표 시드 | 출처·버전 검증 후 ingestion fixture로 전환 |
| 경로 도식·시간표 통계 로직 | 서버 routing 검증 oracle로 사용, 원장으로는 사용하지 않음 |
| 후기/모집 UI 학습 | 공통 폭 토큰, 태그 overflow, 상태 메타데이터 요구로 반영 |
| V1.10 FK·동시 모집 주의사항 | 새 트랜잭션 설계의 직접 근거 |

기존 코드를 독립 버전으로 복사해 시작하지 않는다. 검증된 규칙·테스트·데이터 변환만 선택적으로 포팅한다.

## 7. 우선 해소 순서

1. 파일럿 지역·데이터 라이선스·시간표 모델
2. 탈퇴/공개 계획/모집 개인정보 정책
3. 공통 ID·API·PostgreSQL schema
4. 인증 저장·관리자 scope
5. 지도·장소·경로 서버 원장
6. 계획→후기→모집 수직 루프
7. 운영·알림·모바일
