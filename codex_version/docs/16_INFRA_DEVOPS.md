# 인프라·DevOps

## 1. 환경

| 환경 | 목적 | 데이터 |
|---|---|---|
| local | 개인 개발·통합 테스트 | Docker Compose, 합성 시드 |
| preview | PR별 웹/API 검토 | 수명 제한 DB 또는 공유 격리 schema, 합성 데이터 |
| staging | 운영과 같은 릴리스 검증 | 비식별/합성 데이터, 외부 sandbox |
| production | 실제 서비스 | 관리형 DB·객체 저장소·비밀 관리 |

운영 데이터를 local/preview로 복사하지 않는다.

## 2. 로컬 구성

Docker Compose는 PostgreSQL/PostGIS, Redis, S3 호환 개발 저장소, 메일 캡처 도구와 API·outbox worker·Web을 제공한다. 웹·모바일·API 프로세스는 빠른 재시작을 위해 호스트 실행도 허용한다. 2026-08-09 일반 사용자 PowerShell에서 PostgreSQL/PostGIS 17/3.5.2, Redis, MinIO, Mailpit 기동과 health를 확인했다. API·worker·Web 이미지 기동은 런북의 최종 체크포인트로 별도 기록한다.

- 한 명령으로 의존 서비스 시작
- 버전된 migration과 idempotent seed
- `.env.example`에는 키 이름과 안전한 설명만
- 개발용 기본 비밀은 운영에서 부팅 실패하도록 환경 검증
- worker는 pending outbox를 `FOR UPDATE SKIP LOCKED`로 가져오고 실패 시 최대 300초 지수 backoff로 재시도

## 3. CI 파이프라인

PR마다:

1. format/lint/type check
2. Python·TypeScript 단위 테스트
3. PostgreSQL 통합 테스트와 migration up 검증
4. OpenAPI 생성, lint, breaking diff, 클라이언트 생성 diff 확인
5. 웹 build, 핵심 route 렌더, 접근성 smoke
6. container build와 취약점·secret·dependency scan
7. 주요 E2E(인증, 탐색, 계획, 후기, 모집)
8. preview 배포와 링크 제공

main 병합 후 staging, 수동/정책 승인 후 production으로 승격한다. 같은 이미지 digest를 승격해 환경마다 다시 빌드하지 않는다.

## 4. 배포

- 웹: CDN 앞의 관리형 Next.js 런타임 또는 컨테이너.
- API/worker: 관리형 컨테이너 서비스, 최소 2개 API 인스턴스부터 시작 가능.
- DB: 관리형 PostgreSQL, 다중 AZ는 사용자 규모·비용에 따라 생산 시작 시 결정.
- Redis: 관리형 또는 초기 단일 인스턴스. 원장 데이터 저장 금지.
- 객체: versioning·수명주기·비공개 버킷·CDN signed/public policy.

롤링 또는 blue/green 배포를 사용하고 health/readiness를 분리한다. readiness는 DB 연결과 필수 설정을 검증하되 느린 외부 제공자 상태 때문에 전체 인스턴스를 제거하지 않는다.
HTTPS 강제 전환과 HSTS는 TLS를 종료하는 ingress/CDN에서 적용한다. 로컬 HTTP 검증을 깨뜨리지 않도록 애플리케이션 CSP에 `upgrade-insecure-requests`를 무조건 넣지 않는다.

## 5. DB 변경

- 배포 전 호환 가능한 expand migration을 수행한다.
- 앱이 새 구조를 사용한 뒤 backfill을 관측한다.
- 한 릴리스 이상 지난 후 contract migration을 실행한다.
- 대형 인덱스는 online/concurrent 방식과 statement timeout을 사용한다.
- 실패 시 앱 롤백과 DB forward-fix 절차를 migration마다 기록한다.

## 6. 관측성

| 신호 | 핵심 항목 |
|---|---|
| 로그 | JSON, timestamp, level, service, env, trace/request ID, route, error code |
| 메트릭 | request rate/error/duration, DB pool/slow query, queue lag/failure, cache hit |
| trace | web/API/worker/외부 연동 전파 |
| 제품 품질 | 장소 무결과율, 시간표 미지원율, 경로 추정 비율, 업로드 실패율 |

알림 우선순위:

- P1: 인증 불가, 핵심 API 고장, 데이터 손실 위험
- P2: 오류 예산 급소진, 큐 지연, 외부 데이터 장기 지연
- P3: 단일 기능 품질 저하

모든 알림은 담당자, 사용자 영향, 즉시 확인 쿼리, 런북 링크를 가진다.

## 7. 백업·복구

- 자동 DB 백업 + point-in-time recovery를 활성화한다.
- 객체 저장소 versioning과 삭제 보호 기간을 둔다.
- 초기 목표: RPO 24시간 이하, RTO 4시간 이하. 운영 중요도에 따라 강화한다.
- 분기마다 별도 환경 복원 리허설을 하고 실제 복구 시간을 기록한다.
- 백업 성공 알림만 믿지 않고 복원 가능성을 검증한다.

## 8. 외부 데이터 동기화

- source별 schedule과 lock으로 중복 실행을 막는다.
- 원본을 staging table에 적재하고 검증·diff 후 본 테이블에 반영한다.
- 삭제 급증, 역 순서 대량 변경, 좌표 이상은 자동 게시하지 않는다.
- data version, source 기준일, row count, reject count를 기록한다.
- 실패해도 마지막 성공 데이터를 서비스하며 화면에 기준 시각을 표시한다.

## 9. Kubernetes 도입 기준

초기에는 사용하지 않는다. 다음 중 여러 항목이 실제 문제가 될 때 ADR을 다시 연다.

- 서비스 수와 배포 빈도가 관리형 컨테이너 한계를 넘음
- 세밀한 네트워크/스케줄링/오토스케일 요구
- 전담 플랫폼 운영자가 있음
- 비용 분석에서 명확한 이점이 있음

단순히 계획서에 적혀 있다는 이유로 도입하지 않는다.
