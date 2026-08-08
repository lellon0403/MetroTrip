# API 명세

## 1. 공통 규칙

- Base URL: `/api/v1`
- JSON: `camelCase`, DB: `snake_case`
- ID: UUID 문자열. 역·노선의 사람이 읽는 slug는 별도 필드다.
- 시각: RFC 3339 UTC. 서비스 날짜는 `YYYY-MM-DD`와 `Asia/Seoul` 기준.
- 인증: `Authorization: Bearer <accessToken>`. 웹의 refresh는 HttpOnly 쿠키, 모바일은 요청 body의 device-bound refresh credential을 사용한다.
- 생성 재시도: `Idempotency-Key` 헤더를 지원한다.
- 동시 수정: 수정 가능한 주요 리소스에 `ETag`를 반환하고 `If-Match`를 요구한다.
- 공개 응답의 삭제 사용자 표시는 `author: { id: null, displayName: "탈퇴한 사용자" }`다.

### 페이지네이션

```json
{
  "items": [],
  "pageInfo": { "nextCursor": "...", "hasNext": true }
}
```

- 요청: `cursor`, `limit`(기본 20, 최대 100)
- 정렬 키 뒤에 ID를 붙여 안정적인 커서를 만든다.
- 관리자 표와 감사 로그만 `page`, `size`, `total`을 허용한다.

