# 작업 로그

하루 작업이 끝나면 **3줄**만 남깁니다. 다른 PC에서 이어서 작업할 때 이 파일부터 봅니다.

## 2026-08-12 — 서버 pull 자동화 방식을 cron으로 결정
- 한 것: 배포 서버(우분투 + Docker, 메모리 1GB) 준비가 끝난 상태에서 이미지 pull·재기동 자동화 방식으로 cron을 확정했다(하드웨어 여유가 늘면 Watchtower로 전환 검토). `docs/CICD.md` 7.3절에 `deploy.sh` + crontab 예시(5분 간격, `docker image prune -f`로 옛 이미지 정리, 로그 파일 기록)를 추가했다.
- 다음 할 것: 이 스크립트를 실제 서버 경로에 맞게 배치하고 crontab에 등록한 뒤, `main` push 후 몇 분 안에 컨테이너가 실제로 갱신되는지 끝까지 검증한다. 그 전에 Docker Hub 저장소 설정(`DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN`/`NEXT_PUBLIC_KAKAO_JS_KEY`/`DOCKERHUB_NAMESPACE`)이 먼저 등록돼 있어야 `cd-main.yml`이 이미지를 올릴 수 있다.
- 막힌 것 / 공유할 것: cron 스크립트 자체는 아직 서버에 올린 적이 없어 미검증이다. `docs/CICD.md`의 경로(`/opt/metrotrip`)는 예시이니 실제 서버 배치 경로에 맞게 바꿔야 한다.
- (추가) 배포 도메인이 `https://metrotrip.kro.kr`로 확정됐다. TLS는 기존 nginx/Caddy 리버스 프록시가 종단한다(이 저장소 밖에서 이미 구성됨) — `docker-compose.yml`은 그대로 둬도 되고, `frontend:5173` 하나만 프록시에 연결하면 `next.config.ts`의 rewrites가 `/api/v1`도 알아서 처리한다. `.env.example`의 `METROTRIP_CORS_ORIGINS`/`METROTRIP_PUBLIC_FRONTEND_URL`을 이 도메인으로 채워뒀다. 이 과정에서 실제 버그 가능성 하나를 발견했다: `backend/app/services/reviews.py`의 `create_media_upload`가 `request.url_for()`로 절대 URL을 만드는데 `backend/Dockerfile`의 uvicorn에 `--proxy-headers`가 없어서, 리버스 프록시 뒤에서 후기 업로드 미디어 URL이 `metrotrip.kro.kr`이 아니라 내부 연결 정보로 깨져 나올 수 있다 — 아직 코드는 안 고쳤고 실제로 후기 사진을 올려서 확인부터 필요하다(`docs/CICD.md` 7.3절·8장, `backend/.txt`에 기록).

