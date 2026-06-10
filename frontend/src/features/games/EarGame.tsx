// EarGame.tsx — 🎧 음 듣고 맞히기(청음 게임): 음 이름 / 음정 간격 맞히기. 레벨 + 별
import { useCallback, useEffect, useRef, useState } from 'react'
import NavBar from '../../components/NavBar'
import { playTone } from '../../audio/oscillator'
import { midiToHz } from '../../lib/midi'
import { setGameStars } from '../../lib/storage'
import { EAR_LEVELS, type EarLevel } from './levels'
import LevelSelect from './LevelSelect'
import ClearOverlay from './ClearOverlay'

const GAME_ID = 'ear'
const COLOR = 'var(--color-beetle)'

const SOLFEGE = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시']
const LETTER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const noteLabel = (midi: number) => SOLFEGE[((midi % 12) + 12) % 12]
const noteLetter = (midi: number) => LETTER[((midi % 12) + 12) % 12]
const INTERVAL_LABEL: Record<number, string> = { 2: '2도', 4: '3도', 5: '4도', 7: '5도', 12: '8도(옥타브)' }

const rand = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]

interface Question {
  base: number // 재생 기준음
  answer: number // note: pitch class(0~11) / interval: 반음 수
}
function makeQuestion(lv: EarLevel): Question {
  if (lv.kind === 'interval') {
    const base = rand(lv.pool)
    const semi = rand(lv.intervals!)
    return { base, answer: semi }
  }
  const n = rand(lv.pool)
  return { base: n, answer: n }
}

type Phase = 'select' | 'play' | 'result'

