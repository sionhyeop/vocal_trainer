// AccountChip.tsx — 헤더 우측상단 로그인/로그아웃 (로컬 닉네임)
import { useState } from 'react'
import { useAccountStore } from '../store/account'

export default function AccountChip() {
  const { account, login, logout } = useAccountStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const submit = () => {
    if (!name.trim()) return
    login(name)
    setName('')
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      {account ? (
        <button onClick={() => setOpen((o) => !o)} style={chip} title="계정">
          <span style={avatar}>{account.name[0]?.toUpperCase()}</span>
          <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</span>
          <span style={{ opacity: 0.7, fontSize: 11 }}>▾</span>
        </button>
      ) : (
        <button onClick={() => setOpen((o) => !o)} style={loginBtn}>👤 로그인</button>
      )}

      {open && (
        <div style={popover}>
          {account ? (
            <>
              <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
                {account.name} 님으로 로그인됨
              </div>
              <button onClick={() => { logout(); setOpen(false) }} style={popBtn}>로그아웃</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                닉네임으로 시작 (이 기기에 저장)
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                  placeholder="닉네임"
                  autoFocus
                  style={input}
                />
                <button onClick={submit} style={{ ...popBtn, background: 'var(--color-primary)', color: 'var(--color-text-inverse)', borderColor: 'var(--color-primary)' }}>시작</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 6px',
  borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontFamily: 'var(--font-family)',
  fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-caption)', color: '#fff',
  background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(8px)',
}
const loginBtn: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontFamily: 'var(--font-family)',
  fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-caption)', color: '#fff',
  background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.35)', backdropFilter: 'blur(8px)',
}
const avatar: React.CSSProperties = {
  width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
  background: 'var(--color-primary)', color: '#08230a', fontWeight: 'var(--font-weight-heavy)', fontSize: 13,
}
const popover: React.CSSProperties = {
  position: 'absolute', right: 0, top: 'calc(100% + 8px)', minWidth: 200, zIndex: 30,
  background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 'var(--space-sm)',
  boxShadow: 'var(--shadow-md)', border: 'var(--border-width) solid var(--color-border)',
}
const popBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'var(--font-family)',
  fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-caption)', color: 'var(--color-text)',
  background: 'var(--color-bg)', border: 'var(--border-width) solid var(--color-border)', whiteSpace: 'nowrap',
}
const input: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-family)',
  fontSize: 'var(--font-size-caption)', border: 'var(--border-width) solid var(--color-border)',
}
