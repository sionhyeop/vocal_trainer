// ChartList.tsx — 상단 카테고리 탭 + 해당 차트 리스트 (홈/차트페이지 공용)
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../../store/session'
import songs from '../../assets/chartSongs.json'

interface ChartSong {
  title: string
  artist: string
  videoId: string
  ytTitle: string
  category: string
}

const TABS = [
  { label: '케이팝', cat: '한국', color: 'var(--color-primary)' },
  { label: '제이팝', cat: '제이팝', color: 'var(--color-cardinal)' },
  { label: '팝송', cat: '팝', color: 'var(--color-macaw)' },
  { label: '발라드', cat: '발라드', color: 'var(--color-beetle)' },
  { label: '트로트', cat: '트로트', color: 'var(--color-fox)' },
]

export default function ChartList() {
  const navigate = useNavigate()
  const setSelected = useSessionStore((s) => s.setSelected)
  const list = songs as ChartSong[]
  const [active, setActive] = useState(TABS[0].cat)
  const activeTab = TABS.find((t) => t.cat === active) ?? TABS[0]
  const items = list.filter((s) => s.category === active)

  const pick = (s: ChartSong) => {
    setSelected({ videoId: s.videoId, title: `${s.artist} - ${s.title}`, channelTitle: s.artist })
    navigate(`/sing/${s.videoId}`)
  }

  return (
    <div>
      {/* 카테고리 탭 */}
      <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const on = t.cat === active
          return (
            <button
              key={t.cat}
              onClick={() => setActive(t.cat)}
              style={{
                padding: '10px 20px', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-heavy)',
                color: on ? 'var(--color-text-inverse)' : 'var(--color-text)',
                background: on ? t.color : 'var(--color-bg)',
                border: `var(--border-width) solid ${on ? t.color : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontFamily: 'var(--font-family)',
                boxShadow: on ? 'var(--shadow-button)' : 'none',
                transition: 'all var(--duration-fast) var(--easing-default)',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* 리스트 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((s, i) => (
          <button key={s.videoId} onClick={() => pick(s)} style={row(activeTab.color)}>
            <span style={{ width: 24, textAlign: 'right', color: activeTab.color, fontWeight: 'var(--font-weight-heavy)', fontSize: 'var(--font-size-subhead)' }}>{i + 1}</span>
            <img src={`https://i.ytimg.com/vi/${s.videoId}/default.jpg`} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 'var(--font-weight-bold)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
              <span style={{ display: 'block', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.artist}</span>
            </span>
            <span style={{ color: activeTab.color, fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-caption)' }}>▶ 부르기</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function row(color: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
    padding: '8px var(--space-sm)', background: 'var(--color-bg)',
    border: 'var(--border-width) solid var(--color-border)', borderRadius: 'var(--radius-lg)',
    cursor: 'pointer', fontFamily: 'var(--font-family)', textAlign: 'left', width: '100%',
    borderLeft: `4px solid ${color}`,
  }
}
