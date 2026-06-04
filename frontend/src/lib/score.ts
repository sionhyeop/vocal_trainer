// score.ts — 목표음 기반 cent 채점 + 판정 (PLAN §2.1, §4.3)
// ★ 음치도 흥미를 느끼도록 관대하게 잡음 — 넓은 허용오차 + 높은 점수 바닥.

export type Judgment = 'Perfect' | 'Great' | 'Good' | 'Miss'

// noteScore — 더 관대하게: 바닥 점수↑, 0점 컷오프↑ (입력 불안정 흡수)
export function scoreFromCents(cents: number): number {
  const a = Math.abs(cents)
  if (a > 320) return 0
  return Math.max(45, 100 - a * 0.2)
}

// 판정 임계 — 매우 관대하게: 입력값이 불안정해도 정답으로 잘 인식.
//   (옥타브 오검출은 호출부에서 옥타브-폴딩으로 이미 흡수됨)
export function judge(absCents: number, voiced: boolean): Judgment {
  if (!voiced) return 'Miss'
  if (absCents <= 70) return 'Perfect'   // 45 → 70
  if (absCents <= 130) return 'Great'    // 90 → 130
  if (absCents <= 220) return 'Good'     // 160 → 220 (반음 2개 이상까지 Good)
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
