# 백엔드 연동 인수인계 문서

초기 MVP의 지도 기능은 프론트 단독으로 동작하지만, 현재 회원가입·로그인·비밀번호 재설정은 백엔드와 연결되어 있습니다. 회원 조회·수정·탈퇴 백엔드도 구현되어 있어 이 문서를 기준으로 마이페이지 프론트 연동을 진행합니다.

> 대상: 백엔드(윤홍규), DB(김유진), 프론트(우진, 황지성)
> 상태: 2026-08-07 기준 — 인증, 회원 조회·수정·탈퇴, 역 즐겨찾기와 마이페이지 목록 API 백엔드 구현 완료, 프론트 회원 관리 연동 필요

---

## 1. 핵심 원칙

**프론트 컴포넌트는 데이터가 어디서 오는지 몰라야 합니다.**

지금은 정적 JSON에서, 나중에는 API에서 오지만 컴포넌트 코드는 그대로여야 합니다.
그래서 데이터 접근은 반드시 **각 Feature의 `api/` 또는 shared 데이터 접근 함수 한 겹을 거쳐서** 합니다.

```
역 Feature  →  frontend/src/shared/lib/stations.ts  →  (지금) shared/data/stations.json
                                                     →  (나중) GET /api/v1/stations
장소 Feature → frontend/src/features/station-map/api/places.ts → (지금) places.json
                                                                → (나중) 백엔드 API
```

컴포넌트에서 `import stations from '../data/stations.json'` 처럼 **직접 import 하지 않습니다.**

## 2. 유지할 데이터 접근 인터페이스

```ts
// frontend/src/shared/types/station.ts
export type Station = {
  name: string;
  lat: number;
  lng: number;
  line: string;
};

// frontend/src/shared/lib/stations.ts
// MVP: stations.json을 반환. 백엔드 연동 시 이 함수 내부만 fetch로 교체.
export async function getStations(): Promise<Station[]>;
export async function searchStations(keyword: string): Promise<Station[]>;
```

> `async`로 만들어 두는 이유: 나중에 API로 바꿔도 **호출부 시그니처가 바뀌지 않기 때문**입니다.
> 지금 동기 함수로 만들면 나중에 전부 고쳐야 합니다.

## 3. 교체 지점 목록

| 현재 (MVP) | 교체 후 (P1) | 영향 파일 |
|---|---|---|
| `stations.json` 정적 로드 | `GET /api/v1/stations` | `frontend/src/shared/lib/stations.ts` |
| 카카오 로컬 API 프론트 직접 호출 | 백엔드 프록시 경유 (키 은닉 + 캐싱) | `frontend/src/features/station-map/api/places.ts` |
| 인증 API별 개별 `fetch` | Access Token 첨부·갱신·공통 오류 처리를 담당하는 API 클라이언트 | `frontend/src/shared/lib/apiClient.ts` (신규) |
| 마이페이지 예시 정보 | `GET /api/v1/users/me` 응답 | `frontend/src/features/my-page/*` |
| 계정 관리 프리뷰 | 목적별 재인증 후 프로필·비밀번호 수정·회원 탈퇴 API | `frontend/src/features/my-page/*` |

### 카카오 API를 백엔드로 옮겨야 하는 이유
지금은 JavaScript 키가 브라우저에 노출됩니다. MVP에서는 **도메인 제한**으로 막지만,
운영 단계에서는 백엔드가 REST 키로 호출하고 프론트는 백엔드만 부르는 구조가 맞습니다.

## 4. 현재 백엔드 API 계약

아래 표는 현재 FastAPI의 Swagger/OpenAPI에 등록된 경로를 기준으로 합니다.
비즈니스 API는 `/api/v1`을 공통 prefix로 사용하고 리소스명은 복수형으로 통일합니다.
요청·응답 필드와 오류 모델의 상세 계약은 실행 중인 서버의 `/docs` 또는
`/openapi.json`에서 확인합니다.

