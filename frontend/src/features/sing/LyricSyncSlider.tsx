// LyricSyncSlider.tsx — 가사 싱크 세로 슬라이더 (음정 차트 우측, 넉넉한 폭)
// 방향(사용자 의도): 위로 올리면 가사가 "이전 줄로 되감김 = 늦게"(+), 아래로 내리면 "앞으로 = 빨리"(-).
// 중앙=0, 더블클릭=0. 범위 ±10초.
import { useRef } from 'react'

const MAX = 10 // ±10초

export default function LyricSyncSlider({ offset, onChange }: { offset: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const update = (clientY: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientY - r.top) / r.height))
    // 위(frac 0) = +MAX(늦게/되감기), 아래(frac 1) = -MAX(빨리)
    onChange(Math.round((0.5 - frac) * 2 * MAX * 10) / 10)
  }

  // 표시 위치: offset +MAX → 맨 위, -MAX → 맨 아래
  const frac = Math.min(1, Math.max(0, 0.5 - offset / (2 * MAX)))

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        update(e.clientY)
      }}
      onPointerMove={(e) => dragging.current && update(e.clientY)}
      onPointerUp={(e) => {
        dragging.current = false
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
      }}
      onDoubleClick={() => onChange(0)}
      title="가사 싱크 — 가사가 빨리 뜨면 위로(늦게), 늦게 뜨면 아래로(빨리). 더블클릭=0"
      style={{
        position: 'absolute', right: 6, top: 18, bottom: 18, width: 56,
        cursor: 'ns-resize', touchAction: 'none',
        display: 'flex', justifyContent: 'center', alignItems: 'stretch',
      }}
    >
      {/* 트랙 */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, width: 6, background: 'rgba(255,255,255,0.22)', borderRadius: 3 }} />
      {/* 중앙(0) 눈금 */}
      <div style={{ position: 'absolute', top: '50%', width: 28, height: 2, background: 'rgba(255,255,255,0.45)', transform: 'translateY(-1px)' }} />
      {/* 위/아래 힌트 */}
      <div style={{ position: 'absolute', top: -16, fontSize: 10, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>▲ 늦게</div>
      <div style={{ position: 'absolute', bottom: -16, fontSize: 10, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>▼ 빨리</div>
      {/* 썸(현재 값) */}
      <div
        style={{
          position: 'absolute', top: `${frac * 100}%`, transform: 'translateY(-50%)',
          minWidth: 50, padding: '4px 6px', borderRadius: 10,
          background: offset ? 'var(--color-bee)' : 'rgba(255,255,255,0.92)',
          color: '#2a2a2a', fontSize: 12, fontWeight: 800, textAlign: 'center',
          boxShadow: '0 1px 6px rgba(0,0,0,0.5)', pointerEvents: 'none',
        }}
      >
        {offset > 0 ? '+' : ''}{offset.toFixed(1)}s
      </div>
    </div>
  )
}