export default function EarGame() {
  const [phase, setPhase] = useState<Phase>('select')
  const [level, setLevel] = useState<EarLevel | null>(null)
  const [levelIdx, setLevelIdx] = useState(0)
  const [q, setQ] = useState<Question | null>(null)
  const [qNum, setQNum] = useState(0) // 1-based 현재 문제 번호
  const [correct, setCorrect] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [result, setResult] = useState<{ cleared: boolean; stars: number } | null>(null)

  const qRef = useRef<Question | null>(null)
  qRef.current = q

  const playQ = useCallback((lv: EarLevel, question: Question) => {
    if (lv.kind === 'interval') {
      playTone(midiToHz(question.base), 600)
      setTimeout(() => playTone(midiToHz(question.base + question.answer), 600), 650)
    } else {
      playTone(midiToHz(question.base), 800)
    }
  }, [])

  const startLevel = useCallback((idx: number) => {
    const lv = EAR_LEVELS[idx]
    const first = makeQuestion(lv)
    setLevel(lv); setLevelIdx(idx); setQ(first); setQNum(1); setCorrect(0); setPicked(null); setResult(null); setPhase('play')
  }, [])

  // 새 문제마다 자동 재생
  useEffect(() => {
    if (phase !== 'play' || !level || !q) return
    const t = setTimeout(() => playQ(level, q), 250)
    return () => clearTimeout(t)
  }, [q, phase, level, playQ])

  const answer = useCallback((choice: number) => {
    const lv = level
    if (!lv || !q || picked != null) return
    setPicked(choice)
    const ok = choice === q.answer
    const nc = correct + (ok ? 1 : 0)
    if (ok) setCorrect(nc)

    setTimeout(() => {
      if (qNum >= lv.rounds) {
        const ratio = nc / lv.rounds
        const stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.5 ? 1 : 0
        if (stars > 0) setGameStars(GAME_ID, lv.id, stars)
        setResult({ cleared: stars > 0, stars })
        setPhase('result')
      } else {
        setQ(makeQuestion(lv)); setQNum(qNum + 1); setPicked(null)
      }
    }, ok ? 650 : 1100)
  }, [level, q, picked, correct, qNum])

  // ── 렌더 ──────────────────────────────────────
  if (phase === 'select') {
    return (
      <main style={wrap}>
        <NavBar title="음 듣고 맞히기" />
        <h1 style={{ ...h1, color: COLOR }}>🎧 음 듣고 맞히기</h1>
        <p style={sub}>들려주는 음(또는 두 음의 간격)을 맞혀보세요. {EAR_LEVELS[0].rounds}문제 중 정답률로 별을 받습니다.</p>
        <LevelSelect gameId={GAME_ID} levels={EAR_LEVELS} color={COLOR} onPick={startLevel} />
      </main>
    )
  }

  const lv = level!
  const isInterval = lv.kind === 'interval'
  const choices = isInterval ? lv.intervals! : lv.pool

  return (
    <main style={wrap}>
      <NavBar title="음 듣고 맞히기" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
        <span style={{ fontWeight: 'var(--font-weight-bold)', color: COLOR }}>{lv.name}</span>
        <span style={{ color: 'var(--color-text-secondary)' }}>{qNum} / {lv.rounds} · 정답 {correct}</span>
      </div>

      {/* 진행 바 */}
      <div style={{ height: 8, background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-pill)', overflow: 'hidden', marginBottom: 'var(--space-lg)' }}>
        <div style={{ width: `${((qNum - 1) / lv.rounds) * 100}%`, height: '100%', background: COLOR, transition: 'width var(--duration-normal)' }} />
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
        <button onClick={() => q && playQ(lv, q)} style={{ ...primary, background: COLOR, boxShadow: '0 4px 0 #a44ed6' }}>🔊 다시 듣기</button>
        {!isInterval && <button onClick={() => playTone(midiToHz(60), 700)} style={ghost}>🎹 기준음 도(C4)</button>}
      </div>

      <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 var(--space-sm)' }}>
        {isInterval ? '두 음의 간격은?' : '방금 들린 음은?'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-sm)' }}>
        {choices.map((c) => {
          const isPicked = picked === c
          const isAnswer = picked != null && c === q!.answer
          const wrong = isPicked && c !== q!.answer
          return (
            <button
              key={c}
              onClick={() => answer(c)}
              style={{
                ...noteBtn,
                background: isAnswer ? 'var(--color-primary)' : wrong ? 'var(--color-cardinal)' : 'var(--color-bg)',
                color: isAnswer || wrong ? 'var(--color-text-inverse)' : 'var(--color-text)',
                borderColor: isAnswer ? 'var(--color-primary)' : wrong ? 'var(--color-cardinal)' : 'var(--color-border)',
              }}
            >
              {isInterval ? (
                <span style={{ fontSize: 'var(--font-size-subhead)', fontWeight: 'var(--font-weight-heavy)' }}>{INTERVAL_LABEL[c]}</span>
              ) : (
                <>
                  <span style={{ fontSize: 'var(--font-size-subhead)', fontWeight: 'var(--font-weight-heavy)' }}>{noteLabel(c)}</span>
                  <span style={{ fontSize: 'var(--font-size-caption)', opacity: 0.8 }}>{noteLetter(c)}</span>
                </>
              )}
            </button>
          )
        })}
      </div>

      {picked != null && picked !== q!.answer && (
        <p style={{ color: 'var(--color-cardinal)', fontWeight: 'var(--font-weight-bold)', marginTop: 'var(--space-md)' }}>
          정답: {isInterval ? INTERVAL_LABEL[q!.answer] : `${noteLabel(q!.answer)}(${noteLetter(q!.answer)})`}
        </p>
      )}

      <button onClick={() => { setPhase('select'); setLevel(null) }} style={{ ...ghost, marginTop: 'var(--space-lg)' }}>← 레벨 선택</button>

      {phase === 'result' && result && (
        <ClearOverlay
          cleared={result.cleared}
          stars={result.stars}
          detail={`${lv.rounds}문제 중 ${correct}개 정답`}
          hasNext={levelIdx + 1 < EAR_LEVELS.length}
          onRetry={() => startLevel(levelIdx)}
          onSelect={() => { setResult(null); setPhase('select'); setLevel(null) }}
          onNext={() => startLevel(levelIdx + 1)}
        />
      )}
    </main>
  )
}

const wrap: React.CSSProperties = { maxWidth: 640, margin: '0 auto', padding: 'var(--space-lg) var(--space-gutter)' }
const h1: React.CSSProperties = { fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)', margin: '0 0 var(--space-xs)' }
const sub: React.CSSProperties = { color: 'var(--color-text-secondary)', margin: '0 0 var(--space-md)' }
const noteBtn: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
  padding: 'var(--space-md) 0', border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-lg)', cursor: 'pointer', fontFamily: 'var(--font-family)', boxShadow: 'var(--shadow-sm)',
}
const primary: React.CSSProperties = {
  padding: 'var(--space-sm) var(--space-lg)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-heavy)',
  color: 'var(--color-text-inverse)', border: 'none', borderRadius: 'var(--radius-lg)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
const ghost: React.CSSProperties = {
  padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text)', background: 'var(--color-bg)', border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-lg)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
