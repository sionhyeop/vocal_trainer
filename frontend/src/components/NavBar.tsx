// NavBar.tsx — 화면 공통 헤더: 큰 로고(홈 링크) + 뒤로/앞으로 + 페이지 제목
import { useNavigate } from 'react-router-dom'
import Logo from './Logo'
import AdminButton from './AdminButton'

export default function NavBar({ title }: { title?: React.ReactNode }) {
  const navigate = useNavigate()

  return (
    <header style={{ marginBottom: 'var(--space-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-sm)' }}>
        <Logo />
        <div style={{ display: 'flex', gap: 'var(--space-xs)', flexShrink: 0, alignItems: 'center' }}>
          <AdminButton />
          <button onClick={() => navigate(-1)} style={iconBtn} title="뒤로" aria-label="뒤로">←</button>
          <button onClick={() => navigate(1)} style={iconBtn} title="앞으로" aria-label="앞으로">→</button>
        </div>
      </div>
      {title && (
        <div
          style={{
            marginTop: 'var(--space-xs)',
            fontSize: 'var(--font-size-caption)',
            color: 'var(--color-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
      )}
    </header>
  )
}

const iconBtn: React.CSSProperties = {
  minWidth: 40,
  height: 40,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 'var(--font-size-body)',
  fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text)',
  background: 'var(--color-bg)',
  border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-pill)',
  cursor: 'pointer',
  fontFamily: 'var(--font-family)',
}
