// ribbonDraw.ts — 가창 화면 피치 리본
//  - Tier B: 목표 블록 없이 내 피치 트레일 (자동 센터링)
//  - Tier A(멜로디): 노래방 퍼펙트 스코어식 — 목표 막대가 날아오고 내 목소리 마커가 음을 따라감
import { midiToNoteName } from '../../lib/midi'
import type { Note } from '../../lib/noteMap'

export interface RibbonSample {
  midi: number | null
  tMs?: number // 멜로디 모드에서 재생시간 동기용
}

const RANGE = 12 // 중심 ±12 반음(2옥타브) → 음역 넉넉, 떨림이 작게 보임
const MAX_HISTORY = 360

// 최근 유성음들의 평균으로 중심을 잡아 트레일이 항상 보이게(자동 센터링)
function centerOf(hist: RibbonSample[]): number {
  const recent: number[] = []
  for (let i = hist.length - 1; i >= 0 && recent.length < 90; i--) {
    if (hist[i].midi != null) recent.push(hist[i].midi as number)
  }
  if (recent.length === 0) return 60
  return Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)
}

// 현재 음 마커 + 음이름 라벨
function drawVoiceMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  midi: number | null,
  midiToY: (m: number) => number,
  H: number,
  hit: boolean,
) {
  if (midi == null) return
  const rawY = midiToY(midi)
  const y = Math.max(10, Math.min(H - 10, rawY))
  const color = hit ? '#58cc02' : '#ffffff'
  // 글로우 점
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = hit ? 22 : 8
  ctx.beginPath()
  ctx.arc(x, y, hit ? 13 : 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  // 음이름 라벨
  const label = midiToNoteName(midi)
  ctx.font = 'bold 13px sans-serif'
  const w = ctx.measureText(label).width + 12
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  roundRect(ctx, x + 12, y - 11, w, 22, 6)
  ctx.fill()
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + 18, y + 1)
  // 음역 벗어나면 화살표
  if (rawY < 10) { ctx.fillStyle = color; ctx.fillText('▲', x - 18, 12) }
  if (rawY > H - 10) { ctx.fillStyle = color; ctx.fillText('▼', x - 18, H - 12) }
}

export function drawSingRibbon(canvas: HTMLCanvasElement | null, hist: RibbonSample[]) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const center = centerOf(hist)
  const pxPerSemi = H / (2 * RANGE)
  const midiToY = (m: number) => H / 2 - (m - center) * pxPerSemi

  ctx.font = '11px sans-serif'
  ctx.textBaseline = 'middle'
  for (let s = -RANGE; s <= RANGE; s++) {
    const m = center + s
    const y = midiToY(m)
    const isC = ((m % 12) + 12) % 12 === 0
    ctx.strokeStyle = isC ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(36, y)
    ctx.lineTo(W, y)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText(midiToNoteName(m), 4, y)
  }

  const nowX = W - 80
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(nowX, 0)
  ctx.lineTo(nowX, H)
  ctx.stroke()

  const n = hist.length
  const step = nowX / MAX_HISTORY
  let last: { x: number; y: number } | null = null
  for (let i = 0; i < n; i++) {
    const m = hist[i].midi
    if (m == null) { last = null; continue }
    const x = nowX - (n - 1 - i) * step
    if (x < 36) continue
    const y = midiToY(m)
    if (last) {
      ctx.strokeStyle = '#1cb0f6'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    last = { x, y }
  }
  drawVoiceMarker(ctx, nowX, hist[n - 1]?.midi ?? null, midiToY, H, false)
}

// ── Tier A 멜로디 리본 (노래방 퍼펙트 스코어식) ──────────
const LOOKAHEAD_MS = 2200 // 화면에 보이는 시간 폭(작을수록 막대가 가로로 더 넓직)
const PAST_MS = 1500

