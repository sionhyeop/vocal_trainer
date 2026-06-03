# 보컬 게임 (게임형 교육 미니게임) — 설계

작성일: 2026-06-01 · 상태: 승인됨 → 구현

## 목표
기존 보컬 트레이너에 **아케이드형 보컬 훈련 미니게임 2종**을 추가한다. 둘 다 마이크로 노래해서 조작하는 "보컬 액션" 게임이며, **레벨(단계) + 별 3개** 구조로 반복 동기를 만든다. Duolingo 스타일 디자인 토큰 위에 얹는다.

## 접근법
**A. 공용 툴킷 + 데이터 기반 레벨** (채택). 두 게임은 독립 컴포넌트지만 작은 공용 모듈(별점 저장, 레벨 선택, 클리어 오버레이)을 공유. 기존 자산 재사용: `useMicPitch`(실시간 피치), `oscillator.ts`(playTone), Duolingo 토큰·`judgePop`/`bounce` 애니메이션. 레벨은 데이터 배열로 정의.

## 공용 인프라 — `frontend/src/features/games/`
- **별점 저장** (`lib/storage.ts`에 추가): 키 `vt:games`, 형태 `{ [gameId]: { [levelId]: stars 0~3 } }`. 함수 `getGameStars(gameId,levelId)`, `setGameStars(gameId,levelId,stars)`(기존보다 높을 때만 갱신), `totalStars()`.
- **레벨 선택 컴포넌트** `LevelSelect.tsx`: 레벨을 세로로 나열, 각 레벨에 별(0~3)·잠금 표시. 직전 레벨 클리어(별≥1) 시 다음 해제. Lv1은 항상 열림.
- **클리어 오버레이** `ClearOverlay.tsx`: "클리어!" + 획득 별(애니메이션) + [다시][레벨선택][다음]. `judgePop`/바운스 재사용.
- **게임 허브** `GamesHub.tsx` (`/games`): 두 게임 카드 + 총 별 개수.

## 게임 1 — 🪜 음역대 클라이머 (`ClimberGame.tsx`, `/games/climber`)
세로 사다리. 목표 음이 아래→위로 제시되고, 마이크로 그 음을 **±0.7반음** 안에서 약 **1.0초** 유지하면 칸이 잠기고 한 칸 등반 → 다음(보통 더 높은) 칸 등장.
- **실패 조건**: 칸마다 제한시간(예 8초) 안에 잠그지 못하면 종료(추락).
- **레벨 데이터**: `{ id, name, notes: midi[], holdMs, tolSemi, timeLimitMs }`.
  - Lv1 C4→G4(5음, 편안) / Lv2 위로 확장(C4→C5) / Lv3 하행(G4→C4) / Lv4 옥타브 점프.
- **프로필 연동**: 저장된 음역대(`getProfile`)가 있으면 목표 음을 사용자 범위로 이동(transpose)해 난이도 스케일. 없으면 기본.
- **별**: 등반한 칸 수 비율 + 평균 음정 오차로 1~3개.
- **화면**: 세로 캔버스. y축=음높이. 목표 칸 하이라이트, 내 실시간 피치 마커(클라이머), 현재 칸 잠금 게이지.
- **교육 효과**: 음역 확장·음정 정확도·지속력.

## 게임 2 — 🎼 멜로디 따라부르기 (`EchoGame.tsx`, `/games/echo`)
짧은 멜로디를 `playTone`으로 들려줌 → 사용자가 따라 부르면 검출 음을 대조. 맞으면 멜로디가 한 음 길어짐(Simon 성장).
- **채점(단순화)**: 따라부르기 단계에서 각 기대 음마다 고정 시간창(예 700ms)을 배정하고, 그 창의 **중앙값(median) 검출 피치**를 목표 midi와 비교. **±1반음 이내 = 정답**. (어려운 onset 검출 회피)
- **흐름**: ① 재생(패드 점등 + 톤) → ② 카운트인 → ③ 따라부르기(창별 검출·판정) → ④ 라운드 통과 시 한 음 추가, 실패 N회 시 종료.
- **레벨 데이터**: `{ id, name, scale: midi[], startLen, maxLen, noteMs, tolSemi }`.
  - Lv1 3음·좁은 음정(장2/3도) / Lv2 4음 / Lv3 도약 포함·길이↑.
- **별**: 도달 길이 / 음 정확도.
- **화면**: 음 패드(색 원) 가로 줄 — 재생 때 점등, 부를 때 검출 음 점등. 진행 상태 표시.
- **교육 효과**: 청음 + 가창 동시, 음정 기억.

## 진입 동선
- 라우트: `/games`(허브) → `/games/climber`, `/games/echo`.
- 홈: **🎮 보컬 게임** 진입(차트 위 섹션 또는 모드 카드 추가) + 총 별 배지.
- `router.tsx`에 3개 라우트 추가.

## 범위 밖 (지금 안 함)
- 전체 진행 시스템(XP/레벨/리그/하트), 온라인 리더보드, 데일리 챌린지. → 별점 로컬 저장까지만.

## 파일 영향
- 신규: `features/games/{GamesHub,LevelSelect,ClearOverlay,ClimberGame,EchoGame,levels.ts}.tsx`
- 수정: `lib/storage.ts`(게임 별점), `app/router.tsx`(라우트), `features/home/HomePage.tsx`(진입).
- 재사용: `hooks/useMicPitch.ts`, `lib/oscillator.ts`, `styles/tokens.css`.

## 검증
- 빌드 `npm run build` 통과(tsc strict).
- 각 게임: 마이크 권한→플레이→클리어 오버레이→별 저장(새로고침 후 유지)→다음 레벨 해제.
- vite 재시작 후 `/games`, `/games/climber`, `/games/echo` 200.
