// breathAnalyzer.ts — 호흡/안정성 근사 분석 (PLAN §4.3)
// 프레임 로그(clarity·rms·midi)에서 음 안정성, 바람 새는 비율, 최장 호흡 구간을 추정한다.
// 정밀(FFT/HNR)은 후속. 여기선 pitchy clarity(주기성≈HNR)와 rms로 근사한다.

export interface SessionFrame {
  tMs: number
  midi: number | null // 유성음일 때만
  clarity: number
  rms: number
  voiced: boolean
}

export interface BreathSummary {
  stability: number // 0~100 (음 안정성: 높을수록 흔들림 적음)
  breathyRatio: number // 0~1 (소리 있는데 음정 불명확 = 바람 새는 비율)
  longestPhraseMs: number // 한 호흡 최장 발성 구간
  voicedRatio: number // 0~1 (전체 중 유성음 비율)
}

const RMS_GATE = 0.008

export function analyzeBreath(frames: SessionFrame[]): BreathSummary {
  if (frames.length === 0) {
    return { stability: 0, breathyRatio: 0, longestPhraseMs: 0, voicedRatio: 0 }
  }

  let voiced = 0
  let soundFrames = 0 // 소리가 있는 프레임(rms 게이트 이상)
  let breathy = 0 // 소리는 있는데 유성음 아님

  // 음 안정성: 연속 유성 구간 내 인접 프레임 midi 변화량 평균
  let jitterSum = 0
  let jitterCount = 0
  let prevMidi: number | null = null

  // 최장 호흡: 연속 유성 구간 길이
  let longest = 0
  let runStart: number | null = null
  let lastVoicedT = 0

  for (const f of frames) {
    if (f.rms >= RMS_GATE) {
      soundFrames++
      if (!f.voiced) breathy++
    }
    if (f.voiced && f.midi != null) {
      voiced++
      if (prevMidi != null) {
        jitterSum += Math.abs(f.midi - prevMidi)
        jitterCount++
      }
      prevMidi = f.midi
      if (runStart == null) runStart = f.tMs
      lastVoicedT = f.tMs
    } else {
      // 유성 구간 종료
      if (runStart != null) longest = Math.max(longest, lastVoicedT - runStart)
      runStart = null
      prevMidi = null
    }
  }
  if (runStart != null) longest = Math.max(longest, lastVoicedT - runStart)

  const meanJitter = jitterCount > 0 ? jitterSum / jitterCount : 1
  // 0.5반음/프레임 흔들림이면 0점, 흔들림 없으면 100점
  const stability = Math.max(0, Math.min(100, 100 - meanJitter * 200))
  const breathyRatio = soundFrames > 0 ? breathy / soundFrames : 0
  const voicedRatio = voiced / frames.length

  return {
    stability: Math.round(stability),
    breathyRatio: Math.round(breathyRatio * 100) / 100,
    longestPhraseMs: Math.round(longest),
    voicedRatio: Math.round(voicedRatio * 100) / 100,
  }
}
