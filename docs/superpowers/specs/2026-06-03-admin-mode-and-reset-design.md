# 관리자 모드 + 데이터 리셋 — 설계

작성일: 2026-06-03 · 상태: 승인됨 → 구현 (리셋 먼저)

## 목표
관리자(나)가 라이브 사이트의 **곡과 가사를 추가·고정**할 수 있는 관리자 모드를 만든다. 그리고 기존 **음정 노트맵·가사 데이터를 전부 리셋**한 뒤, 몇 곡만 직접 다시 적용한다.

## 확정된 결정 (브레인스토밍)
1. **관리자 진입** = 비밀 닉네임 로그인 (`VITE_ADMIN_NAME`과 일치 시 관리자 UI 노출)
2. **반영 범위** = 라이브 사이트 전체 공유 (리포 커밋 → GitHub→Vercel 자동배포)
3. **리셋 범위** = 로컬 원본까지 완전 삭제 (`public/notemaps` + `backend/cache`)
4. **가사 고정** = 자동 lrclib 기본, 수정하면 전체 교체·저장(고정본 사용)

## 아키텍처 핵심
"라이브 전체 공유"라 관리자 변경은 리포에 커밋돼야 한다. 브라우저는 GitHub 토큰을 못 가지므로(노출), 기존 extract-request와 동일하게 **서버리스 함수가 커밋**한다. 닉네임은 클라이언트 게이팅(UI 노출)일 뿐이라, 쓰기 API는 누구나 호출 가능 → **서버측 시크릿(`ADMIN_SECRET`)으로 쓰기 인증**한다. (닉네임=UI, 시크릿=쓰기 권한)

## 컴포넌트

### A. 관리자 진입 / 인증
- `isAdmin = account?.name === import.meta.env.VITE_ADMIN_NAME`
- 관리자면 헤더/홈에 "⚙ 관리자" 링크 + `/admin` 라우트 노출
- `/admin` 패널: **관리자 시크릿** 1회 입력 → `localStorage('vt:adminSecret')` 보관 → 쓰기 요청에 `x-admin-secret` 헤더로 전송
- 서버리스: `x-admin-secret === process.env.ADMIN_SECRET` 검증, 불일치 시 401

### B. 곡 추가·고정 (`/api/admin/song`)
- 입력: videoId(또는 URL 파싱) + title + artist + category + (옵션) ytTitle
- 동작: `frontend/src/assets/chartSongs.json`을 GitHub Contents API로 읽고 → 항목 추가/수정/삭제 → 커밋
- 관리자 패널: 추가 폼 + 현재 곡 목록(삭제 버튼)
- 커밋 후 Vercel 자동배포로 차트 반영

### C. 가사 편집·고정 (`/api/admin/lyrics`)
- 곡 선택 → 현재 가사 로드(고정본 있으면 그것, 없으면 lrclib) → LRC textarea 편집 → 저장
- 저장: `frontend/public/lyrics/<videoId>.json` 생성/수정(형태 `{ synced?: string(LRC), plain?: string, source: 'admin' }`) → 커밋
- 삭제(고정 해제): 파일 제거 → 다시 자동 lrclib
- **useLyrics 변경**: 맨 앞에 고정 가사(`${BASE_URL}lyrics/<videoId>.json`) HEAD/GET 시도 → 있으면 그걸 사용, 없으면 기존 흐름(백엔드/lrclib). 노트맵 정적 우선 패턴과 동일.

### D. 리셋 (1회성, 지금 즉시)
- 삭제: `frontend/public/notemaps/*.json`, `backend/cache/*.json`
- 코드: `loadCachedNoteMap`은 파일 없으면 자연히 null → "추출 요청" 흐름으로. 추가 코드 변경 불필요.
- 곡별 `lyricOffset:<id>` localStorage는 사용자 기기에 남지만 무해(해당 곡 없으면 미사용). 정리 안내만.
- 커밋·push → 라이브가 빈 채점 상태. 차트 곡은 "추출 요청"으로 재적용 가능.
- ⚠️ 되돌리기 어려움: 60개 노트맵(추출 결과물) 영구 삭제. 사용자 명시 승인함.

### E. env / 보안
- 신규 `ADMIN_SECRET` (Vercel Production env, 서버측) — 쓰기 인증
- 신규 `VITE_ADMIN_NAME` (번들 포함, 약한 보안 — UI 게이팅용)
- 기존 `GH_QUEUE_TOKEN` 재사용(리포 쓰기 권한 이미 있음)
- 서버리스 함수: `frontend/api/admin/song.js`, `frontend/api/admin/lyrics.js` (또는 단일 `admin.js` 라우팅)

## 파일 영향
- 신규: `frontend/api/admin-*.js`, `frontend/src/features/admin/AdminPage.tsx`, `frontend/public/lyrics/`(가사 고정본)
- 수정: `hooks/useLyrics.ts`(고정 가사 우선), `app/router.tsx`(/admin), 헤더/홈(관리자 링크), `store/account.ts`(isAdmin 헬퍼 선택)
- 삭제(리셋): `frontend/public/notemaps/*`, `backend/cache/*`

## 구현 순서
1. **리셋** — 노트맵/캐시 삭제, 커밋·push, 라이브 빈 상태 확인
2. 관리자 진입/인증 (env + 게이팅 + /admin 셸)
3. 곡 추가·고정 API + UI
4. 가사 편집·고정 API + UI + useLyrics 변경
5. 배포 + E2E

## 검증
- 리셋 후 라이브: 차트 곡 진입 시 노트맵 없음 → "추출 요청" 노출, 정상 동작
- 관리자: 비밀 닉네임 로그인 시에만 /admin 접근, 시크릿 검증
- 곡 추가 → 차트에 반영(배포 후), 가사 수정 → 고정본 사용
- 비관리자/시크릿 불일치 → 쓰기 401
