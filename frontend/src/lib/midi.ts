// midi.ts — Hz ↔ MIDI ↔ 음이름 ↔ cents 변환 (PLAN §4.2)
// 주의: pitchy의 findPitch에는 실제 sampleRate를 넘겨야 Hz가 맞다(§4.2). 하지만
//       Hz→MIDI 변환 자체는 sampleRate와 무관하다(아래 함수들은 Hz만 받는다).

export const A4_HZ = 440
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / A4_HZ)
}

export function midiToHz(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - 69) / 12)
}

/** 정수 MIDI → "A4", "C#5" 형태 음이름 */
export function midiToNoteName(midi: number): string {
  const m = Math.round(midi)
  const name = NOTE_NAMES[((m % 12) + 12) % 12]
  const octave = Math.floor(m / 12) - 1
  return `${name}${octave}`
}

/** 가장 가까운 반음 대비 편차(cents) */
export function centsFromNearest(midi: number): number {
  return (midi - Math.round(midi)) * 100
}

/** 목표음(targetMidi) 대비 편차(cents) */
export function centsFromTarget(midi: number, targetMidi: number): number {
  return (midi - targetMidi) * 100
}

/**
 * 옥타브 무관 편차(cents) — 12반음(옥타브) 차이를 동일 음으로 간주해 접는다.
 * 마이크의 가장 흔한 불안정(저음/배음으로 인한 옥타브 오검출)을 정답으로 관대하게 인식하기 위함.
 * 반환은 [-600, 600] cents 범위의 가장 가까운 동음 편차.
 */
export function centsFromTargetOctaveFolded(midi: number, targetMidi: number): number {
  let d = ((midi - targetMidi) % 12 + 12) % 12 // 0..12 반음
  if (d > 6) d -= 12 // -6..6 (가장 가까운 동음)
  return d * 100
}
