# 결정 로그

## 상태

- `ACCEPTED`: 독립 버전 기본안
- `PROPOSED`: 질문 해소 후 확정
- `DEFERRED`: 후속 단계에서 재평가
- `SUPERSEDED`: 다른 결정으로 대체

| ID | 상태 | 결정 | 이유 | 결과·재검토 조건 |
|---|---|---|---|---|
| D-001 | ACCEPTED | 기존 앱 복제가 아닌 clean-slate 설계 | 문서·코드·DB 충돌과 제품 범위 변화 | 데이터·규칙·테스트만 선별 재사용 |
| D-002 | ACCEPTED | Transit+Discovery+Planning+Community 결합 | 역/장소/계획/콘텐츠의 연결이 차별점 | 루프 기여 없는 기능은 후순위 |
| D-003 | ACCEPTED | 웹과 모바일을 별도 surface로 설계 | 여행 전 편집과 여행 중 사용 맥락이 다름 | 공통 계약/토큰만 공유 |
| D-004 | ACCEPTED | 웹은 Next.js, 모바일은 Expo | SSR/SEO와 네이티브 위치·푸시 동시 충족 | 팀 역량·배포 제약 변하면 재검토 |
| D-005 | ACCEPTED | FastAPI 모듈러 모놀리스 | 현행 역량과 트랜잭션 단순성 | 조직·부하가 분리 필요를 증명할 때만 서비스 분리 |
| D-006 | ACCEPTED | PostgreSQL+PostGIS 단일 원장 | 공간 검색·FTS·제약 통합 | 관리형 제공/비용 문제 시 대안 검토 |
| D-007 | ACCEPTED | Oracle 실시간 백업과 Kubernetes 제외 | 초기 복잡도 대비 복구·운영 가치 낮음 | RPO/RTO나 규모 요구가 바뀌면 ADR |
| D-008 | ACCEPTED | 내부 UUID와 source별 external ID 분리 | 외부 역 코드 체계 충돌 | 외부 ID를 FK로 사용 금지 |
| D-009 | ACCEPTED | service calendar+exception+offset stop time | 주말 enum 충돌과 자정 운행 해결 | GTFS 호환성을 유지 |
| D-010 | ACCEPTED | 계획 순서는 `position`, 시간은 별도 | visit_time 정렬은 충돌·무시간 일정에 약함 | 재정렬 API 원자 처리 |
| D-011 | ACCEPTED | 계획에 날짜·day를 추가 | 여행 계획의 핵심인데 현행 DB에 없음 | 다일정 지원 가능 |
| D-012 | ACCEPTED | 공개 공유 링크는 hash·회수·만료 가능 | 읽기 전용 공유와 유출 대응 | 쓰기 권한 링크 금지 |
| D-013 | ACCEPTED | 사전서명 객체 업로드+검사 | 로컬 디스크와 임의 URL 등록 위험 | 검증 전 공개 금지 |
| D-014 | ACCEPTED | refresh 회전+family reuse 탐지 | 장기 세션 탈취 피해 제한 | 웹 localStorage 사용 금지 |
| D-015 | ACCEPTED | API cursor, 관리자 표만 page/size | 피드 변경 중 중복·누락 감소 | 작은 고정 목록은 pagination 생략 가능 |
| D-016 | ACCEPTED | ETag 기반 낙관적 동시성 | 계획·모집·콘텐츠 덮어쓰기 방지 | 충돌 UX 필수 |
| D-017 | ACCEPTED | outbox로 알림·집계 연결 | DB 변경과 비동기 이벤트 유실 방지 | broker가 바뀌어도 이벤트 계약 유지 |
| D-018 | ACCEPTED | 모집 P0, 일반 토론 커뮤니티 P1 | 최신 DB/구현은 모집이 더 구체적 | moderation 준비 후 댓글 출시 |
| D-019 | ACCEPTED | 지도와 목록은 동등한 탐색 수단 | 접근성·SDK 실패·비교성 | 지도 실패에도 핵심 흐름 유지 |
| D-020 | ACCEPTED | 정보 중심·절제된 블루 디자인 | 기존 과도한 카드/폭 불일치 개선 | 공통 content width 토큰 |
| D-021 | ACCEPTED | 개발 기본안은 탈퇴 시 PII 익명화 후 공개 콘텐츠 관계 보존 | 커뮤니티 맥락과 개인정보 균형 | 법적 보존·삭제 정책 확정 시 재검토 |
| D-022 | PROPOSED | 파일럿은 천안·아산 | 기존 데이터·장소 자산이 가장 강함 | 사용자 모집 가능성 검증 필요 |
| D-023 | DEFERRED | 실시간 열차 위치 | 공급자·SLA·정확도 불확실 | P2, source 계약 후 |
| D-024 | DEFERRED | 추천/AI 일정 생성 | 핵심 데이터·품질보다 앞서면 신뢰 저하 | 충분한 완성 계획·동의 데이터 후 |
| D-025 | ACCEPTED | 후기는 사용자당 하나의 도움됨 반응을 지원 | 피드 품질 신호와 중복 반응 방지 | 신고·moderation 정책과 함께 운영 지표 재검토 |
| D-026 | ACCEPTED | 로컬 S3는 내부 MinIO 주소와 브라우저 공개 주소를 분리 | 컨테이너 내부 DNS로 만든 사전서명 URL은 브라우저에서 열 수 없음 | 배포 시 public origin과 bucket 정책을 별도 설정 |
| D-027 | ACCEPTED | 평점은 DB에 0.5점 단위 정수(`rating_twice`)로 저장 | 부동소수·소수 정밀도 차이를 제거하고 check constraint를 단순화 | 표시 계약은 0.5~5.0 값을 유지 |
| D-028 | ACCEPTED | 웹 브라우저는 같은 출처의 `/api/v1`만 호출하고 Next 서버가 API로 프록시 | cross-origin refresh 쿠키 실패와 공개 API 주소 결합을 제거 | 분리 도메인 배포 시 CORS·cookie domain ADR 재검토 |
| D-029 | ACCEPTED | 초기 worker는 PostgreSQL outbox를 `SKIP LOCKED`로 polling하고 지수 backoff 재시도 | broker 장애와 DB 트랜잭션 사이 이벤트 유실을 피하면서 로컬 구성을 단순화 | 처리량·지연 지표가 임계치를 넘으면 Redis broker 또는 전용 큐로 교체 |
| D-030 | ACCEPTED | 탈퇴는 현재 비밀번호와 `DELETE` 확인 후 즉시 PII 익명화, reset challenge·push device 삭제, 신청 비공개 메시지 제거, 모든 세션 폐기 | 민감 작업 의도를 재검증하고 공개 콘텐츠 관계만 유지하는 파일럿 정책을 명확히 함 | 취소 유예·법적 보존 정책 승인 시 비동기 삭제 요청으로 전환 |
| D-031 | ACCEPTED | Phase A~H의 실행 계약은 생성 OpenAPI를 source of truth로 하고 Phase 1 목표 API와의 차이를 별도 표로 유지 | 초기 목표 경로와 실제 구현 경로를 혼합하면 Web/Mobile 계약 드리프트와 과장된 완료 보고가 발생함 | 이메일 검증·세분화 세션·영업시간·인앱 알림을 구현할 때 목표 표와 실제 표를 다시 통합 |
| D-032 | ACCEPTED | Kakao JavaScript SDK는 Web 지도 렌더링에만 사용하고 Kakao Local REST 조회는 API가 수행해 PostGIS에 TTL 캐시 | REST 키를 브라우저에 노출하지 않고 목록·지도·즐겨찾기가 동일한 내부 UUID와 공급자 상태를 사용해야 함 | 공급자 쿼터·신선도 요구가 바뀌면 동기화 ledger와 background refresh를 도입 |

