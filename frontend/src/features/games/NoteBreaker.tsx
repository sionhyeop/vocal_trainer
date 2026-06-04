// NoteBreaker.tsx — 🎹 피아노 타일(음 깨기): 세로 레인으로 검은 타일이 위→아래로 떨어지고,
// 그 레인(건반)의 음정을 소리내면 하단 히트존에서 깨진다. 목소리로 건반을 누르는 피아노 타일.
// 게임 루프는 useMicPitch의 onFrame(매 프레임)으로 구동.
import { useCallback, useEffect, useRef, useState } from 'react'
import NavBar from '../../components/NavBar'
import { useMicPitch, type PitchFrame } from '../../hooks/useMicPitch'
import { midiToNoteName } from '../../lib/midi'
import { getProfile, setGameStars } from '../../lib/storage'
import { BREAKER_LEVELS, type BreakerLevel } from './levels'
import LevelSelect from './LevelSelect'
import ClearOverlay from './ClearOverlay'

const GAME_ID = 'breaker'
const COLOR = 'var(--color-macaw)'

const KEYBOARD_H = 56 // 하단 건반 높이(px)
const TILE_H = 60 // 타일 높이(px)
const HIT_BAND = 46 // 히트존 반높이(px) — 클수록 관대(완만)
const LEAD_MS = 2800 // 첫 타일이 히트라인 닿기까지 여유
const LIVES = 3

