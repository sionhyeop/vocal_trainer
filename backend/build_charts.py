"""build_charts.py — 인기곡 큐레이션 → YouTube 영상 찾기 → 멜로디 노트 일괄 사전 추출.

1) 큐레이션 리스트(국내/해외)를 YouTube Data API로 검색해 videoId 확보
2) frontend/src/assets/chartSongs.json 으로 저장(프론트 '차트' 페이지가 읽음)
3) 각 곡을 extract_notemap(auto) 로 추출 → backend/cache/<videoId>.json 적재(이미 있으면 skip)

진행 로그: /tmp/build_charts.log . 백그라운드로 오래 돈다(곡당 ~1분).
사용: .venv/bin/python build_charts.py [resolve|extract|all]
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(__file__)
OUT_JSON = os.path.join(HERE, "..", "frontend", "src", "assets", "chartSongs.json")
LOG = "/tmp/build_charts.log"

# (제목, 아티스트, 카테고리) — 한국 / 발라드 / 팝 / 제이팝
SONGS = [
    # 한국 (K-pop 댄스)
    ("Supernova", "aespa", "한국"), ("Whiplash", "aespa", "한국"), ("Armageddon", "aespa", "한국"),
    ("Magnetic", "ILLIT", "한국"), ("Supernatural", "NewJeans", "한국"), ("How Sweet", "NewJeans", "한국"),
    ("HEYA", "IVE", "한국"), ("I AM", "IVE", "한국"),
    ("Klaxon", "(G)I-DLE", "한국"), ("Fate", "(G)I-DLE", "한국"),
    ("EASY", "LE SSERAFIM", "한국"), ("CRAZY", "LE SSERAFIM", "한국"),
    ("Boom Boom Bass", "RIIZE", "한국"), ("Get A Guitar", "RIIZE", "한국"),
    ("SHEESH", "BABYMONSTER", "한국"),
    ("첫 만남은 계획대로 되지 않아", "TWS", "한국"),
    ("고민중독", "QWER", "한국"),
    ("Blueming", "IU", "한국"),
    ("Seven", "Jung Kook", "한국"), ("Mantra", "Jennie", "한국"),
    # 발라드
    ("한 페이지가 될 수 있게", "DAY6", "발라드"), ("예뻤어", "DAY6", "발라드"),
    ("Welcome to the Show", "DAY6", "발라드"),
    ("Love wins all", "IU", "발라드"), ("밤편지", "IU", "발라드"),
    ("Standing Next to You", "Jung Kook", "발라드"),
    ("사랑인가 봐", "멜로망스", "발라드"), ("너의 모든 순간", "성시경", "발라드"),
    # 팝 (해외)
    ("APT", "ROSÉ Bruno Mars", "팝"), ("Espresso", "Sabrina Carpenter", "팝"),
    ("BIRDS OF A FEATHER", "Billie Eilish", "팝"), ("Beautiful Things", "Benson Boone", "팝"),
    ("Shape of You", "Ed Sheeran", "팝"), ("Die With A Smile", "Lady Gaga Bruno Mars", "팝"),
    # 제이팝
    ("アイドル", "YOASOBI", "제이팝"), ("夜に駆ける", "YOASOBI", "제이팝"),
    ("Lemon", "Kenshi Yonezu 米津玄師", "제이팝"), ("KICK BACK", "Kenshi Yonezu 米津玄師", "제이팝"),
    ("死ぬのがいいわ", "Fujii Kaze 藤井風", "제이팝"), ("Pretender", "Official HIGE DANdism", "제이팝"),
    ("うっせぇわ", "Ado", "제이팝"), ("紅蓮華", "LiSA", "제이팝"),
]


def log(msg: str) -> None:
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def _yt_key() -> str:
    env = os.path.join(HERE, "..", "frontend", ".env")
    for ln in open(env, encoding="utf-8"):
        if ln.startswith("VITE_YOUTUBE_API_KEY="):
            return ln.split("=", 1)[1].strip()
    raise RuntimeError("YouTube 키 없음")


def search_video(track: str, artist: str, key: str) -> dict | None:
    q = urllib.parse.quote(f"{artist} {track} MV")
    url = (
        "https://www.googleapis.com/youtube/v3/search"
        f"?part=snippet&type=video&videoEmbeddable=true&maxResults=1&q={q}&key={key}"
    )
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            data = json.load(r)
        items = data.get("items") or []
        if not items:
            return None
        it = items[0]
        return {
            "title": track,
            "artist": artist,
            "videoId": it["id"]["videoId"],
            "ytTitle": it["snippet"]["title"],
        }
    except Exception as e:
        log(f"  검색 실패 {artist} - {track}: {e}")
        return None


def resolve() -> list[dict]:
    key = _yt_key()
    out: list[dict] = []
    for track, artist, category in SONGS:
        v = search_video(track, artist, key)
        if v:
            v["category"] = category
            out.append(v)
            log(f"  찾음: [{category}] {artist} - {track} → {v['videoId']}")
        time.sleep(0.2)
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    log(f"리스트 저장: {len(out)}곡 → {OUT_JSON}")
    return out


def extract(songs: list[dict]) -> None:
    from melody import extract_notemap, _cache_path

    total = len(songs)
    for i, s in enumerate(songs, 1):
        vid = s["videoId"]
        if os.path.exists(_cache_path(vid)):
            log(f"({i}/{total}) skip(캐시): {s['artist']} - {s['title']}")
            continue
        log(f"({i}/{total}) 추출 시작: {s['artist']} - {s['title']} [{vid}]")
        t0 = time.time()
        try:
            res = extract_notemap(vid, max_seconds=60, method="auto")
            log(f"    ✓ {res['extractor']} 노트수 {len(res['contour'])} ({time.time()-t0:.0f}s)")
        except Exception as e:
            log(f"    ✗ 실패: {e}")
    log("=== 전체 추출 완료 ===")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    if mode in ("resolve", "all"):
        songs = resolve()
    else:
        songs = json.load(open(OUT_JSON, encoding="utf-8"))
    if mode in ("extract", "all"):
        extract(songs)
