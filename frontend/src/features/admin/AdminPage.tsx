// AdminPage.tsx — 관리자 모드: 곡 추가·고정 + 가사 편집·고정. (비밀 닉네임 로그인 + 서버 시크릿)
import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import NavBar from '../../components/NavBar'
import { useAccountStore, isAdminName } from '../../store/account'
import { parseVideoId } from '../../lib/youtube'

const SECRET_KEY = 'vt:adminSecret'
const CATEGORIES = ['한국', '제이팝', '팝', '발라드', '트로트']

interface Song { title: string; artist: string; videoId: string; ytTitle: string; category: string }

export default function AdminPage() {
  const account = useAccountStore((s) => s.account)
  const [secret, setSecret] = useState(() => localStorage.getItem(SECRET_KEY) || '')
  const [tab, setTab] = useState<'song' | 'lyrics'>('song')

  // 관리자 닉네임이 아니면 접근 차단
  if (!isAdminName(account?.name)) return <Navigate to="/" replace />

  const saveSecret = (v: string) => { setSecret(v); try { localStorage.setItem(SECRET_KEY, v) } catch { /* */ } }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--space-lg) var(--space-gutter)' }}>
      <NavBar title="관리자" />
      <h1 style={{ fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-heavy)', color: 'var(--color-beetle)', margin: '0 0 var(--space-xs)' }}>⚙ 관리자 모드</h1>
      <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 var(--space-md)' }}>곡과 가사를 추가·고정합니다. 저장 시 리포에 커밋되어 1~2분 후 라이브에 반영됩니다.</p>

      {/* 관리자 시크릿 */}
      <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
        <span style={{ fontWeight: 'var(--font-weight-bold)' }}>🔑 시크릿</span>
        <input type="password" value={secret} onChange={(e) => saveSecret(e.target.value)} placeholder="관리자 시크릿(쓰기 인증)" style={input} />
        <span style={{ fontSize: 'var(--font-size-caption)', color: secret ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>{secret ? '입력됨' : '미입력'}</span>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-md)' }}>
        {(['song', 'lyrics'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ ...tabBtn, ...(tab === t ? tabOn : {}) }}>
            {t === 'song' ? '🎵 곡 관리' : '📜 가사 고정'}
          </button>
        ))}
      </div>

      {tab === 'song' ? <SongManager secret={secret} /> : <LyricsManager secret={secret} />}
    </main>
  )
}

