# 프론트엔드 UI 토큰 규칙

## 기본 원칙

- 공용 디자인 값은 `frontend/src/styles/tokens.css`의 CSS 변수로 관리한다.
- 색상, spacing, radius, 기본 컨트롤 크기처럼 여러 화면에서 반복되는 값은 컴포넌트에 직접 작성하지 않는다.
- 전역 레이아웃과 화면별 클래스는 `frontend/app/styles.css`에서 관리한다.
- 현재 프론트엔드는 Tailwind가 아니라 일반 CSS와 의미 기반 클래스 이름을 사용한다.

## 토큰 사용 방법

컴포넌트에서는 공용 토큰을 참조한다.

```css
.exampleCard {
  color: var(--mt-color-ink);
  border-radius: var(--mt-radius-card);
  box-shadow: var(--mt-shadow-card);
}
```

공용 색상·폭·카드 모양을 조정할 때는 개별 컴포넌트보다 `tokens.css`의 토큰을 먼저 확인한다.

## 토큰 그룹

- `--mt-color-*`: 본문, 배경, 경계선, 브랜드, 상태 색상
- `--mt-layout-content-max`: 일반 페이지 콘텐츠 최대 폭
- `--mt-layout-reading-max`: 읽기 중심 화면 최대 폭
- `--mt-layout-rail`: 보조 레일 폭
- `--mt-radius-card`, `--mt-shadow-card`: 공용 카드 모양과 그림자

하나의 크기 토큰을 모든 UI에 강제로 공유하지 않는다. 의미와 사용 맥락이 다른 영역은 별도 토큰 그룹으로 유지한다.

새 토큰을 추가할 때는 기존 토큰 재사용 가능성을 먼저 확인하고, 여러 화면에서 반복되거나 공통 조정이 필요한 값만 추가한다.

## 콘텐츠 폭

- 일반 페이지는 `styles.css`의 `.contentShell`과 `--mt-layout-content-max`를 사용한다.
- 읽기 중심 화면은 `--mt-layout-reading-max`를 기준으로 별도 최대 폭을 적용한다.
- 화면 하나에만 필요한 세부 레이아웃 값은 해당 의미 기반 클래스에 두되, 여러 화면에서 반복되면 토큰으로 올린다.

## 사이드바 프로필 메뉴

- 마이페이지 내부 메뉴는 `styles.css`의 `.mySidebar`와 하위 클래스를 사용한다.
- 좁은 화면에서는 같은 메뉴가 가로 스크롤 방식으로 전환된다.
- 전역 헤더의 계정 메뉴와 마이페이지 내부 사이드바 역할을 분리한다.
