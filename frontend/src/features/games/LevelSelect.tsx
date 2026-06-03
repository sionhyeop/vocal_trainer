// LevelSelect.tsx — 레벨을 세로 길처럼 나열(잠금/별 표시). 게임 공용.
import { getGameStars } from '../../lib/storage'

interface LevelLite {
  id: string
  name: string
}
interface Props {
  gameId: string
  levels: LevelLite[]
  color: string
  onPick: (index: number) => void
}

function Stars({ n }: { n: number }) {
  return (
    <span style={{ letterSpacing: 1 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ filter: i < n ? 'none' : 'grayscale(1) opacity(0.3)', fontSize: 14 }}>⭐</span>
      ))}
    </span>
  )
}

export default function LevelSelect({ gameId, levels, color, onPick }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      {levels.map((lv, i) => {
        const stars = getGameStars(gameId, lv.id)
        const prevStars = i === 0 ? 1 : getGameStars(gameId, levels[i - 1].id)
        const locked = i > 0 && prevStars < 1
        return (
          <button
            key={lv.id}
            disabled={locked}
            onClick={() => onPick(i)}
            className={locked ? undefined : 'lift'}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
              padding: 'var(--space-sm) var(--space-md)', width: '100%', textAlign: 'left',
              borderRadius: 'var(--radius-lg)', cursor: locked ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-family)', boxShadow: 'var(--shadow-sm)',
              background: locked ? 'var(--color-bg-subtle)' : 'var(--color-bg)',
              border: `var(--border-width) solid ${locked ? 'var(--color-border)' : color}`,
              opacity: locked ? 0.6 : 1,
            }}
          >
            <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 'var(--radius-pill)', background: locked ? 'var(--color-border)' : color, color: 'var(--color-text-inverse)', display: 'grid', placeItems: 'center', fontWeight: 'var(--font-weight-heavy)' }}>
              {locked ? '🔒' : i + 1}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text)' }}>{lv.name}</span>
              <Stars n={stars} />
            </span>
            {!locked && <span style={{ color, fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-caption)' }}>▶</span>}
          </button>
        )
      })}
    </div>
  )
}
