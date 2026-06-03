// AdminButton.tsx — 관리자 닉네임 로그인 시 자동 노출되는 "관리자 모드" 진입 버튼.
// (/admin 페이지에서는 숨김)
import { Link, useLocation } from 'react-router-dom'
import { useAccountStore, isAdminName } from '../store/account'

export default function AdminButton({ variant = 'solid' }: { variant?: 'solid' | 'glass' }) {
  const account = useAccountStore((s) => s.account)
  const loc = useLocation()
  if (!isAdminName(account?.name)) return null
  if (loc.pathname === '/admin') return null

  const style: React.CSSProperties =
    variant === 'glass'
      ? {
          ...base,
          color: '#fff',
          background: 'rgba(255,255,255,0.14)',
          border: '1px solid rgba(255,255,255,0.35)',
          backdropFilter: 'blur(8px)',
        }
      : {
          ...base,
          color: 'var(--color-text-inverse)',
          background: 'var(--color-beetle)',
          border: '1px solid var(--color-beetle)',
        }

  return (
    <Link to="/admin" style={style} title="관리자 모드">
      ⚙ 관리자
    </Link>
  )
}

const base: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '8px 14px',
  borderRadius: 'var(--radius-pill)',
  fontFamily: 'var(--font-family)',
  fontWeight: 'var(--font-weight-bold)',
  fontSize: 'var(--font-size-caption)',
  textDecoration: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
