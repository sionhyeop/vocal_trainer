// ProfilePage.tsx — 내 음역대 측정·저장 (M6)
import { useCallback, useRef, useState } from 'react'
import NavBar from '../../components/NavBar'
import { useMicPitch, type PitchFrame } from '../../hooks/useMicPitch'
import { midiToNoteName } from '../../lib/midi'
import { getProfile, saveProfile, type Profile } from '../../lib/storage'

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(() => getProfile())
  const [cur, setCur] = useState<{ note: string; voiced: boolean }>({ note: '–', voiced: false })
  const [range, setRange] = useState<{ lo: number | null; hi: number | null }>({ lo: null, hi: null })
  const loRef = useRef<number | null>(null)
  const hiRef = useRef<number | null>(null)
  const frameRef = useRef(0)

  const onFrame = useCallback((f: PitchFrame) => {
    if (f.voiced && f.midi != null) {
      if (loRef.current == null || f.midi < loRef.current) loRef.current = f.midi
      if (hiRef.current == null || f.midi > hiRef.current) hiRef.current = f.midi
    }
    if (frameRef.current++ % 5 === 0) {
      setCur({ note: f.voiced && f.midi != null ? midiToNoteName(f.midi) : '–', voiced: f.voiced })
      setRange({ lo: loRef.current, hi: hiRef.current })
    }
  }, [])

  const { running, error, start, stop } = useMicPitch(onFrame)

  const begin = async () => {
    loRef.current = null
    hiRef.current = null
    setRange({ lo: null, hi: null })
    await start()
  }

  const finish = () => {
    stop()
    if (loRef.current != null && hiRef.current != null && hiRef.current - loRef.current >= 2) {
      const p: Profile = { lowMidi: Math.round(loRef.current), highMidi: Math.round(hiRef.current), dateMs: Date.now() }
      saveProfile(p)
      setProfile(p)
    }
  }

  const span = profile ? profile.highMidi - profile.lowMidi : 0

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-lg) var(--space-gutter)' }}>
      <NavBar title="프로필" />
      <h1 style={{ fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)', color: 'var(--color-primary)', margin: '0 0 var(--space-md)' }}>
        🎚 내 음역대
      </h1>

      {profile && (
        <div style={{ ...card, marginBottom: 'var(--space-md)' }}>
          <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>저장된 음역대</div>
          <div style={{ fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)' }}>
            {midiToNoteName(profile.lowMidi)} ~ {midiToNoteName(profile.highMidi)}
          </div>
          <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>
            약 {Math.floor(span / 12)}옥타브 {span % 12}반음
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-xs)' }}>측정</div>
        <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-sm)' }}>
          시작을 누르고 <b>가장 낮은 음 ~ 가장 높은 음</b>까지 편하게 "아—" 소리로 천천히 올려보세요.
        </p>

        {running && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
            <Stat label="현재 음" value={cur.note} accent={cur.voiced} />
            <Stat label="최저" value={range.lo != null ? midiToNoteName(range.lo) : '–'} />
            <Stat label="최고" value={range.hi != null ? midiToNoteName(range.hi) : '–'} />
          </div>
        )}

        {!running ? (
          <button onClick={begin} style={primaryBtn}>🎤 측정 시작</button>
        ) : (
          <button onClick={finish} style={{ ...primaryBtn, background: 'var(--color-cardinal)', boxShadow: '0 4px 0 #d33' }}>■ 측정 끝 · 저장</button>
        )}
        {error && <p style={{ color: 'var(--color-cardinal)' }}>{error}</p>}
      </div>

      <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-md)' }}>
        팁: 무리하지 말고 편한 음역까지만. 유선 이어폰 권장.
      </p>
    </main>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-xs)', textAlign: 'center' }}>
      <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 'var(--font-size-subhead)', fontWeight: 'var(--font-weight-heavy)', color: accent ? 'var(--color-primary)' : 'var(--color-text)' }}>{value}</div>
    </div>
  )
}

const card: React.CSSProperties = {
  border: 'var(--border-width) solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md)',
}
const primaryBtn: React.CSSProperties = {
  padding: 'var(--space-sm) var(--space-lg)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text-inverse)', background: 'var(--color-primary)', border: 'none',
  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-button)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
