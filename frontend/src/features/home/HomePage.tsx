// HomePage.tsx — 프리미엄 랜딩 (히어로 + 개인 대시보드 + 이어서 부르기 + 차트)
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ChartList from '../chart/ChartList'
import AccountChip from '../../components/AccountChip'
import AdminButton from '../../components/AdminButton'
import { useAccountStore, isAdminName } from '../../store/account'
import { useSessionStore } from '../../store/session'
import { listSessions, getProfile, type SessionResult } from '../../lib/storage'
import { midiToNoteName } from '../../lib/midi'
import { scoreColor } from '../result/ResultPanel'

const footLink: React.CSSProperties = {
  color: 'var(--color-macaw)',
  fontWeight: 'var(--font-weight-bold)',
  textDecoration: 'none',
  fontSize: 'var(--font-size-caption)',
}

function fmtDate(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function Stat({ label, value, unit, color, small }: { label: string; value: string; unit?: string; color: string; small?: boolean }) {
  return (
    <div style={{ ...statCard, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: small ? 20 : 30, fontWeight: 'var(--font-weight-heavy)', color, lineHeight: 1.1 }}>
        {value}
        {unit && <span style={{ fontSize: 'var(--font-size-caption)', marginLeft: 2 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const setSelected = useSessionStore((s) => s.setSelected)
  const account = useAccountStore((s) => s.account)

  const { recent, stats, hasData } = useMemo(() => {
    const sessions = listSessions()
    const recent = sessions.slice(0, 6)
    const count = sessions.length
    const avg = count ? Math.round(sessions.reduce((a, s) => a + s.score, 0) / count) : 0
    const profile = getProfile()
    const range = profile ? `${midiToNoteName(profile.lowMidi)}~${midiToNoteName(profile.highMidi)}` : null
    return { recent, stats: { count, avg, range }, hasData: count > 0 || !!range }
  }, [])

  const openSession = (s: SessionResult) => {
    setSelected({ videoId: s.videoId, title: s.title })
    navigate(`/sing/${s.videoId}`)
  }

  return (
    <main style={{ position: 'relative', maxWidth: 860, margin: '0 auto', padding: 'var(--space-md) var(--space-gutter) var(--space-xl)' }}>
      {/* 헤더 우측상단: 관리자(자동) + 계정 */}
      <div style={{ position: 'absolute', top: 'var(--space-sm)', right: 'var(--space-gutter)', zIndex: 6, display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
        <AdminButton variant="glass" />
        <AccountChip />
      </div>

      {/* ── 프리미엄 히어로 (풀폭 다크 스테이지) ───────── */}
      <section style={heroSection}>
        {/* 배경 이미지 (로드 실패해도 아래 다크 배경이 보임) */}
        <div style={heroPhoto} />
        {/* 다크 그라데이션 오버레이 */}
        <div style={heroOverlay} />
        {/* 컬러 글로우 오브 */}
        <div style={{ ...orb, width: 360, height: 360, left: '-6%', top: '-28%', background: 'radial-gradient(circle, rgba(88,204,2,0.55), transparent 70%)' }} />
        <div style={{ ...orb, width: 440, height: 440, right: '-12%', bottom: '-44%', background: 'radial-gradient(circle, rgba(28,176,246,0.5), transparent 70%)', animationDelay: '1.4s' }} />

        {/* 콘텐츠 */}
        <div style={heroInner}>
          <span style={heroBadge}>🎤 AI 보컬 코치 · 실시간 음정 채점</span>
          <h1 style={heroTitle}>보컬 트레이너</h1>
          <p style={heroSub}>
            마이크로 노래하면 음정을 실시간으로 채점합니다.<br />
            <b style={{ fontWeight: 'var(--font-weight-bold)', color: '#fff' }}>노래방 퍼펙트 스코어</b>를 집에서 — 점수 · 약점 구간 · 호흡까지.
          </p>
          <div style={heroCtaRow}>
            <Link to="/search" className="lift" style={heroPrimary}>🔍 곡 검색해서 부르기</Link>
            <Link to="/games" className="lift" style={heroGlass}>🎮 게임으로 시작</Link>
          </div>
          <div style={heroStats}>
            <span><b style={statNum}>50곡</b> 인기 차트</span>
            <span style={dotSep}>·</span>
            <span><b style={statNum}>실시간</b> 피치 채점</span>
            <span style={dotSep}>·</span>
            <span><b style={statNum}>3가지</b> 보컬 게임</span>
          </div>
        </div>

        {/* 사운드 이퀄라이저 (하단) */}
        <div style={eqRow} aria-hidden>
          {EQ_BARS.map((b, i) => (
            <span key={i} style={{ flex: 1, height: '100%', transformOrigin: 'bottom', borderRadius: '3px 3px 0 0', background: b.color, animation: `eq ${b.dur}s var(--easing-default) ${b.delay}s infinite` }} />
          ))}
        </div>
      </section>

      {/* ── 나의 기록 대시보드 ───────────────────────── */}
      <section style={{ marginBottom: 'var(--space-xl)' }}>
        <h2 style={sectionH2}>{account ? `${account.name} 님의 기록` : '📊 나의 기록'}</h2>
        {hasData ? (
          <div style={statGrid}>
            <Stat label="연습한 곡" value={`${stats.count}`} unit="곡" color="var(--color-primary)" />
            <Stat label="평균 점수 (100점 만점)" value={`${stats.avg}`} unit="점" color={scoreColor(stats.avg)} />
            <Stat label="내 음역대" value={stats.range ?? '—'} color="var(--color-beetle)" small />
          </div>
        ) : (
          <Link to="/search" className="lift" style={emptyCard}>
            🎤 아직 기록이 없어요 — <b>첫 곡을 불러보세요!</b>
          </Link>
        )}
      </section>

      {/* ── 이어서 부르기 (최근 연습) ────────────────── */}
      {recent.length > 0 && (
        <section style={{ marginBottom: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-sm)' }}>
            <h2 style={{ ...sectionH2, margin: 0 }}>⏯ 이어서 부르기</h2>
            <Link to="/history" style={footLink}>전체 기록 →</Link>
          </div>
          <div style={recentRow}>
            {recent.map((s) => (
              <button key={s.id} onClick={() => openSession(s)} className="lift" style={recentCard}>
                <img src={`https://i.ytimg.com/vi/${s.videoId}/mqdefault.jpg`} alt="" style={recentThumb} />
                <span style={{ ...scoreBadge, background: scoreColor(s.score) }}>{s.score}점</span>
                <span style={recentTitle}>{s.title}</span>
                <span style={recentDate}>{fmtDate(s.dateMs)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 인기곡 차트 ─────────────────────────────── */}
      <h2 style={{ fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)', color: 'var(--color-cardinal)', margin: '0 0 var(--space-xs)' }}>
        🔥 인기곡 차트
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 var(--space-md)' }}>
        장르를 고르면 바로 부를 수 있어요. (음정 노트 미리 준비됨)
      </p>
      <ChartList />

      <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-xl)', flexWrap: 'wrap' }}>
        <Link to="/history" style={footLink}>📈 연습 기록</Link>
        <Link to="/profile" style={footLink}>🎚 내 음역대</Link>
        <Link to="/mic-test" style={footLink}>🎤 마이크 진단</Link>
        <Link to="/notemap" style={footLink}>🎼 추출 음정 보기</Link>
        <Link to="/status" style={footLink}>🔧 중간 점검</Link>
        {isAdminName(account?.name) && <Link to="/admin" style={{ ...footLink, color: 'var(--color-beetle)' }}>⚙ 관리자</Link>}
      </div>
    </main>
  )
}

// ── 대시보드 / 이어서 부르기 스타일 ───────────────
const sectionH2: React.CSSProperties = {
  fontSize: 'var(--font-size-subhead)', fontWeight: 'var(--font-weight-heavy)', color: 'var(--color-text)', margin: '0 0 var(--space-sm)',
}
const statGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--space-sm)',
}
const statCard: React.CSSProperties = {
  background: 'var(--color-bg)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md)',
  boxShadow: 'var(--shadow-sm)', border: 'var(--border-width) solid var(--color-border)',
}
const emptyCard: React.CSSProperties = {
  display: 'block', textDecoration: 'none', color: 'var(--color-text)', background: 'var(--color-bg-subtle)',
  border: 'var(--border-width) dashed var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md)',
  fontWeight: 'var(--font-weight-bold)',
}
const recentRow: React.CSSProperties = {
  display: 'flex', gap: 'var(--space-sm)', overflowX: 'auto', paddingBottom: 4,
}
const recentCard: React.CSSProperties = {
  flex: '0 0 160px', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-family)',
  background: 'var(--color-bg)', border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-lg)', padding: 8, boxShadow: 'var(--shadow-sm)', position: 'relative',
}
const recentThumb: React.CSSProperties = {
  width: '100%', height: 88, objectFit: 'cover', borderRadius: 'var(--radius-md)', display: 'block',
}
const scoreBadge: React.CSSProperties = {
  position: 'absolute', top: 14, left: 14, padding: '2px 8px', borderRadius: 'var(--radius-pill)',
  color: '#fff', fontWeight: 'var(--font-weight-heavy)', fontSize: 11,
}
const recentTitle: React.CSSProperties = {
  display: 'block', fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-caption)', marginTop: 6,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const recentDate: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--color-text-secondary)' }

// ── 히어로 스타일 ────────────────────────────────
const heroSection: React.CSSProperties = {
  position: 'relative',
  width: '100vw',
  marginLeft: 'calc(50% - 50vw)',
  marginTop: 'calc(-1 * var(--space-md))',
  marginBottom: 'var(--space-xl)',
  minHeight: 480,
  display: 'flex',
  alignItems: 'center',
  overflow: 'hidden',
  background: '#0a0e1a',
  color: 'var(--color-text-inverse)',
}
const heroPhoto: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundImage:
    "url('https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1600&q=80')",
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  opacity: 0.5,
  filter: 'saturate(1.15)',
}
const heroOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'linear-gradient(100deg, rgba(8,12,24,0.95) 0%, rgba(8,12,24,0.78) 42%, rgba(10,14,26,0.4) 100%)',
}
const orb: React.CSSProperties = {
  position: 'absolute',
  borderRadius: '50%',
  filter: 'blur(48px)',
  pointerEvents: 'none',
  animation: 'glowPulse 4s var(--easing-default) infinite',
}
const heroInner: React.CSSProperties = {
  position: 'relative',
  zIndex: 2,
  width: '100%',
  maxWidth: 920,
  margin: '0 auto',
  padding: 'var(--space-xl) var(--space-gutter) calc(var(--space-xl) + 36px)',
}
const heroBadge: React.CSSProperties = {
  display: 'inline-block',
  padding: '7px 16px',
  borderRadius: 'var(--radius-pill)',
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.25)',
  backdropFilter: 'blur(6px)',
  fontSize: 'var(--font-size-caption)',
  fontWeight: 'var(--font-weight-bold)',
  letterSpacing: '0.2px',
  animation: 'heroRise var(--duration-slow) var(--easing-default) both',
}
const heroTitle: React.CSSProperties = {
  fontSize: 'clamp(44px, 8vw, 76px)',
  fontWeight: 'var(--font-weight-heavy)',
  lineHeight: 1.04,
  letterSpacing: '-1.5px',
  margin: 'var(--space-sm) 0',
  background: 'linear-gradient(120deg, #ffffff 0%, #b9f6ca 52%, #84d2ff 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  filter: 'drop-shadow(0 8px 28px rgba(0,0,0,0.45))',
  animation: 'heroRise var(--duration-slow) var(--easing-default) 80ms both',
}
const heroSub: React.CSSProperties = {
  fontSize: 'clamp(15px, 2.2vw, 20px)',
  fontWeight: 'var(--font-weight-medium)',
  lineHeight: 1.5,
  color: 'rgba(255,255,255,0.88)',
  margin: '0 0 var(--space-lg)',
  maxWidth: 580,
  animation: 'heroRise var(--duration-slow) var(--easing-default) 160ms both',
}
const heroCtaRow: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-sm)',
  flexWrap: 'wrap',
  animation: 'heroRise var(--duration-slow) var(--easing-default) 240ms both',
}
const heroPrimary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '14px 26px',
  fontSize: 'var(--font-size-body)',
  fontWeight: 'var(--font-weight-heavy)',
  color: '#08230a',
  background: 'var(--color-primary)',
  borderRadius: 'var(--radius-pill)',
  textDecoration: 'none',
  boxShadow: '0 8px 28px rgba(88,204,2,0.45)',
}
const heroGlass: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '14px 24px',
  fontSize: 'var(--font-size-body)',
  fontWeight: 'var(--font-weight-bold)',
  color: '#fff',
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.3)',
  backdropFilter: 'blur(8px)',
  borderRadius: 'var(--radius-pill)',
  textDecoration: 'none',
}
const heroStats: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-xs)',
  flexWrap: 'wrap',
  marginTop: 'var(--space-lg)',
  color: 'rgba(255,255,255,0.7)',
  fontSize: 'var(--font-size-caption)',
  animation: 'heroRise var(--duration-slow) var(--easing-default) 320ms both',
}
const statNum: React.CSSProperties = { color: '#fff', fontWeight: 'var(--font-weight-heavy)' }
const dotSep: React.CSSProperties = { opacity: 0.4 }
const eqRow: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: 56,
  display: 'flex',
  alignItems: 'flex-end',
  gap: 3,
  padding: '0 4px',
  zIndex: 1,
  pointerEvents: 'none',
}
const EQ_COLORS = ['rgba(88,204,2,0.85)', 'rgba(28,176,246,0.8)', 'rgba(255,200,0,0.75)', 'rgba(255,255,255,0.45)']
const EQ_BARS = Array.from({ length: 44 }, (_, i) => ({
  dur: 0.7 + (i % 6) * 0.16,
  delay: (i * 0.13) % 1.4,
  color: EQ_COLORS[i % EQ_COLORS.length],
}))
