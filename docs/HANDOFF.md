# 다른 PC에서 이어서 작업하기

> 데스크톱에서 작업하던 내용을 **노트북 등 다른 PC에서 그대로 이어받기 위한 문서**입니다.
> 이 문서만 읽으면 지금까지의 맥락 없이도 이어서 작업할 수 있습니다.
>
> 마지막 갱신: 2026-08-05 / 기준 브랜치: `develop`

---

## 1. 지금 상태 요약

프론트엔드 MVP의 **1~5단계와 마커·인포윈도우까지 완료**되어 있습니다. Feature-based architecture와 shadcn 기반 공용 UI 구조를 사용하며, 이메일 인증 회원가입·로그인·비밀번호 재설정 화면이 백엔드 인증 API와 연결되어 있습니다. 백엔드에는 회원 조회, 목적별 비밀번호 재인증, 이름·닉네임 수정, 비밀번호 변경과 회원 탈퇴까지 구현되어 있으며 프론트 회원 관리 화면 연결이 남아 있습니다.

| SPEC 단계 | 내용 | 상태 |
|---|---|---|
| 1 | Vite + React + TypeScript 세팅 | ✅ 완료 |
| 2 | 카카오맵 SDK 로드 + 지도 표시 | ✅ 완료 (탕정역 기준) |
| 3 | 역 데이터 + 역 목록 UI | ✅ 완료 |
| 4 | 역 목록 UI | ✅ 완료 |
| 5 | 역 클릭 → 지도 중심 이동 | ✅ 완료 |
| 6 | 반경 1km 장소 검색 → 마커 | 🔸 일부 (탕정역 2곳만 수동) — **다음 작업** |
| 7 | 마커 클릭 → 인포윈도우 | ✅ 완료 |
| 8 | 반응형 정리 + README | 🔸 반응형은 확인, README 남음 |
| — | 발표용 프리뷰 화면 4종 (SPEC 2-1) | ✅ 완료 (노선도/경로/시간표/마이페이지, 동작 없음) |
| — | 이메일 인증 회원가입·로그인·비밀번호 재설정 | ✅ 프론트·백엔드 연동 완료 |
| — | 회원 조회·수정·탈퇴 | ✅ 백엔드 완료 / 🔸 프론트 연동 필요 |

### 현재 프론트엔드 구조

```
frontend/src/
├─ app/                        앱 진입점·라우팅·전역 내비게이션
├─ pages/                      MapPage·LineMapPage·RoutePage·MyPage·AuthPage
├─ features/
│  ├─ auth/                    인증 API·폼 상태·로그인/회원가입/재설정 UI
│  ├─ station-map/             카카오맵·장소·역 선택 Feature
│  │  ├─ api/                  장소 데이터 접근
│  │  ├─ hooks/                SDK, 마커, 장소 조회, 역 검색 상태
│  │  └─ ui/                   지도·컨트롤·역 목록·장소 목록
│  ├─ line-map/                노선도 Feature
│  │  ├─ data/                 노선도 좌표
│  │  ├─ hooks/                역 조회·drag/zoom 상태
│  │  └─ ui/                   노선도 SVG UI
│  ├─ timetable/               시간표 Feature·다이얼로그 Hook/UI
│  ├─ route-plan/              경로 프리뷰 Feature
│  └─ my-page/                 마이페이지 프리뷰 Feature
└─ shared/
   ├─ lib/                     cn, asset, 역 데이터 접근 유틸리티
   ├─ types/                   여러 기능이 공유하는 타입
   └─ ui/                      shadcn 기반 Button·Input·Card·Dialog·Badge 등
```

### 인증과 공용 UI