## 2026-08-11 — 배포 방식을 GitHub Pages → Docker로 전환 + develop 최신화 반영
- 한 것: 프론트·백엔드를 모두 Docker로 배포하기로 결정하고 `deploy.yml`(GitHub Pages)을 비활성화했다(push 트리거 제거). 이후 develop을 최신화하니 프론트가 Vite SPA에서 Next.js SSR로, 백엔드에 MySQL/Oracle 이중화(`docs/DB-FAILOVER.md`)가 들어와 있어 CI/CD를 통째로 재검토했다: `ci-frontend.yml`을 eslint/`tsc --noEmit`/`next build`로 전면 재작성(Node 22→24, oxlint/vite 관련 내용 제거), `docker-compose.yml`을 `frontend/Dockerfile`(develop에 이미 있던 Next.js 3단계 빌드, 포트 5173)에 맞춰 다시 썼다 — 백엔드 서비스명을 `api`로 강제(Dockerfile의 `API_INTERNAL_BASE_URL` 기본값이 `http://api:8000`), `NEXT_PUBLIC_KAKAO_JS_KEY` 빌드 인자, 동기화 상태용 `backend_var` 볼륨 추가. 체크아웃 충돌로 생겼던 대피 파일들(`gitpx_deploy.yml`, 루트 `Dockerfile`, 예전 `frontend/nginx.conf`)은 확인 후 삭제. `ci-backend.yml`은 oracledb/apscheduler 추가 후에도 로컬에서 134개 테스트 전부 통과 재확인 — 변경 불필요.
- 다음 할 것: Docker가 설치된 다른 PC에서 `docker compose up -d --build`로 실제 1차 검증까지 마쳤다 — `api`/`frontend` 둘 다 기동, `/health`·`/api/v1/health/db` 정상, 브라우저에서 홈 데이터도 정상 표시. 그 과정에서 진짜 버그를 하나 찾아 고쳤다: `app/scheduler.py`가 실행 시점에 `scripts.sync_to_oracle`을 import하는데 `backend/Dockerfile`이 `scripts/`를 이미지에 안 넣고 `pyproject.toml`도 그 패키지를 포함 안 해서 컨테이너에서 10분마다 `ModuleNotFoundError`가 났다 — Dockerfile에 `COPY scripts ./scripts` 추가, `pyproject.toml`의 `packages.find.include`에 `"scripts*"` 추가로 해결하고 격리된 venv에서 재현·검증했다(기존 ruff/pytest 134개도 그대로 통과). 카카오맵은 그 PC에서 "Kakao 지도 SDK를 불러오지 못했습니다"(스크립트 네트워크 에러)로 확인돼, 앱 설정이 아니라 그 PC/브라우저가 `dapi.kakao.com`에 못 나가는 것으로 원인을 좁혔다(방화벽/사내망/광고차단 추정, 그 PC에서 직접 확인 필요).
- 브랜치 전략을 다시 정했다: **develop은 CI만, main은 CI + Docker 이미지 빌드·Docker Hub push까지만** 하고 나머지(이미지 pull, 컨테이너 재기동)는 서버에서 한다 — self-hosted runner를 GitHub Actions에 등록하는 방식은 안 쓴다. `deploy-develop.yml`(develop push 게이트 + 비활성 self-hosted deploy 잡)을 지웠다. 작업 중 `.github/workflows/.yaml`이라는 이름으로 팀원(jeonseho00 Docker Hub 계정)이 준 실제 참고 워크플로가 저장소에 이미 있는 걸 발견해서, 확인 후 그 구조를 그대로 `cd-main.yml`(워크플로 이름은 `Test and publish Docker images`)로 채택했다 — test-backend/test-frontend/publish 3개 잡을 인라인(ci-backend.yml/ci-frontend.yml을 workflow_call로 재사용하지 않음), `docker/build-push-action`으로 backend·frontend 이미지를 `main`+커밋SHA 태그로 push. 하드코딩돼 있던 `jeonseho00`만 저장소 Variable `DOCKERHUB_NAMESPACE`로 뺐다(팀원 계정을 쓰기로 해서). `ci-backend.yml`/`ci-frontend.yml`의 push 트리거에서는 `main`을 뺐다(develop만 직접 트리거 — main 검증은 이제 cd-main.yml이 독자적으로 함). `docker-compose.yml`에 `image:`(배포 서버용, `${DOCKERHUB_NAMESPACE}/metrotrip-*:main` pull)와 `build:`(로컬 검증용, 그대로 유지)를 같이 둬서 두 용도를 한 파일로 커버했다.
- 다음 할 것: 저장소에 Variables(`DOCKERHUB_USERNAME`, `DOCKERHUB_NAMESPACE`, `NEXT_PUBLIC_KAKAO_JS_KEY`)와 Secret(`DOCKERHUB_TOKEN`)을 실제로 등록하고 main에 push해서 `cd-main.yml`이 실제로 Docker Hub까지 이미지를 올리는지 확인해야 한다(아직 미검증). 그다음 서버 쪽 pull·재기동 방식(수동/cron/Watchtower 등, `docs/CICD.md` 7장)을 정한다.
- 막힌 것 / 공유할 것: 카카오맵 문제는 그 PC의 네트워크/브라우저 쪽 확인이 남아 있다. Oracle 지갑 파일도 아직 없어 `docker-compose.yml`에 볼륨 마운트를 추가하지 못했다.
- (추가) 배포 서버 준비 완료 — 우분투 서버 + Docker, 메모리 1GB라 k3s는 못 쓴다(원래 설계대로 순수 `docker compose`로 간다는 뜻과 일치). 남은 건 서버 쪽 pull·재기동 자동화 방식(cron/수동/Watchtower/webhook, 메모리 제약상 cron 유력) 결정과 Docker Hub 저장소 설정 등록 후 `main` push로 `cd-main.yml` 실제 검증뿐이다. `docs/CICD.md` 7.3장·8장 갱신함.

