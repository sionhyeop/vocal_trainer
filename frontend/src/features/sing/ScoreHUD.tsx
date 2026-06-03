// ScoreHUD.tsx — 실시간 점수/콤보/판정 (PLAN §2.2 HUD)
import { JUDGMENT_COLOR, type Judgment } from '../../lib/score'

interface Props {
  score: number
  combo: number
  judgment: Judgment | null
  judgmentKey: number // 같은 판정이 연속돼도 애니메이션 재생용
}

export default function ScoreHUD({ score, combo, judgment, judgmentKey }: Props) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* 점수 */}
      <div
        style={{
          position: 'absolute', top: 10, left: 14,
          fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)',
          color: 'var(--color-text-inverse)', textShadow: '0 2px 6px rgba(0,0,0,0.6)',
        }}
      >
        {Math.round(score).toLocaleString()}
      </div>

      {/* 콤보 */}
      {combo >= 2 && (
        <div
          style={{
            position: 'absolute', top: 14, right: 16, textAlign: 'right',
            color: 'var(--color-bee)', textShadow: '0 2px 6px rgba(0,0,0,0.6)',
          }}
        >
          <span style={{ fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)' }}>{combo}</span>
          <span style={{ fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-bold)' }}> COMBO</span>
        </div>
      )}

      {/* 판정 팝 (중앙) */}
      {judgment && (
        <div
          key={judgmentKey}
          style={{
            position: 'absolute', top: '38%', left: 0, right: 0, textAlign: 'center',
            fontSize: 'var(--font-size-hero)', fontWeight: 'var(--font-weight-heavy)',
            color: JUDGMENT_COLOR[judgment], textShadow: '0 2px 10px rgba(0,0,0,0.6)',
            animation: 'judgePop var(--duration-slow) var(--easing-bounce)',
          }}
        >
          {judgment}
        </div>
      )}
    </div>
  )
}
