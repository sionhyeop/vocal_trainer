"""lyrics.py — lrclib 싱크 가사 프록시 (PLAN §6.2/§6.4).

★ 이 모듈의 진짜 난이도는 가사 파싱이 아니라 lrclib에 "도달하는 것"이다.
   해법 3단계 (절대 requests/httpx로 대체 금지):
   1. DoH로 진짜 IP 조회      — 로컬 DNS 필터를 HTTPS로 우회
   2. CURLOPT_RESOLVE로 IP 직결 — SNI/Host는 lrclib.net 유지 (안 그러면 Cloudflare 거절)
   3. impersonate="chrome"     — Cloudflare JA3 지문 검사 통과

문서(README)보다 이 코드를 신뢰할 것.
"""

import difflib
import re

from curl_cffi import requests as ccrequests
from curl_cffi import CurlOpt

LRCLIB_HOST = "lrclib.net"

# DoH 리졸버 (HTTPS라 DNS 필터가 질의를 못 봄)
DOH_RESOLVERS = [
    "https://8.8.8.8/resolve",
    "https://dns.google/resolve",
    "https://cloudflare-dns.com/dns-query",
]

_ip_cache: dict[str, list[str]] = {}


def _resolve_via_doh(hostname: str) -> list[str]:
    """DoH로 A 레코드(IPv4) 목록을 얻는다. 캐시 적용."""
    if hostname in _ip_cache:
        return _ip_cache[hostname]
    for url in DOH_RESOLVERS:
        try:
            r = ccrequests.get(
                url,
                params={"name": hostname, "type": "A"},
                headers={"accept": "application/dns-json"},
                impersonate="chrome",
                timeout=8,
                verify=False,
            )
            if r.status_code != 200:
                continue
            ips = [
                a["data"]
                for a in (r.json().get("Answer") or [])
                if a.get("type") == 1 and "data" in a  # type 1 = A 레코드
            ]
            if ips:
                _ip_cache[hostname] = ips
                return ips
        except Exception:
            continue
    return []


def _lrclib_get(path: str, params: dict):
    """lrclib /api{path} GET. DoH IP에 직결 + Chrome 위장.

    404는 '없음'을 뜻하므로 None 반환(에러 아님). 그 외 실패는 다음 IP로.
    """
    ips = _resolve_via_doh(LRCLIB_HOST)
    if not ips:
        raise RuntimeError("could not resolve lrclib.net via DoH")
    for ip in ips:
        try:
            r = ccrequests.get(
                f"https://{LRCLIB_HOST}/api{path}",
                params=params,
                impersonate="chrome",
                timeout=15,
                verify=False,  # IP 직결이라 검증 체인 회피. SNI로 올바른 호스트에 붙음
                headers={
                    "Accept": "application/json",
                    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
                },
                # SNI/Host는 원 도메인 유지, 연결만 IP로 고정
                curl_options={CurlOpt.RESOLVE: [f"{LRCLIB_HOST}:443:{ip}"]},
            )
            if r.status_code == 404:
                return None
            if r.status_code != 200:
                continue
            return r.json()
        except Exception:
            continue
    return None


# ── 매칭 품질: 언어 무관 유사도 채점 (해외곡 오매칭/미스 방지) ──
def _norm(s: str | None) -> str:
    s = (s or "").lower()
    # feat./ft./featuring 이후 제거 (괄호 포함/미포함 모두)
    s = re.sub(r"\(feat[^)]*\)", " ", s)
    s = re.sub(r"\b(feat|ft|featuring|prod)\.?\b.*", " ", s)
    # 영숫자/한글/일부 CJK만 남기고 제거
    s = re.sub(r"[^0-9a-z가-힣぀-ヿ一-鿿\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _sim(a: str | None, b: str | None) -> float:
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return 0.0
    return difflib.SequenceMatcher(None, na, nb).ratio()


def _has_hangul(s: str | None) -> bool:
    return bool(re.search(r"[가-힣]", s or ""))


def _score(cand: dict, track: str, artist: str | None, want_hangul: bool = False) -> float:
    ts = _sim(track, cand.get("trackName"))
    if artist:
        score = 0.6 * ts + 0.4 * _sim(artist, cand.get("artistName"))
    else:
        score = ts
    if cand.get("syncedLyrics"):
        score += 0.08  # 싱크 가사 우대
    # 한국 곡이면 한글 가사 우선, 로마자/번역본은 강하게 감점
    if want_hangul:
        lyr = cand.get("syncedLyrics") or cand.get("plainLyrics") or ""
        score += 0.2 if _has_hangul(lyr) else -0.35
    return score


def _normalize(hit: dict, query: dict) -> dict:
    """lrclib 응답 → 프론트 계약 형태."""
    return {
        "synced": hit.get("syncedLyrics"),
        "plain": hit.get("plainLyrics"),
        "matched_track": hit.get("trackName"),
        "matched_artist": hit.get("artistName"),
        "query": query,
    }


def search_lyrics(track: str, artist: str | None = None) -> dict | None:
    """여러 쿼리로 후보를 모은 뒤, 제목/아티스트 유사도로 최선을 고른다.

    이전엔 "첫 synced 항목"을 그냥 택해 해외곡에서 엉뚱한 가사가 붙거나(오매칭),
    정확 매칭만 보다 못 찾는 경우가 많았다. 이제 후보를 모아 채점하고,
    충분히 비슷하지 않으면 차라리 '없음'으로 반환한다(엉뚱한 가사 방지).
    """
    attempts: list[dict] = []
    if artist:
        attempts.append({"track_name": track, "artist_name": artist})
    attempts.append({"track_name": track})
    free = f"{artist} {track}".strip() if artist else track
    attempts.append({"q": free})

    # 후보 수집(중복 제거)
    seen: dict = {}
    for params in attempts:
        data = _lrclib_get("/search", params)
        if not data:
            continue
        for r in (data if isinstance(data, list) else [data]):
            key = r.get("id") or (r.get("trackName"), r.get("artistName"))
            if key not in seen:
                seen[key] = r
    if not seen:
        return None

    cands = list(seen.values())
    # 한국 곡 판단: 쿼리 또는 후보 가사에 한글이 있으면 한글본 우선
    any_hangul = any(
        _has_hangul(c.get("syncedLyrics") or c.get("plainLyrics")) for c in cands
    )
    want_hangul = _has_hangul(track) or _has_hangul(artist) or any_hangul

    def sc(c: dict) -> float:
        return _score(c, track, artist, want_hangul)

    best = max(cands, key=sc)
    best_score = sc(best)

    # 너무 안 맞으면 오매칭 방지를 위해 '없음'
    if best_score < 0.45:
        return None

    # 상위권(0.1 이내)에서 싱크 가사가 있으면 그쪽 우선
    near = [c for c in cands if sc(c) >= best_score - 0.1]
    synced = [c for c in near if c.get("syncedLyrics")]
    if synced:
        best = max(synced, key=sc)

    return _normalize(best, {"track": track, "artist": artist})
