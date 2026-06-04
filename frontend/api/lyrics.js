// /api/lyrics — 가사 프록시(서버리스). 백엔드 없는 정적 배포에서 브라우저가 lrclib을 직접
// 호출하면 CORS로 막힌다. 같은 출처로 이 함수를 부르면 서버측에서 lrclib을 받아 최선 가사를 반환.
//   GET ?track=&artist=  → {synced, plain, matched_track, matched_artist} | 404
// (Vercel 네트워크에서 lrclib은 일반 요청으로 도달 가능 — curl_cffi/DoH 불필요. dev는 Python 백엔드 사용.)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function norm(s) {
  let t = (s || '').toLowerCase()
  t = t.replace(/\(feat[^)]*\)/g, ' ').replace(/\b(feat|ft|featuring|prod)\.?\b.*/g, ' ')
  t = t.replace(/[^0-9a-z가-힣぀-ヿ一-鿿\s]/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}
// bigram Dice 유사도 [0,1]
function sim(a, b) {
  const na = norm(a), nb = norm(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const bg = (s) => { const g = []; for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2)); return g }
  const A = bg(na), B = bg(nb)
  if (!A.length || !B.length) return na === nb ? 1 : 0
  const m = new Map()
  for (const g of A) m.set(g, (m.get(g) || 0) + 1)
  let inter = 0
  for (const g of B) { const c = m.get(g); if (c) { inter++; m.set(g, c - 1) } }
  return (2 * inter) / (A.length + B.length)
}
const hasHangul = (s) => /[가-힣]/.test(s || '')
function scoreCand(c, track, artist, wantHangul) {
  const ts = sim(track, c.trackName)
  let score = artist ? 0.65 * ts + 0.35 * sim(artist, c.artistName) : ts
  if (c.syncedLyrics) score += 0.08
  if (wantHangul) score += hasHangul(c.syncedLyrics || c.plainLyrics) ? 0.2 : -0.35
  return score
}

async function lrclibSearch(q, signal) {
  const url = 'https://lrclib.net/api/search?q=' + encodeURIComponent(q)
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal })
  if (!res.ok) return []
  const arr = await res.json()
  return Array.isArray(arr) ? arr : []
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method not allowed' })
  }
  const track = String(req.query?.track || '').trim()
  const artist = String(req.query?.artist || '').trim()
  if (!track) return res.status(400).json({ error: 'track required' })

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    // q 자유검색 변형들 (구조화 검색은 lrclib에서 신뢰 불가). lrclib이 느려 병렬로 호출.
    const queries = artist ? [`${artist} ${track}`, `${track} ${artist}`, track] : [track]
    const results = await Promise.all(queries.map((q) => lrclibSearch(q, ctrl.signal).catch(() => [])))
    clearTimeout(timer)
    const seen = new Map()
    for (const arr of results) {
      for (const r of arr) {
        const k = String(r.id ?? `${r.trackName}|${r.artistName}`)
        if (!seen.has(k)) seen.set(k, r)
      }
    }

    const cands = [...seen.values()]
    if (!cands.length) return res.status(404).json({ error: 'not found' })
    const wantHangul = hasHangul(track) || hasHangul(artist) || cands.some((c) => hasHangul(c.syncedLyrics || c.plainLyrics))
    const sc = (c) => scoreCand(c, track, artist, wantHangul)
    let best = cands.reduce((a, b) => (sc(b) > sc(a) ? b : a))
    if (sc(best) < 0.45) return res.status(404).json({ error: 'no good match' }) // 오매칭 방지
    const near = cands.filter((c) => sc(c) >= sc(best) - 0.1)
    const synced = near.filter((c) => c.syncedLyrics)
    if (synced.length) best = synced.reduce((a, b) => (sc(b) > sc(a) ? b : a))
    return res.status(200).json({
      synced: best.syncedLyrics || null,
      plain: best.plainLyrics || null,
      matched_track: best.trackName,
      matched_artist: best.artistName,
      source: 'lrclib',
    })
  } catch (e) {
    clearTimeout(timer)
    console.error('lyrics proxy failed:', e)
    return res.status(502).json({ error: 'lyrics fetch failed' })
  }
}
