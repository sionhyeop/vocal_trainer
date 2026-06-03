// MicTestPage.tsx — 마이크 입력 진단 (핵심 기능 점검용)
// 게이트 없이 원시값(RMS·Hz·clarity) + 실제 적용된 트랙 설정 + 배경음(MR 유입) 측정.
import { useCallback, useEffect, useRef, useState } from 'react'
import NavBar from '../../components/NavBar'
import { startMicCapture, type MicCapture } from '../../audio/micCapture'
import { createPitchDetector, computeRms } from '../../audio/pitchDetector'
import { hzToMidi, midiToNoteName } from '../../lib/midi'

interface Settings {
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
  sampleRate?: number
  label?: string
}

interface Live {
  rms: number
  hz: number
  clarity: number
  note: string
  voiced: boolean
}

export default function MicTestPage() {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [live, setLive] = useState<Live>({ rms: 0, hz: 0, clarity: 0, note: '–', voiced: false })
  const [peak, setPeak] = useState(0)
  const [baseline, setBaseline] = useState<number | null>(null)
  const [measuring, setMeasuring] = useState(false)

  const capRef = useRef<MicCapture | null>(null)
  const rafRef = useRef(0)
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null)
  const detectRef = useRef<ReturnType<typeof createPitchDetector> | null>(null)
  const peakRef = useRef(0)
  const frameRef = useRef(0)
  const baselineRef = useRef<{ active: boolean; until: number; max: number }>({ active: false, until: 0, max: 0 })

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    capRef.current?.stop()
    capRef.current = null
    setRunning(false)
  }, [])

  const start = useCallback(async () => {
    setError('')
    setPeak(0)
    peakRef.current = 0
    try {
      const cap = await startMicCapture(2048)
      capRef.current = cap
      bufRef.current = new Float32Array(cap.analyser.fftSize)
      detectRef.current = createPitchDetector(cap.analyser.fftSize)
      const sr = cap.audioContext.sampleRate

      const track = cap.stream.getAudioTracks()[0]
      const s = track?.getSettings?.() ?? {}
      setSettings({
        echoCancellation: s.echoCancellation as boolean | undefined,
        noiseSuppression: s.noiseSuppression as boolean | undefined,
        autoGainControl: s.autoGainControl as boolean | undefined,
        sampleRate: sr,
        label: track?.label,
      })

      const loop = () => {
        const buf = bufRef.current!
        cap.readTimeDomain(buf)
        const rms = computeRms(buf)
        const { pitchHz, clarity } = detectRef.current!(buf, sr)
        if (rms > peakRef.current) {
          peakRef.current = rms
          setPeak(rms)
        }
        if (baselineRef.current.active) {
          baselineRef.current.max = Math.max(baselineRef.current.max, rms)
          if (performance.now() >= baselineRef.current.until) {
            baselineRef.current.active = false
            setBaseline(baselineRef.current.max)
            setMeasuring(false)
          }
        }
        if (frameRef.current++ % 4 === 0) {
          const voiced = clarity >= 0.65 && rms >= 0.0035 && pitchHz > 0
          setLive({
            rms,
            hz: pitchHz,
            clarity,
            note: pitchHz > 0 ? midiToNoteName(hzToMidi(pitchHz)) : '–',
            voiced,
          })
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
      setRunning(true)
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? '마이크 권한이 거부되었습니다. 주소창 자물쇠 → 마이크 허용.' : (e?.message ?? '마이크 시작 실패'))
    }
  }, [])

  const measureBaseline = useCallback(() => {
    if (!running) return
    setMeasuring(true)
    setBaseline(null)
    baselineRef.current = { active: true, until: performance.now() + 2500, max: 0 }
  }, [running])

  useEffect(() => () => stop(), [stop])

  // 종합 판정
  let verdict = ''
  let verdictColor = 'var(--color-text-secondary)'
  if (running) {
    if (peak < 0.005) {
      verdict = '입력이 거의 없습니다. 마이크가 음소거이거나 잘못된 장치일 수 있어요.'
      verdictColor = 'var(--color-cardinal)'
    } else if (baseline != null && baseline > 0.02) {
      verdict = `조용할 때도 입력(${baseline.toFixed(3)})이 큽니다 → 스피커의 MR/배경음이 마이크로 새는 중. 유선 이어폰을 쓰세요.`
      verdictColor = 'var(--color-fox)'
    } else if (live.voiced) {
      verdict = `정상 — ${live.note} 감지 중 (clarity ${live.clarity.toFixed(2)})`
      verdictColor = 'var(--color-primary)'
    } else {
      verdict = '마이크는 살아있습니다. 소리를 내면 음이 잡힙니다.'
      verdictColor = 'var(--color-macaw)'
    }
  }

  // 통화 모드 통일: EC/NS는 켜는 게 정상(MR 유입 제거). 경고 안 함.
  const badEcNs = false

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-lg) var(--space-gutter)' }}>
      <NavBar title="마이크 진단" />
      <h1 style={{ fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)', color: 'var(--color-primary)', margin: '0 0 var(--space-md)' }}>
        🎤 마이크 진단
      </h1>

      {!running ? (
        <button onClick={start} style={primaryBtn}>마이크 시작</button>
      ) : (
        <button onClick={stop} style={{ ...primaryBtn, background: 'var(--color-cardinal)', boxShadow: '0 4px 0 #d33' }}>정지</button>
      )}
      {error && <p style={{ color: 'var(--color-cardinal)' }}>{error}</p>}

      {running && (
        <>
          {/* 종합 판정 */}
          <div style={{ ...card, borderColor: verdictColor, marginTop: 'var(--space-md)' }}>
            <div style={{ fontWeight: 'var(--font-weight-bold)', color: verdictColor }}>● {verdict}</div>
          </div>

          {/* 입력 레벨 */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-caption)', marginBottom: 4 }}>
              <span>입력 레벨 (RMS)</span>
              <span style={{ fontFamily: 'monospace' }}>{live.rms.toFixed(4)} · 최대 {peak.toFixed(3)}</span>
            </div>
            <div style={{ height: 16, background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, live.rms * 400)}%`, background: live.rms > 0.005 ? 'var(--color-primary)' : 'var(--color-border)', transition: 'width 60ms linear' }} />
            </div>
          </div>

          {/* 감지 음정 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--space-xs)' }}>
            <Stat label="감지 음" value={live.note} color={live.voiced ? 'var(--color-primary)' : 'var(--color-text)'} />
            <Stat label="주파수" value={live.hz > 0 ? `${live.hz.toFixed(1)}Hz` : '–'} />
            <Stat label="신뢰도(clarity)" value={live.clarity.toFixed(2)} color={live.clarity >= 0.8 ? 'var(--color-primary)' : 'var(--color-fox)'} />
          </div>

          {/* 배경음/MR 유입 측정 */}
          <div style={card}>
            <div style={{ fontWeight: 'var(--font-weight-bold)', marginBottom: 4 }}>배경음 / MR 유입 측정</div>
            <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
              <b>조용히 한 상태</b>(또는 MR만 틀어둔 상태)에서 누르고 2.5초간 가만히 → 배경 입력을 측정합니다.
            </div>
            <button onClick={measureBaseline} disabled={measuring} style={ghostBtn}>{measuring ? '측정 중… (조용히)' : '🔇 배경음 2.5초 측정'}</button>
            {baseline != null && (
              <div style={{ marginTop: 'var(--space-xs)', fontSize: 'var(--font-size-caption)' }}>
                배경 최대 입력: <b style={{ fontFamily: 'monospace' }}>{baseline.toFixed(4)}</b> —{' '}
                <span style={{ color: baseline > 0.02 ? 'var(--color-fox)' : 'var(--color-primary)' }}>
                  {baseline > 0.02 ? 'MR/소음 유입 있음(이어폰 권장)' : '깨끗함'}
                </span>
              </div>
            )}
          </div>

          {/* 트랙 설정 */}
          {settings && (
            <div style={card}>
              <div style={{ fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-xs)' }}>마이크 설정 (실제 적용값)</div>
              <Row k="장치" v={settings.label || '(이름 없음)'} />
              <Row k="echoCancellation" v={String(settings.echoCancellation)} warn={settings.echoCancellation === true} want="false" />
              <Row k="noiseSuppression" v={String(settings.noiseSuppression)} warn={settings.noiseSuppression === true} want="false" />
              <Row k="autoGainControl" v={String(settings.autoGainControl)} />
              <Row k="sampleRate" v={`${settings.sampleRate}Hz`} />
              {badEcNs && (
                <p style={{ color: 'var(--color-fox)', fontSize: 'var(--font-size-caption)', margin: '6px 0 0' }}>
                  ⚠ 브라우저가 EC/NS를 강제로 켰습니다 → 롱톤이 깎이고 음정이 흔들릴 수 있습니다(크롬 권장).
                </p>
              )}
            </div>
          )}
        </>
      )}

      <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-md)' }}>
        정상이라면: 소리 낼 때 RMS 바가 크게 움직이고 "감지 음"이 바뀝니다. 조용할 때 RMS가 거의 0이어야 하고, MR을 스피커로 틀면 조용히 해도 RMS가 올라갑니다(=마이크에 MR이 섞임 → 채점 저하 → 이어폰 사용).
      </p>
    </main>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ ...card, textAlign: 'center', padding: 'var(--space-sm)' }}>
      <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 'var(--font-size-subhead)', fontWeight: 'var(--font-weight-heavy)', color: color ?? 'var(--color-text)' }}>{value}</div>
    </div>
  )
}

function Row({ k, v, warn, want }: { k: string; v: string; warn?: boolean; want?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-caption)', padding: '2px 0' }}>
      <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{k}</span>
      <span style={{ fontFamily: 'monospace', fontWeight: 'var(--font-weight-bold)', color: warn ? 'var(--color-fox)' : 'var(--color-text)' }}>
        {v}{warn && want ? ` (권장 ${want})` : ''}
      </span>
    </div>
  )
}

const card: React.CSSProperties = {
  border: 'var(--border-width) solid var(--color-border)', borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-md)', marginTop: 'var(--space-sm)',
}
const primaryBtn: React.CSSProperties = {
  padding: 'var(--space-sm) var(--space-lg)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text-inverse)', background: 'var(--color-primary)', border: 'none',
  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-button)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
const ghostBtn: React.CSSProperties = {
  padding: '8px 16px', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text)', background: 'var(--color-bg)', border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
