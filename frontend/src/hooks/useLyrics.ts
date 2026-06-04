// useLyrics.ts — 가사 조회 훅 (PLAN §6.5)
// 백엔드(VITE_LYRICS_API) 우선, 네트워크 완전 실패 시 브라우저 직접 lrclib fallback.
// 경쟁 조건은 abort 플래그로 차단. 의존성은 "원시값"으로만 (객체 넣으면 무한 루프).
import { useEffect, useState } from 'react'
import { parseLrc, mergeShortLines, type LyricLine } from '../lib/lrcParser'
import type { ParsedTitle } from '../lib/titleParser'
import { getLyricsConfirm } from '../lib/storage'

export type LyricsStatus = 'idle' | 'loading' | 'ok' | 'notfound' | 'error'

export interface LyricsResult {
  lines: LyricLine[] // 싱크 가사 (없으면 빈 배열)
  plain: string | null
  status: LyricsStatus
  matched: string | null // "artist - track"
  source: 'backend' | 'direct' | null
  errorMessage?: string
}

const API = import.meta.env.VITE_LYRICS_API as string | undefined

interface LyricsApiResponse {
  synced?: string | null
  plain?: string | null
  matched_track?: string | null
  matched_artist?: string | null
}

async function fetchBackend(
  track: string,
  artist: string | undefined,
  signal: AbortSignal,
): Promise<{ data: LyricsApiResponse | null; status: number }> {
  const url = new URL(`${API}/api/lyrics`)
  url.searchParams.set('track', track)
  if (artist) url.searchParams.set('artist', artist)
  const res = await fetch(url.toString(), { signal })
  if (res.status === 404) return { data: null, status: 404 } // 가사 없음 (에러 아님)
  if (!res.ok) throw new Error(`backend ${res.status}`)
  return { data: await res.json(), status: 200 }
}

// ── 브라우저 직접 lrclib 검색 + 랭킹 (백엔드와 동일 품질) ──────────────
// lrclib의 구조화 검색(artist_name)은 0을 반환하는 경우가 많아 q 자유검색을 주로 쓰고,
// 후보를 모아 제목/아티스트 유사도 + 싱크/한글 가중으로 최선을 고른다(엉뚱한 가사 방지).
function _norm(s: string | undefined | null): string {
  let t = (s || '').toLowerCase()
  t = t.replace(/\(feat[^)]*\)/g, ' ').replace(/\b(feat|ft|featuring|prod)\.?\b.*/g, ' ')
  t = t.replace(/[^0-9a-z가-힣぀-ヿ一-鿿\s]/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}
// bigram Dice 유사도 [0,1] (difflib ratio 근사)
function _sim(a?: string | null, b?: string | null): number {
  const na = _norm(a), nb = _norm(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const bg = (s: string) => { const g: string[] = []; for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2)); return g }
  const A = bg(na), B = bg(nb)
  if (!A.length || !B.length) return na === nb ? 1 : 0
  const m = new Map<string, number>()
  for (const g of A) m.set(g, (m.get(g) || 0) + 1)
  let inter = 0
  for (const g of B) { const c = m.get(g); if (c) { inter++; m.set(g, c - 1) } }
  return (2 * inter) / (A.length + B.length)
}
function _hasHangul(s?: string | null): boolean { return /[가-힣]/.test(s || '') }
function _scoreCand(c: any, track: string, artist: string | undefined, wantHangul: boolean): number {
  const ts = _sim(track, c.trackName)
  let score = artist ? 0.65 * ts + 0.35 * _sim(artist, c.artistName) : ts
  if (c.syncedLyrics) score += 0.08
  if (wantHangul) score += _hasHangul(c.syncedLyrics || c.plainLyrics) ? 0.2 : -0.35
  return score
}

async function fetchDirect(
  track: string,
  artist: string | undefined,
  signal: AbortSignal,
): Promise<LyricsApiResponse | null> {
  // q 자유검색 변형들 (구조화 검색은 lrclib에서 신뢰 불가)
  const queries = artist ? [`${artist} ${track}`, `${track} ${artist}`, track] : [track]
  const seen = new Map<string, any>()
  for (const q of queries) {
    try {
      const url = new URL('https://lrclib.net/api/search')
      url.searchParams.set('q', q)
      const res = await fetch(url.toString(), { signal })
      if (!res.ok) continue
      const arr = await res.json()
      for (const r of (Array.isArray(arr) ? arr : [])) {
        const key = String(r.id ?? `${r.trackName}|${r.artistName}`)
        if (!seen.has(key)) seen.set(key, r)
      }
    } catch {
      if (signal.aborted) return null
    }
  }
  const cands = [...seen.values()]
  if (!cands.length) return null

  const wantHangul = _hasHangul(track) || _hasHangul(artist) ||
    cands.some((c) => _hasHangul(c.syncedLyrics || c.plainLyrics))
  const sc = (c: any) => _scoreCand(c, track, artist, wantHangul)
  let best = cands.reduce((a, b) => (sc(b) > sc(a) ? b : a))
  const bestScore = sc(best)
  if (bestScore < 0.45) return null // 충분히 안 맞으면 차라리 없음(오매칭 방지)
  // 상위권(0.1 이내)에서 싱크 가사 우선
  const near = cands.filter((c) => sc(c) >= bestScore - 0.1)
  const synced = near.filter((c) => c.syncedLyrics)
  if (synced.length) best = synced.reduce((a, b) => (sc(b) > sc(a) ? b : a))
  return {
    synced: best.syncedLyrics,
    plain: best.plainLyrics,
    matched_track: best.trackName,
    matched_artist: best.artistName,
  }
}

