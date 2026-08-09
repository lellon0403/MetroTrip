# 프론트엔드 API 연동 현황

최종 갱신: 2026-08-09

## 완료된 연동

- 인증 세션: 401 응답 시 Refresh Token으로 한 번만 갱신하고 원래 요청을 재시도한다. 로그아웃은 `POST /api/v1/auth/logout` 호출 뒤 로컬 Access/Refresh Token을 모두 정리한다. 서버가 이미 발급된 Access Token을 즉시 폐기하지 않으므로 로컬 토큰 정리는 반드시 수행한다.
- 회원 관리: 마이페이지에서 `GET/PATCH /api/v1/users/me`, 목적별 재인증, `PATCH /users/me/password`, `DELETE /users/me`를 사용한다. 재인증 토큰은 화면 메모리에만 두고 `X-Reauthentication-Token` 헤더로 전송한다.
- 즐겨찾기 역: `GET/POST/DELETE /api/v1/users/me/favorites`를 사용한다. 정적 역 데이터에는 DB `station_id`를 포함해 추가 요청에 사용한다.
- 후기: 목록·상세·작성·수정·삭제·미디어 업로드와 내가 작성한 후기 조회가 연동되어 있다. 후기 목록은 `tag` 쿼리로 태그 필터를 지원한다.
- 모집 게시판: `/api/v1/posts`의 목록·상세·작성·수정·삭제와 참여 신청·취소, 작성자의 신청자 승인·거절을 지원한다. 마이페이지에는 내가 작성한 모집글과 신청/확정 모집글을 표시한다.

## 백엔드 구현 완료·프론트 연동 대기

- `GET /api/v1/lines`, `/lines/suggestions`, `POST /lines/{line_id}/views`
- `GET /api/v1/stations`, `/stations/{station_id}`
- `GET /api/v1/stations/{station_id}/timetables`, `/stations/{station_id}/places`
- `GET/POST /api/v1/plans`, `GET/PATCH/DELETE /api/v1/plans/{plan_id}`
- `POST /api/v1/plans/{plan_id}/share-links`, `GET /api/v1/shared-plans/{share_token}`

공개 transit API는 DB V1.10 기준으로 구현되었고 Swagger 검증을 마쳤다. 프론트는 연동 전까지 기존 정적 데이터를 유지하며, 연동 시 각 Feature의 데이터 접근 함수 내부만 API 호출로 교체한다. 역 목록 응답에는 지도 표시에 필요한 위도·경도와 소속 노선이 포함된다.

### 여행 계획·공유 연동 규칙

- 여행 계획 관리 API는 Bearer Access Token이 필요하며 본인이 작성한 계획만 조회·수정·삭제할 수 있다.
- 요청과 응답 필드는 `camelCase`다. 작성 시 일정 항목에는 `placeId`, 선택적인 `stationId`, `visitTime`, `memo`를 보낸다.
- 수정 요청의 `items`는 전체 일정 스냅샷이다. 기존 항목은 응답에서 받은 `planItemId`를 다시 보내고, 새 항목은 `planItemId`를 생략한다. 배열에서 빠진 기존 항목은 삭제되며 `items: []`는 전체 일정 삭제, `items` 생략은 일정 유지다.
- 공유 버튼은 `POST /api/v1/plans/{plan_id}/share-links`를 호출한다. 응답의 `shareToken`은 URL-safe 22자 원문 토큰이고 `shareUrl`은 프론트 공개 경로다. SHA-256 64자 해시는 DB 저장용이므로 프론트에 전달되지 않는다.
- 공유 계획 화면은 토큰 입력창을 두지 않고 `/shared-plans/{shareToken}` 라우트에서 경로 토큰을 읽어 `GET /api/v1/shared-plans/{share_token}`을 호출한다. 이 조회에는 인증 헤더를 붙이지 않는다.
- 공유 링크는 기본 7일 동안 유효하며 읽기 전용이다. 변조·만료·폐기된 토큰은 모두 `404 SHARED_PLAN_NOT_FOUND`로 처리한다.

## 관리자 API

관리자 장소 등록·수정·삭제 API는 Bearer Access Token과 `ADMIN` 권한이 필요하다. 생성·수정 응답에는 전체 장소 정보와 `stationIds`가 포함된다. 수정 요청에서 `stationIds`와 `imageUrls`를 생략하면 기존 값을 유지하고, 전달하면 전체 목록을 교체한다. 장소 삭제 시 해당 장소를 참조하던 여행 계획 항목도 함께 삭제된다.

관리자는 `DELETE /api/v1/admin/reviews/{review_id}`와 `DELETE /api/v1/admin/posts/{post_id}`로 작성자와 관계없이 후기와 모집 게시글을 삭제할 수 있다. 일반 회원 토큰은 `403 ADMIN_ONLY`로 거부된다.

관리자 전용 장소 목록·상세 조회 API는 아직 없다. 공개 장소 조회는 역 기준이고 전체
`stationIds`를 제공하지 않으므로, 전체 장소 목록에서 수정 화면으로 진입하는 관리자 UI를
완성하려면 `GET /api/v1/admin/places`와 `GET /api/v1/admin/places/{place_id}`가 먼저
필요하다. 후기 삭제 후에는 목록에서 항목을 제거하되, 물리 미디어 파일 정리는 백엔드 후속
과제로 남아 있다.

## 검증 기록

- 프론트: `npm.cmd run lint`, `npm.cmd run build` 통과
- 백엔드: `backend/.venv/Scripts/python.exe -m pytest` — 105개 통과
- 관리자 API: 권한 거부, 장소 등록·부분 수정·삭제, 최소 한 역 검증, `stationIds` 응답,
  계획 항목 선삭제, 후기·모집 게시글 CASCADE 삭제를 자동화 테스트로 확인했다. 실제 MySQL
  서버의 통합 검증은 배포 전에 별도로 수행해야 한다.
- 여행 계획·공유: HTTP CRUD 전 과정과 공유 링크 발급·비회원 조회·변조 토큰 차단을 자동화 테스트로 확인했다. 실제 운영 MySQL의 공유 링크 테이블 존재 여부는 배포 전에 별도로 확인해야 한다.
- transit: 노선 목록·상위 3개 추천·회원/비회원 조회 기록, 역 목록·이름/노선 검색·상세·시간표·주변 장소를 Swagger에서 확인했다.
- 브라우저: 로컬 계정으로 프로필 수정, 즐겨찾기 추가/삭제, 모집글 CRUD, 참여 신청/취소, 작성자 승인, 마이페이지 목록, 비밀번호 변경 후 재로그인, 회원 탈퇴를 확인했다. 검증용 게시글과 계정은 모두 삭제했다.