- 인증 경로: `/login`, `/signup`, `/password-reset`
- API 연결: `frontend/src/features/auth/api/auth.ts`
- 로그인 토큰: `localStorage`의 `metrotrip-access-token`, `metrotrip-refresh-token`
- 로그인만 Radix Dialog 기반 중앙 모달로 표시하고, 회원가입·비밀번호 찾기는 독립 페이지로 표시합니다.
- 회원가입은 약관 동의 → 닉네임 → 이메일 인증 → 비밀번호 → 비밀번호 확인의 단계형 플로우입니다.
- 반응형 레이아웃은 데스크톱(1024px 이상)에서 왼쪽 고정 사이드바를 사용하고, 태블릿·모바일에서는 하단 고정 메뉴와 하단 콘텐츠 패널을 사용합니다. 주요 반응형 값은 `frontend/src/index.css`의 공용 토큰으로 관리하며, 1024~1439px compact desktop, 데스크톱 높이 820px 이하 compact height, 1920px 이상 지도 확장 규칙을 적용합니다. 역 순서 목록은 모바일에서 `w-max`/`flex-nowrap` 가로 스크롤을 사용합니다.
- 공용 UI는 `frontend/src/shared/ui/`에 두며 `Button`, `Input`, `Card`, `Dialog`, `Badge`, `SectionHeader`를 우선 재사용합니다.
- className 결합은 `frontend/src/shared/lib/cn.ts`의 `cn()`을 사용합니다.
- 디자인은 기존 색상 토큰을 유지하면서 지도 중심 Wanderlog 스타일의 카드·pill·여백 체계를 적용합니다.

### 아직 없는 것

- 카테고리 기반 장소 검색 (지금은 탕정역 2곳만 정적 데이터로 제공)
- 노선도/경로/시간표/마이페이지의 **실제 동작** (지금은 화면만 — SPEC 2-1 참고)
- `/api/v1/users/me` 회원 조회와 목적별 재인증·수정·탈퇴 API를 마이페이지에 연결
- 상세 계약과 헤더 처리 규칙은 `docs/BACKEND-HANDOFF.md` 5장 참고

---

## 2. 노트북에서 최초 1회 세팅

### ① 저장소 받기

이미 클론되어 있으면 `git pull` 만 하면 됩니다. 처음이면:

```bash
git clone https://github.com/lellon0403/MetroTrip.git
```

```bash
cd MetroTrip
```

### ② 최신 코드 받기

앱 코드는 `develop`에 있습니다. 새 작업은 `develop`에서 브랜치를 따서 시작하세요.

```bash
git fetch origin
```

```bash
git checkout develop
```

```bash
git pull
```

### ③ 패키지 설치

```bash
cd frontend
```

```bash
npm install
```

### ④ `frontend/.env` 만들기 ← 이걸 빼먹으면 지도가 안 뜹니다

`frontend/.env`는 GitHub에 올라가지 않습니다. **노트북에서 직접 만들어야 합니다.**

```bash
cp .env.example .env
```

그다음 `frontend/.env` 파일을 열어 값을 채웁니다.

```
VITE_KAKAO_MAP_KEY=여기에_JavaScript_키
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

키는 [카카오 개발자 콘솔](https://developers.kakao.com/) → 내 애플리케이션 → **위치확인앱**(ID 1402576) → 앱 키 → **JavaScript 키**에서 다시 복사할 수 있습니다.
**REST API 키가 아닙니다.** 가운데 있는 JavaScript 키입니다.

회원가입·로그인·이메일 인증을 사용할 때는 `VITE_API_BASE_URL`을 백엔드 주소로 설정합니다.
같은 PC에서 실행하면 `http://localhost:8000/api/v1`을 사용하고,
같은 네트워크의 다른 PC에서 접속하면 백엔드 PC의 LAN IP를 사용합니다.

백엔드 환경변수는 `backend/.env.example`을 복사해 `backend/.env`를 만들고,
`METROTRIP_CORS_ORIGINS`에 프론트 주소(`http://192.168.0.108:5173` 등)를 추가합니다.

### ⑤ 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:5173` 접속. 탕정역 일대 지도가 보이면 정상입니다.

---

## 3. Claude Code로 이어서 작업하기

노트북에서 Claude Code를 열고 **아래를 그대로 복사해서** 첫 메시지로 보내세요.

```
docs/HANDOFF.md 를 읽고 현재 상태를 파악해줘.
그 다음 git fetch 해서 브랜치가 최신인지 확인하고,
SPEC 6단계(반경 1km 장소 검색 → 마커 표시)부터 이어서 작업하자.
```

저장소 루트의 `CLAUDE.md`를 Claude Code가 자동으로 읽기 때문에,
Git 규칙·검증 규칙·한국어 응답 같은 팀 규칙은 **노트북에서도 동일하게 적용**됩니다.
따로 설명할 필요가 없습니다.

