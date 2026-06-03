// pitchDetector.ts — pitchy(McLeod MPM) 래퍼 (PLAN §4.2)
import { PitchDetector } from 'pitchy'

export interface PitchReading {
  pitchHz: number
  clarity: number // 0~1, 유성음 신뢰도
}

/** bufferSize는 analyser.fftSize와 일치시킨다(기본 2048). */
export function createPitchDetector(bufferSize = 2048) {
  const detector = PitchDetector.forFloat32Array(bufferSize)
  detector.minVolumeDecibels = -40 // 너무 작은 입력은 무시

  // ★ sampleRate는 하드코딩 금지 — 호출부에서 실제 AudioContext.sampleRate를 넘긴다(§4.2/§13)
  return function detect(input: Float32Array, sampleRate: number): PitchReading {
    const [pitchHz, clarity] = detector.findPitch(input, sampleRate)
    return { pitchHz, clarity }
  }
}

/** 시간영역 버퍼의 RMS 진폭 (마이크 살아있음 표시용, §4.2) */
export function computeRms(buffer: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
  return Math.sqrt(sum / buffer.length)
}
