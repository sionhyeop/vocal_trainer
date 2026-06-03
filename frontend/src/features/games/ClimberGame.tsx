// ClimberGame.tsx — 🪜 음역대 클라이머: 목표 음을 마이크로 유지해 한 칸씩 등반
import { useCallback, useRef, useState } from 'react'
import NavBar from '../../components/NavBar'
import { useMicPitch, type PitchFrame } from '../../hooks/useMicPitch'
import { midiToNoteName } from '../../lib/midi'
import { getProfile, setGameStars } from '../../lib/storage'
import { CLIMBER_LEVELS, type ClimberLevel } from './levels'
import LevelSelect from './LevelSelect'
import ClearOverlay from './ClearOverlay'

const GAME_ID = 'climber'
const COLOR = 'var(--color-fox)'

// 프로필 음역대 중심으로 옥타브 단위 이동(난이도 스케일)
function fitTranspose(notes: number[]): number {
  const p = getProfile()
  if (!p) return 0
  const center = (Math.min(...notes) + Math.max(...notes)) / 2
  const pCenter = (p.lowMidi + p.highMidi) / 2
  return Math.round((pCenter - center) / 12) * 12
}

type Phase = 'select' | 'playing' | 'result'

export default function ClimberGame() {
  const [phase, setPhase] = useState<Phase>('select')
  const [level, setLevel] = useState<ClimberLevel | null>(null)
  const [levelIdx, setLevelIdx] = useState(0)
  const [rung, setRung] = useState(0)
  const [gauge, setGauge] = useState(0)
  const [live, setLive] = useState<number | null>(null)
  const [remain, setRemain] = useState(1)
  const [result, setResult] = useState<{ cleared: boolean; stars: number } | null>(null)

  // 게임 루프 상태(렌더 무관)
  const transposeRef = useRef(0)
  const rungRef = useRef(0)
  const holdRef = useRef(0)
  const lastTRef = useRef(0)
  const rungStartRef = useRef(0)
  const errRef = useRef<number[]>([]) // 누적 |오차|(반음)
  const doneRef = useRef(false)

  const finish = useCallback((cleared: boolean) => {
    if (doneRef.current) return
    doneRef.current = true
    stop()
    let stars = 0
    if (cleared) {
      const errs = errRef.current
      const avgCents = (errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 1) * 100
      stars = avgCents < 35 ? 3 : avgCents < 60 ? 2 : 1
      if (level) setGameStars(GAME_ID, level.id, stars)
    }
    setResult({ cleared, stars })
    setPhase('result')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level])

  const onFrame = useCallback((f: PitchFrame) => {
    if (doneRef.current || !level) return
    const now = performance.now()
    const dt = Math.min(100, now - lastTRef.current)
    lastTRef.current = now

    // 칸당 제한시간
    const left = level.timeLimitMs - (now - rungStartRef.current)
    setRemain(Math.max(0, left / level.timeLimitMs))
    if (left <= 0) { finish(false); return }

    const target = level.notes[rungRef.current] + transposeRef.current
    if (f.voiced && f.midi != null) {
      setLive(f.midi)
      const err = Math.abs(f.midi - target)
      if (err <= level.tolSemi) {
        holdRef.current += dt
        errRef.current.push(err)
      } else {
        holdRef.current = Math.max(0, holdRef.current - dt * 0.6)
      }
    } else {
      setLive(null)
      holdRef.current = Math.max(0, holdRef.current - dt * 0.3)
    }

    setGauge(Math.min(1, holdRef.current / level.holdMs))

    if (holdRef.current >= level.holdMs) {
      const next = rungRef.current + 1
      holdRef.current = 0
      rungStartRef.current = now
      if (next >= level.notes.length) { finish(true); return }
      rungRef.current = next
      setRung(next)
    }
  }, [level, finish])

  const { error, start, stop } = useMicPitch(onFrame)

  const play = useCallback(async (idx: number) => {
    const lv = CLIMBER_LEVELS[idx]
    transposeRef.current = fitTranspose(lv.notes)
    rungRef.current = 0
    holdRef.current = 0
    errRef.current = []
    doneRef.current = false
    lastTRef.current = performance.now()
    rungStartRef.current = performance.now()
    setLevel(lv); setLevelIdx(idx); setRung(0); setGauge(0); setLive(null); setRemain(1); setResult(null)
    setPhase('playing')
    await start()
  }, [start])

  const backToSelect = useCallback(() => { stop(); doneRef.current = true; setPhase('select'); setLevel(null) }, [stop])

  // ── 렌더 ──────────────────────────────────────
  if (phase === 'select') {
    return (
      <main style={wrap}>
        <NavBar title="음역대 클라이머" />
        <h1 style={{ ...h1, color: COLOR }}>🪜 음역대 클라이머</h1>
        <p style={sub}>목표 음을 마이크로 정확히 내서 한 칸씩 올라가세요. 끝까지 오르면 클리어!{getProfile() ? ' (내 음역대에 맞춰 조정됨)' : ''}</p>
        <LevelSelect gameId={GAME_ID} levels={CLIMBER_LEVELS} color={COLOR} onPick={play} />
      </main>
    )
  }

  const lv = level!
  const target = lv.notes[rung] + transposeRef.current
  const inTune = live != null && Math.abs(live - target) <= lv.tolSemi

  return (
    <main style={wrap}>
      <NavBar title="음역대 클라이머" />
      {error && <p style={{ color: 'var(--color-cardinal)' }}>{error}</p>}

      {/* 진행 사다리 (위가 높은 음) */}
      <div style={{ display: 'flex', gap: 'var(--space-lg)', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 4, minWidth: 96 }}>
          {lv.notes.map((n, i) => {
            const climbed = i < rung
            const current = i === rung
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 'var(--radius-md)',
                fontWeight: 'var(--font-weight-bold)',
                background: climbed ? 'var(--color-primary)' : current ? COLOR : 'var(--color-bg-subtle)',
                color: climbed || current ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                border: current ? '2px solid #fff' : '2px solid transparent',
                boxShadow: current ? 'var(--shadow-md)' : 'none',
              }}>
                <span>{current ? '🧗' : climbed ? '✓' : '·'}</span>
                <span>{midiToNoteName(n + transposeRef.current)}</span>
              </div>
            )
          })}
        </div>

        {/* 튜너 + 게이지 */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>목표 음</div>
          <div style={{ fontSize: 56, fontWeight: 'var(--font-weight-heavy)', color: COLOR, lineHeight: 1.1 }}>
            {midiToNoteName(target)}
          </div>
          <div style={{ fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-bold)', color: inTune ? 'var(--color-primary)' : 'var(--color-text-secondary)', minHeight: 26 }}>
            {live == null ? '🎤 소리를 내보세요' : inTune ? '✅ 좋아요! 유지하세요' : `내 음: ${midiToNoteName(live)} ${live > target ? '↓ 낮춰요' : '↑ 높여요'}`}
          </div>

          {/* 유지 게이지 */}
          <div style={{ marginTop: 'var(--space-md)', height: 22, background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
            <div style={{ width: `${gauge * 100}%`, height: '100%', background: inTune ? 'var(--color-primary)' : COLOR, transition: 'width 60ms linear' }} />
          </div>
          <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: 4 }}>유지 게이지</div>

          {/* 제한시간 */}
          <div style={{ marginTop: 'var(--space-md)', height: 6, background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
            <div style={{ width: `${remain * 100}%`, height: '100%', background: remain < 0.3 ? 'var(--color-cardinal)' : 'var(--color-bee)', transition: 'width 60ms linear' }} />
          </div>

          <div style={{ marginTop: 'var(--space-md)', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>
            {rung + 1} / {lv.notes.length} 칸 · {lv.name}
          </div>
        </div>
      </div>

      <button onClick={backToSelect} style={{ marginTop: 'var(--space-lg)', ...ghost }}>← 레벨 선택으로</button>

      {phase === 'result' && result && (
        <ClearOverlay
          cleared={result.cleared}
          stars={result.stars}
          detail={result.cleared ? `${lv.name} 완등!` : '시간 안에 다 오르지 못했어요. 다시 도전!'}
          hasNext={levelIdx + 1 < CLIMBER_LEVELS.length}
          onRetry={() => play(levelIdx)}
          onSelect={() => { setResult(null); setPhase('select'); setLevel(null) }}
          onNext={() => play(levelIdx + 1)}
        />
      )}
    </main>
  )
}

const wrap: React.CSSProperties = { maxWidth: 640, margin: '0 auto', padding: 'var(--space-lg) var(--space-gutter)' }
const h1: React.CSSProperties = { fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)', margin: '0 0 var(--space-xs)' }
const sub: React.CSSProperties = { color: 'var(--color-text-secondary)', margin: '0 0 var(--space-md)' }
const ghost: React.CSSProperties = {
  padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text)', background: 'var(--color-bg)', border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-lg)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