| Method | Path | 용도 |
|---|---|---|
| GET | `/health` | 서버 상태 확인 |
| POST | `/api/v1/auth/register` | 회원가입 |
| POST | `/api/v1/auth/login` | 로그인 |
| POST | `/api/v1/auth/reauthenticate` | 회원 정보 수정 전 현재 비밀번호 재인증 |
| POST | `/api/v1/auth/refresh` | Access Token 갱신 |
| POST | `/api/v1/auth/logout` | 로그아웃 |
| POST | `/api/v1/auth/email-verifications` | 이메일 인증 코드 발송 |
| POST | `/api/v1/auth/email-verifications/confirm` | 이메일 인증 코드 확인 |
| POST | `/api/v1/auth/password-reset/requests` | 비밀번호 재설정 코드 발송 |
| POST | `/api/v1/auth/password-reset/confirm` | 비밀번호 변경 |
| GET | `/api/v1/users/me` | 내 회원 정보 |
| PATCH | `/api/v1/users/me` | 내 회원 정보 수정 |
| PATCH | `/api/v1/users/me/password` | 내 비밀번호 변경 |
| DELETE | `/api/v1/users/me` | 회원 탈퇴 |
| GET | `/api/v1/users/me/favorites` | 역 즐겨찾기 목록 |
| POST | `/api/v1/users/me/favorites/{station_id}` | 역 즐겨찾기 추가 |
| DELETE | `/api/v1/users/me/favorites/{station_id}` | 역 즐겨찾기 삭제 |
| GET | `/api/v1/users/me/reviews` | 내가 작성한 후기 목록 |
| GET | `/api/v1/users/me/posts` | 내가 작성한 모집 글 목록 |
| GET | `/api/v1/users/me/participating-posts` | 내가 참여한 모집 글 목록 |
| GET | `/api/v1/lines` | 노선 목록 |
| GET | `/api/v1/lines/suggestions` | 최근 조회 기록 기반 노선 추천 |
| POST | `/api/v1/lines/{line_id}/views` | 노선 조회 기록 |
| GET | `/api/v1/stations` | 역 목록 및 `keyword` 검색 |
| GET | `/api/v1/stations/{station_id}` | 역 상세 |
| GET | `/api/v1/stations/{station_id}/places` | 역 주변 장소 |
| GET | `/api/v1/stations/{station_id}/timetables` | DB 시간표 조회 |
| GET | `/api/v1/plans` | 내 여행 계획 목록 |
| POST | `/api/v1/plans` | 여행 계획 작성 |
| GET | `/api/v1/plans/{plan_id}` | 여행 계획 상세 |
| PATCH | `/api/v1/plans/{plan_id}` | 여행 계획 수정 |
| DELETE | `/api/v1/plans/{plan_id}` | 여행 계획 삭제 |
| POST | `/api/v1/plans/{plan_id}/share-links` | 읽기 전용 공유 링크 발급 |
| GET | `/api/v1/shared-plans/{share_token}` | 공유 여행 계획 읽기 전용 조회 |
| GET | `/api/v1/reviews` | 후기 목록 |
| POST | `/api/v1/reviews` | 후기 작성 |
| GET | `/api/v1/reviews/{review_id}` | 후기 상세 |
| PATCH | `/api/v1/reviews/{review_id}` | 후기 수정 |
| DELETE | `/api/v1/reviews/{review_id}` | 후기 삭제 |
| POST | `/api/v1/review-media` | 후기 미디어 업로드 URL 발급 |
| GET | `/api/v1/notices` | 공지사항 목록 |
| GET | `/api/v1/notices/{notice_id}` | 공지사항 상세 |
| GET | `/api/v1/posts` | 일반·모집 게시글 목록 |
| POST | `/api/v1/posts` | 게시글 작성 |
| GET | `/api/v1/posts/{post_id}` | 게시글 상세 |
| PATCH | `/api/v1/posts/{post_id}` | 게시글 수정 |
| DELETE | `/api/v1/posts/{post_id}` | 게시글 삭제 |
| POST | `/api/v1/posts/{post_id}/participants` | 모집 참여 신청 |
| GET | `/api/v1/posts/{post_id}/participants` | 참여 신청 목록 |
| PATCH | `/api/v1/posts/{post_id}/participants/me` | 내 참여 신청 취소 |
| PATCH | `/api/v1/posts/{post_id}/participants/{participant_id}` | 참여 신청 수락·거절 |
| POST | `/api/v1/admin/notices` | 공지사항 작성 |
| PATCH | `/api/v1/admin/notices/{notice_id}` | 공지사항 수정 |
| DELETE | `/api/v1/admin/notices/{notice_id}` | 공지사항 삭제 |
| POST | `/api/v1/admin/places` | 장소 추가 |
| PATCH | `/api/v1/admin/places/{place_id}` | 장소 수정 |
| DELETE | `/api/v1/admin/places/{place_id}` | 장소 삭제 |

