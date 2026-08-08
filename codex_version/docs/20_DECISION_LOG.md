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
| D-021 | PROPOSED | 탈퇴 콘텐츠는 PII 익명화 후 보존 | 커뮤니티 맥락과 개인정보 균형 | 법무/제품 결정 필요; 현행 CASCADE와 충돌 |
| D-022 | PROPOSED | 파일럿은 천안·아산 | 기존 데이터·장소 자산이 가장 강함 | 사용자 모집 가능성 검증 필요 |
| D-023 | DEFERRED | 실시간 열차 위치 | 공급자·SLA·정확도 불확실 | P2, source 계약 후 |
| D-024 | DEFERRED | 추천/AI 일정 생성 | 핵심 데이터·품질보다 앞서면 신뢰 저하 | 충분한 완성 계획·동의 데이터 후 |
| D-025 | PROPOSED | 후기 도움됨 반응은 P1 | 요구에는 있으나 현행 계약/DB 없음 | 커뮤니티 moderation과 함께 출시 |

새 결정은 ID, 상태, 선택, 근거, 결과, 재검토 조건을 반드시 남긴다. 이미 구현됐다는 사실만으로 목표 결정이 되지는 않는다.

