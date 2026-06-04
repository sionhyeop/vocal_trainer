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
  // 기본값을 "끊김 최소화" 쪽으로: 짧은 노트도 살리고(minNoteMs↓), 같은 음 병합 폭↑,
  // 빈틈 브릿지 임계↑(연속 피치). connectGapMs 이하 간격은 앞 음을 끌어 메운다.
  const { smoothWindow = 5, minNoteMs = 60, maxGapMs = 120, connectGapMs = 1200 } = opts
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

  return bridgeGaps(notes, connectGapMs)
}

/**
 * 빈 피치 자동 연결(갭필) 알고리즘 — "보컬에 맞게 끊김없이 이어지도록".
 *
 * 추출 곡선은 자음·숨·순간 F0 드롭아웃 때문에 노트 사이에 빈틈이 생긴다. 그대로 두면 노래방
 * 리본의 목표 막대가 깜빡이며 끊긴다. 이 함수는 인접 노트 사이 간격이 `bridgeMs` 이하이면
 * **앞 노트를 다음 노트 시작까지 끌어(sustain)** 빈틈을 없앤다 — 직전 음을 유지하다 다음
 * 음의 진짜 onset에서 깔끔히 전환하므로 채점 정합(타이밍)도 보존된다.
 *
 * 단, `bridgeMs`(기본 1.2초)를 넘는 큰 간격은 *실제 쉼표/간주*로 보고 메우지 않는다
 * (없는 발성을 채점하지 않기 위함). 임계만 키우면 더 공격적으로 이을 수 있다.
 */
export function bridgeGaps(notes: Note[], bridgeMs = 1200): Note[] {
  for (let i = 0; i < notes.length - 1; i++) {
    const gap = notes[i + 1].startMs - notes[i].endMs
    if (gap > 0 && gap <= bridgeMs) notes[i].endMs = notes[i + 1].startMs
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
