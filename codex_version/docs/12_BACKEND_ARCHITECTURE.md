# 백엔드 아키텍처

## 형태

초기 목표는 하나의 배포 단위를 가진 모듈러 모놀리스다. 모듈마다 라우터, 애플리케이션 서비스, 도메인 규칙, 저장소를 분리하고 데이터베이스 트랜잭션은 유스케이스 경계에서 관리한다.

```text
services/api/app/
├─ main.py
├─ platform/
│  ├─ config.py
│  ├─ db.py
│  ├─ errors.py
│  ├─ auth.py
│  ├─ observability.py
│  └─ idempotency.py
├─ modules/
│  ├─ identity/
│  ├─ transit/
│  ├─ discovery/
│  ├─ routing/
│  ├─ planning/
│  ├─ reviews/
│  ├─ community/
│  ├─ notifications/
│  └─ moderation/
└─ integrations/
   ├─ maps/
   ├─ transit_sources/
   ├─ object_storage/
   ├─ email/
   └─ push/
```

각 모듈 내부 의존 방향은 `api → application → domain`, `application → repository → models`다. API 계층은 HTTP 변환, 애플리케이션 계층은 유스케이스·트랜잭션, 도메인은 상태 규칙, 저장소는 영속화를 담당한다.

## 현행에서 유지·교체할 것

| 현행 | 목표 |
|---|---|
| FastAPI·Pydantic·SQLAlchemy | 유지하되 Alembic과 모듈 경계 강화 |
| 수동 HMAC JWT 구현 | 검증된 JOSE 라이브러리와 키 회전 구조로 교체 |
| refresh token DB 해시·회전 | 유지, 재사용 탐지와 token family 추가 |
| 로컬 미디어 PUT | 객체 저장소 사전서명 업로드로 교체 |
| 계약만 있고 501인 transit/plan/notice | 구현 단계에서 실제 도메인·저장소 연결 |
| MySQL과 Oracle 이중 스키마 | PostgreSQL 단일 원장·관리형 복제 |
| 모델 일부 FK 생략 | 모든 FK를 마이그레이션과 ORM에 일치시킴 |

## 요청 처리

1. request ID/trace context를 생성 또는 전달한다.
2. 인증·속도 제한·입력 스키마를 검증한다.
3. 애플리케이션 서비스가 권한과 비즈니스 규칙을 확인한다.
4. 하나의 unit of work에서 변경·outbox를 커밋한다.
5. 응답 DTO를 반환하고 구조화 지표를 기록한다.

라우터에서 직접 `commit()`하거나 여러 저장소를 임의 조합하지 않는다.

## 트랜잭션 경계

| 유스케이스 | 잠금/제약 |
|---|---|
| 모집 수락 | 모집 행 조건부 잠금, 수락 인원 재집계, 정원 시 자동 마감 |
| 계획 편집 | `version` 조건부 UPDATE, 항목 일괄 검증 |
| 후기 게시 | 후기·태그·미디어 claim·outbox 원자 커밋 |
| 회원 탈퇴 | 세션 폐기, 개인정보 처리, 소유 콘텐츠 정책을 단계 작업으로 기록 |
| refresh 회전 | 기존 토큰 폐기와 새 토큰 발급을 하나의 트랜잭션으로 처리 |
| 관리자 조치 | 대상 상태 변경과 audit log 원자 커밋 |

## 읽기 모델

목록 응답에서 N+1을 피하기 위해 명시적 projection query를 사용한다. ORM 엔터티를 그대로 API에 직렬화하지 않는다.

- 후기 카드: 작성자 표시명, 대표 이미지, 경로, 반응 집계
- 모집 카드: 작성자, 정원/수락 수, 계획 요약
- 마이페이지: 각 섹션은 독립 API로 부분 실패 가능
- 역 상세: 역·노선은 캐시, 장소·시간표는 별도 병렬 리소스

## 경로 계산

- `transit`은 노선 위상과 시간표를 제공하고 `routing`이 경로를 계산한다.
- 결과에는 `algorithmVersion`, `computedAt`, `dataVersion`, 각 구간의 `REALTIME/SCHEDULE/ESTIMATE` 근거를 포함한다.
- 동일 입력의 짧은 TTL 캐시를 허용하되 실시간 데이터 버전이 바뀌면 무효화한다.
- 첫 단계는 시간 의존 Dijkstra 또는 검증된 대중교통 알고리즘을 사용하고, 프론트에서 경로를 원장처럼 계산하지 않는다.

## 비동기 작업

- transactional outbox poller 또는 CDC를 한 방식으로 선택한다.
- 이벤트는 UUID, 유형, aggregate ID, 발생 시각, schema version을 가진다.
- 소비자는 event ID를 기록해 멱등 처리한다.
- 이메일·푸시 실패는 dead-letter와 운영 재처리를 지원한다.
- 이미지 검사는 업로드 완료 command 뒤 수행한다.

## 오류 계약

```json
{
  "error": {
    "code": "RECRUITMENT_CAPACITY_REACHED",
    "message": "모집 정원이 모두 찼습니다.",
    "details": {},
    "traceId": "..."
  }
}
```

- 메시지는 사용자 표시 가능하되 클라이언트 분기는 `code`로 한다.
- 409는 버전·상태 충돌, 422는 필드 검증, 429는 제한, 503은 외부 소스 일시 장애에 사용한다.
- 예상 도메인 오류를 500으로 반환하지 않는다.

## 운영·관리자

- 관리자 API는 역할뿐 아니라 action scope를 검사한다.
- 목록 export와 대량 작업은 비동기로 실행하고 다운로드를 감사한다.
- 외부 데이터 동기화는 dry-run, 변경 요약, 승인 또는 자동 임계값을 지원한다.
- 모든 관리자 변경은 이전/이후 값, 사유, actor, request ID를 남긴다.

