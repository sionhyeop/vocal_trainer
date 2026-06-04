// EchoGame.tsx — 🎼 멜로디 따라부르기: 메인 '곡 따라부르기'의 음정차트(리본)를 가져와,
// 발라드 멜로디가 흐르는 리본을 보며 실시간으로 따라 부른다(MelodyScorer로 채점).
//   미리듣기(톤+리본, 마이크 OFF) → 따라부르기(리본 스크롤+채점, 톤 OFF: 가이드음 마이크 누출 방지)
import { useCallback, useEffect, useRef, useState } from 'react'
import NavBar from '../../components/NavBar'
import { useMicPitch, type PitchFrame } from '../../hooks/useMicPitch'
import { playTone } from '../../audio/oscillator'
import { midiToHz } from '../../lib/midi'
import { setGameStars } from '../../lib/storage'
import type { Note } from '../../lib/noteMap'
import { drawMelodyRibbon, MAX_HISTORY, type RibbonSample } from '../sing/ribbonDraw'
import { MelodyScorer } from '../../audio/melodyScorer'
import { BALLADS, type BalladSong } from './levels'
import LevelSelect from './LevelSelect'
import ClearOverlay from './ClearOverlay'

const GAME_ID = 'echo'
const COLOR = 'var(--color-macaw)'
const LEAD_MS = 2600 // 첫 음이 now라인에 닿기까지 리본이 흘러들어올 여유

// 발라드 멜로디([midi,beats]) → 타임드 노트맵(startMs/endMs/midiNote)
function balladNotes(song: BalladSong): Note[] {
  const beatMs = 60000 / song.bpm
  const notes: Note[] = []
  let t = LEAD_MS
  for (const [midi, beats] of song.melody) {
    const dur = beats * beatMs
    notes.push({ startMs: Math.round(t), endMs: Math.round(t + dur), midiNote: midi })
    t += dur
  }
  return notes
}
function targetMidiAt(notes: Note[], tMs: number): number | null {
  for (const n of notes) if (tMs >= n.startMs && tMs < n.endMs) return n.midiNote
  return null
}
function octaveAlign(midi: number, target: number): number {
  return midi + 12 * Math.round((target - midi) / 12)
}

type Phase = 'select' | 'play' | 'result'
type Status = 'ready' | 'preview' | 'count' | 'singing'

