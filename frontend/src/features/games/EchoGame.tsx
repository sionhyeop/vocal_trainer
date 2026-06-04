// EchoGame.tsx — 🎼 멜로디 따라부르기: 유명 발라드 5곡 중 골라 듣고 따라 부르기(정확도 채점)
import { useCallback, useRef, useState } from 'react'
import NavBar from '../../components/NavBar'
import { useMicPitch, type PitchFrame } from '../../hooks/useMicPitch'
import { playTone } from '../../audio/oscillator'
import { midiToHz, midiToNoteName } from '../../lib/midi'
import { setGameStars } from '../../lib/storage'
import { BALLADS, type BalladSong } from './levels'
import LevelSelect from './LevelSelect'
import ClearOverlay from './ClearOverlay'

const GAME_ID = 'echo'
const COLOR = 'var(--color-macaw)'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

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
// 부른 음들을 멜로디에 정렬(앞뒤 ±2 오프셋 중 최다 적중)해 음별 적중 배열 반환
function alignHits(segs: number[], melody: number[], tol: number): boolean[] {
  let bestOff = 0
  let bestHits = -1
  for (let off = -2; off <= 2; off++) {
    let h = 0
    for (let i = 0; i < melody.length; i++) {
      const s = segs[i + off]
      if (s != null && octaveErr(s, melody[i]) <= tol) h++
    }
    if (h > bestHits) { bestHits = h; bestOff = off }
  }
  return melody.map((m, i) => {
    const s = segs[i + bestOff]
    return s != null && octaveErr(s, m) <= tol
  })
}

type Phase = 'select' | 'song' | 'result'
type Status = 'ready' | 'listening' | 'singing'

