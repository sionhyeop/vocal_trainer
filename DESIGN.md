# DESIGN.md — Duolingo 디자인 토큰

> 참조: https://duolingo.com
> 톤: 친근함 · 장난기 · 게이미피케이션. 둥글둥글한 모서리, 굵고 또렷한 타이포그래피,
> 생기 있는 원색 팔레트, 그리고 Duolingo 특유의 "눌리는" 3D 버튼.
> Duolingo는 색상을 동물 이름으로 부릅니다 (Feather Green, Macaw, Cardinal...).

---

## 1. Color Palette (`--color-*`)

채도 높은 원색을 과감하게 사용합니다. 시그니처는 부엉이 그린.
각 색은 버튼의 3D 효과를 위해 더 진한 "그림자색"을 짝으로 가집니다.

```css
:root {
  /* 브랜드 — Feather Green */
  --color-primary: #58cc02;        /* 시그니처 그린 (메인 버튼/강조) */
  --color-primary-shadow: #58a700; /* 그린 버튼 하단 3D 그림자 */
  --color-primary-hover: #61e002;  /* 호버 상태 */

  /* 보조 컬러 (동물 네이밍) */
  --color-macaw: #1cb0f6;          /* 블루 (정보/링크) */
  --color-macaw-shadow: #1899d6;
  --color-cardinal: #ff4b4b;       /* 레드 (오답/경고) */
  --color-bee: #ffc800;            /* 옐로우 (스트릭/보상) */
  --color-fox: #ff9600;            /* 오렌지 */
  --color-beetle: #ce82ff;         /* 퍼플 */

  /* 배경 */
  --color-bg: #ffffff;             /* 기본 배경 (순백) */
  --color-bg-subtle: #f7f7f7;      /* 보조 배경 (Snow, 섹션 구분) */

  /* 텍스트 */
  --color-text: #4b4b4b;           /* 주 텍스트 (Eel, 다크 그레이) */
  --color-text-secondary: #777777; /* 보조 텍스트 (Wolf) */
  --color-text-inverse: #ffffff;   /* 컬러 버튼 위 텍스트 */

  /* 테두리 */
  --color-border: #e5e5e5;         /* 기본 구분선 (Swan) */
}
```

---

## 2. Typography (`--font-*`)

굵고 둥근 산세리프(Feather Bold 계열). 헤딩은 매우 굵게, 본문도 묵직하게.
가독성과 친근함을 동시에.

```css
:root {
  /* 폰트 패밀리 */
  --font-family: "Feather Bold", "din-round", -apple-system,
                 "Helvetica Neue", Arial, sans-serif;

  /* 크기 */
  --font-size-hero: 48px;     /* 대형 hero 헤드라인 */
  --font-size-heading: 32px;  /* 섹션 제목 */
  --font-size-subhead: 22px;  /* 소제목 */
  --font-size-body: 17px;     /* 본문 */
  --font-size-caption: 13px;  /* 캡션 / 각주 */

  /* 굵기 — 전반적으로 굵게 */
  --font-weight-medium: 500;
  --font-weight-bold: 700;
  --font-weight-heavy: 800;   /* hero 헤드라인용 */

  /* 라인 높이 */
  --line-height-tight: 1.2;   /* 헤딩용 */
  --line-height-normal: 1.5;  /* 본문용 */
}
```

---

## 3. Spacing (`--space-*`)

8px 그리드 기반. 컴포넌트는 넉넉한 패딩으로 터치하기 좋게.

```css
:root {
  --space-xs: 8px;
  --space-sm: 16px;
  --space-md: 24px;
  --space-lg: 40px;
  --space-xl: 64px;

  /* 레이아웃 */
  --space-section: 72px;      /* 섹션 간 수직 간격 */
  --space-gutter: 24px;       /* 좌우 여백(거터) */
}
```

---

## 4. Effects (`--shadow-*`, `--blur-*`, `--radius-*`)

Duolingo의 핵심은 **둥근 모서리 + 두꺼운 하단 그림자(3D 버튼)**.
일반 그림자는 부드럽게, 버튼은 또렷한 솔리드 그림자로.

```css
:root {
  /* 그림자 */
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.12);

  /* 3D 버튼 — 하단 솔리드 그림자 (Duolingo 시그니처) */
  --shadow-button: 0 4px 0 var(--color-primary-shadow);

  /* 블러 (글래스/오버레이) */
  --blur-overlay: 8px;

  /* 둥근 모서리 — 전반적으로 크게 */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;          /* 카드/버튼 기본 */
  --radius-pill: 9999px;      /* 알약형 / 원형 요소 */

  /* 테두리 두께 — 두껍게 (만화 같은 느낌) */
  --border-width: 2px;
}
```

---

## 5. Animation (`--duration-*`, `--easing-*`)

빠르고 통통 튀는 느낌. 보상/정답 시 탄성 있는 바운스.

```css
:root {
  /* 지속시간 */
  --duration-fast: 100ms;
  --duration-normal: 200ms;
  --duration-slow: 400ms;

  /* Easing */
  --easing-default: cubic-bezier(0.4, 0, 0.2, 1);   /* 부드러운 ease-in-out */
  --easing-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);/* 탄성 바운스 (보상 연출) */
}
```

---

## 토큰 활용 규칙

1. CSS에서는 `var(--token)` 만 사용한다.
2. 토큰에 없는 값은 임의로 만들지 않는다.
3. 새 값이 필요하면 이 DESIGN.md에 **먼저 추가**한 뒤 사용한다.
