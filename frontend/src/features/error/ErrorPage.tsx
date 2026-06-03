// ErrorPage.tsx — 라우터 errorElement + 404 catch-all (친절한 안내 + 홈 이동)
import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router-dom'

export default function ErrorPage() {
  const error = useRouteError()
  const navigate = useNavigate()

  let title = '화면을 찾을 수 없어요'
  let detail = '요청한 페이지가 없거나, 이동 중 문제가 생겼습니다.'
  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? '화면을 찾을 수 없어요 (404)' : `${error.status} ${error.statusText}`
    if (error.data && typeof error.data === 'object' && 'message' in error.data) {
      detail = String((error.data as { message?: string }).message ?? detail)
    }
  } else if (error instanceof Error) {
    detail = error.message
  }

  return (
    <main
      style={{
        maxWidth: 520, margin: '0 auto', padding: 'var(--space-xl) var(--space-gutter)',
        textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-sm)',
      }}
    >
      <div style={{ fontSize: 72 }}>🦉</div>
      <h1 style={{ fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)', color: 'var(--color-primary)', margin: 0 }}>
        {title}
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 var(--space-md)' }}>{detail}</p>
      <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
        <button onClick={() => navigate('/')} style={primaryBtn}>🏠 홈으로</button>
        <button onClick={() => navigate(-1)} style={ghostBtn}>← 뒤로</button>
      </div>
    </main>
  )
}

const primaryBtn: React.CSSProperties = {
  padding: 'var(--space-sm) var(--space-lg)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text-inverse)', background: 'var(--color-primary)', border: 'none',
  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-button)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
const ghostBtn: React.CSSProperties = {
  padding: 'var(--space-sm) var(--space-lg)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text)', background: 'var(--color-bg)', border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-lg)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