## 2026-08-10 — GitHub Actions CI 구성
- 한 것: `ci-backend.yml`/`ci-frontend.yml`/`deploy-develop.yml`을 프로젝트에 맞게 작성했다. backend는 Python 3.10 + ruff + pytest(SQLite 인메모리라 MySQL 불필요), frontend는 Node 22 + oxlint + `tsc`/`vite build`로 검증한다. 로컬에서 두 CI 명령 모두 통과 확인(pytest 105개, lint/build 정상).
- 다음 할 것: 배포 서버(self-hosted runner)와 `docker-compose.yml`이 준비되면 `deploy-develop.yml`의 `deploy` 잡(`if: false`로 비활성 중) 활성화. 자세한 설정과 사용법은 `docs/CICD.md` 참고.
- 막힌 것 / 공유할 것: 백엔드를 올릴 서버가 아직 없어 실제 배포 자동화는 보류 상태다.

## 2026-08-09 — 관리자 장소·콘텐츠 관리 구현
- 한 것: 장소 등록·부분 수정·삭제와 관리자 후기·모집 게시글 삭제를 구현하고 관리자 권한·연쇄 삭제 테스트와 문서를 보강해 Pytest 105개 통과를 확인했다.
- 다음 할 것: 관리자 화면 연동 전에 장소 목록·상세 조회 API를 추가하고 실제 MySQL에서 장소·계획 항목 삭제 트랜잭션을 점검한다.
- 막힌 것 / 공유할 것: 후기 물리 파일 삭제, 관리자 감사 로그, 로그아웃한 Access Token의 즉시 폐기는 별도 정책이 필요하다.

## 2026-08-08 — 경로 노선도를 공식 노선도 모양으로 배치
- 한 것: 노선이 꺾이는 모양을 `data/lineShapes.ts` 에 **방향과 역 개수**로만 적어 두고 자동 배치하도록 바꿨다(좌표를 역마다 찍지 않는다). 수도권 전철 노선도의 1호선 모양(연천→회룡 동쪽 일직선, 광운대에서 내려꺾임, 도심 서쪽 가로지르기, 구로에서 인천·신창 두 갈래)을 그대로 따른다. 전 구간이 2500x2900px 라 **전체 보기** 버튼을 추가했다.
- 다음 할 것: 2~4호선 데이터가 오면 `lineShapes.ts` 에 모양만 추가하면 된다. 아직 DB 시드에는 1호선 두 갈래뿐이다.
- 막힌 것 / 공유할 것: 시간표 커버리지가 여전히 **100개 역 중 8개**라 경로의 99%가 추정값이다(`BACKEND-HANDOFF.md` 참고). 그리고 DB 장소 33곳이 8개 역에만 붙어 있고 **탕정역은 0곳**이라, 프로젝트 범위(탕정역 인근)와 어긋나는 점을 팀 회의에서 논의하기로 했다.

## 2026-08-08 — 공개 노선·역 API 백엔드 구현 및 문서 최신화
- 한 것: DB V1.10 기준으로 노선 목록·상위 3개 추천·조회 기록과 역 목록·검색·상세·시간표·주변 장소 API를 구현하고 Swagger·MySQL SQL 컴파일·Ruff·Pytest 70개 통과를 확인했다.
- 다음 할 것: 프론트의 정적 역·노선·시간표·장소 데이터 접근 함수를 공개 transit API로 교체한다.
- 막힌 것 / 공유할 것: 여행 계획·공지사항·관리자 장소 변경은 아직 `501`이며, DB·애플리케이션 UTC 통일과 탈퇴 사용자 잔존 Access Token 처리는 별도 검토사항이다.

## 2026-08-07 — 내가 작성·참여한 모집 글 목록 조회 백엔드 구현
- 한 것: JWT 사용자 기준 작성 글과 `APPLIED`·`ACCEPTED` 참여 글 목록을 페이지 조회하고, 참여 상태·신청·응답 시각을 응답에 포함함. 상태별 최근 신청순·최근 수락순 검증을 포함해 Pytest 46개가 통과함.
- 다음 할 것: 마이페이지 모집 글 탭에 `/users/me/posts`와 필수 `status`를 받는 `/users/me/participating-posts`를 연결함.
- 막힌 것 / 공유할 것: 자동 테스트는 통과했으며 실제 MySQL과 Swagger에서 두 사용자 데이터 격리와 상태별 정렬을 최종 확인해야 함.

