// HistoryScreen.tsx — 연습 기록(세션) 목록 + 상세 + 삭제 (M6)
import { useState } from 'react'
import { Link } from 'react-router-dom'
import NavBar from '../../components/NavBar'
import { listSessions, deleteSession, type SessionResult } from '../../lib/storage'
import { fmtTime } from '../result/weakSections'
import { scoreColor } from '../result/ResultPanel'

function fmtDate(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function HistoryScreen() {
  const [items, setItems] = useState<SessionResult[]>(() => listSessions())
  const [open, setOpen] = useState<string | null>(null)

  const remove = (id: string) => {
    deleteSession(id)
    setItems(listSessions())
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--space-lg) var(--space-gutter)' }}>
      <NavBar title="연습 기록" />
      <h1 style={{ fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)', color: 'var(--color-primary)', margin: '0 0 var(--space-md)' }}>
        📈 연습 기록
      </h1>

      {items.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>
          아직 기록이 없습니다. <Link to="/" style={{ color: 'var(--color-macaw)', fontWeight: 'var(--font-weight-bold)' }}>곡을 불러보세요 →</Link>
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-xs)' }}>
          {items.map((s) => (
            <div key={s.id} style={card}>
              <button onClick={() => setOpen(open === s.id ? null : s.id)} style={rowBtn}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 'var(--font-weight-bold)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                  <span style={{ display: 'block', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>
                    {fmtDate(s.dateMs)} · {s.mode === 'melody' ? '정밀' : '자유'}
                  </span>
                </span>
                <span style={{ fontSize: 30, fontWeight: 'var(--font-weight-heavy)', color: scoreColor(s.score) }}>{s.score}<span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>/100</span></span>
              </button>

              {open === s.id && (
                <div style={{ padding: '0 var(--space-md) var(--space-sm)', fontSize: 'var(--font-size-caption)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
                    <span style={{ color: 'var(--color-primary)' }}>P {s.counts.Perfect}</span>
                    <span style={{ color: 'var(--color-macaw)' }}>G {s.counts.Great}</span>
                    <span style={{ color: 'var(--color-bee)' }}>Gd {s.counts.Good}</span>
                    <span style={{ color: 'var(--color-cardinal)' }}>M {s.counts.Miss}</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>최대콤보 {s.maxCombo}</span>
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
                    호흡 안정성 {s.breath.stability} · 최장발성 {(s.breath.longestPhraseMs / 1000).toFixed(1)}초
                  </div>
                  {s.weak.length > 0 && (
                    <div style={{ marginBottom: 'var(--space-xs)' }}>
                      약점: {s.weak.map((w) => `${fmtTime(w.timeMs)}(${w.deviation}¢)`).join(', ')}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                    <Link to={`/sing/${s.videoId}`} style={{ color: 'var(--color-macaw)', fontWeight: 'var(--font-weight-bold)', textDecoration: 'none' }}>다시 부르기 →</Link>
                    <button onClick={() => remove(s.id)} style={delBtn}>삭제</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

const card: React.CSSProperties = {
  border: 'var(--border-width) solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
}
const rowBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', width: '100%',
  padding: 'var(--space-sm) var(--space-md)', background: 'var(--color-bg)', border: 'none',
  cursor: 'pointer', fontFamily: 'var(--font-family)', textAlign: 'left',
}
const delBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--color-cardinal)', fontWeight: 'var(--font-weight-bold)',
  cursor: 'pointer', fontFamily: 'var(--font-family)', fontSize: 'var(--font-size-caption)',
}