> 세션이 바뀌면 이전 대화는 사라집니다. 파일과 커밋만 남습니다.
> 그래서 이 문서와 `docs/WORKLOG.md`가 유일한 인수인계 수단입니다.
> **작업이 끝나면 두 문서를 갱신**하세요.

---

## 4. 반드시 알아야 할 함정

여기서 실제로 시간을 많이 썼습니다. 같은 함정을 다시 밟지 마세요.

### ① 카카오는 접속 주소가 정확히 일치해야 한다

카카오 콘솔에 등록된 주소와 **완전히 같아야만** 지도가 뜹니다. 실제 테스트 결과:

| 접속 주소 | 결과 |
|---|---|
| `http://localhost:5173` | ✅ 200 |
| `http://127.0.0.1:5173` | ❌ 401 |
| `http://localhost:5174` | ❌ 401 |
| `http://192.168.x.x:5173` (LAN) | ❌ 401 |

- **반드시 `localhost`로 접속**하세요. `127.0.0.1`은 안 됩니다
- 포트는 `frontend/vite.config.ts`에서 5173으로 고정해 뒀습니다 (`strictPort`).
  5173이 사용 중이면 서버가 **에러를 내고 멈춥니다.** 이건 의도한 동작입니다 —
  조용히 다른 포트로 옮겨가면 원인을 못 찾기 때문입니다.
  이때는 5173을 쓰는 다른 프로그램을 끄세요

### ② 카카오맵 서비스가 켜져 있어야 한다

`제품 설정 > 카카오맵` → 활성화 ON. 꺼져 있으면 SDK가 403을 반환합니다.

```
{"errorType":"NotAuthorizedError",
 "message":"App(위치확인앱) disabled OPEN_MAP_AND_LOCAL service."}
```

### ③ `유료 API > 일반`의 카카오맵은 `사용 안 함`으로 둘 것

이건 **쿼터 초과 시 과금하며 계속 쓸지**를 정하는 설정입니다.
`사용 안 함`으로 두면 초과 시 요금이 청구되는 대신 호출이 막힙니다. 학생 프로젝트에는 이게 안전합니다.

### ④ 팀원이 각자 카카오 앱을 만들면 안 된다

2026-07-21 정책 변경으로, 무료 쿼터는 **계정당 첫 번째로 활성화한 앱에만** 제공됩니다.
두 번째 앱부터는 비즈월렛(결제수단) 연결이 필요합니다.
**지금 쓰는 키 하나를 팀에서 공유**하세요.

무료 쿼터: 지도 SDK 30만건/일, 장소 검색 10만건/일 — 데모에는 충분합니다.

### ⑤ `frontend/public/` 이미지는 `asset()` 을 거쳐서 쓴다

GitHub Pages 는 `https://lellon0403.github.io/MetroTrip/` 하위로 서비스됩니다.
그래서 `<img src="/logo.png">` 처럼 슬래시로 시작하는 주소를 쓰면
**로컬에서는 되는데 배포본에서만 404** 가 납니다. 찾기 어려운 실수입니다.

```tsx
import { asset } from '../../shared/lib/asset';
<img src={asset('logo.png')} />
```

### ⑥ `max-w-md` 같은 클래스는 쓰면 안 된다

`frontend/src/index.css`의 `@theme`에서 `--spacing-md: 16px`를 정의해 뒀기 때문에,
같은 이름을 쓰는 `max-w-md` / `w-lg` 등이 **28rem이 아니라 16px로 계산**됩니다.
글자가 한 줄에 하나씩 떨어지면 이 문제입니다. `max-w-[28rem]`처럼 값을 직접 적으세요.
(`max-w-4xl`처럼 이름이 겹치지 않는 것은 정상 동작합니다)

### ⑦ 지도 컨테이너 높이가 0이면 지도가 안 보인다

에러도 안 나고 그냥 안 보여서 헷갈립니다. `.map-view`는 부모 높이를 채우도록 되어 있고,
부모(`.app-main`)에 `min-height: 0`이 필요합니다. 레이아웃을 고칠 때 이 부분을 깨뜨리지 마세요.

