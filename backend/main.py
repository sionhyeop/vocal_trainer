"""main.py — VocalTrainer 백엔드 (PLAN §6.3).

엔드포인트:
  GET /api/health  — 헬스체크
  GET /api/lyrics  — lrclib 싱크 가사 프록시 (404 = 가사 없음, 에러 아님)

AI 코치(/api/coach)는 후속(M7)에서 추가.
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from lyrics import search_lyrics
from melody import extract_notemap, get_progress, load_cached

app = FastAPI(title="VocalTrainer Lyrics API")

# 개발용 CORS. 배포 시 allow_origins를 실제 출처로 제한할 것.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/lyrics")
def get_lyrics(
    track: str = Query(..., min_length=1),
    artist: str | None = Query(None),
):
    result = search_lyrics(track=track, artist=artist)
    if result is None:
        # 404 = "이 곡 가사 없음" (서버 오류와 구분). 프론트는 notfound로 처리.
        raise HTTPException(status_code=404, detail="Lyrics not found")
    return result


@app.get("/api/notemap")
def get_notemap(
    videoId: str = Query(..., min_length=5),
    maxSeconds: int = Query(120, ge=15, le=600),  # 프론트는 풀곡 추출로 600 전송 → melody.py가 곡 길이(360s)까지 클램프
    force: bool = Query(False),
    method: str = Query("auto", pattern="^(auto|crepe|basicpitch)$"),
    cachedOnly: bool = Query(False),
):
    """원곡 오디오에서 멜로디 피치 곡선 자동 추출(방법 A). 첫 곡은 수십 초 소요.
    method: auto(기본)|crepe|basicpitch. EDM/처리된 보컬은 basicpitch가 강함.
    force=true면 캐시 무시하고 재추출. cachedOnly=true면 캐시에 있을 때만 반환(없으면 404, 추출 안 함)."""
    if cachedOnly:
        cached = load_cached(videoId)
        if cached is None:
            raise HTTPException(status_code=404, detail="not cached")
        return cached
    try:
        return extract_notemap(videoId, max_seconds=maxSeconds, force=force, method=method)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"멜로디 추출 실패: {e}")


@app.get("/api/notemap/progress")
def notemap_progress(videoId: str = Query(..., min_length=5)):
    """추출 진행 상태 {stage, pct}. 프론트가 폴링해 진행바 표시."""
    return get_progress(videoId)
