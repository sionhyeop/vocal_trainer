// EchoGame.tsx — 🎼 멜로디 따라부르기(Simon식): 들은 멜로디를 따라 부르면 한 음씩 길어짐
import { useCallback, useRef, useState } from 'react'
import NavBar from '../../components/NavBar'
import { useMicPitch, type PitchFrame } from '../../hooks/useMicPitch'
import { playTone } from '../../audio/oscillator'
import { midiToHz, midiToNoteName } from '../../lib/midi'
import { setGameStars } from '../../lib/storage'
import { ECHO_LEVELS, type EchoLevel } from './levels'
import LevelSelect from './LevelSelect'
import ClearOverlay from './ClearOverlay'

const GAME_ID = 'echo'
const COLOR = 'var(--color-macaw)'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
function randSeq(scale: number[], len: number): number[] {
  return Array.from({ length: len }, () => scale[Math.floor(Math.random() * scale.length)])
}
// 옥타브 무관 오차(반음): 저음/고음 사용자 모두 통과
function octaveErr(a: number, b: number): number {
  let best = Infinity
  for (let k = -2; k <= 2; k++) best = Math.min(best, Math.abs(a - b - 12 * k))
  return best
}
// 연속 프레임을 안정된 음 시퀀스로 분절
function segmentize(samples: (number | null)[]): number[] {
  const segs: number[] = []
  let cur: number[] = []
  let gap = 0
  const flush = () => {
    if (cur.length >= 5) {
      const s = [...cur].sort((a, b) => a - b)
      segs.push(s[s.length >> 1])
    }
    cur = []
  }
  for (const v of samples) {
    if (v == null) { gap++; if (gap >= 3) flush(); continue }
    gap = 0
    if (cur.length && Math.abs(v - cur[0]) > 1.0) flush()
    cur.push(v)
  }
  flush()
  return segs
}

type Phase = 'select' | 'level' | 'result'
type Status = 'ready' | 'listening' | 'singing'

