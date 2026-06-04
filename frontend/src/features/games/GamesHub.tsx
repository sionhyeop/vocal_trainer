// GamesHub.tsx — 🎮 보컬 게임 허브 (/games)
import { Link } from 'react-router-dom'
import NavBar from '../../components/NavBar'
import { totalStars } from '../../lib/storage'

const GAMES = [
  { to: '/games/breaker', icon: '🎹', label: '피아노 타일', desc: '떨어지는 타일을 그 음정으로 소리내 깨기 · 콤보 아케이드', color: '#2b2b2b' },
  { to: '/games/echo', icon: '🎼', label: '멜로디 따라부르기', desc: '유명 발라드 5곡 듣고 따라 부르기 · 청음 + 가창', color: 'var(--color-macaw)' },
  { to: '/games/climber', icon: '🪜', label: '음역대 클라이머', desc: '음정 차트 보며 목표 음 유지해 등반 · 음정·음역 훈련', color: 'var(--color-fox)' },
  { to: '/games/ear', icon: '🎧', label: '음 듣고 맞히기', desc: '음 이름·음정 간격 청음 퀴즈 · 절대/상대음감', color: 'var(--color-beetle)' },
]

export default function GamesHub() {
  const stars = totalStars()
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-lg) var(--space-gutter)' }}>
      <NavBar title="보컬 게임" />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 var(--space-xs)' }}>
        <h1 style={{ fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)', color: 'var(--color-bee)', margin: 0 }}>🎮 보컬 게임</h1>
        <span style={{ fontWeight: 'var(--font-weight-heavy)', color: 'var(--color-bee)' }}>⭐ {stars}</span>
      </div>
      <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 var(--space-lg)' }}>
        마이크로 노래하며 즐기는 보컬 훈련 게임. 레벨을 깨고 별을 모으세요.
      </p>

      <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
        {GAMES.map((g) => (
          <Link key={g.to} to={g.to} className="lift" style={{
            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
            padding: 'var(--space-md)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
            background: g.color, color: 'var(--color-text-inverse)',
          }}>
            <span style={{ fontSize: 44 }}>{g.icon}</span>
            <span>
              <span style={{ display: 'block', fontSize: 'var(--font-size-subhead)', fontWeight: 'var(--font-weight-heavy)' }}>{g.label}</span>
              <span style={{ display: 'block', fontSize: 'var(--font-size-caption)', opacity: 0.92 }}>{g.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  )
}
