# HANDOFF — 보컬 트레이너 (Vocal Trainer Web App)

노래방 "퍼펙트 스코어" 스타일 보컬 트레이닝 웹앱. 곡 검색/차트 → MR·원곡 재생 → 실시간 음정 채점 → 결과(등급/약점 구간/호흡) + 보이스 트레이닝.

> 작업 디렉토리: `/mnt/c/dev/capstone_vocal_webapp`
> 기준일: 2026-06-01 · 상태: M0~M6 완료 + 다수 개선

---

## 1. 빠른 시작

### 프론트엔드 (React + Vite + TS)
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173  (포트 점유 시 5174로 뜰 수 있음 — 로그 확인)
npm run build        # tsc -b && vite build (배포 검증용)
```
> **중요: 크롬에서 열 것.** VSCode Simple Browser(Electron)는 YouTube 임베드를 차단해 검은 화면이 됨.
> 코드 수정 후 화면 반영이 안 되면(특히 JSON import 변경) vite를 재시작: `fuser -k 5173/tcp; rm -rf node_modules/.vite; npm run dev`.

### 백엔드 (FastAPI + Python 3.12, uv)
```bash
cd backend
uv venv --python 3.12 .venv          # 최초 1회 (시스템 py3.14는 curl_cffi 휠 없음 → 3.12 고정)
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/uvicorn main:app --port 8000 --host 127.0.0.1   # cwd=backend
```
헬스: `curl http://127.0.0.1:8000/api/health` → `{"ok":true}`

### 환경변수 — `frontend/.env`
```
VITE_YOUTUBE_API_KEY=<설정됨>   # 검색용 Data API 키. 번들에 노출됨 → 공개 배포 시 리퍼러 제한 필수
VITE_LYRICS_API=http://127.0.0.1:8000
```

---

## 2. 스택

| 레이어 | 기술 |
|---|---|
| 프론트 | React + Vite + TypeScript, zustand(상태), react-router 6 |
| 오디오 | Web Audio API, pitchy(McLeod MPM 피치검출), getUserMedia, soundtouchjs(오프라인 피치시프트) |
| 재생/검색 | YouTube IFrame Player API(재생, 키 불필요) / Data API(검색, 키 필요) |
| 가사 | lrclib(싱크 가사) ← `curl_cffi` + DoH + `impersonate="chrome"` (Cloudflare/DNS 우회) |
| 음정 추출 | Demucs(보컬 분리) → torchcrepe(CREPE) 또는 Basic Pitch(폴리포닉/EDM), librosa.pyin(폴백) |
| 저장 | localStorage(세션/노트맵캐시/프로필), sessionStorage(검색캐시), 백엔드 `cache/*.json`(추출 노트맵) |

---

## 3. 디렉토리 구조

```
frontend/src/
  styles/tokens.css        # DESIGN.md 디자인 토큰 단일 소스 (Duolingo 스타일). 색/타이포/간격/효과/애니메이션
  app/router.tsx           # 모든 라우트 정의
  store/session.ts         # 선택 곡 등 zustand 스토어
  lib/
    storage.ts             # SessionResult/Profile 저장·조회 (localStorage)
    noteMap.ts             # Tier A 노트맵 zod 스키마
    oscillator.ts          # playTone (이어트레이닝용 오실레이터)
  hooks/useMicPitch.ts     # 마이크 피치 (median-7 → One Euro 필터 + voicing hangover)
  features/
    home/HomePage.tsx          # 랜딩(그라데이션 히어로 + 컬러 모드카드 + 차트)
    chart/ChartList.tsx        # 카테고리 탭 + 곡 리스트 (홈/차트 공용)
    chart/ChartPage.tsx
    search/SearchPage.tsx      # YouTube 검색 (Data API 키)
    sing/SingScreen.tsx        # ★핵심: 영상+리본+가사+싱크슬라이더+채점+결과
    sing/ribbonDraw.ts         # 노래방 리본 캔버스 (목표바 R→L 흐름 + 목소리 바)
    training/PitchCheckPage.tsx    # 음정 확인 (목표음 트레이닝)
    training/EarTrainingPage.tsx   # 음 맞히기 (이어 트레이닝)        [M6]
    training/VoiceShiftPage.tsx    # 내 목소리 변조 (피치 시프트)      [M6]
    training/MicTestPage.tsx       # 마이크 진단
    history/HistoryScreen.tsx      # 연습 기록 목록/상세/삭제         [M6]
    profile/ProfilePage.tsx        # 내 음역대 측정·저장             [M6]
    result/, notemap/, status/, error/
  components/  Logo.tsx, NavBar.tsx
  assets/chartSongs.json   # 차트 곡 데이터 (videoId 직접 박음 → 검색 쿼터 회피)

backend/
  main.py        # FastAPI: /api/health, /api/lyrics, /api/notemap(+progress)
  lyrics.py      # lrclib 가사 (DoH+curl_cffi+chrome 위장, 한국어 가사 우선)
  melody.py      # 추출 파이프라인 (다운로드→크롭→분리→피치추출→캐시)
  build_chart_json.py / build_charts.py   # 차트 사전 생성 스크립트
  cache/*.json   # 추출된 노트맵 캐시 (videoId.json)
```