## 2026-08-06 — 내가 작성한 후기 목록 조회 백엔드 구현
- 한 것: JWT 사용자 기준 후기 목록을 `created_at DESC, review_id DESC`로 페이지 조회하고 기존 후기 응답 조립 로직을 재사용하도록 구현함. 사용자 격리·정렬·빈 목록·페이지네이션·조회수 유지 테스트를 포함해 Pytest 41개가 통과함.
- 다음 할 것: 마이페이지 후기 영역에 `GET /api/v1/users/me/reviews?page=1&size=10`을 연결함.
- 막힌 것 / 공유할 것: 이번 변경 파일의 Ruff 검사는 통과했으며 실제 MySQL과 Swagger에서 사용자별 결과와 최근 작성순을 최종 확인해야 함.

## 2026-08-06 — 역 즐겨찾기 조회·추가·삭제 백엔드 구현
- 한 것: DB V1.10의 `stations`, `station_favorites` 모델과 조회·추가·멱등 삭제 API를 구현함. 중복 추가는 Service 사전 검사와 DB UNIQUE 충돌 처리로 `409`를 반환하며 SQLite HTTP 통합 테스트를 포함한 Pytest 37개가 통과함.
- 다음 할 것: 지도와 마이페이지가 공유하는 프론트 즐겨찾기 API 모듈을 만들고 목록·버튼 상태를 연결함.
- 막힌 것 / 공유할 것: 자동 테스트는 통과했으며 실제 MySQL에서 Swagger로 추가·중복·삭제와 최근 추가순 조회를 최종 확인해야 함.

## 2026-08-05 — 회원 조회·목적별 재인증·회원 수정·탈퇴 백엔드 구현
- 한 것: JWT로 현재 회원을 조회하고, `PROFILE_UPDATE`·`PASSWORD_CHANGE`·`WITHDRAWAL` 목적별 5분 재인증 토큰을 발급해 이름/닉네임 수정, 비밀번호 변경, 회원 소유 데이터 연쇄 하드 딜리트를 구현함. Ruff와 Pytest 14개가 통과함.
- 다음 할 것: `docs/BACKEND-HANDOFF.md` 5장 계약에 따라 프론트 공통 API 클라이언트, 마이페이지 실제 회원 조회, 재인증 기반 수정·탈퇴 화면을 연결함.
- 막힌 것 / 공유할 것: 백엔드는 실제 MySQL Swagger 테스트가 남아 있고, 비밀번호 변경·탈퇴 성공 시 프론트가 로컬 Access/Refresh Token을 삭제해야 함.
## 2026-08-05 — DB 시드(V1.10) 반영, 환승·실제 시간표 동작
- 한 것: DB 담당이 올린 V1.10 시드를 `frontend/scripts/convertSeed.mjs` 로 변환해 **역 100개**(연천~인천/신창)와 **시간표 1,690건**을 프론트에 넣었다. `train_no` 로 같은 열차를 이어 **실제 도착 시각**을 계산하고, 시간표에 없는 역은 앞뒤에서 추정해 `약 17:44` 로 구분 표시한다. **환승이 드디어 실제로 동작**한다 — 인천역→온양온천역이 구로역 환승 1회로 정확히 잡힌다.
- 다음 할 것: 2~4호선은 아직 시드에 없다. 백엔드 API(`/api/v1/routes`, `/stations`, `/timetables`)가 생기면 각 `api/*.ts` 내부만 교체.
- 막힌 것 / 공유할 것: **시간표에 직산·탕정·신창 3개 역이 0건**이고, `1호선 (인천)` 쪽 시간표가 통째로 없다. `BACKEND-HANDOFF.md` 에 DB 담당 확인 요청으로 적어 뒀다. 그리고 `TopNav.tsx:67` 의 `aria-label` 문자열이 깨져 있다(`留덉씠?섏씠吏`).