interface Tile { lane: number; hitTime: number; broken: boolean; missed: boolean }
interface Particle { x: number; y: number; age: number; color: string }

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
function octaveErr(a: number, b: number): number {
  let best = Infinity
  for (let k = -2; k <= 2; k++) best = Math.min(best, Math.abs(a - b - 12 * k))
  return best
}
function fitTranspose(lanes: number[]): number {
  const p = getProfile()
  if (!p) return 0
  const center = (Math.min(...lanes) + Math.max(...lanes)) / 2
  const pCenter = (p.lowMidi + p.highMidi) / 2
  return Math.round((pCenter - center) / 12) * 12
}
function genTiles(level: BreakerLevel): Tile[] {
  const out: Tile[] = []
  let prev = -1
  const N = level.lanes.length
  for (let i = 0; i < level.count; i++) {
    let lane = Math.floor(Math.random() * N)
    if (N > 1) { let g = 0; while (lane === prev && g++ < 8) lane = Math.floor(Math.random() * N) }
    prev = lane
    out.push({ lane, hitTime: LEAD_MS + i * level.gapMs, broken: false, missed: false })
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
  const tilesRef = useRef<Tile[]>([])
  const lanesRef = useRef<number[]>([]) // 이조된 레인 음정
  const pxPerMsRef = useRef(0.13)
  const partsRef = useRef<Particle[]>([])
  const flashRef = useRef<number[]>([]) // 레인별 최근 깨짐 시각(건반 플래시)
  const startRef = useRef(0)
  const lastElRef = useRef(0)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const bestComboRef = useRef(0)
  const livesRef = useRef(LIVES)
  const doneRef = useRef(false)
  const levelRef = useRef<BreakerLevel | null>(null)

  const finish = useCallback((cleared: boolean) => {
    if (doneRef.current) return
    doneRef.current = true
    stop()
    const total = tilesRef.current.length
    const hit = tilesRef.current.filter((t) => t.broken).length
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
    if (startRef.current === 0) { startRef.current = now; lastElRef.current = 0; return }
    let elapsed = now - startRef.current
    if (lastElRef.current > 0 && elapsed - lastElRef.current > 400) {
      startRef.current += elapsed - lastElRef.current // 백그라운드 탭 점프 동결
      elapsed = now - startRef.current
    }
    lastElRef.current = elapsed

    const lanes = lanesRef.current
    const N = lanes.length
    const pxPerMs = pxPerMsRef.current
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const laneW = w / N
    const hitLineY = h - KEYBOARD_H - 8
    const yFor = (hitTime: number) => hitLineY - (hitTime - elapsed) * pxPerMs

    // 내 음정 → 가장 가까운 레인(옥타브 무관, tol 이내)
    const live = f.voiced && f.midi != null ? f.midi : null
    let activeLane = -1
    if (live != null) {
      let best = lv.tolSemi + 0.001
      for (let i = 0; i < N; i++) {
        const e = octaveErr(live, lanes[i])
        if (e < best) { best = e; activeLane = i }
      }
    }

    // ── 판정 ──
    let changed = false
    for (const t of tilesRef.current) {
      if (t.broken || t.missed) continue
      const y = yFor(t.hitTime)
      if (Math.abs(y - hitLineY) <= HIT_BAND) {
        if (t.lane === activeLane) {
          t.broken = true
          scoreRef.current += 10 + comboRef.current * 2
          comboRef.current += 1
          bestComboRef.current = Math.max(bestComboRef.current, comboRef.current)
          flashRef.current[t.lane] = now
          partsRef.current.push({ x: t.lane * laneW + laneW / 2, y: hitLineY, age: 0, color: '#58cc02' })
          changed = true
        }
      } else if (y > hitLineY + HIT_BAND) {
        t.missed = true
        comboRef.current = 0
        livesRef.current -= 1
        partsRef.current.push({ x: t.lane * laneW + laneW / 2, y: hitLineY, age: 0, color: '#ff4b4b' })
        changed = true
      }
    }
    if (changed) setHud({ score: scoreRef.current, combo: comboRef.current, lives: Math.max(0, livesRef.current) })

    // ── 그리기(피아노 타일) ──
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)

    // 레인 배경(번갈아 옅게) + 활성 레인 하이라이트 + 구분선
    for (let i = 0; i < N; i++) {
      const x = i * laneW
      if (i % 2 === 1) { ctx.fillStyle = '#fafafa'; ctx.fillRect(x, 0, laneW, hitLineY + HIT_BAND) }
      if (i === activeLane) { ctx.fillStyle = 'rgba(28,176,246,0.10)'; ctx.fillRect(x, 0, laneW, hitLineY + HIT_BAND) }
      ctx.strokeStyle = '#eeeeee'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, hitLineY + HIT_BAND); ctx.stroke()
    }

    // 히트라인
    ctx.strokeStyle = '#1cb0f6'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(0, hitLineY); ctx.lineTo(w, hitLineY); ctx.stroke()

    // 타일(검은 둥근 사각, 음이름 흰글씨)
    ctx.textAlign = 'center'
    for (const t of tilesRef.current) {
      if (t.broken) continue
      const cy = yFor(t.hitTime)
      if (cy < -TILE_H || cy > h) continue
      const x = t.lane * laneW + 5
      const tw = laneW - 10
      const near = Math.abs(cy - hitLineY) <= HIT_BAND
      ctx.fillStyle = t.missed ? '#dddddd' : near ? '#ffc800' : '#1a1a1a'
      roundRectPath(ctx, x, cy - TILE_H / 2, tw, TILE_H, 8)
      ctx.fill()
      ctx.fillStyle = t.missed ? '#999' : near ? '#1a1a1a' : '#ffffff'
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText(midiToNoteName(lanes[t.lane]), t.lane * laneW + laneW / 2, cy + 5)
    }

    // 파티클
    for (const p of partsRef.current) {
      const r = 8 + p.age * 1.6
      ctx.globalAlpha = Math.max(0, 1 - p.age / 14)
      ctx.strokeStyle = p.color; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke()
      p.age++
    }
    ctx.globalAlpha = 1
    partsRef.current = partsRef.current.filter((p) => p.age < 14)

    // 하단 건반 — 레인별 키, 활성/플래시 표시
    const keyY = h - KEYBOARD_H
    for (let i = 0; i < N; i++) {
      const x = i * laneW
      const flash = now - (flashRef.current[i] || 0) < 220
      const active = i === activeLane
      ctx.fillStyle = flash ? '#58cc02' : active ? '#1cb0f6' : '#ffffff'
      roundRectPath(ctx, x + 3, keyY + 3, laneW - 6, KEYBOARD_H - 6, 7)
      ctx.fill()
      ctx.strokeStyle = '#dddddd'; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = flash || active ? '#ffffff' : '#555555'
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText(midiToNoteName(lanes[i]), x + laneW / 2, keyY + KEYBOARD_H / 2 + 5)
    }
    ctx.textAlign = 'left'

    // ── 종료 ──
    if (livesRef.current <= 0) { finish(false); return }
    const last = tilesRef.current[tilesRef.current.length - 1]
    if (last && elapsed > last.hitTime + 900 && tilesRef.current.every((t) => t.broken || t.missed)) {
      finish(true)
    }
  }, [finish])

  const { error, start, stop } = useMicPitch(onFrame)

  const sizeCanvas = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    c.width = Math.round(c.clientWidth * dpr)
    c.height = Math.round(420 * dpr)
    const cx = c.getContext('2d')
    if (cx) cx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [])

  const play = useCallback(async (idx: number) => {
    const lv = BREAKER_LEVELS[idx]
    const transpose = fitTranspose(lv.lanes)
    lanesRef.current = lv.lanes.map((m) => m + transpose)
    tilesRef.current = genTiles(lv)
    partsRef.current = []
    flashRef.current = []
    pxPerMsRef.current = lv.speedPxPerSec / 1000
    scoreRef.current = 0; comboRef.current = 0; bestComboRef.current = 0; livesRef.current = LIVES
    startRef.current = 0; lastElRef.current = 0
    doneRef.current = false
    levelRef.current = lv
    setLevel(lv); setLevelIdx(idx); setHud({ score: 0, combo: 0, lives: LIVES }); setResult(null)
    setPhase('playing')
    const ok = await start()
    if (!ok) { setPhase('select'); setLevel(null) }
  }, [start])

  const leave = useCallback(() => { stop(); doneRef.current = true; setPhase('select'); setLevel(null) }, [stop])

  useEffect(() => {
    if (phase !== 'playing') return
    sizeCanvas()
    window.addEventListener('resize', sizeCanvas)
    return () => window.removeEventListener('resize', sizeCanvas)
  }, [phase, sizeCanvas])

  // ── 렌더 ──
  if (phase === 'select') {
    return (
      <main style={wrap}>
        <NavBar title="피아노 타일" />
        <h1 style={{ ...h1, color: COLOR }}>🎹 피아노 타일</h1>
        <p style={sub}>검은 타일이 떨어집니다. 타일이 아래 건반에 닿는 순간 그 음을 소리내 깨세요! 콤보를 이어가세요.{getProfile() ? ' (내 음역대에 맞춰 조정됨)' : ''}</p>
        <LevelSelect gameId={GAME_ID} levels={BREAKER_LEVELS} color={COLOR} onPick={play} />
      </main>
    )
  }

  const lv = level!
  return (
    <main style={wrap}>
      <NavBar title="피아노 타일" />
      {error && <p style={{ color: 'var(--color-cardinal)' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
        <span style={{ fontWeight: 'var(--font-weight-heavy)', color: COLOR }}>점수 {hud.score} {hud.combo >= 2 && <span style={{ color: 'var(--color-bee)' }}>· {hud.combo} COMBO</span>}</span>
        <span style={{ fontSize: 'var(--font-size-subhead)' }}>{'❤️'.repeat(hud.lives)}{'🤍'.repeat(LIVES - hud.lives)}</span>
      </div>

      <canvas ref={canvasRef} role="img" aria-label="피아노 타일 게임 — 검은 타일이 위에서 떨어집니다" style={{ width: '100%', height: 420, borderRadius: 'var(--radius-md)', border: 'var(--border-width) solid var(--color-border)', touchAction: 'none' }} />
      <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
        아래 건반의 음이름을 타일이 닿는 순간 소리내세요. 파란 건반=지금 내 음정. {lv.name}
      </div>

      <button onClick={leave} style={{ marginTop: 'var(--space-md)', ...ghost }}>← 레벨 선택으로</button>

      {phase === 'result' && result && (
        <ClearOverlay
          cleared={result.cleared}
          stars={result.stars}
          detail={result.cleared ? `${result.hit}/${result.total}타일 격파! 최고콤보 ${bestComboRef.current}` : `${result.hit}/${result.total}타일 — 하트를 모두 잃었어요. 다시!`}
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
