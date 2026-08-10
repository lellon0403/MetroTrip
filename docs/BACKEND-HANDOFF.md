# 백엔드 연동 인수인계 문서

초기 MVP의 지도 기능은 아직 프론트 정적 데이터를 사용하지만, 인증·회원·후기·모집 게시판은 백엔드와 연결되어 있습니다. 공개 노선·역·시간표·주변 장소 조회 백엔드도 구현되어 있어 이 문서를 기준으로 transit 프론트 연동을 진행합니다.

> 대상: 백엔드(윤홍규), DB(김유진), 프론트(우진, 황지성)
> 상태: 2026-08-09 기준 — 공개 transit API 구현 및 Swagger 검증 완료, 프론트 transit 연동 필요

---

## 1. 핵심 원칙

**프론트 컴포넌트는 데이터가 어디서 오는지 몰라야 합니다.**

지금은 정적 JSON에서, 나중에는 API에서 오지만 컴포넌트 코드는 그대로여야 합니다.
그래서 데이터 접근은 반드시 **각 Feature의 `api/` 또는 shared 데이터 접근 함수 한 겹을 거쳐서** 합니다.

```
역 Feature  →  frontend/src/shared/lib/stations.ts  →  (현재 FE) shared/data/stations.json
                                                     →  (연동 대상) GET /api/v1/stations (백엔드 준비됨)
장소 Feature → frontend/src/features/station-map/api/places.ts → (현재 FE) places.json/카카오 API
                                                                → (연동 대상) GET /api/v1/stations/{id}/places (백엔드 준비됨)
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
| 정적 장소/카카오 로컬 API 직접 호출 | `GET /api/v1/stations/{id}/places` | `frontend/src/features/station-map/api/places.ts` |
| 인증 API별 개별 `fetch` | Access Token 첨부·갱신·공통 오류 처리를 담당하는 API 클라이언트 | `frontend/src/shared/lib/apiClient.ts` (신규) |
| 프론트에서 그래프 탐색으로 경로 계산 | `GET /api/v1/routes` (**계약에 없음 — 신설 필요**) | `frontend/src/features/route-plan/api/routes.ts` |
| DB 시드를 변환한 정적 시간표 | `GET /api/v1/stations/{id}/timetables` | `frontend/src/features/route-plan/api/timetables.ts` |
| DB 시드를 변환한 정적 역·노선 | `GET /api/v1/stations`, `/lines` | `shared/lib/stations.ts`, `route-plan/api/routes.ts` |
| 마이페이지 예시 정보 | `GET /api/v1/users/me` 응답 | `frontend/src/features/my-page/*` |
| 계정 관리 프리뷰 | 목적별 재인증 후 프로필·비밀번호 수정·회원 탈퇴 API | `frontend/src/features/my-page/*` |

### 카카오 API를 백엔드로 옮겨야 하는 이유
지금은 JavaScript 키가 브라우저에 노출됩니다. MVP에서는 **도메인 제한**으로 막지만,
운영 단계에서는 백엔드가 REST 키로 호출하고 프론트는 백엔드만 부르는 구조가 맞습니다.

### 경로 탐색 API — 백엔드(윤홍규)에게 요청

`docs/SPEC.md` 2-2로 경로 기능이 범위에 들어왔는데,
**현재 계약에 경로 탐색 엔드포인트가 없습니다.** 아래 형태로 신설이 필요합니다.

```
GET /api/v1/routes?from_station_id={id}&to_station_id={id}
```

응답에 필요한 것:

| 필요한 것 | 화면에서의 용도 |
|---|---|
| 두 가지 안 (최소 시간 / 최소 환승) | 나란히 비교하는 카드 |
| 안별 경유역 목록 (순서 포함) | 세로 타임라인 렌더 |
| 안별 환승 지점 (역·이전 노선·다음 노선) | 타임라인에 환승 표시 |
| 안별 예상 소요시간 | 비교 카드의 요약 |

- 프론트 타입은 `frontend/src/features/route-plan/types.ts`에 있고,
  DB의 `stations` / `line_stations` 구조에 맞춰 잡아 뒀습니다.
- 그전까지는 프론트가 정적 데이터로 직접 그래프 탐색을 합니다.
  API가 생기면 `features/route-plan/api/routes.ts` **내부만** 교체합니다.
- **소요시간**은 시간표가 있는 구간은 실제 값으로, 없는 구간은
  `역당 2분 + 환승 5분` 근사치로 계산하고 화면에 "예상"이라고 표기합니다.
- 비교 기준은 **정차역 수가 아니라 시간**입니다. 역 사이 소요 시간이 구간마다 달라서,
  시간표가 들어오면 "역을 적게 지나는 경로"와 "빨리 도착하는 경로"가 달라집니다.

### 시간표 연동 현황 (2026-08-05, V1.10 시드 기준)

**시드를 그대로 쓰고 있습니다.** `scripts/convertSeed.mjs`가
`db/seed/`의 SQL을 프론트 정적 JSON으로 변환합니다.
DB 시드가 갱신되면 이 스크립트를 다시 돌리면 됩니다.
(변환된 JSON을 손으로 고치지 마세요 — 다음 변환 때 덮어써집니다)

`train_no` 컬럼이 있어 같은 열차를 정확히 이을 수 있습니다.
**이전 판에 적어 뒀던 "순서로 매칭하는 방법"은 더 이상 필요 없어 지웠습니다.**

프론트 계산 방식:

1. 출발 시각 이후 승차역에 오는 열차를 `train_no`로 찾는다
2. 같은 열차가 하차역에 서는 시각을 그대로 도착 시각으로 쓴다
3. 환승은 "내린 시각 이후 오는 다음 열차"를 다시 찾아 이어 붙인다

#### 🙏 시간표를 채워 주세요 — 지금 가장 큰 병목입니다

프론트는 이미 **`train_no` 로 실제 열차를 따라가는** 계산을 하고 있습니다.
출발 시각 이후 그 역에 오는 첫 열차를 찾고, 같은 열차의 각 역 정차 시각을 그대로 쓰며,
환승은 내린 뒤 도보 시간을 두고 다음 열차를 다시 찾습니다.

**문제는 데이터 범위입니다.**

| 항목 | 현황 |
|---|---|
| 시간표가 있는 역 | **100개 중 8개** (성환·두정·천안·봉명·쌍용·아산·배방·온양온천) |
| `1호선 (인천)` | **0 / 65역** — 서울·인천 구간이 통째로 없습니다 |
| `1호선 (신창)` | 8 / 80역 |
| **실제 시간표로 계산되는 역 쌍** | **0.9%** (3,160쌍 중 28쌍) |

즉 **경로의 99%가 추정값으로 표시됩니다.** 실제 지하철 앱과 시각을 맞추려면
시간표 데이터가 채워지는 것 말고는 방법이 없습니다.

우선순위를 매긴다면:

1. `1호선 (인천)` 노선 전체 — 지금 0건이라 서울·인천 경로가 전부 추정입니다
2. `직산`·`탕정`·`신창` — 신창은 종착역인데도 0건입니다
3. 나머지 구간 (수원·평택·의정부 등)

그전까지 누락 구간은 프론트가 **시간표에서 뽑은 평균**(역간 소요 중앙값, 배차 간격의 절반)으로
추정하고, 화면에 추정임을 밝힙니다. 개별 역이 빠진 경우는 앞뒤 역 사이를 나눠
`약 17:44` 처럼 구분 표시합니다. 채워 주시면 그대로 실제 시각으로 바뀝니다.

`arrival_time`이 NULL인 시발역은 `departure_time`을 대신 씁니다 (스키마 의도대로).

## 4. 현재 백엔드 API 계약

아래 표는 현재 FastAPI의 Swagger/OpenAPI에 등록된 경로를 기준으로 합니다.
비즈니스 API는 `/api/v1`을 공통 prefix로 사용하고 리소스명은 복수형으로 통일합니다.
요청·응답 필드와 오류 모델의 상세 계약은 실행 중인 서버의 `/docs` 또는
`/openapi.json`에서 확인합니다.

| Method | Path | 용도 |
|---|---|---|
| GET | `/health` | 서버 상태 확인 |
| GET | `/api/v1/health/db` | 현재 DB 라우팅 대상(`mysql`/`oracle`)과 마지막 동기화 시각 |
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
| DELETE | `/api/v1/admin/reviews/{review_id}` | 관리자 후기 삭제 |
| DELETE | `/api/v1/admin/posts/{post_id}` | 관리자 모집 게시글 삭제 |

현재 인증·회원·즐겨찾기·여행 계획 CRUD·읽기 전용 공유·후기·모집 게시판, 공지사항, 공개 노선·역·시간표·주변 장소와 관리자 장소 변경·콘텐츠 삭제 API 및 `/health`가 실제 구현되어 있습니다.

### MySQL 장애 시 쓰기 API 응답

MySQL이 정상이 아닐 때 모든 쓰기(POST/PATCH/DELETE) API는 아래처럼 `503`을 반환합니다. 조회(GET) API는 자동으로 Oracle 읽기 전용 복제본으로 전환되어 계속 `200`을 반환하지만, 데이터가 최대 동기화 주기(기본 10분)만큼 과거 상태일 수 있습니다.

```http
HTTP/1.1 503 Service Unavailable
Retry-After: 60

{"code": "HTTP_503", "message": "일시적으로 등록·수정 기능을 사용할 수 없습니다. 조회는 정상 이용 가능합니다.", "details": null}
```

프론트는 이 메시지를 그대로 노출해 "조회는 된다"는 점을 사용자에게 알려야 합니다. 설계 근거는 [docs/DB-FAILOVER.md](DB-FAILOVER.md)를 참고합니다.

### 4-1. 공개 transit API 연동 계약

- `GET /lines`: DB V1.10의 노선을 표시 순서대로 반환합니다.
- `GET /lines/suggestions`: 최근 1시간의 `line_view_logs`를 집계해 상위 3개 노선을 반환합니다.
- `POST /lines/{line_id}/views`: 인증 선택 API입니다. 인증 헤더가 없으면 익명 기록을, 유효한 Bearer Access Token이 있으면 회원 기록을 저장합니다. 잘못되거나 만료된 토큰은 `401`입니다.
- `GET /stations`: `keyword`, `line_id`, `page`, `size`를 지원하고 좌표와 소속 노선을 함께 반환합니다. 전체 역을 프론트에서 보관하려면 현재 데이터 범위에서 `size=100`으로 한 번 조회할 수 있습니다.
- `GET /stations/{station_id}`: 역 좌표, 주소, 소속 노선을 반환합니다.
- `GET /stations/{station_id}/timetables`: `line_id`, `day_type`, `direction`이 필수입니다. `day_type`은 `WEEKDAY|WEEKEND`, `direction`은 `UP|DOWN`입니다. V1.10의 `train_no`는 `trainNo`로 반환하며, `24:00:00` 이후 시각을 보존하기 위해 도착·출발 시각은 문자열입니다.
- `GET /stations/{station_id}/places`: 선택한 역과 V1.10의 `place_stations`로 연결된 반경 1km 이내 장소를 반환하며 `category`, `page`, `size`를 지원합니다.
- `POST/PATCH/DELETE /admin/places`: `ADMIN` 권한이 필요합니다. 장소는 한 개 이상의 역과 연결되어야 하며 생성·수정 응답에는 `stationIds`가 포함됩니다. PATCH에서 역·이미지 목록을 전달하면 전체 교체하고 생략하면 유지합니다. 장소 삭제 시 참조 중인 여행 계획 항목을 먼저 삭제하고 계획 자체는 유지합니다.
- `DELETE /admin/reviews/{review_id}`, `DELETE /admin/posts/{post_id}`: `ADMIN` 권한으로 작성자와 관계없이 후기와 모집 게시글을 삭제합니다. 후기 태그·미디어 DB 행과 모집 참여 신청은 DB CASCADE로 함께 삭제됩니다.

역 목록을 프론트에 캐시해 이름 검색과 지도 선택을 처리할 수 있습니다. DB의 역 정보가 바뀌면 다시 조회해야 하므로 정적 파일로 영구 복제하기보다는 애플리케이션 시작 시 한 번 조회하는 방식을 권장합니다.

### 4-2. 관리자 API 운영 및 후속 검토

- 관리자 전용 장소 목록·상세 조회 API는 아직 없습니다. 공개 주변 장소 조회는 역과 반경을
  기준으로 하고 전체 `stationIds`를 반환하지 않으므로, 관리자 화면의 전체 목록·수정 진입을
  위해 `GET /api/v1/admin/places`와 `GET /api/v1/admin/places/{place_id}`를 우선 추가하는
  것이 좋습니다.
- 후기 삭제 시 `review_media` DB 행은 삭제되지만 로컬 저장소의 물리 파일은 삭제되지
  않습니다. 기존 파일 URL 접근을 차단해야 한다면 저장소 삭제 인터페이스와 실패 처리 정책을
  먼저 정해야 합니다.
- 관리자 삭제 이력·삭제 사유를 저장하는 감사 로그는 현재 DB V1.10에 없습니다. 운영 감사가
  필요하면 스키마와 보존 기간을 먼저 합의해야 합니다.
- 현재 장소 이름·주소·이미지 URL의 길이는 검증하지만 공백만 입력된 문자열은 별도로
  거부하지 않습니다. 관리자 UI에서 공백 입력을 막고, 백엔드 정규화 정책은 후속으로
  확정해야 합니다.

### 4-3. 여행 계획·읽기 전용 공유 연동 계약

- `GET /plans`: 현재 사용자의 계획을 `createdAt`, `planId` 내림차순으로 페이지 조회합니다. 각 항목에는 전체 일정과 역·장소 이름이 포함됩니다.
- `POST /plans`: `planTitle`, `startStationId`, `endStationId`, `items`로 계획을 작성합니다. 출발·도착역과 각 장소가 실제로 존재해야 하며, `stationId`가 있는 일정은 DB V1.10의 `place_stations`에 해당 장소·역 조합이 있어야 합니다.
- `GET /plans/{plan_id}`: 본인 계획만 상세 조회합니다. 없는 계획은 `404 PLAN_NOT_FOUND`, 다른 사용자의 계획은 `403 PLAN_FORBIDDEN`입니다.
- `PATCH /plans/{plan_id}`: 전달한 기본 필드만 변경하지만, `items`는 전체 스냅샷으로 처리합니다. 기존 항목은 `planItemId`를 포함하고 새 항목은 이를 생략합니다. 요청 배열에서 누락된 기존 항목은 삭제되며 `items: []`는 전체 일정 삭제, `items` 생략은 일정 유지입니다. 수정 필드의 명시적 `null`은 허용하지 않습니다.
- `DELETE /plans/{plan_id}`: 본인 계획을 삭제하고 `travel_plan_items`와 공유 링크는 CASCADE 삭제합니다. 연결된 후기와 모집 게시글의 `plan_id`는 DB V1.10에 따라 `NULL`이 됩니다.
- `POST /plans/{plan_id}/share-links`: 본인 계획에 대해 기본 7일짜리 읽기 전용 링크를 발급합니다. 응답의 `shareToken`은 URL-safe 22자 원문이고 `shareUrl`은 프론트 공개 경로입니다. DB에는 원문 대신 SHA-256 64자 해시만 저장합니다.
- `GET /shared-plans/{share_token}`: 인증 없이 현재 계획 내용을 읽습니다. 소유자와 작성·수정 시각은 공개하지 않으며, 변조·만료·폐기·삭제된 링크는 모두 `404 SHARED_PLAN_NOT_FOUND`로 응답합니다.

프론트는 토큰 입력창 대신 `shareUrl`의 `/shared-plans/{shareToken}` 경로를 공개 페이지로 등록하고, 경로 파라미터를 공개 조회 API에 전달합니다. 공유 링크가 올바른 프론트 주소를 가리키도록 배포 환경에서 다음 값을 설정해야 합니다.

```env
METROTRIP_PUBLIC_FRONTEND_URL=https://프론트엔드-도메인
METROTRIP_SHARE_LINK_EXPIRE_DAYS=7
```

`travel_plan_share_links`는 DB V1.10 원본에 없는 공유 기능 확장 테이블입니다. 공유 API 배포 전에 운영 MySQL에 해당 테이블과 `travel_plans(plan_id) ON DELETE CASCADE` FK, `token_hash CHAR(64) UNIQUE`, 만료·폐기 시각 컬럼이 실제로 적용됐는지 확인해야 합니다. 테이블이 없으면 두 공유 API는 정상 동작할 수 없습니다.

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

Access Token 만료 시간은 기본 30분, Refresh Token 만료 시간은 기본 14일입니다. 프론트는 `frontend/src/shared/lib/apiClient.ts`에서 인증 요청의 401 응답을 한 번만 Refresh Token으로 갱신하고 원래 요청을 재시도합니다. 여러 요청이 동시에 만료되어도 갱신 요청은 하나만 실행하며, Refresh Token까지 만료되거나 거부된 경우에만 로컬 세션을 정리합니다.

현재 프론트 로그아웃은 로컬 토큰을 제거하기 전에 `POST /api/v1/auth/logout`을 호출하며,
서버는 해당 사용자의 활성 Refresh Token을 모두 폐기합니다. 이미 발급된 Access Token은
별도로 폐기되지 않아 기본 30분 만료 시점까지 유효하므로, 프론트는 로그아웃 즉시 로컬
Access Token을 제거해야 합니다. 관리자 계정의 즉시 세션 무효화가 필요하면 Access Token
차단 목록이나 토큰 버전 정책을 별도로 설계해야 합니다.

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

1. 인증 헤더와 공통 오류 처리를 담당하는 `apiClient.ts`를 유지·확장합니다.
2. `getMyProfile`, `reauthenticate`, `updateProfile`, `changePassword`, `withdraw` API 함수를 추가합니다.
3. 마이페이지 진입 시 `GET /users/me`로 실제 회원 정보를 불러옵니다.
4. 계정 관리 진입 전에 목적을 선택해 재인증합니다.
5. 재인증 토큰은 화면 메모리에만 보관하고 만료 시 비밀번호 입력 단계로 되돌립니다.
6. 비밀번호 변경·탈퇴 성공 시 로컬 토큰을 제거하고 로그인 화면으로 이동합니다.
7. Access Token 만료 시 Refresh Token 갱신과 원래 요청 재시도를 공통 API 클라이언트에서 처리합니다.

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

역·노선 정보는 데이터베이스 명세서 V1.10 구조를 기준으로 합니다.

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

### 노선·역 데이터 (2026-08-05 갱신 — V1.10 시드 반영 완료)

DB 시드(`seed_03_stations`, `seed_04_line_stations`)를 변환해 **역 100개**를
쓰고 있습니다. 연천~인천/신창 전 구간입니다.

`1호선 (인천)` / `1호선 (신창)` 두 갈래로 나눠 주신 덕분에 **지선이 깔끔하게 표현**되고,
공통 구간(연천~구로)이 양쪽에 들어 있어 환승 계산이 그대로 맞습니다.
`인천역 → 신창역`처럼 갈래가 바뀌는 경로에서 **환승 1회**가 정상 계산되는 것을 확인했습니다.

경로 탐색에 반드시 필요한 것:

| 필요한 것 | 대응 컬럼 | 비고 |
|---|---|---|
| 노선 내 역 순서 | `line_stations.station_order` | **인접 관계 계산의 핵심.** 없으면 경로 탐색 자체가 불가능 |
| 역 좌표 | `stations.latitude` / `longitude` | 경유역 반경 1km 장소 추천에 사용 |
| 환승역 | 한 역이 `line_stations`에서 여러 노선에 연결된 것 | 별도 컬럼 불필요 |

- 1호선처럼 **지선이 있는 노선**(경인선·장항선 등)은 `station_order` 하나만으로
  분기를 표현하기 어렵습니다. 처리 방식을 정해서 알려주세요.
- 공개 데이터셋(jhj0517 gist)을 검토했으나 **천안·아산 구간이 통째로 누락**되어 있고,
  파일 자체에 좌표 부정확 경고가 붙어 있어 쓰지 않기로 했습니다.