export default function EchoGame() {
  const [phase, setPhase] = useState<Phase>('select')
  const [song, setSong] = useState<BalladSong | null>(null)
  const [songIdx, setSongIdx] = useState(0)
  const [status, setStatus] = useState<Status>('ready')
  const [count, setCount] = useState(3)
  const [hud, setHud] = useState({ acc: 0, combo: 0 })
  const [result, setResult] = useState<{ stars: number; acc: number } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const notesRef = useRef<Note[]>([])
  const histRef = useRef<RibbonSample[]>([])
  const scorerRef = useRef<MelodyScorer | null>(null)
  const startRef = useRef(0)
  const doneRef = useRef(false)
  const statusRef = useRef<Status>('ready')
  const songRef = useRef<BalladSong | null>(null)
  const previewRafRef = useRef(0)
  const countTimerRef = useRef<number | null>(null)

  const setStat = (s: Status) => { statusRef.current = s; setStatus(s) }

  const finishSing = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    stop()
    scorerRef.current?.flush()
    const acc = Math.round(scorerRef.current?.accuracy() ?? 0)
    const stars = acc >= 85 ? 3 : acc >= 65 ? 2 : acc >= 45 ? 1 : 0
    const s = songRef.current
    if (stars >= 1 && s) setGameStars(GAME_ID, s.id, stars)
    setResult({ stars, acc })
    setPhase('result')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onFrame = useCallback((f: PitchFrame) => {
    if (doneRef.current || statusRef.current !== 'singing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const now = performance.now()
    if (startRef.current === 0) { startRef.current = now; return }
    const tMs = now - startRef.current
    const notes = notesRef.current
    const raw = f.voiced && f.midi != null ? f.midi : null
    // 리본 표시용: 활성 목표음 옥타브에 맞춰 트레일이 목표에 겹치게
    const target = targetMidiAt(notes, tMs)
    const disp = raw != null && target != null ? octaveAlign(raw, target) : raw
    const hist = histRef.current
    hist.push({ midi: disp, tMs })
    if (hist.length > MAX_HISTORY) hist.shift()
    drawMelodyRibbon(canvas, hist, notes, tMs)

    const j = scorerRef.current!.update(tMs, raw)
    if (j) {
      const sc = scorerRef.current!
      setHud({ acc: Math.round(sc.accuracy()), combo: sc.state.combo })
    }
    const last = notes[notes.length - 1]
    if (last && tMs > last.endMs + 600) finishSing()
  }, [finishSing])

  const { error, start, stop } = useMicPitch(onFrame)

  const sizeCanvas = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    c.width = c.clientWidth
    c.height = 210
    drawMelodyRibbon(c, histRef.current, notesRef.current, startRef.current ? performance.now() - startRef.current : 0)
  }, [])

  const stopPreview = () => { cancelAnimationFrame(previewRafRef.current); previewRafRef.current = 0 }
  const clearCount = () => { if (countTimerRef.current) { clearInterval(countTimerRef.current); countTimerRef.current = null } }

  const pickSong = useCallback((idx: number) => {
    const s = BALLADS[idx]
    songRef.current = s
    notesRef.current = balladNotes(s)
    histRef.current = []
    setSong(s); setSongIdx(idx); setHud({ acc: 0, combo: 0 }); setResult(null)
    setStat('ready'); setPhase('play')
  }, [])

  // 미리듣기: 톤 + 리본 흐름(마이크 OFF, 채점 없음)
  const preview = useCallback(() => {
    if (statusRef.current !== 'ready') return
    setStat('preview')
    const notes = notesRef.current
    const last = notes[notes.length - 1]
    const t0 = performance.now()
    let gi = 0
    const loop = () => {
      const tMs = performance.now() - t0
      while (gi < notes.length && tMs >= notes[gi].startMs) {
        const n = notes[gi]
        playTone(midiToHz(n.midiNote), Math.min(800, n.endMs - n.startMs) * 0.9)
        gi++
      }
      drawMelodyRibbon(canvasRef.current, [], notes, tMs)
      if (last && tMs > last.endMs + 400) {
        stopPreview()
        setStat('ready')
        drawMelodyRibbon(canvasRef.current, [], notes, 0)
        return
      }
      previewRafRef.current = requestAnimationFrame(loop)
    }
    previewRafRef.current = requestAnimationFrame(loop)
  }, [])

  const beginSing = useCallback(async () => {
    scorerRef.current = new MelodyScorer(notesRef.current)
    histRef.current = []
    startRef.current = 0
    doneRef.current = false
    setHud({ acc: 0, combo: 0 })
    setStat('singing')
    const ok = await start()
    if (!ok) { setStat('ready') }
  }, [start])

  // 따라부르기: 카운트다운 → beginSing
  const sing = useCallback(() => {
    if (statusRef.current !== 'ready') return
    stopPreview()
    setStat('count'); setCount(3)
    countTimerRef.current = window.setInterval(() => {
      setCount((c) => {
        const next = c - 1
        if (next <= 0) { clearCount(); beginSing() }
        return next > 0 ? next : 0
      })
    }, 800)
  }, [beginSing])

  const leave = useCallback(() => {
    stopPreview(); clearCount(); doneRef.current = true; stop()
    setPhase('select'); setSong(null); setStat('ready')
  }, [stop])

  useEffect(() => {
    if (phase !== 'play') return
    sizeCanvas()
    window.addEventListener('resize', sizeCanvas)
    return () => window.removeEventListener('resize', sizeCanvas)
  }, [phase, sizeCanvas])

  // 언마운트 정리
  useEffect(() => () => { stopPreview(); clearCount() }, [])

  // ── 렌더 ──
  if (phase === 'select') {
    return (
      <main style={wrap}>
        <NavBar title="멜로디 따라부르기" />
        <h1 style={{ ...h1, color: COLOR }}>🎼 멜로디 따라부르기</h1>
        <p style={sub}>유명 발라드를 골라 흐르는 음정 리본을 보며 따라 부르세요. 메인 '곡 따라부르기'와 같은 채점입니다.</p>
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
  return (
    <main style={wrap}>
      <NavBar title="멜로디 따라부르기" />
      {error && <p style={{ color: 'var(--color-cardinal)' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
        <span style={{ fontWeight: 'var(--font-weight-bold)', color: COLOR }}>{s.title} · {s.artist}</span>
        {status === 'singing' && <span style={{ fontWeight: 'var(--font-weight-heavy)' }}>정확도 {hud.acc} {hud.combo >= 2 && <span style={{ color: 'var(--color-bee)' }}>· {hud.combo}연속</span>}</span>}
      </div>

      <div style={{ position: 'relative' }}>
        <canvas ref={canvasRef} role="img" aria-label="멜로디 음정 리본 — 흐르는 목표 음을 따라 부르세요"
          style={{ width: '100%', height: 210, borderRadius: 'var(--radius-md)', background: '#1a1a2e', display: 'block' }} />
        {status === 'count' && (
          <div style={countOverlay}><span style={{ fontSize: 72, fontWeight: 'var(--font-weight-heavy)', color: '#fff' }}>{count}</span></div>
        )}
      </div>
      <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
        가운데 세로선(now)에 목표 음이 닿을 때 그 높이로 부르세요. {status === 'singing' ? '🎤 부르는 중…' : status === 'preview' ? '🔊 미리듣기…' : ''}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap', marginTop: 'var(--space-md)' }}>
        <button onClick={preview} disabled={status !== 'ready'} style={{ ...primary, background: COLOR, opacity: status === 'ready' ? 1 : 0.5 }}>🔊 미리듣기</button>
        <button onClick={sing} disabled={status !== 'ready'} style={{ ...primary, opacity: status === 'ready' ? 1 : 0.5 }}>🎤 따라부르기</button>
        <button onClick={leave} style={ghost}>← 곡 선택</button>
      </div>

      {phase === 'result' && result && (
        <ClearOverlay
          cleared={result.stars >= 1}
          stars={result.stars}
          detail={`${s.title} — 정확도 ${result.acc}%!`}
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
const countOverlay: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.35)', borderRadius: 'var(--radius-md)',
}
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
