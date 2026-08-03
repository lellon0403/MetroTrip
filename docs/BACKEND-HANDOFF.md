# 백엔드 연동 인수인계 문서

MVP는 백엔드 없이 프론트 단독으로 동작합니다.
나중에 백엔드가 붙을 때 **프론트를 크게 뜯어고치지 않도록**, 지금부터 지켜야 할 경계를 정리합니다.

> 대상: 백엔드(윤홍규), DB(김유진), 프론트(우진, 황지성)
> 상태: 초안 — 백엔드 착수 시점에 함께 확정 필요

---

## 1. 핵심 원칙

**프론트 컴포넌트는 데이터가 어디서 오는지 몰라야 합니다.**

지금은 정적 JSON에서, 나중에는 API에서 오지만 컴포넌트 코드는 그대로여야 합니다.
그래서 데이터 접근은 반드시 **`frontend/src/api/` 아래 함수 한 겹을 거쳐서** 합니다.

```
컴포넌트  →  frontend/src/api/stations.ts  →  (지금) stations.json
                                           →  (나중) GET /api/stations
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
| `stations.json` 정적 로드 | `GET /api/stations` | `frontend/src/api/stations.ts` |
| 카카오 로컬 API 프론트 직접 호출 | 백엔드 프록시 경유 (키 은닉 + 캐싱) | `frontend/src/api/places.ts` |
| 없음 | 인증 토큰 처리 | `frontend/src/api/client.ts` (신규) |

### 카카오 API를 백엔드로 옮겨야 하는 이유
지금은 JavaScript 키가 브라우저에 노출됩니다. MVP에서는 **도메인 제한**으로 막지만,
운영 단계에서는 백엔드가 REST 키로 호출하고 프론트는 백엔드만 부르는 구조가 맞습니다.

## 4. 백엔드에 요청할 API (P1 초안)

확정 아님. 백엔드 착수 시 함께 스펙 확정합니다.

| Method | Path | 용도 |
|---|---|---|
| GET | `/api/stations` | 역 목록 전체 |
| GET | `/api/stations?keyword=` | 역 검색 |
| GET | `/api/places?lat=&lng=&radius=&category=` | 주변 장소 (카카오 프록시) |
| POST | `/api/auth/signup` | 회원가입 |
| POST | `/api/auth/login` | 로그인 |
| GET | `/api/favorites` | 즐겨찾기 조회 |
| POST | `/api/favorites` | 즐겨찾기 추가 |
| GET | `/api/reviews` | 후기 목록 |
| POST | `/api/reviews` | 후기 작성 |

### 응답 형식 합의 (제안)

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

에러 시:

```json
{
  "success": false,
  "data": null,
  "error": { "code": "STATION_NOT_FOUND", "message": "역을 찾을 수 없습니다" }
}
```

> 형식이 정해지지 않으면 프론트가 응답 처리 코드를 두 번 짜게 됩니다.
> **백엔드 착수 전에 이 부분부터 합의**해 주세요.

## 5. DB 담당에게 전달할 사항

MVP의 `stations.json` 구조가 그대로 `station` 테이블의 최소 컬럼이 됩니다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | PK | |
| `name` | VARCHAR | 역명 |
| `lat` | DECIMAL | 위도 |
| `lng` | DECIMAL | 경도 |
| `line` | VARCHAR | 노선명 |

- 환승역은 같은 이름이 노선별로 중복됩니다 → `name` 단독 UNIQUE 불가, `(name, line)` 조합 고려
- 좌표 정밀도는 소수점 6자리 이상 권장