현재 인증 API, 내 회원 정보 조회·수정·탈퇴, 역 즐겨찾기, 내가 작성한 후기·모집 글·참여 모집 글 목록 API와 `/health`는 실제 구현되어 있습니다. 그 외 비즈니스 API는 계약만 구현되어 있으며 호출 시 `501 Not Implemented`를 반환합니다.

내 회원 정보 수정과 탈퇴는 Access Token과 `X-Reauthentication-Token` 헤더를 함께 요구합니다. 재인증 토큰은 `/api/v1/auth/reauthenticate`에서 현재 비밀번호와 목적(`PROFILE_UPDATE`, `PASSWORD_CHANGE`, `WITHDRAWAL`)을 확인한 후 발급되며, 별도 DB 저장 없이 5분 동안 유효합니다. 각 API는 자신의 목적과 일치하는 재인증 토큰만 허용합니다. 일반 회원 정보 수정은 이름과 닉네임만 허용하고, 비밀번호는 `/api/v1/users/me/password`에서 별도로 변경합니다. 회원 탈퇴 시 사용자 행과 DB에서 `ON DELETE CASCADE`로 연결된 회원 소유 데이터를 함께 하드 딜리트합니다.

회원가입·로그인·비밀번호 재설정의 기존 프론트 연결은 `frontend/src/features/auth/api/auth.ts`에서 담당합니다. 회원 조회·수정·탈퇴 API는 백엔드만 구현되어 있으므로 아래 계약에 맞춰 프론트 연결이 필요합니다. 개발 환경의 이메일 발송 모드가 `console`이면 인증 코드는 백엔드 실행 터미널에 표시됩니다.

LAN에서 프론트를 공유할 때는 `backend/.env`의 `METROTRIP_CORS_ORIGINS`에 프론트 접속 주소를 추가해야 합니다. 예를 들어 프론트가 `http://192.168.0.108:5173`에서 열리면 해당 주소를 CORS 목록에 포함합니다.

### 응답 형식

성공 시 단건 API는 리소스를 직접 반환하고, 목록 API는 `items`와 페이지 정보를 반환합니다.
오류는 다음 형식으로 통일합니다.

```json
{
  "code": "STATION_NOT_FOUND",
  "message": "역을 찾을 수 없습니다.",
  "details": null
}
```

## 5. 프론트 회원 관리 연동 계약

### 5-1. 공통 인증 헤더

로그인 응답의 `accessToken`은 인증이 필요한 모든 요청에 Bearer 헤더로 전달합니다.

```http
Authorization: Bearer <accessToken>
```

현재 프론트는 토큰을 다음 키로 저장합니다.

```text
metrotrip-access-token
metrotrip-refresh-token
```

Access Token 만료 시간은 기본 30분, Refresh Token 만료 시간은 기본 14일입니다. 백엔드에는 `POST /api/v1/auth/refresh`가 구현되어 있지만 프론트의 자동 갱신과 401 재시도 로직은 아직 없습니다.

현재 프론트 로그아웃은 로컬 토큰만 제거합니다. 서버의 활성 Refresh Token까지 폐기하려면 로컬 토큰 제거 전에 `POST /api/v1/auth/logout`을 Access Token과 함께 호출해야 합니다.

### 5-2. 내 회원 정보 조회

```http
GET /api/v1/users/me
Authorization: Bearer <accessToken>
```

성공 응답:

```json
{
  "userId": 7,
  "email": "user@example.com",
  "name": "홍길동",
  "nickname": "길동",
  "role": "USER",
  "createdAt": "2026-08-05T09:00:00",
  "updatedAt": "2026-08-05T09:00:00"
}
```

이메일은 로그인 식별자이므로 조회만 가능하고 수정할 수 없습니다. 전화번호는 현재 가입·조회·수정 범위에서 사용하지 않습니다.

### 5-3. 목적별 비밀번호 재인증

프로필 수정, 비밀번호 변경, 회원 탈퇴 전에는 현재 비밀번호를 다시 확인합니다.

```http
POST /api/v1/auth/reauthenticate
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "password": "CurrentPassword1!",
  "purpose": "PROFILE_UPDATE"
}
```

허용 목적과 사용 API:

| `purpose` | 사용할 API |
|---|---|
| `PROFILE_UPDATE` | `PATCH /api/v1/users/me` |
| `PASSWORD_CHANGE` | `PATCH /api/v1/users/me/password` |
| `WITHDRAWAL` | `DELETE /api/v1/users/me` |

성공 응답:

```json
{
  "verificationToken": "...",
  "expiresIn": 300,
  "purpose": "PROFILE_UPDATE"
}
```

