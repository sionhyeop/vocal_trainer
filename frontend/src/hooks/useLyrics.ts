// useLyrics.ts — 가사 조회 훅 (PLAN §6.5)
// 백엔드(VITE_LYRICS_API) 우선, 네트워크 완전 실패 시 브라우저 직접 lrclib fallback.
// 경쟁 조건은 abort 플래그로 차단. 의존성은 "원시값"으로만 (객체 넣으면 무한 루프).
import { useEffect, useState } from 'react'
import { parseLrc, mergeShortLines, type LyricLine } from '../lib/lrcParser'
import type { ParsedTitle } from '../lib/titleParser'

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

// 브라우저 직접 lrclib (백엔드 완전 실패 시 안전망)
async function fetchDirect(
  track: string,
  artist: string | undefined,
  signal: AbortSignal,
): Promise<LyricsApiResponse | null> {
  const url = new URL('https://lrclib.net/api/search')
  url.searchParams.set('track_name', track)
  if (artist) url.searchParams.set('artist_name', artist)
  const res = await fetch(url.toString(), { signal })
  if (!res.ok) return null
  const arr = await res.json()
  const list: any[] = Array.isArray(arr) ? arr : []
  const hit = list.find((d) => d.syncedLyrics) ?? list[0]
  if (!hit) return null
  return {
    synced: hit.syncedLyrics,
    plain: hit.plainLyrics,
    matched_track: hit.trackName,
    matched_artist: hit.artistName,
  }
}

const EMPTY: LyricsResult = {
  lines: [],
  plain: null,
  status: 'idle',
  matched: null,
  source: null,
}

export function useLyrics(parsed: ParsedTitle | null, videoId?: string): LyricsResult {
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
      // 0) 관리자 고정 가사(정적) 우선 — /lyrics/<videoId>.json
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
  }, [trackName, artistName, altTrack, altArtist, vid])

  return result
}
