// weakSections.ts — 약점 구간 Top3 (PLAN §4.3) — 편차 큰 구간 추출
import { centsFromTarget, centsFromNearest } from '../../lib/midi'
import type { Note } from '../../lib/noteMap'
import type { LyricLine } from '../../lib/lrcParser'
import type { SessionFrame } from '../../audio/breathAnalyzer'

export interface WeakSection {
  label: string
  timeMs: number // 구간 시작(재생 점프용)
  deviation: number // 평균 편차(cents)
  samples: number
}

const MIN_SAMPLES = 8

function activeNoteAt(notes: Note[], t: number): Note | null {
  for (const n of notes) {
    if (t >= n.startMs && t < n.endMs) return n
    if (t < n.startMs) break
  }
  return null
}

export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface Bucket {
  label: string
  timeMs: number
  sum: number
  count: number
}

export function computeWeakSections(
  frames: SessionFrame[],
  lines: LyricLine[],
  notes: Note[] | null,
): WeakSection[] {
  const useLines = lines.length > 0
  const buckets = new Map<number, Bucket>()

  for (const f of frames) {
    if (!f.voiced || f.midi == null) continue

    // 편차: 멜로디 모드는 목표 노트 대비, 아니면 가장 가까운 반음 대비
    let dev: number
    if (notes && notes.length > 0) {
      const n = activeNoteAt(notes, f.tMs)
      if (!n) continue
      dev = Math.abs(centsFromTarget(f.midi, n.midiNote))
    } else {
      dev = Math.abs(centsFromNearest(f.midi))
    }

    // 버킷 키
    let key: number
    let label: string
    let timeMs: number
    if (useLines) {
      key = findLineIndexLocal(lines, f.tMs / 1000)
      if (key < 0) continue
      label = lines[key].text || '♪'
      timeMs = Math.round(lines[key].time * 1000)
    } else {
      key = Math.floor(f.tMs / 5000)
      timeMs = key * 5000
      label = `${fmtTime(timeMs)} 구간`
    }

    let b = buckets.get(key)
    if (!b) {
      b = { label, timeMs, sum: 0, count: 0 }
      buckets.set(key, b)
    }
    b.sum += dev
    b.count++
  }

  return Array.from(buckets.values())
    .filter((b) => b.count >= MIN_SAMPLES)
    .map((b) => ({ label: b.label, timeMs: b.timeMs, deviation: Math.round(b.sum / b.count), samples: b.count }))
    .sort((a, b) => b.deviation - a.deviation)
    .slice(0, 3)
}

// lrcParser.findLineIndex와 동일(의존 최소화 위해 로컬)
function findLineIndexLocal(lines: LyricLine[], t: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= t) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}
