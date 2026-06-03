// CoachCard.tsx — AI 코칭 카드 (M5: 스텁 / M7에서 Anthropic 연결)
export default function CoachCard() {
  return (
    <div
      style={{
        border: 'var(--border-width) dashed var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-md)',
        background: 'var(--color-bg-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
      }}
    >
      <span style={{ fontSize: 28 }}>🦉</span>
      <div>
        <div style={{ fontWeight: 'var(--font-weight-bold)' }}>AI 코칭</div>
        <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>
          점수·약점·호흡을 바탕으로 한국어 코칭 — 준비 중 (M7에서 활성화)
        </div>
      </div>
    </div>
  )
}
