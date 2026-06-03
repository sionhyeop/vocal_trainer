// score.ts — 목표음 기반 cent 채점 + 판정 (PLAN §2.1, §4.3)
// ★ 음치도 흥미를 느끼도록 관대하게 잡음 — 넓은 허용오차 + 높은 점수 바닥.

export type Judgment = 'Perfect' | 'Great' | 'Good' | 'Miss'

// noteScore = max(40, 100 - |cents| * 0.25) → 100c=75, 200c=50, 그 외도 최소 40점 바닥(완전 빗나가면 0)
export function scoreFromCents(cents: number): number {
  const a = Math.abs(cents)
  if (a > 250) return 0 // 반음(100c)을 한참 넘게 벗어나면 0
  return Math.max(40, 100 - a * 0.25)
}

// 판정 임계 — 관대하게: 반음(100c) 안쪽이면 Good 이상
export function judge(absCents: number, voiced: boolean): Judgment {
  if (!voiced) return 'Miss'
  if (absCents <= 45) return 'Perfect'
  if (absCents <= 90) return 'Great'
  if (absCents <= 160) return 'Good'
  return 'Miss'
}

export const JUDGMENT_COLOR: Record<Judgment, string> = {
  Perfect: 'var(--color-primary)',
  Great: 'var(--color-macaw)',
  Good: 'var(--color-bee)',
  Miss: 'var(--color-cardinal)',
}

// 판정별 획득 점수 (Good도 후하게)
export const JUDGMENT_POINTS: Record<Judgment, number> = {
  Perfect: 100,
  Great: 80,
  Good: 55,
  Miss: 0,
}