## 2026-08-04 — 경로 지도 선택·출발 시각 (팀원 반응형 리팩토링 위로 리베이스)
- 한 것: 출발·도착역을 **지하철 지도에서 눌러 고르도록** 바꿨다(카카오·네이버 방식, 위경도 투영으로 역 자동 배치). 비교 기준을 정차역 수에서 **시간**으로 바꿔 `최소 시간 / 최소 환승`으로 정리했고, 출발 시각을 정하면 경유역마다 도착 예정 시각이 나온다. 팀원의 반응형 리팩토링 위로 리베이스하고 새 `FRONTEND-UI-CONVENTIONS.md` 규칙(`--route-map-height` 토큰)에 맞췄다.
- 다음 할 것: DB 담당의 시간표·노선 API가 오면 `route-plan/api/timetables.ts`·`routes.ts` 내부만 교체. 시간표 매칭 방식은 `BACKEND-HANDOFF.md`에 정리해 뒀다.
- 막힌 것 / 공유할 것: **`TopNav.tsx:67` 의 `aria-label` 문자열이 깨져 있다**(`留덉씠?섏씠吏`). 프로필 메뉴 커밋에서 들어간 것으로 보이니 담당자 확인 필요. 그리고 브라우저 패널이 표시되지 않는 환경이라 **창 크기를 실시간으로 바꿀 때의 동작은 검증하지 못했다**(초기 렌더는 여러 크기에서 확인함).

## 2026-08-04 — 경로 기능 (최단거리·최소환승 + 경유역 장소 추천)
- 한 것: 경로 화면을 프리뷰 목업에서 **실제 동작하는 기능**으로 확장함. 노선 그래프 기반 탐색(최단거리·최소환승), Wanderlog 스타일 커버 헤더, 경유역 세로 타임라인과 역별 주변 장소를 만들었다. 범위 확장은 코드보다 먼저 `SPEC.md` 2-2에 반영함.
- 다음 할 것: DB 담당이 제공할 노선·역 API가 오면 `frontend/src/features/route-plan/api/routes.ts` **내부만** fetch로 교체. 그때부터 환승이 실제로 발생하므로 최소환승 카드가 의미를 갖는다.
- 막힌 것 / 공유할 것: **경로 탐색 API가 백엔드 계약에 없어 신설을 요청**했다 (`BACKEND-HANDOFF.md` 3장). 소요시간은 `train_timetables`가 채워지기 전까지 `역당 2분 + 환승 5분` 근사치다. 공개 데이터셋(jhj0517 gist)은 천안·아산 구간이 통째로 빠져 있어 쓰지 않기로 했다.

## 2026-08-04 — 인증 연동·shadcn 공용 UI·프론트 리디자인
- 한 것: 이메일 인증 회원가입, 로그인, 비밀번호 재설정을 백엔드 API에 연결하고 `shared/ui`에 shadcn 기반 Button·Input·Card·Dialog·Badge·SectionHeader를 구성함. 기존 색상과 지도 중심 레이아웃을 유지하면서 내비게이션, 역 pill, 장소 카드, 노선도, 시간표, 프리뷰 화면을 미니멀한 Wanderlog 스타일로 리디자인함.
- 다음 할 것: `/api/v1/users/me` 구현 후 마이페이지의 예시 정보를 실제 회원 정보로 교체하고, 실제 브라우저에서 데스크톱·모바일 지도 상호작용을 확인.
- 막힌 것 / 공유할 것: `frontend/.env`와 카카오맵 키가 있는 환경에서 실제 지도·마커·모달 중첩 동작 확인이 필요함.

형식:

```

## 2026-08-04 — 프론트엔드 기능별 아키텍처 리팩토링
- 한 것: `app/pages/features/shared` 구조로 재배치하고, 카카오맵·역 검색·노선도·시간표의 상태와 데이터 접근을 Feature별 Hook/API로 분리함.
- 다음 할 것: 카테고리 기반 장소 검색을 `features/station-map/api/places.ts`에 연결하고 실제 브라우저에서 주요 동작을 재확인.
- 막힌 것 / 공유할 것: `frontend/.env`가 없어 카카오맵 SDK의 실제 브라우저 동작은 별도 환경에서 확인 필요.
## YYYY-MM-DD — 이름
- 한 것:
- 다음 할 것:
- 막힌 것 / 공유할 것:
```

