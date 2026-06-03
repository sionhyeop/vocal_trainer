// ChartPage.tsx — /chart 직접 진입용 (홈과 동일한 ChartList 재사용)
import NavBar from '../../components/NavBar'
import ChartList from './ChartList'

export default function ChartPage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--space-lg) var(--space-gutter)' }}>
      <NavBar />
      <h1 style={{ fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)', color: 'var(--color-cardinal)', margin: '0 0 var(--space-md)' }}>
        🔥 인기곡 차트
      </h1>
      <ChartList />
    </main>
  )
}