function median(values: number[]): number {
  if (values.length === 0) return 60
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function drawMelodyRibbon(
  canvas: HTMLCanvasElement | null,
  hist: RibbonSample[],
  notes: Note[],
  currentMs: number,
) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  // 목표가 있으면 멜로디 음역, 없으면(자유 모드) 내 목소리에 맞춰 센터링
  const center = notes.length ? Math.round(median(notes.map((n) => n.midiNote))) : centerOf(hist)
  const pxPerSemi = H / (2 * RANGE)
  const midiToY = (m: number) => H / 2 - (m - center) * pxPerSemi

  const nowX = Math.round(W * 0.34)
  const pxPerMs = (W - nowX) / LOOKAHEAD_MS
  const timeToX = (t: number) => nowX + (t - currentMs) * pxPerMs

  // 레인
  ctx.font = '11px sans-serif'
  ctx.textBaseline = 'middle'
  for (let s = -RANGE; s <= RANGE; s++) {
    const m = center + s
    const y = midiToY(m)
    ctx.strokeStyle = ((m % 12) + 12) % 12 === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(36, y); ctx.lineTo(W, y); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillText(midiToNoteName(m), 4, y)
  }

  // now 라인 판정존(살짝 밝은 띠)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fillRect(nowX - 6, 0, 12, H)

  // 현재 사용자 음 / 활성 노트 / 히트 판정
  const userMidi = hist[hist.length - 1]?.midi ?? null
  let activeNote: Note | null = null
  for (const n of notes) {
    if (currentMs >= n.startMs && currentMs < n.endMs) { activeNote = n; break }
    if (n.startMs > currentMs) break
  }
  // 관대한 히트 판정(±1 반음) — 넓직한 막대와 맞춤
  const hit = !!(activeNote && userMidi != null && Math.abs(userMidi - activeNote.midiNote) <= 1.0)

  // 목표 막대 (날아옴) — 넓직하게(약 1.5반음 높이)
  const blockH = pxPerSemi * 1.5
  for (const n of notes) {
    if (n.endMs < currentMs - PAST_MS || n.startMs > currentMs + LOOKAHEAD_MS) continue
    const x0 = timeToX(n.startMs)
    const x1 = timeToX(n.endMs)
    const y = midiToY(n.midiNote) - blockH / 2
    const w = Math.max(3, x1 - x0)
    const isActive = n === activeNote
    if (isActive && hit) {
      ctx.fillStyle = '#58cc02'; ctx.shadowColor = '#58cc02'; ctx.shadowBlur = 20
    } else if (isActive) {
      ctx.fillStyle = 'rgba(255,150,0,0.85)'; ctx.shadowColor = '#ff9600'; ctx.shadowBlur = 10
    } else {
      ctx.fillStyle = 'rgba(28,176,246,0.45)'; ctx.shadowBlur = 0
    }
    roundRect(ctx, x0, y, w, blockH, 6)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // 내 목소리 = 가로로 길쭉한 막대 (각 샘플을 짧은 가로 캡슐로 → 세로 줄무늬 없음)
  const barH = Math.min(pxPerSemi * 1.35, 44) // 내 목소리 막대 — 넓직하게
  ctx.fillStyle = hit ? 'rgba(88,204,2,0.95)' : 'rgba(255,255,255,0.88)'
  for (let i = 0; i < hist.length; i++) {
    const s = hist[i]
    if (s.midi == null || s.tMs == null || s.tMs < currentMs - PAST_MS) continue
    // 입력단(One Euro)에서 이미 스무딩됨 → 여기선 가벼운 ±1만(이중 지연 방지)
    let sum = s.midi, cnt = 1
    for (let k = i - 1; k <= i + 1; k++) {
      if (k === i || k < 0 || k >= hist.length) continue
      const m = hist[k].midi
      if (m != null) { sum += m; cnt++ }
    }
    const midi = sum / cnt
    const x = timeToX(s.tMs)
    const next = hist[i + 1]
    const x2 = next && next.tMs != null ? timeToX(next.tMs) : x + 5
    const w = Math.max(4, x2 - x + 1) // +1 겹침으로 가로 연결
    roundRect(ctx, x, midiToY(midi) - barH / 2, w, barH, barH / 2)
    ctx.fill()
  }

  // 활성 목표 음이름(상단)
  if (activeNote) {
    ctx.font = 'bold 14px sans-serif'
    ctx.fillStyle = hit ? '#58cc02' : '#ff9600'
    ctx.textBaseline = 'top'
    ctx.fillText(`목표 ${midiToNoteName(activeNote.midiNote)}${hit ? '  ✓ 맞음!' : ''}`, 40, 8)
  }

  // 현재 음 마커
  drawVoiceMarker(ctx, nowX, userMidi, midiToY, H, hit)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

export { MAX_HISTORY }