> 지금 잡고 있는 파일이 있으면 "다음 할 것"에 파일 경로를 적어주세요. 충돌을 미리 피할 수 있습니다.

---

## 2026-07-29 — 노선도를 끌어보는 뷰어로 교체 (브랜치: `feat/fe-metromap-viewer`)
- 한 것:
  - **`노선 강조 보기`(직접 그린 SVG) 제거.** `MetroMap.tsx`, `metroLines.ts` 삭제.
    노선 화면은 실제 노선도 이미지 하나만 쓴다 (필요하면 git 이력에서 복구 가능)
  - **스크롤바 대신 지도처럼 끌어서 움직이도록 교체.**
    잡아 끌어 이동 + 휠/버튼으로 확대·축소, `기본 크기` 버튼으로 복귀
  - 노선 화면만 **가로 폭 제한을 풀어** 화면을 꽉 채운다 (`PreviewFrame`에 `wide` 옵션 추가)
  - 처음 배율은 **가로를 꽉 채우는 크기**. 세로까지 다 넣으면 양옆이 비고 글씨가 작아진다
- 다음 할 것: 장소 마커를 카테고리 검색으로 확장 (SPEC 6단계 나머지)
- 막힌 것 / 공유할 것:
  - 폰 화면 폭(약 310px)에 맞추면 역 이름을 전혀 못 읽어서,
    **최소 900px 폭은 유지**하고 넘치는 부분은 끌어서 보게 했다
  - 휠 확대는 `preventDefault` 가 필요해서 React 의 `onWheel` 이 아니라
    `addEventListener(..., { passive: false })` 로 직접 붙였다
  - 확대 한계는 원본 크기(100%). 그 이상 키우면 뭉개진다

---

## 2026-07-29 — 로고 · 실제 노선도 이미지 적용 (브랜치: `feat/fe-logo-metromap-image`)
- 한 것:
  - **로고 적용** — `frontend/public/logo.png`. 받은 원본은 흰 여백이 크고 780KB 였어서,
    여백을 잘라내고 배경을 투명하게 만든 뒤 200px 높이로 줄였다 (→ 76KB)
  - **수도권 전체 노선도를 실제 이미지로 교체** — `frontend/public/metro-map.png`.
    `seoulSubway.png` 를 팔레트 PNG 로 압축 (2.8MB → 631KB, 2800px 폭).
    글자 선명도는 확인함
  - 직접 그린 SVG 노선도는 **`노선 강조 보기` 버튼으로 남겨 뒀다.**
    이미지는 역이 다 있지만 마우스 반응이 없고, SVG 는 노선 강조가 되므로 둘 다 쓸모가 있다
  - 이미지가 없으면 자동으로 SVG 로 넘어가도록 폴백을 넣었다 (파일 빠져도 안 깨짐)
  - 노선도가 화면 폭에 맞추면 글씨가 작아서 **`크게 보기` 버튼** 추가
- 다음 할 것: 장소 마커를 카테고리 검색으로 확장 (SPEC 6단계 나머지)
- 막힌 것 / 공유할 것:
  - **`frontend/public/` 이미지는 반드시 `asset()` 을 거쳐 쓸 것.** 슬래시로 시작하는 주소를 쓰면
    로컬에서는 되는데 배포본에서만 404 가 난다 (HANDOFF ⑤ 참고)
  - 프로젝트 루트에 원본 이미지 3개(`ChatGPT_Image_...png`, `seoulSubway.png`,
    `nuua_metro_seoul_korean.png`)가 남아 있다. 가공본이 `frontend/public/`에 들어갔으니 지워도 된다.
    용량이 커서 커밋에는 넣지 않았다
  - 로고 워드마크는 `metrop` 인데 앱 이름·저장소명은 `MetroTrip` 그대로 두기로 함

---

