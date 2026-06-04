// score.ts — 목표음 기반 cent 채점 + 판정 (PLAN §2.1, §4.3)
// ★ 음치도 흥미를 느끼도록 관대하게 잡음 — 넓은 허용오차 + 높은 점수 바닥.

export type Judgment = 'Perfect' | 'Great' | 'Good' | 'Miss'

// noteScore — 훨씬 후하게: 바닥 점수↑↑, 컷오프↑, 기울기 완만(입력 불안정 흡수)
export function scoreFromCents(cents: number): number {
  const a = Math.abs(cents)
  if (a > 450) return 0
  return Math.max(62, 100 - a * 0.12)
}

// 판정 임계 — 훨씬 관대하게: 거의 반음까지 Perfect, 3반음 가까이까지 Good.
//   (옥타브 오검출은 호출부에서 옥타브-폴딩으로 이미 흡수됨)
export function judge(absCents: number, voiced: boolean): Judgment {
  if (!voiced) return 'Miss'
  if (absCents <= 95) return 'Perfect'   // 70 → 95 (거의 반음까지)
  if (absCents <= 175) return 'Great'    // 130 → 175
  if (absCents <= 300) return 'Good'     // 220 → 300 (반음 3개 가까이까지 Good)
  return 'Miss'
}

export const JUDGMENT_COLOR: Record<Judgment, string> = {
  Perfect: 'var(--color-primary)',
  Great: 'var(--color-macaw)',
  Good: 'var(--color-bee)',
  Miss: 'var(--color-cardinal)',
}

// 판정별 획득 점수 (Great·Good도 훨씬 후하게)
export const JUDGMENT_POINTS: Record<Judgment, number> = {
  Perfect: 100,
  Great: 90,
  Good: 74,
  Miss: 0,
}
