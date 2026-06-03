// NoteMapViewPage.tsx — 추출/가이드 노트맵 보기 (테스트용 피아노롤)
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import NavBar from '../../components/NavBar'
import { listNoteMaps } from '../../lib/noteMapStore'
import { midiToNoteName } from '../../lib/midi'
import { parseVideoTitle } from '../../lib/titleParser'
import { useLyrics } from '../../hooks/useLyrics'
import type { LyricLine } from '../../lib/lrcParser'
import type { NoteMap } from '../../lib/noteMap'

function drawRoll(canvas: HTMLCanvasElement | null, map: NoteMap | null, lines: LyricLine[] = []) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)
  if (!map || map.notes.length === 0) return

  const notes = map.notes
  const dur = Math.max(...notes.map((n) => n.endMs))
  const lo = Math.min(...notes.map((n) => n.midiNote)) - 1
  const hi = Math.max(...notes.map((n) => n.midiNote)) + 1
  const span = hi - lo + 1
  const leftPad = 46
  const pxPerSemi = H / span
  const midiToY = (m: number) => H - (m - lo + 0.5) * pxPerSemi
  const pxPerMs = (W - leftPad) / dur
  const timeToX = (t: number) => leftPad + t * pxPerMs

  // 가로 레인 + 음이름
  ctx.font = '11px sans-serif'
  ctx.textBaseline = 'middle'
  for (let m = lo; m <= hi; m++) {
    const y = midiToY(m)
    ctx.strokeStyle = ((m % 12) + 12) % 12 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(leftPad, y); ctx.lineTo(W, y); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText(midiToNoteName(m), 6, y)
  }

  // 5초 세로 눈금
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.textBaseline = 'top'
  for (let s = 0; s * 5000 <= dur; s++) {
    const x = timeToX(s * 5000)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    ctx.fillText(`${s * 5}s`, x + 2, 2)
  }

  // 노트 막대
  const barH = pxPerSemi * 0.78
  for (const n of notes) {
    const x = timeToX(n.startMs)
    const w = Math.max(2, (n.endMs - n.startMs) * pxPerMs)
    const y = midiToY(n.midiNote) - barH / 2
    ctx.fillStyle = '#1cb0f6'
    ctx.shadowColor = '#1cb0f6'
    ctx.shadowBlur = 4
    const rr = Math.min(4, w / 2, barH / 2)
    ctx.beginPath()
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + barH, rr)
    ctx.arcTo(x + w, y + barH, x, y + barH, rr)
    ctx.arcTo(x, y + barH, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // 가사 정렬 검토: 가사 줄 시작 시각에 세로 점선 + 텍스트
  if (lines.length) {
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(255,75,75,0.5)'
    ctx.lineWidth = 1
    ctx.font = '11px sans-serif'
    ctx.textBaseline = 'top'
    let lastLabelX = -999
    for (const l of lines) {
      const x = timeToX(l.time * 1000)
      if (x < leftPad || x > W) continue
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      if (l.text && x - lastLabelX > 46) {
        ctx.fillStyle = 'rgba(255,150,150,0.95)'
        ctx.fillText(l.text.slice(0, 6), x + 2, 16)
        lastLabelX = x
      }
    }
    ctx.setLineDash([])
  }
}

export default function NoteMapViewPage() {
  const [maps] = useState(() => listNoteMaps())
  const [sel, setSel] = useState(0)
  const [showLyrics, setShowLyrics] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const current = maps[sel]?.map ?? null

  // 가사 정렬 검토용 (곡 제목으로 가사 조회)
  const parsed = useMemo(() => (current ? parseVideoTitle(current.title) : null), [current])
  const lyrics = useLyrics(parsed)
  const lyricLines = showLyrics ? lyrics.lines : []

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const render = () => {
      c.width = c.clientWidth
      c.height = c.clientHeight
      drawRoll(c, current, lyricLines)
    }
    render()
    window.addEventListener('resize', render)
    return () => window.removeEventListener('resize', render)
  }, [current, lyricLines])

  const dur = current && current.notes.length ? Math.max(...current.notes.map((n) => n.endMs)) : 0

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--space-lg) var(--space-gutter)' }}>
      <NavBar title="추출 음정 보기 (테스트)" />
      <h1 style={{ fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)', color: 'var(--color-primary)', margin: '0 0 var(--space-md)' }}>
        🎼 추출/가이드 음정 보기
      </h1>

      {maps.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>
          저장된 노트맵이 없습니다. 가창 화면에서 <b>🎵 원곡 자동 추출</b> 또는 <b>🎙 가이드 녹음</b>을 먼저 하면 여기에 나타납니다.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-sm)' }}>
            <select value={sel} onChange={(e) => setSel(Number(e.target.value))} style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', border: 'var(--border-width) solid var(--color-border)', fontFamily: 'var(--font-family)', fontSize: 'var(--font-size-body)' }}>
              {maps.map((m, i) => (
                <option key={m.videoId} value={i}>{m.map.title || m.videoId} ({m.map.notes.length}노트)</option>
              ))}
            </select>
            {current && <Link to={`/sing/${maps[sel].videoId}`} style={{ color: 'var(--color-macaw)', fontWeight: 'var(--font-weight-bold)', textDecoration: 'none' }}>▶ 이 곡 부르러 가기</Link>}
          </div>

          {current && (
            <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)', display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
              <span>
                출처: {current.license === 'auto-extract-vocals' ? '원곡 자동추출(보컬분리)' : current.license === 'auto-extract-mix' ? '원곡 자동추출(믹스)' : '가이드 녹음'} · 노트 {current.notes.length}개 · 길이 {(dur / 1000).toFixed(1)}초
              </span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={showLyrics} onChange={(e) => setShowLyrics(e.target.checked)} />
                가사 정렬 표시(빨간 점선)
              </label>
              {showLyrics && lyrics.status === 'ok' && <span style={{ color: 'var(--color-primary)' }}>가사 {lyrics.lines.length}줄</span>}
              {showLyrics && lyrics.status === 'notfound' && <span style={{ color: 'var(--color-fox)' }}>가사 못 찾음(곡 제목만으로 매칭 실패)</span>}
            </div>
          )}

          <canvas ref={canvasRef} style={{ width: '100%', height: 380, display: 'block', borderRadius: 'var(--radius-lg)', background: '#0d1117' }} />
          <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-sm)' }}>
            가로축=시간, 세로축=음정. 파란 막대=추출된 멜로디, <span style={{ color: 'var(--color-cardinal)' }}>빨간 점선=가사 줄 시작</span>. 가사 점선 위치에 음 막대가 있으면 정렬이 맞는 겁니다. 저음으로 튀는 막대는 추출 오류일 수 있어요.
          </p>
        </>
      )}
    </main>
  )
}