// ── 곡 관리 ─────────────────────────────────────
function SongManager({ secret }: { secret: string }) {
  const [songs, setSongs] = useState<Song[]>([])
  const [vidInput, setVidInput] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/song')
      const d = await res.json()
      if (res.ok) setSongs(d.songs || [])
    } catch { /* */ }
  }, [])
  useEffect(() => { load() }, [load])

  const submit = async (op: 'add' | 'delete', videoId?: string) => {
    setMsg(''); setBusy(true)
    try {
      const vid = videoId || parseVideoId(vidInput.trim()) || vidInput.trim()
      const res = await fetch('/api/admin/song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify(op === 'delete' ? { op, videoId: vid } : { op: 'add', videoId: vid, title, artist, category, ytTitle: `${artist} ${title}`.trim() }),
      })
      const d = await res.json()
      if (!res.ok) { setMsg(`❌ ${d.error || '실패'}`); return }
      setMsg(op === 'delete' ? '🗑 삭제됨 (배포 후 반영)' : `✅ 저장됨 (총 ${d.count}곡, 배포 후 반영)`)
      if (op === 'add') { setVidInput(''); setTitle(''); setArtist('') }
      load()
    } catch (e: any) {
      setMsg(`❌ ${e?.message || '네트워크 오류'}`)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div style={card}>
        <div style={{ fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-xs)' }}>곡 추가/수정</div>
        <input value={vidInput} onChange={(e) => setVidInput(e.target.value)} placeholder="YouTube URL 또는 videoId" style={{ ...input, width: '100%', marginBottom: 6 }} />
        <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" style={{ ...input, flex: '1 1 140px' }} />
          <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="아티스트" style={{ ...input, flex: '1 1 140px' }} />
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={input}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={() => submit('add')} disabled={busy || !secret || !vidInput} style={primary}>{busy ? '저장 중…' : '➕ 추가/고정'}</button>
        {msg && <p style={{ fontSize: 'var(--font-size-caption)', marginTop: 6 }}>{msg}</p>}
      </div>

      <div style={{ fontWeight: 'var(--font-weight-bold)', margin: 'var(--space-md) 0 var(--space-xs)' }}>현재 차트 ({songs.length}곡)</div>
      <div style={{ display: 'grid', gap: 4 }}>
        {songs.map((s) => (
          <div key={s.videoId} style={row}>
            <img src={`https://i.ytimg.com/vi/${s.videoId}/default.jpg`} alt="" style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 6 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</b>
              <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>{s.artist} · {s.category}</span>
            </span>
            <button onClick={() => submit('delete', s.videoId)} disabled={busy || !secret} style={del}>삭제</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 가사 고정 ───────────────────────────────────
function LyricsManager({ secret }: { secret: string }) {
  const [vid, setVid] = useState('')
  const [artist, setArtist] = useState('')
  const [track, setTrack] = useState('')
  const [synced, setSynced] = useState('')
  const [plain, setPlain] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const videoId = parseVideoId(vid.trim()) || vid.trim()

  const loadPinned = async () => {
    setMsg('')
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}lyrics/${videoId}.json?t=${Date.now()}`)
      if (res.ok) { const d = await res.json(); setSynced(d.synced || ''); setPlain(d.plain || ''); setMsg('📜 고정 가사 불러옴') }
      else setMsg('고정 가사 없음 (자동 가사 사용 중)')
    } catch { setMsg('불러오기 실패') }
  }

  const loadAuto = async () => {
    setMsg('lrclib 검색 중…')
    try {
      const u = new URL('https://lrclib.net/api/search')
      u.searchParams.set('track_name', track)
      if (artist) u.searchParams.set('artist_name', artist)
      const res = await fetch(u.toString())
      const arr = await res.json()
      const hit = (Array.isArray(arr) ? arr : []).find((d) => d.syncedLyrics) || arr[0]
      if (hit) { setSynced(hit.syncedLyrics || ''); setPlain(hit.plainLyrics || ''); setMsg(`✅ ${hit.artistName} - ${hit.trackName} 불러옴 (수정 후 저장)`) }
      else setMsg('lrclib 결과 없음')
    } catch { setMsg('lrclib 검색 실패') }
  }

  const save = async (op?: 'delete') => {
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) { setMsg('❌ videoId 확인'); return }
    setBusy(true); setMsg('')
    try {
      const res = await fetch('/api/admin/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify(op === 'delete' ? { op, videoId } : { videoId, synced, plain, nowMs: Date.now() }),
      })
      const d = await res.json()
      if (!res.ok) { setMsg(`❌ ${d.error || '실패'}`); return }
      setMsg(op === 'delete' ? '🗑 고정 해제됨 (배포 후 자동 가사)' : '✅ 고정 저장됨 (1~2분 후 반영)')
    } catch (e: any) { setMsg(`❌ ${e?.message || '오류'}`) } finally { setBusy(false) }
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-xs)' }}>가사 편집·고정</div>
      <input value={vid} onChange={(e) => setVid(e.target.value)} placeholder="YouTube URL 또는 videoId" style={{ ...input, width: '100%', marginBottom: 6 }} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="아티스트(lrclib 검색용)" style={{ ...input, flex: '1 1 120px' }} />
        <input value={track} onChange={(e) => setTrack(e.target.value)} placeholder="제목(lrclib 검색용)" style={{ ...input, flex: '1 1 120px' }} />
        <button onClick={loadAuto} style={ghost}>⬇ lrclib 불러오기</button>
        <button onClick={loadPinned} style={ghost}>📜 고정본 불러오기</button>
      </div>
      <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginBottom: 2 }}>싱크 가사 (LRC, [mm:ss.xx] 형식)</div>
      <textarea value={synced} onChange={(e) => setSynced(e.target.value)} rows={10} placeholder="[00:12.34]가사 한 줄..." style={ta} />
      <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', margin: '6px 0 2px' }}>일반 가사 (싱크 없을 때 폴백, 선택)</div>
      <textarea value={plain} onChange={(e) => setPlain(e.target.value)} rows={4} placeholder="(선택) 줄바꿈 가사" style={ta} />
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button onClick={() => save()} disabled={busy || !secret} style={primary}>{busy ? '저장 중…' : '💾 고정 저장'}</button>
        <button onClick={() => save('delete')} disabled={busy || !secret} style={del}>고정 해제</button>
      </div>
      {msg && <p style={{ fontSize: 'var(--font-size-caption)', marginTop: 6 }}>{msg}</p>}
    </div>
  )
}

const input: React.CSSProperties = { padding: '8px 10px', borderRadius: 'var(--radius-md)', border: 'var(--border-width) solid var(--color-border)', fontFamily: 'var(--font-family)', fontSize: 'var(--font-size-caption)' }
const ta: React.CSSProperties = { ...input, width: '100%', fontFamily: 'monospace', resize: 'vertical' }
const card: React.CSSProperties = { border: 'var(--border-width) solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md)' }
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', padding: 6, border: 'var(--border-width) solid var(--color-border)', borderRadius: 'var(--radius-md)' }
const tabBtn: React.CSSProperties = { padding: '8px 16px', borderRadius: 'var(--radius-pill)', border: 'var(--border-width) solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontWeight: 'var(--font-weight-bold)', cursor: 'pointer', fontFamily: 'var(--font-family)' }
const tabOn: React.CSSProperties = { background: 'var(--color-beetle)', color: 'var(--color-text-inverse)', borderColor: 'var(--color-beetle)' }
const primary: React.CSSProperties = { padding: 'var(--space-xs) var(--space-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-inverse)', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'var(--font-family)' }
const ghost: React.CSSProperties = { padding: 'var(--space-xs) var(--space-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text)', background: 'var(--color-bg)', border: 'var(--border-width) solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'var(--font-family)', fontSize: 'var(--font-size-caption)' }
const del: React.CSSProperties = { ...ghost, color: 'var(--color-cardinal)', borderColor: 'var(--color-cardinal)' }