const EMPTY: LyricsResult = {
  lines: [],
  plain: null,
  status: 'idle',
  matched: null,
  source: null,
}

export function useLyrics(parsed: ParsedTitle | null, videoId?: string, refreshKey = 0): LyricsResult {
  const [result, setResult] = useState<LyricsResult>(EMPTY)

  // 원시값으로 분해 (객체 참조를 의존성에 넣으면 매 렌더 새 참조 → 무한 루프)
  const trackName = parsed?.trackName ?? ''
  const artistName = parsed?.artistName ?? ''
  const altTrack = parsed?.alternate?.trackName ?? ''
  const altArtist = parsed?.alternate?.artistName ?? ''
  const vid = videoId ?? ''

  useEffect(() => {
    if (!trackName && !vid) {
      setResult(EMPTY)
      return
    }
    const controller = new AbortController()
    let aborted = false
    setResult({ ...EMPTY, status: 'loading' })

    ;(async () => {
      // 0) "정확해요"로 확정된 로컬 캐시 우선 — API 재호출 없이 즉시 사용
      if (vid) {
        const c = getLyricsConfirm(vid)
        if (c && (c.lines.length || c.plain)) {
          setResult({ lines: c.lines, plain: c.plain, status: 'ok', matched: c.matched, source: 'direct' })
          return
        }
      }
      // 0b) 관리자 고정 가사(정적) — /lyrics/<videoId>.json
      if (vid) {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}lyrics/${vid}.json`, { signal: controller.signal })
          if (res.ok) {
            const d = (await res.json()) as { synced?: string | null; plain?: string | null }
            if (!aborted && (d.synced || d.plain)) {
              setResult({
                lines: d.synced ? mergeShortLines(parseLrc(d.synced)) : [],
                plain: d.plain ?? null,
                status: 'ok',
                matched: '고정 가사',
                source: 'direct',
              })
              return
            }
          }
        } catch {
          if (aborted || controller.signal.aborted) return
          /* 고정 가사 없음 → 자동 흐름 */
        }
      }
      if (!trackName) { if (!aborted) setResult({ ...EMPTY, status: 'notfound' }); return }
      // 시도 조합: 주추정 → alternate (track/artist 뒤바뀜 대비)
      const attempts: Array<{ track: string; artist?: string }> = [
        { track: trackName, artist: artistName || undefined },
      ]
      if (altTrack && (altTrack !== trackName || altArtist !== artistName)) {
        attempts.push({ track: altTrack, artist: altArtist || undefined })
      }

      for (const a of attempts) {
        try {
          if (API) {
            const { data, status } = await fetchBackend(
              a.track,
              a.artist,
              controller.signal,
            )
            if (aborted) return
            if (status === 404 || !data) continue
            if (data.synced || data.plain) {
              setResult({
                lines: data.synced ? mergeShortLines(parseLrc(data.synced)) : [],
                plain: data.plain ?? null,
                status: 'ok',
                matched:
                  [data.matched_artist, data.matched_track]
                    .filter(Boolean)
                    .join(' - ') || null,
                source: 'backend',
              })
              return
            }
          } else {
            const data = await fetchDirect(a.track, a.artist, controller.signal)
            if (aborted) return
            if (data && (data.synced || data.plain)) {
              setResult({
                lines: data.synced ? mergeShortLines(parseLrc(data.synced)) : [],
                plain: data.plain ?? null,
                status: 'ok',
                matched:
                  [data.matched_artist, data.matched_track]
                    .filter(Boolean)
                    .join(' - ') || null,
                source: 'direct',
              })
              return
            }
          }
        } catch (e) {
          if (aborted || controller.signal.aborted) return
          // 백엔드 네트워크 완전 실패 → 직접 lrclib fallback 1회
          if (API) {
            try {
              const data = await fetchDirect(a.track, a.artist, controller.signal)
              if (aborted) return
              if (data && (data.synced || data.plain)) {
                setResult({
                  lines: data.synced ? mergeShortLines(parseLrc(data.synced)) : [],
                  plain: data.plain ?? null,
                  status: 'ok',
                  matched:
                    [data.matched_artist, data.matched_track]
                      .filter(Boolean)
                      .join(' - ') || null,
                  source: 'direct',
                })
                return
              }
            } catch {
              /* fall through */
            }
          }
        }
      }
      if (!aborted) setResult({ ...EMPTY, status: 'notfound' })
    })()

    return () => {
      aborted = true
      controller.abort()
    }
  }, [trackName, artistName, altTrack, altArtist, vid, refreshKey])

  return result
}
