// useMicPitch.ts — 마이크 캡처 + 피치/RMS 프레임 루프 (PLAN §4.1~4.2)
// 성능: 매 프레임 React state를 갱신하지 않고 onFrame 콜백으로만 넘긴다.
// 라우트 이탈/언마운트 시 스트림·AudioContext 정리(§9 cleanup).
import { useCallback, useEffect, useRef, useState } from 'react'
import { startMicCapture, type MicCapture } from '../audio/micCapture'
import { createPitchDetector, computeRms } from '../audio/pitchDetector'
import { hzToMidi } from '../lib/midi'

export interface PitchFrame {
  hz: number
  clarity: number
  rms: number
  midi: number | null // 유성음일 때만 값, 아니면 null
  voiced: boolean
}

// clarity/RMS 게이트 — 민감하게(작은 소리/약한 음정도 잡도록 완화)
const CLARITY_GATE = 0.65
const RMS_GATE = 0.0035

export function useMicPitch(onFrame: (f: PitchFrame) => void) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const captureRef = useRef<MicCapture | null>(null)
  const rafRef = useRef<number>(0)
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null)
  const detectRef = useRef<ReturnType<typeof createPitchDetector> | null>(null)
  const genRef = useRef(0) // 세대 토큰: 진행 중 start()가 stop()/재시작에 의해 무효화되면 폐기
  // onFrame을 ref로 고정해 start를 재생성하지 않음
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  const stop = useCallback(() => {
    genRef.current++ // 대기 중인(awaiting getUserMedia) start()를 무효화 — 누수 방지
    cancelAnimationFrame(rafRef.current)
    captureRef.current?.stop()
    captureRef.current = null
    setRunning(false)
  }, [])

  const start = useCallback(async (): Promise<boolean> => {
    setError(null)
    if (captureRef.current) stop() // 재진입: 기존 캡처/루프 먼저 정리
    const myGen = ++genRef.current
    try {
      const cap = await startMicCapture(2048)
      // 그사이 stop()/재시작이 있었으면 방금 연 스트림을 즉시 닫고 폐기
      if (genRef.current !== myGen) { cap.stop(); return false }
      captureRef.current = cap
      bufRef.current = new Float32Array(cap.analyser.fftSize)
      detectRef.current = createPitchDetector(cap.analyser.fftSize)
      const sampleRate = cap.audioContext.sampleRate // ★ 실제 sampleRate 사용

      // ── 떨림 보정 (전문 보컬앱식: 중앙값 필터 → One Euro Filter) ──────
      // 1) 중앙값 필터(median, 7점): 옥타브 오검출/순간 스파이크에 강건(소수의 튐은 무시됨)
      const WIN = 7
      const win: number[] = []
      const median = (arr: number[]) => {
        const s = [...arr].sort((a, b) => a - b)
        return s[s.length >> 1]
      }
      // 2) One Euro Filter: 정지 시 강하게 스무딩(떨림↓), 빠른 슬라이드엔 덜 스무딩(지연↓)
      const MIN_CUTOFF = 1.3
      const BETA = 0.8
      const D_CUTOFF = 1.0
      let xPrev: number | null = null
      let dxPrev = 0
      let tPrev = 0
      const alpha = (cutoff: number, dt: number) => {
        const tau = 1 / (2 * Math.PI * cutoff)
        return 1 / (1 + tau / dt)
      }
      const oneEuro = (x: number, now: number) => {
        if (xPrev == null) { xPrev = x; tPrev = now; return x }
        const dt = Math.max(0.001, (now - tPrev) / 1000)
        tPrev = now
        const dx = (x - xPrev) / dt
        dxPrev = dxPrev + alpha(D_CUTOFF, dt) * (dx - dxPrev)
        const cutoff = MIN_CUTOFF + BETA * Math.abs(dxPrev)
        const a = alpha(cutoff, dt)
        xPrev = xPrev + a * (x - xPrev)
        return xPrev
      }
      const resetFilter = () => { win.length = 0; xPrev = null; dxPrev = 0 }

      // 보이싱 행오버: 짧은 무성(자음/순간 dip) 구간엔 직전 음을 유지해 트레일이 끊기지 않게
      const HANGOVER_FRAMES = 8 // ≈ 130ms
      let lastMidi: number | null = null
      let sinceVoiced = 0

      const loop = () => {
        if (genRef.current !== myGen) return // 무효화된(오래된) 루프는 스스로 종료
        const buf = bufRef.current!
        cap.readTimeDomain(buf)
        const rms = computeRms(buf)
        const { pitchHz, clarity } = detectRef.current!(buf, sampleRate)
        const rawVoiced = clarity >= CLARITY_GATE && rms >= RMS_GATE && pitchHz > 0

        let midi: number | null = null
        let voiced = rawVoiced
        if (rawVoiced) {
          win.push(hzToMidi(pitchHz))
          if (win.length > WIN) win.shift()
          midi = oneEuro(median(win), performance.now())
          lastMidi = midi
          sinceVoiced = 0
        } else {
          sinceVoiced++
          if (sinceVoiced <= HANGOVER_FRAMES && lastMidi != null) {
            // 짧은 끊김은 직전 음으로 메워 선을 이어줌
            midi = lastMidi
            voiced = true
          } else {
            resetFilter()
            lastMidi = null
          }
        }

        // 소비자(onFrame)에서 예외가 나도 마이크 루프가 죽지 않게 — 한 프레임만 건너뛴다
        try {
          onFrameRef.current({ hz: pitchHz, clarity, rms, midi, voiced })
        } catch (err) {
          console.error('useMicPitch onFrame error (frame skipped):', err)
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
      setRunning(true)
      return true
    } catch (e: any) {
      setError(
        e?.name === 'NotAllowedError'
          ? '마이크 권한이 거부되었습니다. 브라우저 주소창의 마이크 권한을 허용해 주세요.'
          : (e?.message ?? '마이크를 시작할 수 없습니다.'),
      )
      setRunning(false)
      return false
    }
  }, [stop])

  // 채점용으로 열린 마이크 스트림을 그대로 노출(녹음 재사용용)
  const getStream = useCallback((): MediaStream | null => captureRef.current?.stream ?? null, [])

  // 언마운트 정리
  useEffect(() => () => stop(), [stop])

  return { running, error, start, stop, getStream }
}
