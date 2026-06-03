// StatusPage.tsx — 중간 점검 대시보드: 진행 현황 + 라이브 상태 + 빠른 이동
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import NavBar from '../../components/NavBar'
import { listSessions } from '../../lib/storage'

const API = import.meta.env.VITE_LYRICS_API as string | undefined
const YT_KEY = (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined) ?? ''

type Health = 'checking' | 'ok' | 'fail'

interface Feature {
  label: string
  detail: string
  done: boolean
  to?: string
}

const FEATURES: Feature[] = [
  { label: 'M0 스캐폴드 · 디자인 토큰', detail: 'Vite+React+TS, Duolingo 토큰', done: true, to: '/' },
  { label: 'M1 가사 백엔드 (lrclib)', detail: 'DoH+curl_cffi 프록시', done: true },
  { label: 'M2 곡 검색 + 재생 + 싱크 가사', detail: 'YouTube 검색/IFrame + 가사 하이라이트', done: true, to: '/search' },
  { label: 'M3 음정 트레이닝 (게임 흡수)', detail: '음역대 클라이머로 통합', done: true, to: '/games/climber' },
  { label: 'M4 퍼펙트 스코어 가창', detail: '마이크 실시간 채점 + 콤보/판정', done: true, to: '/search' },
  { label: '원곡 대조 정밀 채점', detail: '방법 A(원곡 자동추출) + 방법 B(가이드 녹음)', done: true },
  { label: 'M5 결과 화면', detail: '점수(100점 만점) + 약점 Top3 + 호흡 요약', done: true },
  { label: 'M6 트레이닝②③ · 히스토리 · 프로필', detail: '이어트레이닝/보이스시프트/세션기록', done: false },
  { label: 'M7 AI 코칭', detail: 'Anthropic 키 필요', done: false },
  { label: 'M8 로그인 / 동기화', detail: 'Firebase (선택)', done: false },
]

export default function StatusPage() {
  const [health, setHealth] = useState<Health>('checking')
  const [sessions, setSessions] = useState(0)

  useEffect(() => {
    setSessions(listSessions().length)
    if (!API) {
      setHealth('fail')
      return
    }
    let alive = true
    fetch(`${API}/api/health`)
      .then((r) => r.json())
      .then((d) => alive && setHealth(d?.ok ? 'ok' : 'fail'))
      .catch(() => alive && setHealth('fail'))
    return () => {
      alive = false
    }
  }, [])

  const doneCount = FEATURES.filter((f) => f.done).length

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--space-lg) var(--space-gutter)' }}>
      <NavBar />
      <h1 style={{ fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)', color: 'var(--color-primary)', margin: '0 0 var(--space-xs)' }}>
        🔧 중간 점검
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 var(--space-lg)' }}>
        진행 {doneCount}/{FEATURES.length} · 현재까지 구현 현황과 실시간 상태
      </p>

      {/* 라이브 상태 지표 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
        <Stat
          label="가사 백엔드"
          value={health === 'checking' ? '확인 중…' : health === 'ok' ? '정상' : '응답 없음'}
          color={health === 'ok' ? 'var(--color-primary)' : health === 'fail' ? 'var(--color-cardinal)' : 'var(--color-text-secondary)'}
          sub={API ?? '미설정'}
        />
        <Stat
          label="YouTube 검색 키"
          value={YT_KEY.trim() ? '설정됨' : '없음'}
          color={YT_KEY.trim() ? 'var(--color-primary)' : 'var(--color-fox)'}
          sub={YT_KEY.trim() ? '검색 활성' : 'URL 붙여넣기만'}
        />
        <Stat label="저장된 세션" value={`${sessions}개`} color="var(--color-macaw)" sub="결과 기록(localStorage)" />
      </div>

      {/* 기능 체크리스트 */}
      <h2 style={{ fontSize: 'var(--font-size-subhead)', margin: '0 0 var(--space-sm)' }}>구현 현황</h2>
      <div style={{ display: 'grid', gap: 'var(--space-xs)', marginBottom: 'var(--space-lg)' }}>
        {FEATURES.map((f) => {
          const row = (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                border: 'var(--border-width) solid var(--color-border)', borderRadius: 'var(--radius-md)',
                padding: 'var(--space-sm) var(--space-md)', background: 'var(--color-bg)',
                opacity: f.done ? 1 : 0.6,
              }}
            >
              <span style={{ fontSize: 20 }}>{f.done ? '✅' : '⬜'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'var(--font-weight-bold)' }}>{f.label}</div>
                <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>{f.detail}</div>
              </div>
              {f.to && f.done && <span style={{ color: 'var(--color-macaw)', fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-caption)' }}>열기 →</span>}
            </div>
          )
          return f.to && f.done ? (
            <Link key={f.label} to={f.to} style={{ textDecoration: 'none', color: 'inherit' }}>{row}</Link>
          ) : (
            <div key={f.label}>{row}</div>
          )
        })}
      </div>

      {/* 빠른 이동 */}
      <h2 style={{ fontSize: 'var(--font-size-subhead)', margin: '0 0 var(--space-sm)' }}>빠른 이동</h2>
      <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
        <Link to="/" style={pill}>🏠 홈</Link>
        <Link to="/search" style={pill}>🎵 곡 검색</Link>
        <Link to="/games" style={pill}>🎮 보컬 게임</Link>
        <Link to="/mic-test" style={pill}>🎤 마이크 진단</Link>
      </div>
    </main>
  )
}

function Stat({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ border: 'var(--border-width) solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md)', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 'var(--font-size-subhead)', fontWeight: 'var(--font-weight-heavy)', color }}>{value}</div>
      {sub && <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
  )
}

const pill: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 'var(--radius-pill)', border: 'var(--border-width) solid var(--color-border)',
  fontWeight: 'var(--font-weight-bold)', textDecoration: 'none', color: 'var(--color-text)', fontSize: 'var(--font-size-caption)',
}
