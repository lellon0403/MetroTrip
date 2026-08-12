# 프론트엔드 API 연동 현황

최종 갱신: 2026-08-11
작업 브랜치: `feat/fe-timetable-route`

## 구조

`experiment/codex-implementation`의 Next.js UI를 루트 `frontend/`로 이식했다. 새 UI가 기대하는 계약과 현재 FastAPI 계약이 다르므로 다음 두 파일에서 연결한다.

- `frontend/src/lib/api.ts`: OpenAPI 클라이언트, Access Token 헤더
- `frontend/src/lib/legacyApiAdapter.ts`: 경로·요청·응답 변환
- `frontend/src/lib/legacyMappers.ts`: 역·장소·후기·모집·일정 등의 응답 모델 변환
- `frontend/src/contracts/schema.d.ts`: Codex UI가 사용하는 화면 계약

Next.js 서버 컴포넌트인 홈과 후기 목록/상세는 현재 FastAPI를 직접 호출한 뒤 `legacyMappers.ts`로 변환한다.

## 현재 FastAPI에 연결된 기능

- 인증: 이메일 인증 회원가입, 로그인, Refresh Token 회전, 로그아웃, 비밀번호 재설정
- 회원: 프로필 조회, 현재 비밀번호 재인증 후 닉네임 수정·회원 탈퇴
- 역/노선: 목록, 검색, 상세, 시간표
- 장소: 역 기준 반경 1km 장소 목록과 캐시된 장소 상세 표시
- 일정: 목록, 상세, 작성, 수정, 삭제
- 모집: 목록, 상세, 작성, 수정, 삭제, 신청·취소·승인·거절·마감
- 후기: 목록, 상세, 작성, 수정, 삭제, 로컬 미디어 업로드
- 홈: 공지, 이벤트, 진행 중 모집, 천안역 주변 장소를 기존 API에서 조합
- 공유 일정: 읽기 전용 조회

### 지하철 일정 경로

- `/discover`의 지하철 화면은 기존 역 목록 API로 선택 가능한 역을 구성한다.
- 선택 순서대로 출발·경유·도착 역할을 정하고, 각 구간의 양 끝 역 시간표를 `lineId`, `dayType`, `direction` 조건으로 조회한다.
- 브라우저 현지 현재 시각을 15초마다 확인하고 분이 바뀌면 경로를 다시 계산한다.
- 같은 `trainNo`가 양 끝 역에 존재하면서 현재 시각 이후 가장 먼저 출발하는 열차를 이어 붙여 실제 운행 시각을 계산한다. 시간표가 없거나 같은 열차를 찾지 못하면 추정값을 만들지 않는다.
- 주말 요청값은 백엔드 계약에 맞춰 `WEEKEND`를 사용한다.

## 계약 차이로 제한되는 기능

| 새 UI 기능 | 현재 처리 | 필요한 백엔드 |
|---|---|---|
| 좌표/지도 경계 장소 검색 | 가장 가까운 역을 골라 역 기준 API 사용, 최대 1km | 좌표·bounds·복수 카테고리 검색 API |
| 장소 단건 상세 | 같은 세션에서 불러온 장소 캐시 사용 | `GET /places/{id}` |
| 장소 즐겨찾기 | 브라우저 `localStorage` 전용 | 사용자별 장소 즐겨찾기 CRUD |
| 도보 경로 | 직선거리와 분당 67m 로컬 추정 | 보행 경로 제공자 연동 API |
| 일정 날짜/설명/상태 | 브라우저 메타데이터 보조 저장 | 일정 스키마 확장 |
| 일정의 중간 경유역 | 출발·도착은 공식 API, 전체 역 순서는 브라우저 메타데이터 보조 저장 | 계획 항목의 중간 역 정식 저장 계약 |
| 삭제 일정 복원 | 501 미지원 | soft delete·복원 API |
| 후기 좋아요·신고 | 501 미지원 | 좋아요·신고 API |
| 모집 질문 댓글·신고 | 501 미지원 | 댓글·신고 API |
| 모집 연결 일정 조회 | 501 미지원 | 공개 가능한 일정 스냅샷 API |
| 공유 일정 복제 | 501 미지원 | 복제 API |
| 관리자 신고·감사·동기화 | 빈 목록 또는 501 | 관리자 운영 API |

미지원 기능은 성공처럼 꾸미지 않고 `NOT_SUPPORTED_BY_CURRENT_BACKEND` 오류를 반환한다.

## 환경변수

권장 이름:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_KAKAO_JS_KEY=카카오_JavaScript_키
```

이전 PC의 `.env`를 그대로 쓸 수 있도록 `VITE_API_BASE_URL`, `VITE_KAKAO_MAP_KEY`도 `next.config.ts`에서 호환한다. 루트 `.env`만 있는 PC에서는 값을 `frontend/.env.local`로 옮겨야 Next 개발 서버가 읽을 수 있다. `.env*`는 커밋하지 않는다.

## 검증 기록

- `npm.cmd run typecheck`: 통과
- `npm.cmd run lint`: 통과
- `npm.cmd run build`: 통과
- 브라우저: 홈, `/discover`, `/reviews` 서버 렌더링과 오류 상태 확인
- 실제 DB API 통합: Codex 샌드박스가 `backend/.env`를 읽지 못해 일반 PowerShell에서 백엔드를 실행한 뒤 추가 확인 필요
