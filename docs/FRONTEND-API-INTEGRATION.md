# 프론트엔드 API 연동 현황

최종 갱신: 2026-08-09

## 완료된 연동

- 인증 세션: 401 응답 시 Refresh Token으로 한 번만 갱신하고 원래 요청을 재시도한다. 로그아웃은 `POST /api/v1/auth/logout` 호출 뒤 로컬 Access/Refresh Token을 모두 정리한다.
- 회원 관리: 마이페이지에서 `GET/PATCH /api/v1/users/me`, 목적별 재인증, `PATCH /users/me/password`, `DELETE /users/me`를 사용한다. 재인증 토큰은 화면 메모리에만 두고 `X-Reauthentication-Token` 헤더로 전송한다.
- 즐겨찾기 역: `GET/POST/DELETE /api/v1/users/me/favorites`를 사용한다. 정적 역 데이터에는 DB `station_id`를 포함해 추가 요청에 사용한다.
- 후기: 목록·상세·작성·수정·삭제·미디어 업로드와 내가 작성한 후기 조회가 연동되어 있다. 후기 목록은 `tag` 쿼리로 태그 필터를 지원한다.
- 모집 게시판: `/api/v1/posts`의 목록·상세·작성·수정·삭제와 참여 신청·취소, 작성자의 신청자 승인·거절을 지원한다. 마이페이지에는 내가 작성한 모집글과 신청/확정 모집글을 표시한다.

## 백엔드 구현 완료·프론트 연동 대기

- `GET /api/v1/lines`, `/lines/suggestions`, `POST /lines/{line_id}/views`
- `GET /api/v1/stations`, `/stations/{station_id}`
- `GET /api/v1/stations/{station_id}/timetables`, `/stations/{station_id}/places`

공개 transit API는 DB V1.10 기준으로 구현되었고 Swagger 검증을 마쳤다. 프론트는 연동 전까지 기존 정적 데이터를 유지하며, 연동 시 각 Feature의 데이터 접근 함수 내부만 API 호출로 교체한다. 역 목록 응답에는 지도 표시에 필요한 위도·경도와 소속 노선이 포함된다.

## 아직 미구현된 API

여행 계획, 공지사항, 관리자 장소 등록·수정·삭제 API는 백엔드가 `501 Not Implemented`를 반환한다. 공개 역 주변 장소 조회와 관리자 장소 변경 API를 혼동하지 않는다.

## 검증 기록

- 프론트: `npm.cmd run lint`, `npm.cmd run build` 통과
- 백엔드: `backend/.venv/Scripts/python.exe -m pytest` — 70개 통과
- transit: 노선 목록·상위 3개 추천·회원/비회원 조회 기록, 역 목록·이름/노선 검색·상세·시간표·주변 장소를 Swagger에서 확인했다.
- 브라우저: 로컬 계정으로 프로필 수정, 즐겨찾기 추가/삭제, 모집글 CRUD, 참여 신청/취소, 작성자 승인, 마이페이지 목록, 비밀번호 변경 후 재로그인, 회원 탈퇴를 확인했다. 검증용 게시글과 계정은 모두 삭제했다.