재인증 토큰은 DB에 저장하지 않는 5분짜리 JWT입니다. 프론트에서는 `localStorage`에 저장하지 말고 계정 관리 화면의 메모리 상태에만 보관합니다. 수정 API에는 다음 헤더로 전달합니다.

```http
X-Reauthentication-Token: <verificationToken>
```

다른 목적의 재인증 토큰을 사용하면 HTTP `401`, Access Token과 재인증 토큰의 사용자가 다르면 HTTP `403`을 반환합니다.

### 5-4. 이름·닉네임 수정

```http
PATCH /api/v1/users/me
Authorization: Bearer <accessToken>
X-Reauthentication-Token: <PROFILE_UPDATE verificationToken>
Content-Type: application/json
```

```json
{
  "name": "변경할 이름",
  "nickname": "변경할닉네임"
}
```

이름과 닉네임 중 하나만 보내도 됩니다. 빈 요청, `null`, 이메일·전화번호·비밀번호 같은 허용되지 않은 필드는 HTTP `422`로 거절합니다. 중복 닉네임은 HTTP `409`와 `NICKNAME_ALREADY_EXISTS`를 반환합니다.

### 5-5. 비밀번호 변경

```http
PATCH /api/v1/users/me/password
Authorization: Bearer <accessToken>
X-Reauthentication-Token: <PASSWORD_CHANGE verificationToken>
Content-Type: application/json
```

```json
{
  "newPassword": "ChangedPassword1!",
  "newPasswordConfirm": "ChangedPassword1!"
}
```

성공하면 기존 Refresh Token이 모두 폐기됩니다. 프론트는 성공 직후 두 로컬 토큰을 삭제하고 로그인 화면으로 이동해야 합니다.

```ts
localStorage.removeItem('metrotrip-access-token');
localStorage.removeItem('metrotrip-refresh-token');
navigate('/login');
```

### 5-6. 회원 탈퇴

```http
DELETE /api/v1/users/me
Authorization: Bearer <accessToken>
X-Reauthentication-Token: <WITHDRAWAL verificationToken>
```

Request Body는 없습니다. 성공 후 프론트는 로컬 토큰을 모두 삭제하고 로그인 또는 첫 화면으로 이동해야 합니다. 사용자와 DB에서 `ON DELETE CASCADE`로 연결된 회원 소유 데이터는 함께 하드 딜리트됩니다.

### 5-7. 프론트 구현 권장 순서

1. 인증 헤더와 공통 오류 처리를 담당하는 `apiClient.ts`를 추가합니다.
2. `getMyProfile`, `reauthenticate`, `updateProfile`, `changePassword`, `withdraw` API 함수를 추가합니다.
3. 마이페이지 진입 시 `GET /users/me`로 실제 회원 정보를 불러옵니다.
4. 계정 관리 진입 전에 목적을 선택해 재인증합니다.
5. 재인증 토큰은 화면 메모리에만 보관하고 만료 시 비밀번호 입력 단계로 되돌립니다.
6. 비밀번호 변경·탈퇴 성공 시 로컬 토큰을 제거하고 로그인 화면으로 이동합니다.
7. Access Token 만료에 대비해 Refresh Token 갱신과 요청 재시도를 공통 API 클라이언트에 연결합니다.

### 5-8. 역 즐겨찾기

즐겨찾기 API는 모두 Access Token을 요구하며, 프론트가 `userId`를 보내지 않습니다.

목록 조회:

```http
GET /api/v1/users/me/favorites
Authorization: Bearer <accessToken>
```

```json
{
  "items": [
    {
      "favoriteId": 3,
      "stationId": 11,
      "stationName": "탕정역",
      "createdAt": "2026-08-06T10:00:00"
    }
  ]
}
```

목록은 최근 추가순이며 즐겨찾기가 없으면 `{"items": []}`를 반환합니다.

추가:

```http
POST /api/v1/users/me/favorites/{stationId}
Authorization: Bearer <accessToken>
```

정상 추가는 HTTP `201`과 추가된 즐겨찾기를 반환합니다. 존재하지 않는 역은 `404 STATION_NOT_FOUND`, 이미 추가된 역은 `409 FAVORITE_ALREADY_EXISTS`를 반환합니다. 프론트는 요청 중 버튼을 비활성화하되, 서버의 중복 응답도 처리해야 합니다.

삭제:

```http
DELETE /api/v1/users/me/favorites/{stationId}
Authorization: Bearer <accessToken>
```