---

## 4. 핵심 동작 / 비자명한 결정

- **채점 = 멜로디 단독(정밀/원곡 대조).** Tier B(자유) 모드·가이드 녹음은 제거됨. method는 항상 `'melody'`, 추출 길이 60초 고정.
- **마이크 피치 보정**: `median-7 → One Euro 필터`(MIN_CUTOFF 1.3 / BETA 0.8 / D_CUTOFF 1.0), HANGOVER_FRAMES 8, 게이트 CLARITY 0.65 / RMS 0.0035. (옥타브 점프에 강건 — octaveAlign 방식은 상향 폭주로 폐기)
- **MR이 마이크로 새는 문제**: getUserMedia `echoCancellation:true`("콜 모드")로 차단.
- **가사-영상 싱크**: `lyricOffset` 슬라이더(±10s). 위로 올리면 가사가 첫 부분으로 딸려 올라감(top=+MAX). 가사/채점/차트는 전부 plain `getCurrentTime()` 사용 — performance.now() 보간(smoothNow)은 desync 유발해 폐기.
- **EDM/오토튠**: 모노포닉 CREPE가 못 잡음 → Basic Pitch(폴리포닉) method 셀렉터 제공. auto는 신뢰 못 해 수동 선택.
- **차트 곡**: YouTube Data API 쿼터 회피 위해 videoId를 `chartSongs.json`에 직접 기록. 신규 추가 시 **yt-dlp 검색(`ytsearch1:`)으로 id 따고 oEmbed로 재생 가능 검증** 후 추가.
- **가사 한국어 우선**: difflib 유사도 + `_has_hangul`(한글 +0.2, 로마자 -0.35), threshold 0.45.

---

## 5. 차트 현황 (`chartSongs.json`, 총 50곡)

| 카테고리(탭) | cat 값 | 곡수 |
|---|---|---|
| 케이팝 | `한국` | 21 |
| 제이팝 | `제이팝` | 7 |
| 팝송 | `팝` | 6 |
| 발라드 | `발라드` | 6 |
| **트로트** | `트로트` | 10 |

- 케이팝 등은 백그라운드 배치로 노트맵 사전 추출 완료(`backend/cache/`, 59개). EDM 일부는 노이즈 있으나 수용.
- **트로트 10곡은 아직 노트맵 미추출** — 첫 진입 시 추출이 1회 돈다. (배치 사전추출하려면 `build_charts.py` 참고)

---

## 6. API 엔드포인트 (backend)

- `GET /api/health` → `{ok:true}`
- `GET /api/lyrics?track=&artist=` → 싱크 가사(없으면 404=notfound, 에러 아님)
- `GET /api/notemap?videoId=&maxSeconds=&force=&method=&cachedOnly=` → 노트맵(추출/캐시)
- `GET /api/notemap/progress?videoId=` → 추출 진행률(단계: 다운로드8/변환22/분리35-68/추출76/완료100)

---

## 7. 환경 함정 (재발 방지)

- **Python 3.12 고정** (curl_cffi 휠). `requests`/`httpx` 금지 → `curl_cffi`만.
- **Demucs**: PATH에 없음 → `sys.executable -m demucs`. torchaudio 저장에 `torchcodec` 필요(`uv pip install torchcodec`).
- **Basic Pitch**: py3.12 TF 휠 없음 → `uv pip install --no-deps basic-pitch` + onnxruntime/mir_eval/pretty_midi/mido, env `BASIC_PITCH_MODEL_TYPE=onnx`.
- **프로세스 종료**: `pkill`은 자기 cmdline 매치로 자살(exit 144) → 포트로 `fuser -k 5173/tcp`.
- **YT.Player**: React가 div 교체 못 하게 imperative host div + width/height 100%.
- **tsc strict**: `Float32Array<ArrayBuffer>` 타입 명시 필요(micCapture/useMicPitch).

---

## 8. 남은 작업 (우선순위)

1. **트로트 노트맵 배치 사전추출** — 첫 진입 즉시 부르기 가능하게.
2. **M7 — AI 코칭** (Anthropic 키 필요): 결과 화면에서 약점 구간 코칭 코멘트.
3. **정확도 고도화**: WhisperX 단어 단위 가사 정렬, 피아노롤 노트 편집기.
4. **M8 — 배포 + 로그인**: Firebase 로그인, 서버리스 추출(비용: 가사≈무료, 추출 비쌈 → 캐시/서버리스/클라이언트화 검토).

---

## 9. 참고 문서

- `PLAN_vocal_trainer_webapp.md` — 제품 스펙 (Tier A/B 채점, 노트맵 포맷 등)
- `DESIGN.md` — 디자인 토큰(Duolingo 스타일) 원본
- `README.md`보다 코드(`lyrics.py`, `melody.py`)를 신뢰할 것.
