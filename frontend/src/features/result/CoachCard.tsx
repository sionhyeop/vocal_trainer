// CoachCard.tsx — AI 코칭 카드 (M7). 결과화면 진입 시 /api/coach 호출 → Claude(Haiku) 코칭 표시.
// 키 미설정/실패 시 조용히 폴백(스텁 안내)으로 떨어진다 — 데모가 깨지지 않게.
import { useCallback, useEffect, useRef, useState } from 'react'

// /api/coach 로 보내는 세션 지표 (서버 describe()와 형태 일치)
export interface CoachMetrics {
  score: number
  maxCombo: number
  counts: Record<string, number>
  mode: 'free' | 'melody'
  breath: { stability: number; voicedRatio: number; breathyRatio: number; longestPhraseMs: number }
  weak: { timeMs: number; label: string; deviation: number }[]
}

interface Coaching {
  강점: string
  개선점: string[]
  연습팁: string[]
  한줄응원: string
}

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: Coaching }
  | { kind: 'unconfigured' } // 키 미설정(503) — "준비 중" 폴백
  | { kind: 'error'; msg: string }

const TIMEOUT_MS = 18000

// 서버가 망가진/부분 응답(200 {})을 흘려도 클라가 크래시하지 않게 형태를 한 번 더 검증.
function isCoaching(c: unknown): c is Coaching {
  if (!c || typeof c !== 'object') return false
  const o = c as Record<string, unknown>
  return (
    typeof o.강점 === 'string' &&
    Array.isArray(o.개선점) &&
    Array.isArray(o.연습팁) &&
    typeof o.한줄응원 === 'string'
  )
}

export default function CoachCard({ metrics }: { metrics: CoachMetrics }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  // metrics는 점수 카운트업 리렌더로 매 프레임 새 객체가 되므로 ref로 최신값만 잡아둔다.
  const metricsRef = useRef(metrics)
  metricsRef.current = metrics
  const started = useRef(false)

  // 1회 호출 + 재시도 공용. metricsRef를 읽으므로 deps 없이 안정적.
  const run = useCallback(() => {
    setState({ kind: 'loading' })
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    ;(async () => {
      try {
        const r = await fetch('/api/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metricsRef.current),
          signal: ctrl.signal,
        })
        clearTimeout(timer)
        if (r.status === 503) return setState({ kind: 'unconfigured' })
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          return setState({ kind: 'error', msg: j?.error || `오류 ${r.status}` })
        }
        const j = await r.json()
        if (!isCoaching(j?.coaching)) return setState({ kind: 'error', msg: '코칭 형식이 올바르지 않아요' })
        setState({ kind: 'ok', data: j.coaching as Coaching })
      } catch (e) {
        clearTimeout(timer)
        const aborted = (e as { name?: string })?.name === 'AbortError'
        setState({ kind: 'error', msg: aborted ? '코칭 응답이 지연되고 있어요. 다시 시도해 주세요.' : '코칭을 불러오지 못했어요' })
      }
    })()
    // 의도적으로 cleanup에서 abort하지 않는다: StrictMode(dev) 더블마운트의 첫 unmount가
    // 유일한 요청을 죽여 무한 로딩이 되는 것을 피하기 위함. 타임아웃이 진짜 멈춤을 막아준다.
  }, [])

  // 결과화면당 1회만. started ref는 StrictMode 리마운트에도 보존돼 중복 호출(=중복 과금)을 막는다.
  useEffect(() => {
    if (started.current) return
    started.current = true
    run()
  }, [run])

  const tips = state.kind === 'ok' ? (Array.isArray(state.data.연습팁) ? state.data.연습팁 : []) : []
  const fixes = state.kind === 'ok' ? (Array.isArray(state.data.개선점) ? state.data.개선점 : []) : []

  return (
    <div style={shell}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: state.kind === 'ok' ? 'var(--space-sm)' : 0 }}>
        <span style={{ fontSize: 28 }}>🦉</span>
        <div>
          <h3 style={title}>AI 코칭</h3>
          <div role="status" aria-live="polite" style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>
            {state.kind === 'loading' && '점수·약점·호흡을 읽고 코칭을 쓰는 중…'}
            {state.kind === 'ok' && '점수·약점·호흡 기반 맞춤 코칭'}
            {state.kind === 'unconfigured' && 'AI 코칭 준비 중 — 잠시 후 활성화됩니다'}
            {state.kind === 'error' && (state.msg || '지금은 코칭을 불러오지 못했어요')}
          </div>
        </div>
        {state.kind === 'loading' && <span style={spinner} aria-hidden />}
      </div>

      {state.kind === 'ok' && (
        <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
          {state.data.강점 && (
            <Section icon="💪" title="잘한 점" color="var(--color-primary)">
              <p style={p}>{state.data.강점}</p>
            </Section>
          )}
          {fixes.length > 0 && (
            <Section icon="🎯" title="이렇게 해보세요" color="var(--color-macaw)">
              <ul style={ul}>{fixes.map((s, i) => <li key={i} style={li}>{s}</li>)}</ul>
            </Section>
          )}
          {tips.length > 0 && (
            <Section icon="🎤" title="연습 팁" color="var(--color-bee)">
              <ul style={ul}>{tips.map((s, i) => <li key={i} style={li}>{s}</li>)}</ul>
            </Section>
          )}
          {state.data.한줄응원 && <p style={cheer}>{state.data.한줄응원}</p>}
        </div>
      )}

      {state.kind === 'error' && (
        <button onClick={run} style={retry}>↻ 다시 시도</button>
      )}
    </div>
  )
}

function Section({ icon, title, color, children }: { icon: string; title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontWeight: 'var(--font-weight-bold)', color, fontSize: 'var(--font-size-caption)', marginBottom: 2 }}>
        {icon} {title}
      </div>
      {children}
    </div>
  )
}

const shell: React.CSSProperties = {
  border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-md)',
  background: 'var(--color-bg-subtle)',
}
const title: React.CSSProperties = { margin: 0, fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-body)' }
const p: React.CSSProperties = { margin: 0, fontSize: 'var(--font-size-body)', lineHeight: 1.5 }
const ul: React.CSSProperties = { margin: 0, paddingLeft: '1.2em', display: 'grid', gap: 2 }
const li: React.CSSProperties = { fontSize: 'var(--font-size-body)', lineHeight: 1.5 }
const cheer: React.CSSProperties = {
  margin: 0, marginTop: 2, fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)',
  fontSize: 'var(--font-size-body)',
}
const spinner: React.CSSProperties = {
  marginLeft: 'auto', width: 16, height: 16, borderRadius: '50%',
  border: '2px solid var(--color-border)', borderTopColor: 'var(--color-primary)',
  animation: 'spin 0.8s linear infinite',
}
const retry: React.CSSProperties = {
  marginTop: 'var(--space-sm)', padding: '4px 12px', fontSize: 'var(--font-size-caption)',
  fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)', background: 'transparent',
  border: 'var(--border-width) solid var(--color-primary)', borderRadius: 'var(--radius-md)',
  cursor: 'pointer', fontFamily: 'var(--font-family)',
}