삭제는 멱등적으로 동작합니다. 즐겨찾기가 존재하거나 이미 삭제된 상태 모두 HTTP `204`를 반환하며 응답 Body는 없습니다. 지도와 마이페이지처럼 서로 다른 화면에서도 동일한 즐겨찾기 API 함수를 공유하는 것을 권장합니다.

### 5-9. 내가 작성한 후기 목록

```http
GET /api/v1/users/me/reviews?page=1&size=10
Authorization: Bearer <accessToken>
```

Access Token에서 현재 사용자를 식별하므로 프론트는 `userId`를 보내지 않습니다. `page`는 1부터 시작하고 `size`는 1~100이며 기본값은 10입니다.

응답은 전체 후기 목록과 동일한 `ReviewListResponse`를 사용합니다.

```json
{
  "items": [
    {
      "reviewId": 15,
      "userId": 3,
      "authorNickname": "metro_user",
      "title": "서울역 여행 후기",
      "content": "후기 내용",
      "startStationId": 1,
      "startStationName": "서울역",
      "endStationId": 2,
      "endStationName": "부산역",
      "rating": 9,
      "travelCost": 50000,
      "planId": null,
      "viewCount": 12,
      "tags": ["당일치기"],
      "media": [],
      "createdAt": "2026-08-06T15:30:00",
      "updatedAt": "2026-08-06T15:30:00"
    }
  ],
  "page": 1,
  "size": 10,
  "totalElements": 1,
  "totalPages": 1
}
```

목록은 `createdAt DESC`, 값이 같으면 `reviewId DESC`인 최근 작성순입니다. 작성한 후기가 없으면 `items`는 빈 배열이고 `totalElements`와 `totalPages`는 0입니다. 마이페이지 목록 조회는 후기 상세 열람이 아니므로 `viewCount`를 증가시키지 않습니다.

### 5-10. 내가 작성한 모집 글

```http
GET /api/v1/users/me/posts?page=1&size=10
Authorization: Bearer <accessToken>
```

현재 사용자가 작성한 모집 글만 `createdAt DESC`, 값이 같으면 `postId DESC`인 최근 작성순으로 반환합니다. 기존 `PostListResponse`를 사용하며 목록 조회는 `viewCount`를 증가시키지 않습니다.

### 5-11. 내가 참여한 모집 글

```http
GET /api/v1/users/me/participating-posts?status=APPLIED&page=1&size=10
Authorization: Bearer <accessToken>
```

`status`는 필수이며 `APPLIED`와 `ACCEPTED`만 허용합니다. `REJECTED`, `CANCELED` 또는 누락된 상태는 요청 검증 단계에서 HTTP `422`를 반환합니다.

- `APPLIED`: `appliedAt DESC`, 값이 같으면 `participantId DESC`인 최근 신청순
- `ACCEPTED`: `respondedAt DESC`, 값이 같으면 `participantId DESC`인 최근 수락순

각 게시글에는 전체 모집 상태와 별도로 현재 사용자의 참여 정보를 포함합니다.

```json
{
  "postId": 20,
  "title": "부산 당일치기 동행",
  "author": {
    "userId": 5,
    "nickname": "travel_user"
  },
  "viewCount": 8,
  "recruitment": {
    "capacity": 3,
    "acceptedCount": 2,
    "deadline": "2026-08-15",
    "status": "RECRUITING",
    "meetingDate": "2026-08-17"
  },
  "createdAt": "2026-08-01T12:00:00",
  "participation": {
    "participantId": 31,
    "status": "ACCEPTED",
    "appliedAt": "2026-08-02T09:00:00",
    "respondedAt": "2026-08-03T14:00:00"
  }
}
```

취소·거절 후 재신청하면 기존 참여 행의 `appliedAt`을 재신청 시각으로 갱신하고 `respondedAt`을 초기화하므로 `APPLIED` 목록의 최근 신청순에 정상 반영됩니다.

## 6. DB 담당에게 전달할 사항

역·노선 정보는 데이터베이스 명세서 V1.8 구조를 기준으로 합니다.

| 테이블 | 역할 |
|---|---|
| `subway_lines` | 노선 마스터 |
| `stations` | 역명·좌표·주소 |
| `line_stations` | 노선과 역의 N:M 관계 및 노선 내 순서 |
| `train_timetables` | 역·방향·요일별 시간표 |
| `places` | 추천 장소 |
| `place_stations` | 장소와 인근 역의 연결 |

- 환승역은 `stations`에 한 건으로 두고 `line_stations`에서 여러 노선과 연결합니다.
- 좌표 정밀도는 소수점 6자리 이상 권장
