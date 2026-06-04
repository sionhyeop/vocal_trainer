// ResultPanel.tsx — 결과 화면 (PLAN §9): 점수 카운트업 + 약점구간 + 호흡 + 코치
import { useEffect, useState } from 'react'
import type { Judgment } from '../../lib/score'
import type { BreathSummary } from '../../audio/breathAnalyzer'
import { fmtTime, type WeakSection } from './weakSections'
import CoachCard from './CoachCard'

interface Props {
  score: number // 0~100
  maxCombo: number
  counts: Record<Judgment, number>
  mode: 'free' | 'melody'
  breath: BreathSummary
  weak: WeakSection[]
  onReplay: (timeMs: number) => void
  onRetry: () => void
}

// 점수대별 색 + 한줄 평가 (등급 대체)
export function scoreColor(s: number): string {
  if (s >= 90) return 'var(--color-primary)'
  if (s >= 75) return 'var(--color-macaw)'
  if (s >= 60) return 'var(--color-bee)'
  if (s >= 40) return 'var(--color-fox)'
  return 'var(--color-cardinal)'
}
function scoreLabel(s: number): string {
  if (s >= 90) return '완벽해요! 🎉'
  if (s >= 75) return '훌륭해요 👏'
  if (s >= 60) return '좋아요 🙂'
  if (s >= 40) return '조금만 더! 💪'
  return '다시 도전해요 🔁'
}

// 점수 카운트업
function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
      setV(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

export default function ResultPanel({ score, maxCombo, counts, mode, breath, weak, onReplay, onRetry }: Props) {
  const shown = useCountUp(Math.round(score))
  const col = scoreColor(Math.round(score))

  return (
    <div style={{ display: 'grid', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
      {/* 점수 */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
          <div
            style={{
              flexShrink: 0, color: col, border: `5px solid ${col}`,
              borderRadius: 'var(--radius-pill)', width: 120, height: 120,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              animation: 'judgePop var(--duration-slow) var(--easing-bounce)',
            }}
          >
            <span style={{ fontSize: 52, fontWeight: 'var(--font-weight-heavy)', lineHeight: 1 }}>{shown}</span>
            <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>/ 100점</span>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-subhead)', fontWeight: 'var(--font-weight-heavy)', color: col }}>
              {scoreLabel(Math.round(score))}
            </div>
            <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>
              {mode === 'melody' ? '정밀(원곡 대조)' : '자유(안정성)'} · 최대 콤보 {maxCombo}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 6, fontSize: 'var(--font-size-caption)' }}>
              <span style={{ color: 'var(--color-primary)' }}>P {counts.Perfect}</span>
              <span style={{ color: 'var(--color-macaw)' }}>G {counts.Great}</span>
              <span style={{ color: 'var(--color-bee)' }}>Gd {counts.Good}</span>
              <span style={{ color: 'var(--color-cardinal)' }}>M {counts.Miss}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 약점 구간 Top3 */}
      <div style={card}>
        <h3 style={h3}>약점 구간 Top 3 <span style={hint}>(클릭하면 그 구간부터 재생)</span></h3>
        {weak.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-caption)', margin: 0 }}>
            구간 데이터가 부족합니다(더 길게 불러보세요).
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-xs)' }}>
            {weak.map((w, i) => (
              <button key={i} onClick={() => onReplay(w.timeMs)} style={weakRow}>
                <span style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--color-cardinal)' }}>{fmtTime(w.timeMs)}</span>
                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.label}</span>
                <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>평균 {w.deviation}¢ ▶</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 호흡 요약 */}
      <div style={card}>
        <h3 style={h3}>호흡 · 발성 요약</h3>
        <Bar label="음 안정성" value={breath.stability} max={100} unit="" color="var(--color-primary)" />
        <Bar label="유성음 비율" value={Math.round(breath.voicedRatio * 100)} max={100} unit="%" color="var(--color-macaw)" />
        <Bar label="바람 새는 비율" value={Math.round(breath.breathyRatio * 100)} max={100} unit="%" color="var(--color-fox)" />
        <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: 6 }}>
          한 호흡 최장 발성: <b>{(breath.longestPhraseMs / 1000).toFixed(1)}초</b>
        </div>
      </div>

      {/* AI 코치 (M7: Claude 연결) */}
      <CoachCard
        metrics={{
          score: Math.round(score),
          maxCombo,
          counts,
          mode,
          breath: {
            stability: breath.stability,
            voicedRatio: breath.voicedRatio,
            breathyRatio: breath.breathyRatio,
            longestPhraseMs: breath.longestPhraseMs,
          },
          weak: weak.slice(0, 3).map((w) => ({ timeMs: w.timeMs, label: w.label, deviation: w.deviation })),
        }}
      />

      <button onClick={onRetry} style={retryBtn}>↻ 다시 부르기</button>
    </div>
  )
}

function Bar({ label, value, max, unit, color }: { label: string; value: number; max: number; unit: string; color: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-caption)', marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 'var(--font-weight-bold)' }}>{value}{unit}</span>
      </div>
      <div style={{ height: 10, background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-lg)', padding: 'var(--space-md)', boxShadow: 'var(--shadow-sm)',
}
const h3: React.CSSProperties = { fontSize: 'var(--font-size-subhead)', margin: '0 0 var(--space-sm)' }
const hint: React.CSSProperties = { fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)' }
const weakRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-xs) var(--space-sm)',
  background: 'var(--color-bg-subtle)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'var(--font-family)', fontSize: 'var(--font-size-body)',
}
const retryBtn: React.CSSProperties = {
  padding: 'var(--space-sm) var(--space-lg)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text-inverse)', background: 'var(--color-primary)', border: 'none',
  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-button)', cursor: 'pointer', fontFamily: 'var(--font-family)', justifySelf: 'start',
}
