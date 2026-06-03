# 보컬 트레이너 웹앱 (노래방 퍼펙트 스코어 스타일)

곡 검색 → MR/원곡 재생 → **실시간 피치 채점**(노래방식 리본) → 결과(약점 구간·호흡 요약).
원곡 멜로디를 자동 추출하거나 흥얼거려 만든 가이드로 **정밀 음정 대조**도 지원.

- **프론트**: React + Vite + TypeScript (Web Audio + pitchy, YouTube IFrame, Canvas 리본)
- **백엔드**: FastAPI — 가사 프록시(lrclib) + 원곡 멜로디 자동추출(yt-dlp + Demucs + librosa)

## 빠른 시작

### 1) 프론트엔드
```bash
cd frontend
npm install
cp .env.example .env      # 그리고 .env 에 YouTube API 키 입력
npm run dev               # http://localhost:5173
```

### 2) 백엔드 (가사 + 멜로디 추출)
```bash
cd backend
uv venv --python 3.12 .venv          # Python 3.12 고정 (curl_cffi 휠 때문)
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/uvicorn main:app --port 8000 --host 127.0.0.1
```
> 시스템 ffmpeg 필요(멜로디 추출용). Demucs 보컬분리는 CPU에서 동작(첫 곡 느림).

### 필요한 키 (각자 발급, 깃에 올리지 않음)
- `VITE_YOUTUBE_API_KEY` — Google Cloud Console → YouTube Data API v3 (검색용)
- (선택) `ANTHROPIC_API_KEY` — AI 코칭(후속), 백엔드 환경변수

## 저장소에 포함되지 않는 것 (각자 재생성)
`node_modules/`, `backend/.venv/`, `dist/`, `backend/cache/`, `.env` 는 `.gitignore` 처리.
→ 클론 후 위 "빠른 시작"으로 복원하세요.

## 배포 (GitHub → Vercel 자동배포, 백엔드 없는 정적 데모)

이 데모는 **백엔드 없이 프론트만** 정적 배포해도 동작합니다:
- 🔍 검색: 브라우저에서 YouTube Data API 직접 호출
- 📜 가사: 브라우저에서 lrclib 직접 호출 (`VITE_LYRICS_API` 비우면 자동)
- 🎯 채점: 미리 추출한 **차트 59곡 노트맵을 `frontend/public/notemaps/`에 동봉**해 정적 서빙
- (임의 곡 실시간 추출만 비활성 — 로컬 풀기능 실행 시 가능)

### 1) GitHub에 올리기
```bash
git init && git add -A && git commit -m "init: vocal trainer"
git branch -M main
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

### 2) Vercel 연결 (한 번만 — 이후 push마다 자동배포)
1. https://vercel.com → **Add New → Project** → GitHub 리포 import
2. **Root Directory** = `frontend` 로 지정 (Vite 자동 감지)
3. **Environment Variables** 추가:
   - `VITE_YOUTUBE_API_KEY` = (본인 YouTube Data API 키)
   - `VITE_LYRICS_API` = (빈 값 — 가사 직접 호출용)
4. **Deploy** → 공개 URL 생성. 이후 `git push`하면 자동 재배포, PR엔 미리보기 URL.

> 나중에 임의 곡 실시간 추출까지 원하면, 무거운 추출 백엔드(Demucs/CREPE)를
> Hugging Face Spaces 등에 별도 배포하고 `VITE_LYRICS_API`를 그 주소로 설정.
