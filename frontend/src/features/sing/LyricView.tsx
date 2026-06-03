// LyricView.tsx — 싱크 가사 표시 + 현재 라인 강조 (PLAN §9, M2)
// 자동 스크롤 없음(사용자가 직접 스크롤). 현재 라인은 색으로만 강조.
import type { LyricLine } from '../../lib/lrcParser'
import type { LyricsStatus } from '../../hooks/useLyrics'

interface Props {
  lines: LyricLine[]
  activeIndex: number
  status: LyricsStatus
  plain: string | null
}

export default function LyricView({ lines, activeIndex, status, plain }: Props) {
  if (status === 'loading') return <Msg>가사 불러오는 중…</Msg>
  if (status === 'notfound') return <Msg>이 곡의 가사를 찾지 못했습니다.</Msg>
  if (status === 'error') return <Msg>가사 서버 오류가 발생했습니다.</Msg>
  if (status === 'idle') return <Msg>곡을 선택하면 가사가 표시됩니다.</Msg>

  // 싱크 가사 없고 plain만 있는 경우
  if (lines.length === 0 && plain) {
    return (
      <div style={containerStyle}>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-family)', color: 'var(--color-text-secondary)', margin: 0 }}>
          {plain}
        </pre>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      {lines.map((l, i) => {
        const active = i === activeIndex
        return (
          <div
            key={`${l.time}-${i}`}
            style={{
              padding: 'var(--space-xs) 0',
              fontSize: active ? 'var(--font-size-subhead)' : 'var(--font-size-body)',
              fontWeight: active ? 'var(--font-weight-heavy)' : 'var(--font-weight-medium)',
              color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              transition: 'all var(--duration-normal) var(--easing-default)',
              textAlign: 'center',
            }}
          >
            {l.text || '♪'}
          </div>
        )
      })}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  maxHeight: 220,
  overflowY: 'auto',
  padding: 'var(--space-sm) var(--space-md)',
  background: 'var(--color-bg-subtle)',
  borderRadius: 'var(--radius-lg)',
}

function Msg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
      {children}
    </div>
  )
}
