// NoteBreaker.tsx — 🧱 음 깨기: 음표가 오른쪽에서 날아와 히트라인에서 내 음정과 맞으면 깨진다.
// 캔버스 게임. 게임 루프는 useMicPitch의 onFrame(매 프레임)으로 구동 — 최신 피치로 판정+그리기.
import { useCallback, useEffect, useRef, useState } from 'react'
import NavBar from '../../components/NavBar'
import { useMicPitch, type PitchFrame } from '../../hooks/useMicPitch'
import { midiToNoteName } from '../../lib/midi'
import { getProfile, setGameStars } from '../../lib/storage'
import { BREAKER_LEVELS, type BreakerLevel } from './levels'
import LevelSelect from './LevelSelect'
import ClearOverlay from './ClearOverlay'

const GAME_ID = 'breaker'
const COLOR = 'var(--color-cardinal)'

const HIT_X = 92 // 히트라인 x(px)
const HIT_W = 34 // 히트 윈도우 반폭(px)
const LEAD_MS = 2600 // 첫 음표가 히트라인 닿기까지 여유
const LIVES = 3

interface GNote { midi: number; hitTime: number; broken: boolean; missed: boolean }
interface Particle { x: number; y: number; age: number; color: string }

// 둥근 사각형 경로(ctx.roundRect는 일부 환경에서 미지원/예외 → arcTo로 직접 그림)
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 옥타브 무관 오차(반음)
function octaveErr(a: number, b: number): number {
  let best = Infinity
  for (let k = -2; k <= 2; k++) best = Math.min(best, Math.abs(a - b - 12 * k))
  return best
}
// 프로필 음역대 중심으로 옥타브 단위 이조
function fitTranspose(scale: number[]): number {
  const p = getProfile()
  if (!p) return 0
  const center = (Math.min(...scale) + Math.max(...scale)) / 2
  const pCenter = (p.lowMidi + p.highMidi) / 2
  return Math.round((pCenter - center) / 12) * 12
}
function genNotes(level: BreakerLevel, transpose: number): GNote[] {
  const out: GNote[] = []
  let prev = -1
  for (let i = 0; i < level.count; i++) {
    let m = level.scale[Math.floor(Math.random() * level.scale.length)]
    if (level.scale.length > 1) {
      let guard = 0
      while (m === prev && guard++ < 8) m = level.scale[Math.floor(Math.random() * level.scale.length)]
    }
    prev = m
    out.push({ midi: m + transpose, hitTime: LEAD_MS + i * level.gapMs, broken: false, missed: false })
  }
  return out
}

type Phase = 'select' | 'playing' | 'result'

