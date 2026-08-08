# 모바일 아키텍처

## 기본 구조

```text
apps/mobile/src/
├─ app/                    Expo Router 화면·레이아웃
├─ features/               home, explore, trip-mode, reviews, recruitment
├─ entities/               공통 UI 모델
├─ data/
│  ├─ api/                 생성 계약 클라이언트
│  ├─ cache/               query persistence
│  ├─ db/                  SQLite 오프라인 테이블
│  └─ sync/                작업 큐·충돌 처리
├─ native/                 location, notifications, sharing, deep links
└─ shared/                 ui, tokens, auth, telemetry
```

## 데이터 계층

- 네트워크 원장은 서버 API다.
- 일반 조회 캐시는 query persistence로 유지한다.
- 오늘 계획, 계획 항목 완료, 후기 초안처럼 구조적 오프라인 데이터는 SQLite에 둔다.
- Query cache는 재조회 가능 데이터, SQLite는 앱 재시작 후에도 보존해야 할 작업 데이터다.

## 동기화 모델

| 작업 | 방식 | 충돌 |
|---|---|---|
| 계획/역/장소 읽기 | stale-while-revalidate | 서버 최신 우선, 기준 시각 표시 |
| 일정 항목 완료 | client operation ID로 큐 | 멱등 적용, 삭제된 항목은 사용자 확인 |
| 계획 순서/시간 변경 | 온라인 우선 | ETag 불일치 시 병합 화면 |
| 후기 초안 | 로컬 우선 | 게시 순간 서버 검증 |
| 이미지 | 로컬 URI 큐→사전서명 업로드 | 파일별 재시도·취소 |
| 모집 상태 | 온라인 전용 | 즉시 서버 결과만 표시 |

동기화 큐는 `pending/running/succeeded/failed/needs_review` 상태와 재시도 횟수를 가진다. 지수 백오프를 사용하되 4xx 비재시도 오류는 사용자 검토로 보낸다.

## 인증 저장

- 리프레시 토큰은 OS SecureStore/Keychain/Keystore에 저장한다.
- 액세스 토큰은 메모리 중심으로 관리한다.
- 로그아웃·재사용 탐지 시 API 캐시, 사용자 SQLite 데이터, 푸시 토큰 연결을 정리한다.
- 생체 인증은 서버 인증을 대체하지 않고 로컬 재진입 잠금 옵션으로만 사용한다.

## 위치

- 기본은 foreground 위치 한 번 조회다.
- 배경 위치 추적은 제품 요구와 별도 동의가 생기기 전 구현하지 않는다.
- 가까운 역 계산은 가능한 경우 기기에서 캐시된 역 좌표로 수행한다.
- 서버에 위치를 전송하는 검색은 정밀도를 줄이고 목적을 명시한다.

## 푸시와 딥링크

- OS 푸시 토큰은 기기 레코드로 등록하고 교체·로그아웃·무효 응답 때 갱신한다.
- 서버 알림 ID로 중복 표시를 방지한다.
- HTTPS universal/app link를 공유 링크 기본으로 한다.
- 로그인 가드는 원래 딥링크를 인증 후 복원한다.
- 알림은 화면 파일명이 아니라 `resourceType/resourceId/action`으로 목적지를 해석한다.

## 네이티브 의존성 원칙

- Expo SDK가 제공하는 기능을 우선한다.
- custom native module은 성능·보안·기능 부족이 측정됐을 때만 추가한다.
- OTA 업데이트는 네이티브 호환 버전과 서버 최소 지원 버전을 확인한 뒤 배포한다.

## 품질 게이트

- 실제 iOS/Android 기기에서 위치 거부·푸시 거부·저전력·오프라인 흐름 검증
- 앱 cold start, 지도 진입, 오늘 계획 열기 성능 측정
- 딥링크 404/로그인/설치 전환 테스트
- 스크린리더·글꼴 확대·가로 모드 핵심 흐름 검증
- 크래시와 ANR 추적, 소스맵/심볼 업로드 자동화

