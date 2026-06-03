// scorer.ts — Tier B 실시간 채점 (PLAN §4.3 Tier B)
// 유튜브 임의 곡엔 목표 멜로디(노트맵)가 없다 → 음정 "안정성"으로 채점한다.
// 짧은 윈도우 동안 음이 얼마나 흔들리지 않고 유지되는지(표준편차)로 판정한다.
import { JUDGMENT_POINTS, type Judgment } from '../lib/score'

export interface ScoreState {
  score: number
  combo: number
  maxCombo: number
  lastJudgment: Judgment | null
  counts: Record<Judgment, number>
  ticks: number
}

function stdev(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / n
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  return Math.sqrt(v)
}

export class TierBScorer {
  private window: Array<number | null> = [] // 최근 프레임의 midi(무성음=null)
  private frameInTick = 0
  private readonly windowSize = 16 // ≈ 0.27s @60fps
  private readonly tickFrames = 9 // ≈ 0.15s 마다 1회 판정

  state: ScoreState = {
    score: 0,
    combo: 0,
    maxCombo: 0,
    lastJudgment: null,
    counts: { Perfect: 0, Great: 0, Good: 0, Miss: 0 },
    ticks: 0,
  }

  /** 매 프레임 호출. 새 판정이 나온 tick에서만 Judgment 반환, 아니면 null. */
  addFrame(midi: number | null): Judgment | null {
    this.window.push(midi)
    if (this.window.length > this.windowSize) this.window.shift()

    if (++this.frameInTick < this.tickFrames) return null
    this.frameInTick = 0

    const voiced = this.window.filter((m): m is number => m != null)
    let j: Judgment
    if (voiced.length < this.windowSize * 0.35) {
      j = 'Miss' // 대부분 무성음/무음 → 미스 (기준 완화)
    } else {
      const sd = stdev(voiced) // 반음 단위 표준편차 — 관대하게
      j = sd <= 0.4 ? 'Perfect' : sd <= 0.85 ? 'Great' : sd <= 1.5 ? 'Good' : 'Miss'
    }

    const s = this.state
    s.ticks++
    s.counts[j]++
    s.lastJudgment = j
    if (j === 'Miss') {
      s.combo = 0
    } else {
      s.combo++
      s.maxCombo = Math.max(s.maxCombo, s.combo)
    }
    const comboBonus = 1 + Math.min(s.combo, 25) * 0.02 // 최대 +50%
    s.score += JUDGMENT_POINTS[j] * comboBonus
    return j
  }

  /** 누적 정확도(0~100) */
  accuracy(): number {
    const s = this.state
    if (s.ticks === 0) return 0
    const got = s.counts.Perfect * 100 + s.counts.Great * 80 + s.counts.Good * 55
    return got / s.ticks
  }
}