### 오류

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값을 확인해주세요.",
    "details": { "fields": [{ "path": "title", "reason": "required" }] },
    "traceId": "01..."
  }
}
```

공통 코드: `AUTH_REQUIRED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `REFRESH_TOKEN_REUSED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `VERSION_CONFLICT`, `RATE_LIMITED`, `EXTERNAL_SOURCE_UNAVAILABLE`, `INTERNAL_ERROR`.

## 2. 인증·사용자

| Method / Path | 인증 | 요청 | 응답 | 오류·소유권 |
|---|---|---|---|---|
| `POST /auth/email-verifications` | 공개 | `{email,purpose}` | `202 {challengeId,retryAfter}` | 항상 동일 응답; `RATE_LIMITED` |
| `POST /auth/email-verifications/{id}/confirm` | 공개 | `{code}` | `{verificationToken,expiresIn}` | `INVALID_CODE`, `CHALLENGE_EXPIRED` |
| `POST /auth/register` | 공개 | 이메일 검증 토큰, 비밀번호, 이름, 닉네임, 필수 약관 버전 | `201 {user,accessToken,expiresIn}` + refresh | 중복 이메일/닉네임; 멱등 키 |
| `POST /auth/sessions` | 공개 | `{email,password,device}` | `{user,accessToken,expiresIn}` + refresh | 로그인 속도 제한 |
| `POST /auth/sessions/refresh` | refresh | 웹 쿠키 또는 `{refreshToken,deviceId}` | 새 access + 회전 refresh | 재사용 시 token family 전체 폐기 |
| `DELETE /auth/sessions/current` | 회원 | 현재 refresh/session | `204` | 현재 기기 세션만 |
| `DELETE /auth/sessions` | 회원+재인증 | `{exceptCurrent?}` | `204` | 본인 세션만 |
| `POST /auth/reauthentications` | 회원 | `{password,purpose}` | `{reauthToken,expiresIn}` | 목적 제한, 5분 |
| `POST /auth/password-reset-challenges` | 공개 | `{email}` | `202` | 계정 존재 비노출 |
| `POST /auth/password-resets` | 공개 | `{verificationToken,newPassword}` | `204` | 완료 시 모든 세션 폐기 |
| `GET /me` | 회원 | 없음 | `{user,preferences,agreements}` | 본인만 |
| `PATCH /me` | 회원+재인증 | 이름/닉네임/프로필 이미지 | 갱신 user | `If-Match`, 본인만 |
| `PATCH /me/password` | 회원+재인증 | `{newPassword}` | `204` | 모든 세션 폐기 정책 |
| `DELETE /me` | 회원+재인증 | `{reason?,confirmation}` | `202 {deletionRequestId}` | 개인정보 처리 비동기, 취소 기간 `OPEN` |
| `GET /me/sessions` | 회원 | cursor | session 목록 | 본인만, 토큰 값 비노출 |
| `DELETE /me/sessions/{sessionId}` | 회원 | 없음 | `204` | 본인 session만 |
| `POST /auth/oauth/{provider}/authorize` | 공개 | `{redirectUri,codeChallenge}` | `{authorizationUrl,state}` | P1, provider allowlist |
| `POST /auth/oauth/{provider}/callback` | 공개 | `{code,state,codeVerifier}` | session 응답 | P1, 계정 충돌 정책 |

## 3. 노선·역·시간표·경로

| Method / Path | 인증 | 요청/필터 | 응답 | 오류·소유권 |
|---|---|---|---|---|
| `GET /lines` | 공개 | `region,activeOn` | 노선 요약 목록 + dataVersion | 지원 지역만 |
| `GET /lines/{lineId}` | 공개 | 없음 | 노선 상세, 역 순서, 분기 | `NOT_FOUND` |
| `GET /stations` | 공개 | `q,lineId,region,cursor,limit` | 역 요약 cursor 목록 | 동명이역은 노선·지역 포함 |
| `GET /stations/{stationId}` | 공개 | 없음 | 역, 소속 노선, 좌표, 데이터 기준일 | 외부 코드 직접 노출 최소화 |
| `GET /stations/nearby` | 공개 | `lat,lng,radiusM<=5000` | 거리순 역 목록 | P1, 위치 미저장 |
| `GET /stations/{stationId}/departures` | 공개 | `lineId,direction,serviceDate,after,limit` | 출발/도착, 종착역, 근거, dataVersion | `TIMETABLE_NOT_COVERED` |
| `GET /routes` | 공개 | `fromStationId,toStationId,via[],departAt,preference` | 경로 대안, 구간, 실측/추정, 알고리즘 버전 | 같은 역/경로 없음/막차 이후 |
| `POST /route-feedback` | 선택 | `{routeRequestId,type,detail}` | `202` | 로그인 시 user 연결, 익명 허용 |

`preference`: `FASTEST | FEWEST_TRANSFERS`. `departAt`이 없으면 시간 독립 추정 결과임을 응답에 표시한다.

## 4. 장소·즐겨찾기

| Method / Path | 인증 | 요청/필터 | 응답 | 오류·소유권 |
|---|---|---|---|---|
| `GET /places` | 공개 | `stationId,bounds,category,openNow,maxDistanceM,q,sort,cursor,limit` | 장소 카드 + 거리/출처 | stationId 또는 bounds 필수 |
| `GET /places/{placeId}` | 공개 | 없음 | 상세, 미디어, 인근 역, 출처, 관련 후기 | 폐업은 상태 표시 |
| `POST /places/{placeId}/data-issues` | 선택 | `{type,description}` | `201 {reportId}` | 익명은 제한 강화 |
| `GET /me/favorite-stations` | 회원 | cursor | 즐겨찾기 역 | 본인만 |
| `PUT /me/favorite-stations/{stationId}` | 회원 | 없음 | `201/200` 즐겨찾기 | 멱등, 본인만 |
| `DELETE /me/favorite-stations/{stationId}` | 회원 | 없음 | `204` | 멱등 |
| `GET /me/favorite-places` | 회원 | cursor | 즐겨찾기 장소 | 본인만 |
| `PUT /me/favorite-places/{placeId}` | 회원 | 없음 | `201/200` | 멱등 |
| `DELETE /me/favorite-places/{placeId}` | 회원 | 없음 | `204` | 멱등 |

## 5. 여행 계획

`Plan`: `{id,owner,title,startDate,endDate,timeZone,status,visibility,days,version,createdAt,updatedAt}`

`PlanItem`: `{id,dayId,position,type,station?,place?,arrivalAt?,departureAt?,durationMinutes?,memo}`. 이동 구간은 인접 항목을 연결하는 별도 `routeSegments` 배열로 반환한다.

| Method / Path | 인증 | 요청/필터 | 응답 | 오류·소유권 |
|---|---|---|---|---|
| `GET /plans` | 회원 | `status,fromDate,toDate,cursor,limit` | 내 계획 목록 | 소유자만 |
| `POST /plans` | 회원 | 제목, 날짜, 시간대, 선택 경로 | `201 Plan` | 멱등 키, 본인 owner |
| `GET /plans/{planId}` | owner | 없음 | Plan 상세 + ETag | owner만; 공개/비목록 읽기는 공유 토큰 경로만 사용 |
| `PATCH /plans/{planId}` | owner | 제목·날짜·공개 범위 | Plan | `If-Match`, owner |
| `DELETE /plans/{planId}` | owner | 없음 | `204` | soft delete, owner |
| `POST /plans/{planId}/days` | owner | `{date,title?}` | `201 PlanDay` | 날짜 범위·중복 검증 |
| `PATCH /plans/{planId}/days/{dayId}` | owner | 날짜/제목 | PlanDay | `If-Match` |
| `DELETE /plans/{planId}/days/{dayId}` | owner | 없음 | `204` | 포함 항목 처리 확인 |
| `POST /plans/{planId}/items` | owner | PlanItem 입력 | `201 PlanItem` | 장소/역 존재, 위치 검증 |
| `PATCH /plans/{planId}/items/{itemId}` | owner | 시간·메모·장소 등 | PlanItem | `If-Match` |
| `DELETE /plans/{planId}/items/{itemId}` | owner | 없음 | `204` | owner |
| `PUT /plans/{planId}/item-order` | owner | `{dayId,itemIds[]}` | 갱신 순서 + version | 누락/중복 ID, 원자 처리 |
| `POST /plans/{planId}/validate` | owner | 현재 또는 draft payload | 충돌·이동 가능성 목록 | 저장 없이 검증 |
| `POST /plans/{planId}/share-links` | owner | `{expiresAt?}` | `201 {token,url,expiresAt}` | 토큰 hash 저장 |
| `DELETE /plans/{planId}/share-links/{linkId}` | owner | 없음 | `204` | 즉시 회수 |
| `GET /shared-plans/{token}` | 공개 | 없음 | 읽기 전용 공개 projection | `SHARE_LINK_EXPIRED/REVOKED` |
| `POST /shared-plans/{token}/copies` | 회원 | `{title?}` | `201 Plan` | 원본과 독립, 출처 기록 |

## 6. 미디어

| Method / Path | 인증 | 요청 | 응답 | 오류·소유권 |
|---|---|---|---|---|
| `POST /media-uploads` | 회원 | `{fileName,mimeType,sizeBytes,purpose}` | `201 {uploadId,uploadUrl,headers,expiresAt}` | 유형·크기·quota |
| `POST /media-uploads/{uploadId}/complete` | 회원 | `{etag?}` | `{mediaId,status}` | 업로드 owner만, 검사 비동기 |
| `GET /media/{mediaId}` | 정책별 | 없음 | 메타데이터/변형 URL | 연결 리소스 공개 범위 상속 |
| `DELETE /media/{mediaId}` | owner | 없음 | `202` | 연결 여부 확인, 실제 파일 비동기 삭제 |

클라이언트가 임의 URL을 후기 미디어로 등록할 수 없고, `READY` 상태의 자기 미디어 ID만 연결한다.

## 7. 후기·태그·반응

| Method / Path | 인증 | 요청/필터 | 응답 | 오류·소유권 |
|---|---|---|---|---|
| `GET /reviews` | 공개 | `q,searchIn,stationId,placeId,tag,sort,cursor,limit` | 후기 카드 목록 | sort=`RECENT|HELPFUL` |
| `POST /reviews` | 회원 | 제목, 본문 문서, 경로/계획, 평점, 비용, tag IDs, media IDs | `201 Review` | 멱등, 소유 미디어·계획 검증 |
| `GET /reviews/{reviewId}` | 공개 | 없음 | 상세, author, plan snapshot, reactions | 숨김은 관리자 외 404/상태 페이지 |
| `PATCH /reviews/{reviewId}` | owner | 수정 가능한 필드 | Review | `If-Match`, owner |
| `DELETE /reviews/{reviewId}` | owner | 없음 | `204` | soft delete, owner |
| `PUT /reviews/{reviewId}/reactions/helpful` | 회원 | 없음 | `{helpfulCount,myReaction:true}` | 멱등, 본인 후기 허용 여부 `OPEN` |
| `DELETE /reviews/{reviewId}/reactions/helpful` | 회원 | 없음 | `204` | 멱등 |
| `POST /reviews/{reviewId}/reports` | 회원 | `{reason,detail?}` | `201 {reportId}` | 중복 제한 |
| `GET /tags` | 공개 | `q,type=REVIEW,limit` | canonical tag 제안 | prefix 검색 |

후기 댓글은 범용 커뮤니티 댓글 모델이 준비되는 P1에 `GET/POST /reviews/{id}/comments` 별칭으로 제공할 수 있으나 내부 리소스는 comments 하나를 사용한다.

## 8. 커뮤니티·동행 모집

### 토론형 커뮤니티(P1)

| Method / Path | 인증 | 요청/필터 | 응답 | 오류·소유권 |
|---|---|---|---|---|
| `GET /community/posts` | 공개 | `q,type,stationId,sort,cursor,limit` | 글 목록 | `QUESTION|TIP|DISCUSSION` |
| `POST /community/posts` | 회원 | 제목, 본문, type, 연결 리소스 | `201 Post` | 작성자 owner |
| `GET /community/posts/{postId}` | 공개 | 없음 | 글·반응·댓글 요약 | 공개 글 |
| `PATCH /community/posts/{postId}` | owner | 제목/본문/연결 | Post | ETag |
| `DELETE /community/posts/{postId}` | owner | 없음 | `204` | soft delete |
| `GET /community/posts/{postId}/comments` | 공개 | cursor | 스레드 댓글 | 최대 중첩 깊이 정책 |
| `POST /community/posts/{postId}/comments` | 회원 | `{body,parentId?}` | `201 Comment` | parent 같은 글 |
| `PATCH /comments/{commentId}` | owner | `{body}` | Comment | owner |
| `DELETE /comments/{commentId}` | owner | 없음 | `204` | 자식 있으면 tombstone |

### 동행 모집(P0)

| Method / Path | 인증 | 요청/필터 | 응답 | 오류·소유권 |
|---|---|---|---|---|
| `GET /recruitments` | 공개 | `q,status,stationId,meetingFrom,meetingTo,cursor,limit` | 모집 카드 | 마감일과 상태 모두 필터 |
| `POST /recruitments` | 회원 | 제목, 본문, capacity, deadline, meetingAt, planId | `201 Recruitment` | owner 계획만 연결, 멱등 |
| `GET /recruitments/{id}` | 공개 | 없음 | 상세 + 내 신청 상태(선택 인증) | 조회수 비동기 |
| `PATCH /recruitments/{id}` | owner | 내용/정원/마감/일정 | Recruitment | 수락 인원 미만으로 정원 축소 금지 |
| `DELETE /recruitments/{id}` | owner | `{reason?}` | `204` | 신청자 알림 outbox |
| `POST /recruitments/{id}/close` | owner | `{reason?}` | Recruitment | 상태 전이 검증 |
| `POST /recruitments/{id}/applications` | 회원 | `{message?}` | `201 Application` | 작성자 신청 금지, 중복/마감/정원 오류 |
| `PATCH /recruitments/{id}/applications/me` | 신청자 | `{status:"CANCELED"}` | Application | APPLIED/ACCEPTED 취소 정책 |
| `GET /recruitments/{id}/applications` | owner | `status,cursor,limit` | 신청 목록 | 작성자만 |
| `PATCH /recruitments/{id}/applications/{applicationId}` | owner | `{status:"ACCEPTED"|"REJECTED"}` | Application + 모집 요약 | 원자 정원 검사, `CAPACITY_REACHED` |
| `GET /me/recruitment-applications` | 회원 | `status,cursor,limit` | 참여 모집 목록 | 본인만 |

## 9. 마이페이지·알림

| Method / Path | 인증 | 요청/필터 | 응답 | 오류·소유권 |
|---|---|---|---|---|
| `GET /me/reviews` | 회원 | cursor | 내 후기 | 삭제/초안 포함 옵션 |
| `GET /me/recruitments` | 회원 | status,cursor | 내 모집 | 본인만 |
| `GET /notifications` | 회원 | `unreadOnly,type,cursor,limit` | 알림 목록 | 본인만 |
| `PATCH /notifications/{id}` | 회원 | `{read:true}` | Notification | 본인만 |
| `POST /notifications/read-all` | 회원 | `{before?}` | `204` | 멱등 |
| `GET /notification-preferences` | 회원 | 없음 | 채널·유형별 설정 | 본인만 |
| `PUT /notification-preferences` | 회원 | 전체 설정 문서 | 갱신 설정 | 필수 운영 알림 비활성 제한 |
| `POST /devices` | 회원 | `{platform,pushToken,locale,appVersion}` | `201 Device` | 토큰 암호화/보호 |
| `DELETE /devices/{deviceId}` | 회원 | 없음 | `204` | 본인 device만 |

## 10. 공지·관리자

| Method / Path | 인증 | 요청/필터 | 응답 | 오류·소유권 |
|---|---|---|---|---|
| `GET /notices` | 공개 | `audience,activeAt,cursor,limit` | 게시 공지 목록 | 예약/초안 제외 |
| `GET /notices/{id}` | 공개 | 없음 | 공지 상세 | 게시 상태만 |
| `GET /admin/places` | `place:write` | page,size,source,status,q | 관리 projection | 관리자 scope |
| `POST /admin/places` | `place:write` | 장소+출처+역 연결 | `201 Place` | 감사 사유 필수 |
| `PATCH /admin/places/{id}` | `place:write` | 수정 필드 | Place | ETag, 감사 로그 |
| `POST /admin/places/{id}/publish` | `place:publish` | 없음 | Place | 검증 상태 전이 |
| `DELETE /admin/places/{id}` | `place:write` | `{reason}` | `204` | 참조 시 retired 처리 |
| `GET /admin/notices` | `notice:write` | page,size,status | 전체 공지 | scope |
| `POST /admin/notices` | `notice:write` | 제목/본문/대상/게시 기간 | `201 Notice` | 작성자 감사 |
| `PATCH /admin/notices/{id}` | `notice:write` | 수정 | Notice | ETag |
| `DELETE /admin/notices/{id}` | `notice:write` | `{reason}` | `204` | soft delete |
| `GET /admin/reports` | `moderation:read` | status,type,page,size | 신고 큐 | 민감 필드 마스킹 |
| `GET /admin/reports/{id}` | `moderation:read` | 없음 | 대상·이력 | 접근 감사 |
| `POST /admin/reports/{id}/actions` | `moderation:write` | `{action,reason,duration?}` | `201 ModerationAction` | 조치와 감사 원자 처리 |
| `POST /admin/data-sync-jobs` | `data:sync` | `{source,dryRun}` | `202 Job` | 중복 실행 잠금 |
| `GET /admin/data-sync-jobs/{id}` | `data:sync` | 없음 | 진행·변경 요약 | scope |
| `GET /admin/audit-logs` | `audit:read` | actor/action/resource/date,page,size | 감사 로그 | export 별도 승인 |

## 11. 계약 검증 체크리스트

- OpenAPI에 모든 인증 방식·오류 스키마·예제가 포함된다.
- DB nullable/enum/check와 요청 스키마가 일치한다.
- 공개 GET은 refresh token을 요구하지 않는다.
- 각 mutation의 owner/admin scope와 멱등 여부가 테스트에 있다.
- cursor는 정렬 필드가 같아도 중복·누락이 없다.
- ETag 충돌, 모집 동시 수락, refresh 재사용을 통합 테스트한다.
