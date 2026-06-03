// SearchPage.tsx — 곡 검색 (YouTube Data API) (PLAN §5, M2)
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchYouTube, type YouTubeResult } from '../../lib/youtube'
import { useSessionStore } from '../../store/session'
import NavBar from '../../components/NavBar'

const API_KEY = (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined) ?? ''

export default function SearchPage() {
  const navigate = useNavigate()
  const setSelected = useSessionStore((s) => s.setSelected)
  const setSearch = useSessionStore((s) => s.setSearch)

  // 뒤로가기 복원: 스토어에 캐시된 검색어/결과로 초기화
  const [query, setQuery] = useState(() => useSessionStore.getState().searchQuery)
  const [results, setResults] = useState<YouTubeResult[]>(() => useSessionStore.getState().searchResults)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')

  const hasKey = API_KEY.trim().length > 0

  async function onSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim() || !hasKey) return
    setStatus('loading')
    setError('')
    try {
      const r = await searchYouTube(query.trim(), API_KEY)
      setResults(r)
      setSearch(query.trim(), r) // 캐시에 저장(뒤로가기 시 유지)
      setStatus('idle')
    } catch (err: any) {
      setError(err?.message ?? '검색 실패')
      setStatus('error')
    }
  }

  function pick(r: YouTubeResult) {
    setSelected(r)
    navigate(`/sing/${r.videoId}`)
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--space-lg) var(--space-gutter)' }}>
      <NavBar />
      <h1
        style={{
          fontSize: 'var(--font-size-heading)',
          fontWeight: 'var(--font-weight-heavy)',
          color: 'var(--color-primary)',
          margin: '0 0 var(--space-md)',
        }}
      >
        곡 검색
      </h1>

      {/* 검색 (키 필요) */}
      {hasKey ? (
        <form onSubmit={onSearch} style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="곡명 / 아티스트 (예: 아이유 밤편지)"
            style={inputStyle}
          />
          <button type="submit" style={primaryBtn} disabled={status === 'loading'}>
            {status === 'loading' ? '검색 중…' : '검색'}
          </button>
        </form>
      ) : (
        <p style={{ color: 'var(--color-fox)', fontSize: 'var(--font-size-caption)' }}>
          VITE_YOUTUBE_API_KEY가 비어 있어 검색이 비활성입니다. .env에 키를 넣어 주세요.
        </p>
      )}

      {status === 'error' && (
        <p style={{ color: 'var(--color-cardinal)' }}>
          {error}
          {/quota|exhausted/i.test(error) && ' — 일일 쿼터 소진일 수 있습니다.'}
          {/referer|blocked|forbidden|key/i.test(error) && ' — 키 제한(리퍼러/IP)을 확인하세요.'}
        </p>
      )}

      {/* 검색 결과 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
        {results.map((r) => (
          <button key={r.videoId} onClick={() => pick(r)} style={cardBtn}>
            {r.thumbnail && (
              <img src={r.thumbnail} alt="" style={{ width: '100%', borderRadius: 'var(--radius-md)', display: 'block' }} />
            )}
            <div style={{ fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-caption)', marginTop: 'var(--space-xs)', textAlign: 'left', lineHeight: 'var(--line-height-tight)' }}>
              {r.title}
            </div>
            <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
              {r.channelTitle}
            </div>
          </button>
        ))}
      </div>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: 'var(--space-xs) var(--space-sm)',
  fontSize: 'var(--font-size-body)',
  border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  fontFamily: 'var(--font-family)',
}

const primaryBtn: React.CSSProperties = {
  padding: 'var(--space-xs) var(--space-md)',
  fontSize: 'var(--font-size-body)',
  fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text-inverse)',
  background: 'var(--color-primary)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-button)',
  cursor: 'pointer',
  fontFamily: 'var(--font-family)',
}

const cardBtn: React.CSSProperties = {
  background: 'var(--color-bg)',
  border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-xs)',
  cursor: 'pointer',
  fontFamily: 'var(--font-family)',
}