export default function EchoGame() {
  const [phase, setPhase] = useState<Phase>('select')
  const [level, setLevel] = useState<EchoLevel | null>(null)
  const [levelIdx, setLevelIdx] = useState(0)
  const [melody, setMelody] = useState<number[]>([])
  const [hearts, setHearts] = useState(3)
  const [status, setStatus] = useState<Status>('ready')
  const [playIdx, setPlayIdx] = useState(-1)
  const [msg, setMsg] = useState('')
  const [heard, setHeard] = useState<number[] | null>(null) // 채점 후 내가 부른 음
  const [result, setResult] = useState<{ cleared: boolean; stars: number } | null>(null)

  const samplesRef = useRef<(number | null)[]>([])
  const collectingRef = useRef(false)
  const melodyRef = useRef<number[]>([])

  const onFrame = useCallback((f: PitchFrame) => {
    if (!collectingRef.current) return
    samplesRef.current.push(f.voiced && f.midi != null ? f.midi : null)
  }, [])
  const { error, start, stop } = useMicPitch(onFrame)

  const playLevel = useCallback((idx: number) => {
    const lv = ECHO_LEVELS[idx]
    const m = randSeq(lv.scale, lv.startLen)
    melodyRef.current = m
    setLevel(lv); setLevelIdx(idx); setMelody(m); setHearts(3); setStatus('ready')
    setMsg(''); setHeard(null); setResult(null); setPhase('level')
  }, [])

  const listen = useCallback(async () => {
    const lv = level
    if (!lv) return
    setStatus('listening'); setHeard(null); setMsg('잘 들어보세요…')
    const m = melodyRef.current
    for (let i = 0; i < m.length; i++) {
      setPlayIdx(i)
      playTone(midiToHz(m[i]), lv.noteMs * 0.92)
      await sleep(lv.noteMs)
    }
    setPlayIdx(-1); setStatus('ready'); setMsg('이제 따라 불러보세요 🎤')
  }, [level])

  const sing = useCallback(async () => {
    samplesRef.current = []
    collectingRef.current = true
    setHeard(null); setStatus('singing'); setMsg('따라 부르고 끝나면 [채점]을 누르세요')
    await start()
  }, [start])

  const grade = useCallback(() => {
    const lv = level
    if (!lv) return
    collectingRef.current = false
    stop()
    const segs = segmentize(samplesRef.current)
    const m = melodyRef.current
    setHeard(segs.map((s) => Math.round(s)))

    let ok = true
    for (let i = 0; i < m.length; i++) {
      const s = segs[i]
      if (s == null || octaveErr(s, m[i]) > lv.tolSemi) { ok = false; break }
    }
    setStatus('ready')

    if (ok) {
      if (m.length >= lv.maxLen) {
        const stars = hearts >= 3 ? 3 : hearts === 2 ? 2 : 1
        setGameStars(GAME_ID, lv.id, stars)
        setResult({ cleared: true, stars }); setPhase('result')
      } else {
        const nm = [...m, lv.scale[Math.floor(Math.random() * lv.scale.length)]]
        melodyRef.current = nm; setMelody(nm)
        setMsg(`정답! 한 음 추가 (${nm.length}음). 다시 들어보세요`)
      }
    } else {
      const h = hearts - 1
      setHearts(h)
      if (h <= 0) { setResult({ cleared: false, stars: 0 }); setPhase('result') }
      else setMsg(`아쉬워요 (하트 ${h}개 남음). 다시 들어보세요`)
    }
  }, [level, hearts, stop])

  // ── 렌더 ──────────────────────────────────────
  if (phase === 'select') {
    return (
      <main style={wrap}>
        <NavBar title="멜로디 따라부르기" />
        <h1 style={{ ...h1, color: COLOR }}>🎼 멜로디 따라부르기</h1>
        <p style={sub}>멜로디를 듣고 그대로 따라 부르세요. 맞히면 한 음씩 길어집니다. (옥타브는 달라도 OK)</p>
        <LevelSelect gameId={GAME_ID} levels={ECHO_LEVELS} color={COLOR} onPick={playLevel} />
      </main>
    )
  }

  const lv = level!
  return (
    <main style={wrap}>
      <NavBar title="멜로디 따라부르기" />
      {error && <p style={{ color: 'var(--color-cardinal)' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
        <span style={{ fontWeight: 'var(--font-weight-bold)', color: COLOR }}>{lv.name} · {melody.length}음</span>
        <span style={{ fontSize: 'var(--font-size-subhead)' }}>{'❤️'.repeat(hearts)}{'🤍'.repeat(3 - hearts)}</span>
      </div>

      {/* 멜로디 패드 */}
      <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
        {melody.map((n, i) => {
          const lit = playIdx === i
          return (
            <div key={i} style={{
              width: 52, height: 52, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center',
              fontWeight: 'var(--font-weight-heavy)', fontSize: 'var(--font-size-caption)',
              background: lit ? COLOR : 'var(--color-bg-subtle)',
              color: lit ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
              border: '2px solid', borderColor: lit ? COLOR : 'var(--color-border)',
              transform: lit ? 'translateY(-4px)' : 'none', transition: 'all var(--duration-fast)',
            }}>
              {midiToNoteName(n)}
            </div>
          )
        })}
      </div>

      {/* 내가 부른 음(채점 후) */}
      {heard && (
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>내가 부른 음</div>
          <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
            {heard.length === 0 && <span style={{ color: 'var(--color-text-secondary)' }}>(소리가 안 잡혔어요)</span>}
            {heard.map((n, i) => {
              const good = i < melody.length && octaveErr(n, melody[i]) <= lv.tolSemi
              return (
                <span key={i} style={{
                  padding: '4px 10px', borderRadius: 'var(--radius-pill)', fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-caption)',
                  background: good ? 'var(--color-primary)' : 'var(--color-cardinal)', color: 'var(--color-text-inverse)',
                }}>{midiToNoteName(n)}</span>
              )
            })}
          </div>
        </div>
      )}

      <p style={{ minHeight: 24, fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text)' }}>{msg}</p>

      <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
        <button onClick={listen} disabled={status !== 'ready'} style={{ ...primary, opacity: status === 'ready' ? 1 : 0.5 }}>🔊 멜로디 듣기</button>
        {status === 'singing'
          ? <button onClick={grade} style={{ ...primary, background: 'var(--color-primary)', boxShadow: 'var(--shadow-button)' }}>✅ 채점</button>
          : <button onClick={sing} disabled={status !== 'ready'} style={{ ...primary, background: COLOR, boxShadow: '0 4px 0 var(--color-macaw-shadow)', opacity: status === 'ready' ? 1 : 0.5 }}>🎤 따라부르기</button>}
        <button onClick={() => { stop(); collectingRef.current = false; setPhase('select'); setLevel(null) }} style={ghost}>← 레벨 선택</button>
      </div>

      {phase === 'result' && result && (
        <ClearOverlay
          cleared={result.cleared}
          stars={result.stars}
          detail={result.cleared ? `${lv.name} 완성!` : '하트를 모두 잃었어요. 다시 도전!'}
          hasNext={levelIdx + 1 < ECHO_LEVELS.length}
          onRetry={() => playLevel(levelIdx)}
          onSelect={() => { setResult(null); setPhase('select'); setLevel(null) }}
          onNext={() => playLevel(levelIdx + 1)}
        />
      )}
    </main>
  )
}

const wrap: React.CSSProperties = { maxWidth: 640, margin: '0 auto', padding: 'var(--space-lg) var(--space-gutter)' }
const h1: React.CSSProperties = { fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)', margin: '0 0 var(--space-xs)' }
const sub: React.CSSProperties = { color: 'var(--color-text-secondary)', margin: '0 0 var(--space-md)' }
const primary: React.CSSProperties = {
  padding: 'var(--space-sm) var(--space-lg)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-heavy)',
  color: 'var(--color-text-inverse)', background: 'var(--color-primary)', border: 'none',
  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-button)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
const ghost: React.CSSProperties = {
  padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text)', background: 'var(--color-bg)', border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-lg)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
