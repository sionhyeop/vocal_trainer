// Logo.tsx — 서비스 로고(헤더 공통). 누르면 홈으로. hero=첫 화면용 큰 크기.
import { Link } from 'react-router-dom'

export default function Logo({ hero = false }: { hero?: boolean }) {
  return (
    <Link to="/" title="홈으로" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
      <span
        style={{
          fontSize: hero ? 'var(--font-size-hero)' : 'var(--font-size-heading)',
          fontWeight: 'var(--font-weight-heavy)',
          color: 'var(--color-primary)',
          lineHeight: 'var(--line-height-tight)',
          letterSpacing: '-0.5px',
          cursor: 'pointer',
        }}
      >
        🎤 보컬 트레이너
      </span>
    </Link>
  )
}