### ⑧ 지도 영역의 크기가 바뀌면 `relayout()`이 필요하다

카카오맵은 생성 시점의 컨테이너 크기로 내부 픽셀 좌표를 계산합니다.
반응형 전환이나 패널 변경 뒤 확대·축소 화면이 작아 보이면 `useKakaoMap`의 `ResizeObserver`가
`map.relayout()`을 호출하는지 확인하세요. 이 처리를 빼면 지도 타일이 부자연스럽게 갱신될 수 있습니다.

---

## 5. 배포 — GitHub Pages ✅ 완료

**배포 주소: https://lellon0403.github.io/MetroTrip/**

`main`에 푸시되면 자동으로 다시 배포됩니다. 아래는 설정 내역과 문제 해결용 기록입니다.



**Vercel은 로그인이 안 되어 포기했습니다.** (데스크톱·노트북 양쪽에서 복구 코드를 요구함)
대신 GitHub Pages를 쓰며, 이미 쓰는 GitHub 계정 안에서 끝나므로 새로 로그인할 것이 없습니다.

배포 주소: `https://lellon0403.github.io/MetroTrip/`

### 이미 되어 있는 것 (코드)

- `.github/workflows/deploy.yml` — `main`에 푸시되면 자동 빌드·배포
- `frontend/vite.config.ts` — 빌드 시에만 `base: '/MetroTrip/'` 적용
  (개발 서버는 `/` 그대로라 `localhost:5173` 접속 방식은 바뀌지 않음)

### 저장소 설정 (완료됨 — 재설정 시 참고)

1. ✅ **Settings → Pages → Source** = `GitHub Actions`
2. ✅ **Settings → Secrets and variables → Actions**
   - Name: `VITE_KAKAO_MAP_KEY`
   - Secret: 카카오 **JavaScript 키** (`87a8`로 시작하는 것)
3. ✅ **카카오 콘솔 → JavaScript SDK 도메인** — 아래 **두 개 모두** 등록
   ```
   https://lellon0403.github.io
   http://localhost:5173
   ```

### 배포하면서 실제로 겪은 문제 (같은 실수 방지)

| 증상 | 원인 | 해결 |
|---|---|---|
| `configure-pages` 단계에서 `Get Pages site failed / Not Found` | Pages Source를 `GitHub Actions`로 바꾸기 **전에** 워크플로가 실행됨 | 설정 후 워크플로 재실행 |
| 배포는 됐는데 지도 자리에 빨간 에러 문구 | GitHub Secret에 **REST API 키**(`1e21…`)를 넣음 | **JavaScript 키**(`87a8…`)로 교체 후 **재실행** |
| 로컬에서 지도가 갑자기 안 뜸 | 카카오 도메인에 github.io를 **추가**가 아니라 **교체**로 넣어 localhost가 사라짐 | 두 도메인을 함께 등록 |

> **Secret은 빌드 시점에 읽힙니다.** 값을 바꾼 뒤에는 반드시 워크플로를 **재실행**해야 반영됩니다.
> Actions 탭 → `Deploy to GitHub Pages` → `Run workflow`

### 배포 확인

`main`에 푸시되면 자동으로 돌아갑니다. 진행 상황은 저장소 **Actions** 탭에서 볼 수 있습니다.
초록 체크가 뜨면 배포 주소로 접속해 지도가 보이는지 확인하세요.

수동 배포: Actions 탭 → `Deploy to GitHub Pages` → **Run workflow**

배포본 검증 결과 (2026-07-23):
카카오 SDK 로드 성공, 지도 타일 25개 렌더, 콘솔 에러 없음,
중심 좌표가 탕정역과 일치.

---

## 6. 팀원이 로컬에서 실행해보고 싶다고 할 때

배포 전이라면 위 **2번 세팅 절차**를 그대로 전달하면 됩니다.
`frontend/.env`의 키는 GitHub에 없으므로 **Discord DM 등으로 따로** 전달해야 합니다.
(채팅방이나 스크린샷으로 키를 공유하지 마세요)

카카오에 `http://localhost:5173`이 등록되어 있고, 팀원 PC에서도 주소가 같으므로
**추가 등록 없이 그대로 작동**합니다.
