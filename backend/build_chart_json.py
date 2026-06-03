"""build_chart_json.py — 알고 있는 videoId로 카테고리별 차트 리스트를 직접 작성(검색 X, 쿼터 회피).
그 뒤 캐시에 없는 곡만 일괄 추출."""
import json
import os
import time

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "frontend", "src", "assets", "chartSongs.json")

# (title, artist, videoId, category)
SONGS = [
    # 한국
    ("Supernova", "aespa", "phuiiNCxRMg", "한국"),
    ("Whiplash", "aespa", "jWQx2f-CErU", "한국"),
    ("Armageddon", "aespa", "nFYwcndNuOY", "한국"),
    ("Magnetic", "ILLIT", "Vk5-c_v4gMU", "한국"),
    ("Supernatural", "NewJeans", "ZncbtRo7RXs", "한국"),
    ("How Sweet", "NewJeans", "Q3K0TOvTOno", "한국"),
    ("HEYA", "IVE", "07EzMbVH3QE", "한국"),
    ("I AM", "IVE", "6ZUIwj3FgUY", "한국"),
    ("Accendio", "IVE", "PGLx4V680J8", "한국"),
    ("Klaxon", "(G)I-DLE", "rTKqSmX9XhQ", "한국"),
    ("Fate", "(G)I-DLE", "ATK7gAaZTOM", "한국"),
    ("EASY", "LE SSERAFIM", "bNKXxwOQYB8", "한국"),
    ("CRAZY", "LE SSERAFIM", "n6B5gQXlB-0", "한국"),
    ("Boom Boom Bass", "RIIZE", "78lNnCitcBM", "한국"),
    ("Get A Guitar", "RIIZE", "iUw3LPM7OBU", "한국"),
    ("SHEESH", "BABYMONSTER", "2wA_b6YHjqQ", "한국"),
    ("첫 만남은 계획대로 되지 않아", "TWS", "hVAc1Vf2ITU", "한국"),
    ("고민중독", "QWER", "ImuWa3SJulY", "한국"),
    ("Blueming", "IU", "D1PvIWdJ8xo", "한국"),
    ("Seven", "Jung Kook", "QU9c0053UAU", "한국"),
    ("Mantra", "Jennie", "bB3-CUMERIU", "한국"),
    # 발라드
    ("한 페이지가 될 수 있게", "DAY6", "vnS_jn2uibs", "발라드"),
    ("예뻤어", "DAY6", "BS7tz2rAOSA", "발라드"),
    ("Welcome to the Show", "DAY6", "RowlrvmyFEk", "발라드"),
    ("Love wins all", "IU", "JleoAppaxi0", "발라드"),
    ("밤편지", "IU", "BzYnNdJhZQw", "발라드"),
    ("Standing Next to You", "Jung Kook", "UNo0TG9LwwI", "발라드"),
    # 팝
    ("APT", "ROSÉ & Bruno Mars", "ekr2nIex040", "팝"),
    ("Espresso", "Sabrina Carpenter", "eVli-tstM5E", "팝"),
    ("BIRDS OF A FEATHER", "Billie Eilish", "V9PVRfjEBTI", "팝"),
    ("Beautiful Things", "Benson Boone", "Oa_RSwwpPaA", "팝"),
    ("Shape of You", "Ed Sheeran", "JGwWNGJdvx8", "팝"),
    ("Die With A Smile", "Lady Gaga & Bruno Mars", "kPa7bsKwL-c", "팝"),
    # 제이팝
    ("アイドル (Idol)", "YOASOBI", "ZRtdQ81jPUQ", "제이팝"),
    ("夜に駆ける (Yoru ni Kakeru)", "YOASOBI", "x8VYWazR5mE", "제이팝"),
    ("Lemon", "Kenshi Yonezu", "SX_ViT4Ra7k", "제이팝"),
    ("Pretender", "Official HIGE DANdism", "TQ8WlA2GXbk", "제이팝"),
    ("Subtitle", "Official HIGE DANdism", "hN5MBlGv2Ac", "제이팝"),
    ("うっせぇわ (Usseewa)", "Ado", "Qp3b-RXtz4w", "제이팝"),
    ("紅蓮華 (Gurenge)", "LiSA", "CwkzK-F0Y00", "제이팝"),
]

data = [
    {"title": t, "artist": a, "videoId": v, "ytTitle": f"{a} {t}", "category": c}
    for (t, a, v, c) in SONGS
]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f"저장 {len(data)}곡 → {OUT}")

# 캐시에 없는 곡만 추출
if __name__ == "__main__":
    from melody import extract_notemap, _cache_path

    todo = [s for s in data if not os.path.exists(_cache_path(s["videoId"]))]
    print(f"추출 필요: {len(todo)}곡")
    for i, s in enumerate(todo, 1):
        print(f"({i}/{len(todo)}) {s['artist']} - {s['title']} [{s['videoId']}]", flush=True)
        t0 = time.time()
        try:
            r = extract_notemap(s["videoId"], max_seconds=60, method="auto")
            print(f"    ✓ {r['extractor']} {len(r['contour'])}pts ({time.time()-t0:.0f}s)", flush=True)
        except Exception as e:
            print(f"    ✗ {e}", flush=True)
    print("=== 완료 ===", flush=True)
