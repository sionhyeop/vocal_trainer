// ClearOverlay.tsx — 게임 클리어/실패 결과 오버레이 (별 애니메이션)
interface Props {
  cleared: boolean
  stars: number // 0~3
  title?: string
  detail?: string
  hasNext?: boolean
  onRetry: () => void
  onSelect: () => void
  onNext?: () => void
}

export default function ClearOverlay({ cleared, stars, title, detail, hasNext, onRetry, onSelect, onNext }: Props) {
  return (
    <div style={backdrop}>
      <div style={card}>
        <div style={{ fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)', color: cleared ? 'var(--color-primary)' : 'var(--color-cardinal)' }}>
          {title ?? (cleared ? '클리어! 🎉' : '아쉬워요 😢')}
        </div>

        {cleared && (
          <div style={{ display: 'flex', gap: 'var(--space-xs)', justifyContent: 'center', margin: 'var(--space-md) 0' }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  fontSize: 48,
                  filter: i < stars ? 'none' : 'grayscale(1) opacity(0.3)',
                  animation: i < stars ? `judgePop var(--duration-slow) var(--easing-bounce) ${i * 140}ms both` : 'none',
                }}
              >
                ⭐
              </span>
            ))}
          </div>
        )}

        {detail && <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 var(--space-md)' }}>{detail}</p>}

        <div style={{ display: 'flex', gap: 'var(--space-xs)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={onRetry} style={ghostBtn}>↻ 다시</button>
          <button onClick={onSelect} style={ghostBtn}>≡ 레벨 선택</button>
          {cleared && hasNext && onNext && (
            <button onClick={onNext} style={primaryBtn}>다음 →</button>
          )}
        </div>
      </div>
    </div>
  )
}

const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(var(--blur-overlay))',
  display: 'grid', placeItems: 'center', zIndex: 50, padding: 'var(--space-md)',
}
const card: React.CSSProperties = {
  background: 'var(--color-bg)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)',
  textAlign: 'center', maxWidth: 360, width: '100%', boxShadow: 'var(--shadow-md)',
  animation: 'heroIn var(--duration-normal) var(--easing-default)',
}
const primaryBtn: React.CSSProperties = {
  padding: 'var(--space-sm) var(--space-lg)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-heavy)',
  color: 'var(--color-text-inverse)', background: 'var(--color-primary)', border: 'none',
  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-button)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
const ghostBtn: React.CSSProperties = {
  padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text)', background: 'var(--color-bg)', border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-lg)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
