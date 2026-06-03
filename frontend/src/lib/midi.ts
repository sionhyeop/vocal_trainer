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
