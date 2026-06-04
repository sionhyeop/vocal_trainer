// storage.ts — 세션 결과 로컬 저장 (local-first §8). 단일 소스(localStorage).
import type { Judgment } from './score'
import type { BreathSummary } from '../audio/breathAnalyzer'
import type { WeakSection } from '../features/result/weakSections'
import type { LyricLine } from './lrcParser'

export interface SessionResult {
  id: string
  videoId: string
  title: string
  mode: 'free' | 'melody'
  score: number
  accuracy: number
  maxCombo: number
  counts: Record<Judgment, number>
  breath: BreathSummary
  weak: WeakSection[]
  dateMs: number
}

const KEY = 'vt:sessions'
const CAP = 50

export function listSessions(): SessionResult[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SessionResult[]) : []
  } catch {
    return []
  }
}

export function saveSession(s: SessionResult): void {
  try {
    const all = [s, ...listSessions()].slice(0, CAP)
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* 용량 초과 등 무시 */
  }
}

export function getSession(id: string): SessionResult | null {
  return listSessions().find((s) => s.id === id) ?? null
}

export function deleteSession(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(listSessions().filter((s) => s.id !== id)))
  } catch {
    /* noop */
  }
}

// ── 프로필 (내 음역대) ──────────────────────────────
export interface Profile {
  lowMidi: number
  highMidi: number
  dateMs: number
}
const PKEY = 'vt:profile'

export function getProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PKEY)
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    return null
  }
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(PKEY, JSON.stringify(p))
  } catch {
    /* noop */
  }
}

// ── 게임 별점 (미니게임 진행) ───────────────────────
// 형태: { [gameId]: { [levelId]: stars 0~3 } }
const GKEY = 'vt:games'
type GameStars = Record<string, Record<string, number>>

function readGames(): GameStars {
  try {
    const raw = localStorage.getItem(GKEY)
    return raw ? (JSON.parse(raw) as GameStars) : {}
  } catch {
    return {}
  }
}

export function getGameStars(gameId: string, levelId: string): number {
  return readGames()[gameId]?.[levelId] ?? 0
}

/** 기존 기록보다 높을 때만 갱신 */
export function setGameStars(gameId: string, levelId: string, stars: number): void {
  try {
    const all = readGames()
    const g = (all[gameId] ??= {})
    if (stars > (g[levelId] ?? 0)) {
      g[levelId] = stars
      localStorage.setItem(GKEY, JSON.stringify(all))
    }
  } catch {
    /* noop */
  }
}

export function totalStars(): number {
  const all = readGames()
  let n = 0
  for (const g of Object.values(all)) for (const s of Object.values(g)) n += s
  return n
}

// ── 가사 확정 캐시 ("정확해요" 체크 시 고정 → 재호출 없이 즉시 사용) ──
export interface LyricsConfirm {
  lines: LyricLine[]
  plain: string | null
  matched: string | null
}
const lyrKey = (videoId: string) => `vt:lyrics:${videoId}`

export function getLyricsConfirm(videoId: string): LyricsConfirm | null {
  try {
    const raw = localStorage.getItem(lyrKey(videoId))
    return raw ? (JSON.parse(raw) as LyricsConfirm) : null
  } catch {
    return null
  }
}
export function saveLyricsConfirm(videoId: string, data: LyricsConfirm): void {
  try { localStorage.setItem(lyrKey(videoId), JSON.stringify(data)) } catch { /* noop */ }
}
export function clearLyricsConfirm(videoId: string): void {
  try { localStorage.removeItem(lyrKey(videoId)) } catch { /* noop */ }
}