## 2026-07-26 — 상단 내비 전환 · 마이페이지 · 수도권 노선도 (브랜치: `feat/fe-topnav-metromap`)
- 한 것:
  - **좌측 사이드바 → 상단 가로 내비게이션**. 지도를 훨씬 넓게 쓰게 됨
  - **마이페이지 프리뷰** 추가 (프로필·즐겨찾기·후기·계정 관리, 전부 예시)
  - **수도권 간략 노선도를 SVG로 직접 제작** (`frontend/src/data/metroLines.ts`).
    공식 이미지를 쓰지 않았고, 노선에 마우스를 올리면 그 노선만 강조되고
    나머지는 흐려진다. 역 이름은 강조된 노선에만 뜬다 (안 그러면 도심에서 글자가 겹침)
  - **탕정역 장소 마커 2곳** (써브웨이 아산탕정점 / 매화공원) → 클릭 시 인포윈도우.
    좌표·주소는 카카오 로컬 검색으로 실제 값 확인해서 넣음
- 다음 할 것: 장소 마커를 카테고리 검색으로 확장 (SPEC 6단계 나머지).
  건드릴 파일: `frontend/src/api/places.ts`, `frontend/src/components/MapView/MapView.tsx`
- 막힌 것 / 공유할 것:
  - **지도에 원래 보이는 상점 아이콘은 카카오가 그린 것이라 클릭 이벤트를 붙일 수 없다.**
    클릭이 되는 건 우리가 직접 찍은 마커뿐. 그래서 두 곳을 직접 마커로 찍었다
  - 노선도 좌표는 **실제 지리 좌표가 아니라 도식**이다. 주요 역·환승역만 있고
    전체 역은 다음 단계. 환승역 이름은 노선 하나에만 적어 라벨 겹침을 피했다
  - 공유해 준 노선도 이미지는 `nuua METRO` 제작물이라 그대로 넣지 않았다.
    스타일만 참고해서 직접 그림

---

## 2026-07-26 — 발표용 프리뷰 화면 + 지도 화면 정리 (브랜치: `fix/fe-map-panel-polish`)
- 한 것:
  - 좌측 플로팅 패널 폭 축소 (384px → 288px) — 지도를 덜 가리게
  - 사이드바 메뉴를 실제로 눌러 화면 전환되게 연결 (모바일은 상단바 아이콘)
  - **발표용 프리뷰 화면 3종 추가** — 노선도 / 경로 / 시간표.
    "다음 단계엔 이렇게 만듭니다"를 보여주는 용도라 실제 동작은 하지 않음.
    노선도만 예외적으로 역 클릭 → 지도 이동이 동작함
  - `docs/SPEC.md`에 **2-1 발표용 프리뷰 화면** 절 추가 (범위 확장을 문서에 먼저 반영)
  - 버그 2건 수정 — 아래 참고
- 다음 할 것: SPEC 6단계 (반경 1km 장소 검색 → 마커 표시).
  건드릴 파일: `frontend/src/api/places.ts`(신규), `frontend/src/components/MapView/MapView.tsx`
- 막힌 것 / 공유할 것:
  - **`max-w-md` 같은 클래스를 쓰면 안 됨** — `frontend/src/index.css`에서 `--spacing-md`를 정의해 둔 탓에
    `max-w-md`가 28rem이 아니라 **16px**로 계산된다. `max-w-[28rem]`처럼 값을 직접 적을 것.
    (`MapView`의 카카오 에러 문구가 이 버그로 한 글자씩 줄바꿈되고 있었음 — 같이 고침)
  - 지도 확대/축소 시 "탕정역"이 깜빡이는 현상은 **우리 코드 문제가 아님**.
    카카오맵이 역 이름까지 그려진 타일 이미지를 레벨마다 통째로 갈아끼우는 방식이라
    교체 순간에 이전 타일이 잠깐 비친다. 코드로는 없애기 어려움
  - 수도권 전체 노선도는 **공식 이미지 자리만 비워 둠**. 출처·공공누리 유형 확인 후 넣어야 함

---

## 2026-07-23 — 프론트 4~5단계 (브랜치: `feat/fe-station-list`)
- 한 것: SPEC 4~5단계 — `StationList` 컴포넌트(검색+목록), 역 클릭 시 `MapView` 중심 이동 연결
- 다음 할 것: SPEC 6단계 (반경 1km 장소 검색 → 마커 표시).
  건드릴 파일: `frontend/src/api/places.ts`(신규), `frontend/src/components/MapView/MapView.tsx`
- 막힌 것 / 공유할 것: 없음