export default function EchoGame() {
  const [phase, setPhase] = useState<Phase>('select')
  const [song, setSong] = useState<BalladSong | null>(null)
  const [songIdx, setSongIdx] = useState(0)
  const [status, setStatus] = useState<Status>('ready')
  const [playIdx, setPlayIdx] = useState(-1)
  const [msg, setMsg] = useState('')
  const [hits, setHits] = useState<boolean[] | null>(null)
  const [result, setResult] = useState<{ cleared: boolean; stars: number; pct: number } | null>(null)

  const samplesRef = useRef<(number | null)[]>([])
  const collectingRef = useRef(false)
  const playGuardRef = useRef(0) // 듣기 중복재생 방지 토큰

  const onFrame = useCallback((f: PitchFrame) => {
    if (!collectingRef.current) return
    samplesRef.current.push(f.voiced && f.midi != null ? f.midi : null)
  }, [])
  const { error, start, stop } = useMicPitch(onFrame)

  const pickSong = useCallback((idx: number) => {
    setSong(BALLADS[idx]); setSongIdx(idx); setStatus('ready')
    setPlayIdx(-1); setMsg('🔊 먼저 멜로디를 들어보세요'); setHits(null); setResult(null); setPhase('song')
  }, [])

  const listen = useCallback(async () => {
    const s = song
    if (!s) return
    const token = ++playGuardRef.current
    setStatus('listening'); setHits(null); setMsg('잘 들어보세요…')
    const beatMs = 60000 / s.bpm
    for (let i = 0; i < s.melody.length; i++) {
      if (playGuardRef.current !== token) return // 도중 이탈/재시작 시 중단
      const [midi, beats] = s.melody[i]
      setPlayIdx(i)
      playTone(midiToHz(midi), beats * beatMs * 0.92)
      await sleep(beats * beatMs)
    }
    setPlayIdx(-1); setStatus('ready'); setMsg('이제 따라 불러보세요 🎤')
  }, [song])

  const sing = useCallback(async () => {
    samplesRef.current = []
    setHits(null); setStatus('singing'); setMsg('마이크 준비 중…')
    const ok = await start()
    if (!ok) { collectingRef.current = false; setStatus('ready'); setMsg('마이크를 시작할 수 없어요. 권한 허용 후 다시 시도하세요.'); return }
    collectingRef.current = true
    setMsg('멜로디를 따라 부르고, 끝나면 [채점]을 누르세요')
  }, [start])

  const grade = useCallback(() => {
    const s = song
    if (!s) return
    collectingRef.current = false
    stop()
    const segs = segmentize(samplesRef.current)
    const melodyMidis = s.melody.map((n) => n[0])
    const h = alignHits(segs, melodyMidis, s.tolSemi)
    setHits(h)
    setStatus('ready')

    const matched = h.filter(Boolean).length
    const pct = Math.round((matched / melodyMidis.length) * 100)
    const stars = pct >= 85 ? 3 : pct >= 65 ? 2 : pct >= 45 ? 1 : 0
    if (stars >= 1) {
      setGameStars(GAME_ID, s.id, stars)
      setResult({ cleared: true, stars, pct })
      setPhase('result')
    } else {
      setMsg(`정확도 ${pct}% — 조금 더! 멜로디를 다시 듣고 도전해보세요`)
    }
  }, [song, stop])

  const leave = useCallback(() => {
    playGuardRef.current++
    collectingRef.current = false
    stop()
    setPhase('select'); setSong(null)
  }, [stop])

  // ── 렌더 ──────────────────────────────────────
  if (phase === 'select') {
    return (
      <main style={wrap}>
        <NavBar title="멜로디 따라부르기" />
        <h1 style={{ ...h1, color: COLOR }}>🎼 멜로디 따라부르기</h1>
        <p style={sub}>유명 발라드를 골라 멜로디를 듣고 따라 부르세요. 정확도로 별을 받습니다. (옥타브는 달라도 OK)</p>
        <LevelSelect
          gameId={GAME_ID}
          levels={BALLADS.map((b) => ({ id: b.id, name: `${b.title} · ${b.artist}` }))}
          color={COLOR}
          onPick={pickSong}
        />
      </main>
    )
  }

  const s = song!
  const matched = hits ? hits.filter(Boolean).length : 0
  return (
    <main style={wrap}>
      <NavBar title="멜로디 따라부르기" />
      {error && <p style={{ color: 'var(--color-cardinal)' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-sm)' }}>
        <span style={{ fontWeight: 'var(--font-weight-bold)', color: COLOR }}>{s.title} · {s.artist}</span>
        <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>{s.melody.length}음</span>
      </div>

      {/* 멜로디 패드(재생 중 하이라이트, 채점 후 적중/실패) */}
      <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap', marginBottom: 'var(--space-sm)' }}>
        {s.melody.map(([n], i) => {
          const lit = playIdx === i
          const hit = hits ? hits[i] : null
          const bg = lit ? COLOR : hit === true ? 'var(--color-primary)' : hit === false ? 'var(--color-cardinal)' : 'var(--color-bg-subtle)'
          const fg = lit || hit != null ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)'
          return (
            <div key={i} style={{
              width: 48, height: 48, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center',
              fontWeight: 'var(--font-weight-heavy)', fontSize: 'var(--font-size-caption)',
              background: bg, color: fg, border: '2px solid', borderColor: lit ? COLOR : 'var(--color-border)',
              transform: lit ? 'translateY(-4px)' : 'none', transition: 'all var(--duration-fast)',
            }}>
              {midiToNoteName(n)}
            </div>
          )
        })}
      </div>

      {hits && (
        <p style={{ fontWeight: 'var(--font-weight-bold)', color: matched >= s.melody.length * 0.65 ? 'var(--color-primary)' : 'var(--color-fox)' }}>
          정확도 {Math.round((matched / s.melody.length) * 100)}% ({matched}/{s.melody.length}음)
        </p>
      )}
      <p style={{ minHeight: 24, fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text)' }}>{msg}</p>

      <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
        <button onClick={listen} disabled={status !== 'ready'} style={{ ...primary, opacity: status === 'ready' ? 1 : 0.5 }}>🔊 멜로디 듣기</button>
        {status === 'singing'
          ? <button onClick={grade} style={{ ...primary, background: 'var(--color-primary)' }}>✅ 채점</button>
          : <button onClick={sing} disabled={status !== 'ready'} style={{ ...primary, background: COLOR, opacity: status === 'ready' ? 1 : 0.5 }}>🎤 따라부르기</button>}
        <button onClick={leave} style={ghost}>← 곡 선택</button>
      </div>

      {phase === 'result' && result && (
        <ClearOverlay
          cleared={result.cleared}
          stars={result.stars}
          detail={`${s.title} — 정확도 ${result.pct}%!`}
          hasNext={songIdx + 1 < BALLADS.length}
          onRetry={() => pickSong(songIdx)}
          onSelect={() => { setResult(null); setPhase('select'); setSong(null) }}
          onNext={() => pickSong(songIdx + 1)}
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
