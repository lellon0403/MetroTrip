# 학교 작업용 인수인계

> 기준일: 2026-08-10  
> 작업 위치: `C:\Users\wltjd\Desktop\MetroTrip\codex_version`  
> 현재 브랜치: `experiment/codex-implementation`

## 1. 현재 상태

Codex 독립 버전의 Phase A~H 구현과 자동 검증은 대부분 끝났다. 홈, 맵, 일정, 후기, 모집, 관리자 기능과 API·DB·Web·Mobile 기반이 구현되어 있으며 PostgreSQL/PostGIS, Redis, MinIO, Mailpit을 포함한 로컬 Docker 스택도 검증했다.

학교에서 이어서 할 핵심은 **최신 Web 이미지를 한 번 다시 빌드한 뒤 반경 원을 실제 화면에서 최종 확인하는 것**이다. 카카오 지도 타일, 실 장소 데이터, 복수 카테고리, 즐겨찾기 마커, 시간표 drawer, 일정 순번 집중 모드는 이미 실제 브라우저에서 확인했다.

## 2. 학교 PC에서 브랜치 받기

현재 작업은 `main`이나 `develop`이 아니라 `experiment/codex-implementation` 브랜치에 올린다. 학교 PC의 기존 MetroTrip 저장소에서 다음을 실행한다.

```powershell
git fetch origin
git switch experiment/codex-implementation
git pull --ff-only origin experiment/codex-implementation
```

처음 받는 PC라면 프로젝트 경로와 로컬 `.env`를 별도로 준비해야 한다. `.env`와 API 키는 Git에 포함되지 않는다.

## 3. 학교에서 가장 먼저 실행할 명령

Docker Desktop을 켠 일반 사용자 PowerShell에서 실행한다.

```powershell
cd C:\Users\wltjd\Desktop\MetroTrip\codex_version
docker compose up -d --build web
docker compose ps
```

전체 스택까지 다시 만들 필요가 있다면 다음 명령을 사용한다.

```powershell
docker compose up -d --build api worker web
docker compose ps
```

Web 주소는 **`http://localhost:3100`**을 사용한다. `127.0.0.1:3100`은 카카오 개발자 콘솔의 허용 도메인과 다르면 SDK가 실패할 수 있다.

## 4. 최종 브라우저 확인

`http://localhost:3100/discover`에서 아래 순서로 확인한다.

- 카카오 지도 타일이 정상 표시되는가
- 선택 역을 중심으로 반경 원이 표시되는가
- 반경을 `500m`, `1km`, `2km`로 바꾸면 원 크기와 장소 결과가 함께 바뀌는가
- 기본 선택이 `맛집 + 카페`이고 `문화` 같은 추가 카테고리를 동시에 선택할 수 있는가
- 장소 선택 시 상세 inspector가 열리고 즐겨찾기 버튼과 마커 상태가 동기화되는가
- 역 옆 시간표 버튼으로 drawer가 열리는가
- 일정 만들기 후 장소를 추가하고 순서 보기로 전환하면 다른 장소 마커가 숨겨지고 `1, 2, ...` 순번만 보이는가
- 브라우저 콘솔에 오류가 없는가

반경 원이 보이지 않던 원인은 `Circle` 객체를 생성만 하고 지도에 연결하지 않은 것이었다. 현재 [KakaoMap.tsx](../apps/web/src/components/KakaoMap.tsx)에 `radiusCircle.setMap(map)` 수정이 반영되어 있고, lint·typecheck·production build까지 통과했다. Docker Web 이미지만 최신 코드로 다시 빌드하면 된다.

## 5. 이미 확인한 내용

- 실제 Kakao 지도 타일 로드와 Kakao Local 장소 데이터 표시
- 기본 `FOOD + CAFE` 필터와 다중 카테고리 선택
- 장소 목록·마커·상세 inspector 연동
- 즐겨찾기 저장 및 즐겨찾기 전용 마커 표현
- 시간표 drawer
- 일정 drawer, 장소 추가, 순번 집중 모드와 번호 마커
- 홈 aggregation API와 홈 화면
- 후기 검색·masonry 카드·단일 역 표현·상세 조회수 증가 규칙
- Reddit/X 형태 모집 feed와 최신순·인기순
- 공지·이벤트 관리자 기능
- Access Token 만료 후 Refresh Token 회전과 세션 유지

## 6. 주요 구현 범위

- 홈: 여행 시작 CTA, 추천·인기 장소, 모집 홍보, 진행 이벤트·공지
- 맵: 메뉴명 변경, 장소 복수 필터, 일 단위 공급자 동기화 캐시, 반경 선택, 장소 inspector, 즐겨찾기, 시간표, 일정 편집·순번 보기
- 후기: 검색 UI, 이미지 비율 기반 masonry, 본문 요약 제거, 이미지 위 역 표시, 단일 역 지원
- 모집: 용어 변경, Reddit/X형 feed, 최신순·인기순, 조회수
- API/DB: 홈 aggregation, 이벤트·공지, 후기 이미지 크기·nullable 도착역, 모집 조회수, 장소 동기화 ledger, 도보 예상 경로

## 7. 자주 볼 파일

- Web 맵 화면: `apps/web/app/discover/page.tsx`
- Kakao 지도 렌더러: `apps/web/src/components/KakaoMap.tsx`
- 일정 UI: `apps/web/src/components/PlannerPanel.tsx`
- 홈 화면: `apps/web/app/page.tsx`
- 후기: `apps/web/app/reviews/`
- 모집: `apps/web/app/recruitments/`
- API 앱: `services/api/app/`
- 마이그레이션: `services/api/alembic/versions/0009_product_experience.py`
- 전체 구현 상태: `docs/21_IMPLEMENTATION_STATUS.md`
- 제품 결정: `docs/20_DECISION_LOG.md`

## 8. 자동 검증 명령

Web:

```powershell
cd C:\Users\wltjd\Desktop\MetroTrip\codex_version
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build:web
```

API 정적·기본 테스트:

```powershell
cd C:\Users\wltjd\Desktop\MetroTrip\codex_version
$env:METROTRIP_IGNORE_DOTENV='1'
python -m ruff check services/api/app services/api/tests
python -m pytest services/api/tests -q
```

실제 PostgreSQL 통합 테스트는 Docker 스택을 띄운 상태에서 실행한다.

```powershell
$env:METROTRIP_IGNORE_DOTENV='1'
$env:METROTRIP_RUN_POSTGRES_TESTS='1'
python -m pytest services/api/tests -q
```

최근 통과 기준은 Ruff 전체 통과, 기본 Python `38 passed, 5 skipped`, PostgreSQL 모드 `43 passed`, Web JS `4 passed`, Next production build 14 routes다.

## 9. 환경변수 주의

- 실제 값은 `.env`에만 두고 Git에 커밋하지 않는다.
- Web 지도는 `NEXT_PUBLIC_KAKAO_JS_KEY`가 필요하다.
- 서버 장소 검색은 `KAKAO_REST_API_KEY`가 필요하다.
- 실 공급자 모드는 `PROVIDER_MODE` 설정을 따른다.
- 키 값 자체를 문서·로그·커밋 메시지에 적지 않는다.

## 10. 완료 판정

반경 원과 `500m/1km/2km` 변경을 최신 Docker Web 이미지에서 확인하면 이번 제품 경험 보강의 로컬 Web 검증은 끝난다. Android/iOS 실기기, 운영 이메일·푸시, 운영 도메인·클라우드·스토어 서명은 이번 로컬 범위 밖이다.
