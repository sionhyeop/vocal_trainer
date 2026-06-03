// contourToNoteMap.ts — 음정 곡선(가이드 녹음/추출) → 노트맵 자동 생성 (방법 B/A 공통)
// 단성 피치 샘플들을 부드럽게 한 뒤 반음 단위로 양자화하고, 안정 구간을 노트로 묶는다.
import type { Note, NoteMap } from './noteMap'

export interface ContourSample {
  tMs: number
  midi: number // 유성음 샘플만 (호출부에서 무성음 제외)
}

export interface SegmentOptions {
  smoothWindow?: number // 이동평균 창(샘플 수)
  minNoteMs?: number // 이보다 짧은 노트는 버림
  maxGapMs?: number // 같은 음으로 이어붙일 최대 간격
  connectGapMs?: number // 인접 노트 사이 이 간격 이하면 끝을 늘려 빈틈 제거
}

// 이동평균으로 비브라토/순간 흔들림 완화
function smooth(values: number[], win: number): number[] {
  if (win <= 1) return values.slice()
  const out: number[] = []
  const half = Math.floor(win / 2)
  for (let i = 0; i < values.length; i++) {
    let sum = 0
    let cnt = 0
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      sum += values[j]
      cnt++
    }
    out.push(sum / cnt)
  }
  return out
}

/** 정렬된 contour 샘플 → 노트 배열 */
export function contourToNotes(samples: ContourSample[], opts: SegmentOptions = {}): Note[] {
  const { smoothWindow = 5, minNoteMs = 90, maxGapMs = 90, connectGapMs = 350 } = opts
  if (samples.length === 0) return []

  const sorted = [...samples].sort((a, b) => a.tMs - b.tMs)
  const smoothed = smooth(sorted.map((s) => s.midi), smoothWindow)
  const q = smoothed.map((m) => Math.round(m)) // 반음 양자화

  const notes: Note[] = []
  let note = q[0]
  let start = sorted[0].tMs
  let lastT = sorted[0].tMs

  const close = (endMs: number) => {
    if (endMs - start >= minNoteMs) {
      notes.push({ startMs: Math.round(start), endMs: Math.round(endMs), midiNote: note })
    }
  }

  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i].tMs
    const sameNote = q[i] === note
    const smallGap = t - lastT <= maxGapMs
    if (sameNote && smallGap) {
      lastT = t
    } else {
      close(lastT)
      note = q[i]
      start = t
      lastT = t
    }
  }
  close(lastT)

  // 인접 노트 사이 작은 빈틈 메우기 — 앞 노트 끝을 다음 노트 시작까지 늘림
  for (let i = 0; i < notes.length - 1; i++) {
    const gap = notes[i + 1].startMs - notes[i].endMs
    if (gap > 0 && gap <= connectGapMs) notes[i].endMs = notes[i + 1].startMs
  }
  return notes
}

/** 노트맵 객체 빌드 */
export function buildNoteMap(
  id: string,
  title: string,
  samples: ContourSample[],
  opts?: SegmentOptions & { youtubeId?: string; license?: string },
): NoteMap {
  return {
    id,
    title,
    license: opts?.license ?? 'user-guide',
    youtubeId: opts?.youtubeId,
    notes: contourToNotes(samples, opts),
  }
}