새 결정은 ID, 상태, 선택, 근거, 결과, 재검토 조건을 반드시 남긴다. 이미 구현됐다는 사실만으로 목표 결정이 되지는 않는다.

| D-033 | ACCEPTED | 사용자 명칭을 `맵`·`모집`으로 통일 | 탐색/동행 용어보다 수행 행동이 명확함 | 내부 route/API 이름은 호환성을 위해 유지 |
| D-034 | ACCEPTED | Kakao Local 조건별 조회를 기본 24시간 ledger 캐시 | 장소 원장은 분 단위 실시간성이 낮고 로컬 쿼터를 절약해야 함 | 수동 갱신과 background refresh는 후속 |
| D-035 | ACCEPTED | 공개 제휴 계약 없는 도보 시간은 거리 기반 예상으로 표시 | Kakao Mobility 도보 API는 제휴 파트너 전용이며 일반 REST 키만으로 보장할 수 없음 | 제휴 승인 시 feature flag로 공식 endpoint 활성화 |
| D-036 | ACCEPTED | 계획 편집을 맵 우측 drawer에도 제공 | 장소 탐색 문맥을 잃지 않고 즉시 일정화 | 전체 `/plans` 편집기는 고급 편집용으로 유지 |
| D-037 | ACCEPTED | 후기 목적역 nullable 및 원본 이미지 크기 저장 | 단일 역 여행과 비율 기반 masonry를 정확히 지원 | 기존 행은 그대로 호환 |