> 집 PC에는 `frontend/.env`가 없어 지도 연동을 확인하지 못했으나,
> 이후 데스크톱에서 검증 완료 — 역 클릭 시 지도 중심이 해당 역 좌표로 이동,
> 검색/빈 결과/검색어 삭제 동작 정상, 콘솔 에러 없음, 빌드 통과.

---

## 2026-07-23 — GitHub Pages 배포 완료
- 한 것:
  - Vercel은 로그인(복구 코드 요구)이 막혀 **GitHub Pages로 전환**
  - `.github/workflows/deploy.yml` + `frontend/vite.config.ts` base 설정
  - 배포 성공 확인 → **https://lellon0403.github.io/MetroTrip/**
  - `feat/fe-project-setup` 브랜치 main 병합 (PR #3)
- 다음 할 것: SPEC 4~5단계 (역 목록 UI + 클릭 시 지도 이동) — 위 항목에서 완료됨
- 막힌 것 / 공유할 것:
  - `main`에 `test.txt`(내용 `test`)가 남아 있음 — PR 흐름 테스트 흔적으로 보임. 삭제 여부 확인 필요
  - 커스텀 도메인은 발표 후로 미룸 (DNS 전파 24~48시간 리스크)

> 배포 중 겪은 문제와 해결은 `docs/HANDOFF.md` 5장에 정리했습니다.

---

## 2026-07-22 — 프론트 1~3단계 (브랜치: `feat/fe-project-setup`)
- 한 것:
  - SPEC 1단계 — Vite + React 19 + TypeScript 세팅
  - SPEC 2단계 — 카카오맵 SDK 연동, 탕정역 기준 지도 표시 (브라우저 확인 완료)
  - SPEC 3단계 — 1호선 천안·아산 구간 11개 역 데이터 + `frontend/src/api/stations.ts`
- 다음 할 것: SPEC 4~5단계 (역 목록 UI + 클릭 시 지도 이동).
  건드릴 파일: `frontend/src/components/StationList/*`, `frontend/src/App.tsx`
- 막힌 것 / 공유할 것: 아래 카카오 설정 참고

### 카카오 설정 (팀원 각자 필요)
1. `frontend/.env.example`을 복사해 `frontend/.env` 생성 → `VITE_KAKAO_MAP_KEY`에 **JavaScript 키** 입력
   (REST API 키 아님)
2. 키는 팀에서 공유받아 쓸 것. **각자 새 앱을 만들지 말 것** —
   카카오맵 무료 쿼터는 계정당 **첫 번째로 활성화한 앱에만** 제공되며,
   두 번째 앱부터는 비즈월렛(결제수단) 연결이 필요함 (2026-07-21 정책 변경)
3. 앱 관리자는 `제품 설정 > 카카오맵` 활성화 ON 필요.
   이게 꺼져 있으면 SDK가 403 (`disabled OPEN_MAP_AND_LOCAL service`)
4. `유료 API > 일반`의 카카오맵은 **`사용 안 함` 유지** —
   쿼터 초과 시 과금 대신 호출이 막히므로 학생 프로젝트에 안전
5. 배포 시 `JavaScript SDK 도메인`에 배포 URL 추가 등록 필요 (현재 `http://localhost:5173`만 등록됨)

### 무료 쿼터 (참고)
지도 SDK 30만건/일, 키워드·카테고리 장소 검색 각 10만건/일 — 데모에는 충분

---

## 2026-07-22 — (문서 세팅)
- 한 것: 저장소 초기 세팅, `.gitignore` 추가, `docs/` 문서 6종 작성 (SPEC / REQUIREMENTS / CONVENTIONS / PRESENTATION / BACKEND-HANDOFF / WORKLOG)
- 다음 할 것: Vite + React + TS 프로젝트 세팅 (SPEC 구현 순서 1단계)
- 막힌 것 / 공유할 것: 카카오 JavaScript 키 발급 후 팀 공유 필요

확정 사항:
- 노선 범위: 1호선 천안·아산 구간 우선 (탕정, 아산, 배방, 온양온천, 천안). 전체 노선은 최종 목표
- 발표 10분 = 아이디어 3분 + 프론트 시연 2분 + 백엔드 5분
- 프론트 담당 분할은 보류 (Claude Code로 개발하므로 현재 불필요)