export default function NoteBreaker() {
  const [phase, setPhase] = useState<Phase>('select')
  const [level, setLevel] = useState<BreakerLevel | null>(null)
  const [levelIdx, setLevelIdx] = useState(0)
  const [hud, setHud] = useState({ score: 0, combo: 0, lives: LIVES })
  const [result, setResult] = useState<{ cleared: boolean; stars: number; hit: number; total: number } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const notesRef = useRef<GNote[]>([])
  const partsRef = useRef<Particle[]>([])
  const startRef = useRef(0)
  const lastElRef = useRef(0) // 직전 프레임 경과(백그라운드 탭 점프 클램프용)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const bestComboRef = useRef(0)
  const livesRef = useRef(LIVES)
  const doneRef = useRef(false)
  const levelRef = useRef<BreakerLevel | null>(null)
  const rangeRef = useRef({ lo: 55, hi: 74, pxPerMs: 0.1 })

  const finish = useCallback((cleared: boolean) => {
    if (doneRef.current) return
    doneRef.current = true
    stop()
    const total = notesRef.current.length
    const hit = notesRef.current.filter((n) => n.broken).length
    const rate = total ? hit / total : 0
    const stars = !cleared ? 0 : rate >= 0.85 ? 3 : rate >= 0.6 ? 2 : rate >= 0.35 ? 1 : 0
    const lv = levelRef.current
    if (stars >= 1 && lv) setGameStars(GAME_ID, lv.id, stars)
    setResult({ cleared: stars >= 1, stars, hit, total })
    setPhase('result')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onFrame = useCallback((f: PitchFrame) => {
    if (doneRef.current) return
    const lv = levelRef.current
    const canvas = canvasRef.current
    if (!lv || !canvas) return
    const now = performance.now()
    if (startRef.current === 0) { startRef.current = now; lastElRef.current = 0; return } // 첫 프레임에 기준시각 고정
    let elapsed = now - startRef.current
    // 백그라운드 탭 등으로 프레임이 크게 건너뛰면 게임시간을 동결(대량 놓침 방지)
    if (lastElRef.current > 0 && elapsed - lastElRef.current > 400) {
      startRef.current += elapsed - lastElRef.current
      elapsed = now - startRef.current
    }
    lastElRef.current = elapsed
    const { lo, hi, pxPerMs } = rangeRef.current
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const yFor = (midi: number) => {
      const t = (midi - lo) / (hi - lo) // 0..1
      return h - 14 - t * (h - 28) // 높은 음=위
    }
    const live = f.voiced && f.midi != null ? f.midi : null

    // ── 판정 ──
    let changed = false
    for (const n of notesRef.current) {
      if (n.broken || n.missed) continue
      const x = HIT_X + (n.hitTime - elapsed) * pxPerMs
      if (Math.abs(x - HIT_X) <= HIT_W) {
        if (live != null && octaveErr(live, n.midi) <= lv.tolSemi) {
          n.broken = true
          scoreRef.current += 10 + comboRef.current * 2
          comboRef.current += 1
          bestComboRef.current = Math.max(bestComboRef.current, comboRef.current)
          partsRef.current.push({ x: HIT_X, y: yFor(n.midi), age: 0, color: '#58cc02' })
          changed = true
        }
      } else if (x < HIT_X - HIT_W) {
        n.missed = true
        comboRef.current = 0
        livesRef.current -= 1
        partsRef.current.push({ x: HIT_X, y: yFor(n.midi), age: 0, color: '#ff4b4b' })
        changed = true
      }
    }
    if (changed) setHud({ score: scoreRef.current, combo: comboRef.current, lives: Math.max(0, livesRef.current) })

    // ── 그리기 ──
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#f7f7f7'; ctx.fillRect(0, 0, w, h)

    // 음 가로 가이드선 + 음이름(실제 등장하는 음들)
    ctx.font = '11px sans-serif'
    const transNotes = Array.from(new Set(notesRef.current.map((n) => n.midi))).sort((a, b) => a - b)
    ctx.strokeStyle = '#e5e5e5'; ctx.lineWidth = 1
    for (const m of transNotes) {
      const y = yFor(m)
      ctx.beginPath(); ctx.moveTo(HIT_X, y); ctx.lineTo(w, y); ctx.stroke()
      ctx.fillStyle = '#aaa'; ctx.fillText(midiToNoteName(m), 4, y + 4)
    }

    // 히트라인
    ctx.strokeStyle = '#1cb0f6'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(HIT_X, 0); ctx.lineTo(HIT_X, h); ctx.stroke()
    ctx.fillStyle = 'rgba(28,176,246,0.10)'; ctx.fillRect(HIT_X - HIT_W, 0, HIT_W * 2, h)

    // 음표(아직 안 깨진 것)
    for (const n of notesRef.current) {
      if (n.broken) continue
      const x = HIT_X + (n.hitTime - elapsed) * pxPerMs
      if (x < -30 || x > w + 30) continue
      const y = yFor(n.midi)
      const near = Math.abs(x - HIT_X) <= HIT_W
      ctx.fillStyle = n.missed ? '#ddd' : near ? '#ffc800' : '#1cb0f6'
      roundRectPath(ctx, x - 18, y - 13, 36, 26, 8)
      ctx.fill()
      ctx.fillStyle = n.missed ? '#999' : '#fff'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(midiToNoteName(n.midi), x, y + 4)
      ctx.textAlign = 'left'
    }

    // 파티클(깨짐/놓침 효과)
    for (const p of partsRef.current) {
      const r = 6 + p.age * 1.2
      ctx.globalAlpha = Math.max(0, 1 - p.age / 14)
      ctx.strokeStyle = p.color; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke()
      p.age++
    }
    ctx.globalAlpha = 1
    partsRef.current = partsRef.current.filter((p) => p.age < 14)

    // 내 음정 마커(히트라인 위, 음높이에 따라 위아래)
    if (live != null) {
      const y = Math.max(6, Math.min(h - 6, yFor(live)))
      const onTarget = notesRef.current.some((n) => !n.broken && !n.missed &&
        Math.abs(HIT_X + (n.hitTime - elapsed) * pxPerMs - HIT_X) <= HIT_W && octaveErr(live, n.midi) <= lv.tolSemi)
      ctx.fillStyle = onTarget ? '#58cc02' : '#ff9600'
      ctx.beginPath(); ctx.moveTo(HIT_X - 12, y); ctx.lineTo(HIT_X - 26, y - 8); ctx.lineTo(HIT_X - 26, y + 8); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.arc(HIT_X, y, 6, 0, Math.PI * 2); ctx.fill()
    }

    // ── 종료 판정 ──
    if (livesRef.current <= 0) { finish(false); return }
    const last = notesRef.current[notesRef.current.length - 1]
    if (last && elapsed > last.hitTime + 900 &&
      notesRef.current.every((n) => n.broken || n.missed)) {
      finish(true)
    }
  }, [finish])

  const { error, start, stop } = useMicPitch(onFrame)

  const sizeCanvas = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    c.width = Math.round(c.clientWidth * dpr)
    c.height = Math.round(300 * dpr)
    const cx = c.getContext('2d')
    if (cx) cx.setTransform(dpr, 0, 0, dpr, 0, 0) // 논리좌표로 그리되 선명하게
  }, [])

  const play = useCallback(async (idx: number) => {
    const lv = BREAKER_LEVELS[idx]
    const transpose = fitTranspose(lv.scale)
    const notes = genNotes(lv, transpose)
    const mids = notes.map((n) => n.midi)
    const lo = Math.min(...mids) - 2
    const hi = Math.max(...mids) + 2
    notesRef.current = notes
    partsRef.current = []
    scoreRef.current = 0; comboRef.current = 0; bestComboRef.current = 0; livesRef.current = LIVES
    doneRef.current = false
    levelRef.current = lv
    rangeRef.current = { lo, hi, pxPerMs: lv.speedPxPerSec / 1000 }
    startRef.current = 0 // 첫 onFrame에서 기준시각 잡음
    setLevel(lv); setLevelIdx(idx); setHud({ score: 0, combo: 0, lives: LIVES }); setResult(null)
    setPhase('playing')
    const ok = await start()
    if (!ok) { setPhase('select'); setLevel(null) } // 마이크 거부/실패 → 멈춤화면 대신 선택으로
  }, [start])

  const leave = useCallback(() => { stop(); doneRef.current = true; setPhase('select'); setLevel(null) }, [stop])

  useEffect(() => {
    if (phase !== 'playing') return
    sizeCanvas() // 캔버스 마운트 후 크기 확정
    window.addEventListener('resize', sizeCanvas)
    return () => window.removeEventListener('resize', sizeCanvas)
  }, [phase, sizeCanvas])

  // ── 렌더 ──
  if (phase === 'select') {
    return (
      <main style={wrap}>
        <NavBar title="음 깨기" />
        <h1 style={{ ...h1, color: COLOR }}>🧱 음 깨기</h1>
        <p style={sub}>음표가 날아오면 히트라인에서 그 음정을 소리내 깨세요! 콤보를 이어 점수를 올리세요.{getProfile() ? ' (내 음역대에 맞춰 조정됨)' : ''}</p>
        <LevelSelect gameId={GAME_ID} levels={BREAKER_LEVELS} color={COLOR} onPick={play} />
      </main>
    )
  }

  const lv = level!
  return (
    <main style={wrap}>
      <NavBar title="음 깨기" />
      {error && <p style={{ color: 'var(--color-cardinal)' }}>{error}</p>}

      {/* HUD */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
        <span style={{ fontWeight: 'var(--font-weight-heavy)', color: COLOR }}>점수 {hud.score} {hud.combo >= 2 && <span style={{ color: 'var(--color-bee)' }}>· {hud.combo} COMBO</span>}</span>
        <span style={{ fontSize: 'var(--font-size-subhead)' }}>{'❤️'.repeat(hud.lives)}{'🤍'.repeat(LIVES - hud.lives)}</span>
      </div>

      <canvas ref={canvasRef} role="img" aria-label="음 깨기 게임 화면 — 음표가 오른쪽에서 날아옵니다" style={{ width: '100%', height: 300, borderRadius: 'var(--radius-md)', border: 'var(--border-width) solid var(--color-border)', touchAction: 'none' }} />
      <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
        파란선=히트라인 · 날아오는 박스의 음이름을 그 순간 소리내면 깨집니다(▲=내 음정). {lv.name}
      </div>

      <button onClick={leave} style={{ marginTop: 'var(--space-md)', ...ghost }}>← 레벨 선택으로</button>

      {phase === 'result' && result && (
        <ClearOverlay
          cleared={result.cleared}
          stars={result.stars}
          detail={result.cleared ? `${result.hit}/${result.total}음 격파! 최고콤보 ${bestComboRef.current}` : `${result.hit}/${result.total}음 — 하트를 모두 잃었어요. 다시!`}
          hasNext={levelIdx + 1 < BREAKER_LEVELS.length}
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
