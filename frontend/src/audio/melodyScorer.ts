// melodyScorer.ts — Tier A 노트맵 기반 정밀 채점 (PLAN §2.2 Tier A 판정 로직)
// 목표 노트 활성 구간 동안 cent 편차를 누적 → 노트 종료 시 평균 편차 + 커버리지로 판정.
import type { Note } from '../lib/noteMap'
import { centsFromTargetOctaveFolded } from '../lib/midi'
import { JUDGMENT_POINTS, judge, type Judgment } from '../lib/score'
import type { ScoreState } from './scorer'

export class MelodyScorer {
  private notes: Note[]
  private currentIdx = -1
  private acc = { sumAbsCents: 0, voiced: 0, total: 0 }

  state: ScoreState = {
    score: 0,
    combo: 0,
    maxCombo: 0,
    lastJudgment: null,
    counts: { Perfect: 0, Great: 0, Good: 0, Miss: 0 },
    ticks: 0,
  }

  constructor(notes: Note[]) {
    this.notes = [...notes].sort((a, b) => a.startMs - b.startMs)
  }

  // 시간 t(ms)에 활성인 노트 인덱스(없으면 -1). 단조 증가 가정해 앞으로만 탐색.
  private activeIndexAt(t: number): number {
    for (let i = Math.max(0, this.currentIdx); i < this.notes.length; i++) {
      const n = this.notes[i]
      if (t < n.startMs) return -1 // 아직 다음 노트 전(간격)
      if (t >= n.startMs && t < n.endMs) return i
    }
    return -1
  }

  private finalize(idx: number): Judgment {
    const { sumAbsCents, voiced, total } = this.acc
    let j: Judgment
    const coverage = total > 0 ? voiced / total : 0
    if (coverage < 0.15 || voiced === 0) {
      j = 'Miss' // 목표 구간 거의 안 부름 (커버리지 임계 완화 0.25→0.15)
    } else {
      // 평균 cent 편차 기반, score.ts의 관대한 임계 재사용
      j = judge(sumAbsCents / voiced, true)
    }
    const s = this.state
    s.ticks++
    s.counts[j]++
    s.lastJudgment = j
    if (j === 'Miss') s.combo = 0
    else {
      s.combo++
      s.maxCombo = Math.max(s.maxCombo, s.combo)
    }
    const bonus = 1 + Math.min(s.combo, 25) * 0.02
    s.score += JUDGMENT_POINTS[j] * bonus
    this.acc = { sumAbsCents: 0, voiced: 0, total: 0 }
    void idx
    return j
  }

  /** 매 프레임 호출. 노트가 끝나 판정이 확정되면 Judgment 반환, 아니면 null. */
  update(timeMs: number, userMidi: number | null): Judgment | null {
    const idx = this.activeIndexAt(timeMs)
    let finalized: Judgment | null = null

    if (idx !== this.currentIdx) {
      // 이전 노트 종료 → 판정
      if (this.currentIdx >= 0) finalized = this.finalize(this.currentIdx)
      else this.acc = { sumAbsCents: 0, voiced: 0, total: 0 }
      this.currentIdx = idx
    }

    if (idx >= 0) {
      this.acc.total++
      if (userMidi != null) {
        this.acc.voiced++
        // 옥타브 무관 편차 — 마이크 옥타브 오검출을 정답으로 흡수
        this.acc.sumAbsCents += Math.abs(centsFromTargetOctaveFolded(userMidi, this.notes[idx].midiNote))
      }
    }
    return finalized
  }

  /** 곡 종료 시 마지막 노트 마감 */
  flush(): Judgment | null {
    if (this.currentIdx >= 0) {
      const j = this.finalize(this.currentIdx)
      this.currentIdx = -1
      return j
    }
    return null
  }

  accuracy(): number {
    const s = this.state
    if (s.ticks === 0) return 0
    return (s.counts.Perfect * 100 + s.counts.Great * 80 + s.counts.Good * 55) / s.ticks
  }
}
