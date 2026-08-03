# 백엔드 연동 인수인계 문서

MVP는 백엔드 없이 프론트 단독으로 동작합니다.
나중에 백엔드가 붙을 때 **프론트를 크게 뜯어고치지 않도록**, 지금부터 지켜야 할 경계를 정리합니다.

> 대상: 백엔드(윤홍규), DB(김유진), 프론트(우진, 황지성)
> 상태: 현재 FastAPI Swagger 계약 기준 — 비즈니스 로직 구현 전

---

## 1. 핵심 원칙

**프론트 컴포넌트는 데이터가 어디서 오는지 몰라야 합니다.**

지금은 정적 JSON에서, 나중에는 API에서 오지만 컴포넌트 코드는 그대로여야 합니다.
그래서 데이터 접근은 반드시 **`frontend/src/api/` 아래 함수 한 겹을 거쳐서** 합니다.

```
컴포넌트  →  frontend/src/api/stations.ts  →  (지금) stations.json
                                           →  (나중) GET /api/v1/stations
```

컴포넌트에서 `import stations from '../data/stations.json'` 처럼 **직접 import 하지 않습니다.**

## 2. 지금 만들어 둘 인터페이스

```ts
// frontend/src/types/station.ts
export type Station = {
  name: string;
  lat: number;
  lng: number;
  line: string;
};

// frontend/src/api/stations.ts
// MVP: stations.json을 반환. 백엔드 연동 시 이 함수 내부만 fetch로 교체.
export async function getStations(): Promise<Station[]>;
export async function searchStations(keyword: string): Promise<Station[]>;
```

> `async`로 만들어 두는 이유: 나중에 API로 바꿔도 **호출부 시그니처가 바뀌지 않기 때문**입니다.
> 지금 동기 함수로 만들면 나중에 전부 고쳐야 합니다.

## 3. 교체 지점 목록

| 현재 (MVP) | 교체 후 (P1) | 영향 파일 |
|---|---|---|
| `stations.json` 정적 로드 | `GET /api/v1/stations` | `frontend/src/api/stations.ts` |
| 카카오 로컬 API 프론트 직접 호출 | 백엔드 프록시 경유 (키 은닉 + 캐싱) | `frontend/src/api/places.ts` |
| 없음 | 인증 토큰 처리 | `frontend/src/api/client.ts` (신규) |

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
| POST | `/api/v1/auth/refresh` | Access Token 갱신 |
| POST | `/api/v1/auth/logout` | 로그아웃 |
| GET | `/api/v1/users/me` | 내 회원 정보 |
| PATCH | `/api/v1/users/me` | 내 회원 정보 수정 |
| DELETE | `/api/v1/users/me` | 회원 탈퇴 |
| GET | `/api/v1/users/me/favorites` | 역 즐겨찾기 목록 |
| POST | `/api/v1/users/me/favorites/{station_id}` | 역 즐겨찾기 추가 |
| DELETE | `/api/v1/users/me/favorites/{station_id}` | 역 즐겨찾기 삭제 |
| GET | `/api/v1/users/me/reviews` | 내가 작성한 후기 목록 |
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

현재 `/health`를 제외한 비즈니스 API는 계약만 구현되어 있으며 호출 시
`501 Not Implemented`를 반환합니다.

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

## 5. DB 담당에게 전달할 사항

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
