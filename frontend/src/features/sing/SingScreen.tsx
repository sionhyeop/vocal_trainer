// SingScreen.tsx — 퍼펙트 스코어 가창 (PLAN §2.2, M4 + 방법 B)
// MR/원곡 재생 + 싱크 가사 + 내 목소리 실시간 피치 리본 + 채점.
//  - 자유 채점(Tier B): 노트맵 없이 음정 안정성 기반
//  - ★ 정밀 채점(Tier A): 가이드 녹음으로 자동 생성한 노트맵과 cent 1:1 대조 (노래방식)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useSessionStore } from '../../store/session'
import { parseVideoTitle, type ParsedTitle } from '../../lib/titleParser'
import { fetchVideoTitle } from '../../lib/youtube'
import { findLineIndex } from '../../lib/lrcParser'
import { useYouTubePlayer } from '../../hooks/useYouTubePlayer'
import { useLyrics } from '../../hooks/useLyrics'
import { useMicPitch, type PitchFrame } from '../../hooks/useMicPitch'
import ExtractRequest from './ExtractRequest'
import { pitchShiftBuffer } from '../../lib/pitchShift'
import type { ScoreState } from '../../audio/scorer'
import { MelodyScorer } from '../../audio/melodyScorer'
import type { Judgment } from '../../lib/score'
import type { NoteMap } from '../../lib/noteMap'
import { loadNoteMap, saveNoteMap, deleteNoteMap } from '../../lib/noteMapStore'
import { extractNoteMapFromOriginal, fetchExtractProgress, loadCachedNoteMap, type ExtractMethod, type ExtractProgress } from '../../lib/extractNoteMap'
import { analyzeBreath, type SessionFrame, type BreathSummary } from '../../audio/breathAnalyzer'
import { computeWeakSections, type WeakSection } from '../result/weakSections'
import { saveSession, getLyricsConfirm, saveLyricsConfirm, clearLyricsConfirm } from '../../lib/storage'
import ResultPanel from '../result/ResultPanel'
import { drawMelodyRibbon, MAX_HISTORY, type RibbonSample } from './ribbonDraw'
import LyricView from './LyricView'
import LyricSyncSlider from './LyricSyncSlider'
import ScoreHUD from './ScoreHUD'
import NavBar from '../../components/NavBar'

type Phase = 'idle' | 'countdown' | 'singing' | 'done'

const VOICE_SHIFTS = [-7, -5, -3, 0, 3, 5, 7] // 내 목소리 변조(반음)
type Mode = 'melody'

interface ScorerLike {
  state: ScoreState
  accuracy: () => number
}

const YT_API_KEY = (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined) ?? ''
// 로컬 백엔드(VITE_LYRICS_API)가 있으면 직접 추출, 없으면(정적 배포) "추출 요청" 흐름
const HAS_LOCAL_BACKEND = !!(import.meta.env.VITE_LYRICS_API as string | undefined)

export default function SingScreen() {
  const { videoId = '' } = useParams()
  const selected = useSessionStore((s) => s.selected)
  const selTitle = selected?.videoId === videoId ? selected.title : ''
  // 검색으로 안 들어왔거나 제목이 없으면 YouTube에서 제목을 직접 조회 → 곡명/아티스트 자동 추출
  const [fetchedTitle, setFetchedTitle] = useState('')
  useEffect(() => {
    if (selTitle) return
    let alive = true
    fetchVideoTitle(videoId, YT_API_KEY).then((t) => alive && t && setFetchedTitle(t))
    return () => { alive = false }
  }, [videoId, selTitle])
  const title = selTitle || fetchedTitle

  const parsed = useMemo(() => (title ? parseVideoTitle(title) : null), [title])
  // 가사 수동 교정: 자유 입력을 제목 파서로 분해(가수/제목 자동 분리, 순서 바뀌어도 OK)
  const [manualQuery, setManualQuery] = useState<ParsedTitle | null>(null)
  const lyricInput = manualQuery ?? parsed
  const [lyrRefresh, setLyrRefresh] = useState(0)
  const lyrics = useLyrics(lyricInput, videoId, lyrRefresh)
  // "정확해요" 확정 상태 (확정 시 가사를 로컬 고정 → API 재호출 안 함)
  const [lyricsConfirmed, setLyricsConfirmed] = useState(false)
  useEffect(() => { setLyricsConfirmed(!!getLyricsConfirm(videoId)) }, [videoId])
  const toggleLyricsConfirm = useCallback(() => {
    if (lyricsConfirmed) {
      clearLyricsConfirm(videoId)
      setLyricsConfirmed(false)
      setLyrRefresh((n) => n + 1) // 고정 해제 → 다시 자동 조회
    } else if (lyrics.status === 'ok' && (lyrics.lines.length || lyrics.plain)) {
      saveLyricsConfirm(videoId, { lines: lyrics.lines, plain: lyrics.plain, matched: lyrics.matched })
      setLyricsConfirmed(true)
    }
  }, [lyricsConfirmed, videoId, lyrics])
  const { containerRef, ready, status, errorMsg, getCurrentTime, play, pause, seekTo, getPlayerState } =
    useYouTubePlayer(videoId)

  // 현재 가사 줄 인덱스 + 줄 내 진행도(0~1, 단어 와이프용)
  const [lyricPos, setLyricPos] = useState<{ index: number; progress: number }>({ index: -1, progress: 0 })
  const activeIndex = lyricPos.index
  // 가사 싱크 오프셋(초): 영상 인트로/버전 차이로 가사가 밀릴 때 보정. 영상별 저장.
  const [lyricOffset, setLyricOffset] = useState(0)
  const offsetRef = useRef(0)
  offsetRef.current = lyricOffset
  const [showFullLyrics, setShowFullLyrics] = useState(false)
  const [showLyricFix, setShowLyricFix] = useState(false)
  const [fixArtist, setFixArtist] = useState('')
  const [fixTrack, setFixTrack] = useState('')
  // 가수/제목 칸으로 가사 재검색 (한쪽만 채워도 OK, 순서 뒤바뀜 대비 alternate)
  const submitLyricFix = () => {
    const artist = fixArtist.trim()
    const track = fixTrack.trim()
    if (!artist && !track) return
    const t = track || artist // 제목 칸이 비면 가수 칸을 제목으로
    const a = track ? artist : ''
    setManualQuery({
      trackName: t,
      artistName: a,
      alternate: a ? { trackName: a, artistName: t } : undefined,
    })
  }
  const [phase, setPhase] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')
  phaseRef.current = phase

  // 자동 녹음(내 목소리) 상태/참조 — 핸들러는 useMicPitch(getStream) 이후 정의
  const [recordEnabled, setRecordEnabled] = useState(true)
  const recordEnabledRef = useRef(true)
  recordEnabledRef.current = recordEnabled
  const [recordedBuf, setRecordedBuf] = useState<AudioBuffer | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recChunksRef = useRef<Blob[]>([])
  const recCtxRef = useRef<AudioContext | null>(null)
  const recSrcRef = useRef<AudioBufferSourceNode | null>(null)
  const [count, setCount] = useState(3)
  const [rms, setRms] = useState(0)
  const [hud, setHud] = useState<{ score: number; combo: number; judgment: Judgment | null; key: number }>(
    { score: 0, combo: 0, judgment: null, key: 0 },
  )

  // 노트맵 / 채점 모드
  const [noteMap, setNoteMap] = useState<NoteMap | null>(null)
  const noteMapRef = useRef<NoteMap | null>(null)
  noteMapRef.current = noteMap
  const [mode] = useState<Mode>('melody') // 정밀(원곡 대조)만

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const historyRef = useRef<RibbonSample[]>([])
  const melodyRef = useRef<MelodyScorer | null>(null)
  const activeScorerRef = useRef<ScorerLike | null>(null)
  const sessionLogRef = useRef<SessionFrame[]>([])
  const linesRef = useRef(lyrics.lines)
  linesRef.current = lyrics.lines
  const [resultData, setResultData] = useState<{ breath: BreathSummary; weak: WeakSection[] } | null>(null)
  const frameCountRef = useRef(0)
  const countdownTimer = useRef<number | null>(null)

  // videoId 바뀌면 저장된 노트맵 + 가사 오프셋 로드. 로컬에 없으면 서버 캐시(사전 추출 차트곡) 자동 로드
  useEffect(() => {
    const nm = loadNoteMap(videoId)
    setNoteMap(nm)
    const off = Number(localStorage.getItem(`lyricOffset:${videoId}`) || 0)
    setLyricOffset(Number.isFinite(off) ? off : 0)
    if (nm) return
    let alive = true
    loadCachedNoteMap(videoId, videoId).then((cached) => {
      if (alive && cached) {
        saveNoteMap(videoId, cached)
        setNoteMap(cached)
      }
    })
    return () => { alive = false }
  }, [videoId])

  const setOffset = useCallback(
    (v: number) => {
      const n = Math.round(v * 10) / 10
      setLyricOffset(n)
      try { localStorage.setItem(`lyricOffset:${videoId}`, String(n)) } catch { /* noop */ }
    },
    [videoId],
  )

  const onFrame = useCallback(
    (f: PitchFrame) => {
      const tMs = getCurrentTime() * 1000
      const hist = historyRef.current
      hist.push({ midi: f.midi, tMs })
      if (hist.length > MAX_HISTORY) hist.shift()

      // 리본 — 목표 가로막대 + 내 목소리, R→L 흐름
      const notes = noteMapRef.current ? noteMapRef.current.notes : []
      drawMelodyRibbon(canvasRef.current, hist, notes, tMs)

      if (frameCountRef.current++ % 6 === 0) setRms(f.rms)

      // 채점 + 세션 로그(호흡/약점 분석용)
      if (phaseRef.current === 'singing') {
        sessionLogRef.current.push({ tMs, midi: f.midi, clarity: f.clarity, rms: f.rms, voiced: f.voiced })
        const j: Judgment | null = melodyRef.current ? melodyRef.current.update(tMs, f.midi) : null
        if (j !== null) {
          const sc = activeScorerRef.current!
          // 점수는 0~100 (정확도). 콤보는 그대로.
          setHud((prev) => ({ score: Math.round(sc.accuracy()), combo: sc.state.combo, judgment: j, key: prev.key + 1 }))
        }
      }
    },
    [getCurrentTime],
  )

  const { running, error, start, stop, getStream } = useMicPitch(onFrame)

  // 채점용으로 열린 마이크 스트림에 MediaRecorder를 붙여 백그라운드 녹음
  const startRecording = useCallback(() => {
    setRecordedBuf(null)
    if (!recordEnabledRef.current) return
    const stream = getStream()
    if (!stream) return
    try {
      const rec = new MediaRecorder(stream)
      recChunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size) recChunksRef.current.push(e.data) }
      rec.onstop = async () => {
        try {
          const blob = new Blob(recChunksRef.current, { type: rec.mimeType || 'audio/webm' })
          if (!blob.size) return
          const arr = await blob.arrayBuffer()
          const ctx = (recCtxRef.current ??= new AudioContext())
          setRecordedBuf(await ctx.decodeAudioData(arr))
        } catch { /* 디코드 실패 무시 */ }
      }
      rec.start()
      recorderRef.current = rec
    } catch { /* MediaRecorder 미지원 등 무시 */ }
  }, [getStream])

  const stopRecording = useCallback(() => {
    try {
      const rec = recorderRef.current
      if (rec && rec.state !== 'inactive') rec.stop()
    } catch { /* noop */ }
    recorderRef.current = null
  }, [])

  // 녹음된 내 목소리를 semis 반음 이동해 재생(0=원음)
  const playMyVoice = useCallback(async (semis: number) => {
    if (!recordedBuf) return
    const ctx = (recCtxRef.current ??= new AudioContext())
    await ctx.resume()
    try { recSrcRef.current?.stop() } catch { /* noop */ }
    const out = semis === 0 ? recordedBuf : pitchShiftBuffer(ctx, recordedBuf, semis)
    const src = ctx.createBufferSource()
    src.buffer = out
    src.connect(ctx.destination)
    src.start()
    recSrcRef.current = src
  }, [recordedBuf])

  // 캔버스 사이즈
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const resize = () => {
      c.width = c.clientWidth
      c.height = c.clientHeight
      drawMelodyRibbon(c, historyRef.current, [], 0)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // 미리보기 — 부르기 전(idle)에 영상을 재생하면 추출된 목표 멜로디 막대가 배경에 흐른다
  useEffect(() => {
    if (phase !== 'idle' || !noteMap) return
    let raf = 0
    const tick = () => {
      drawMelodyRibbon(canvasRef.current, [], noteMap.notes, getCurrentTime() * 1000)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, noteMap, getCurrentTime])

  // 가사 동기 + 줄 내 진행도(단어 와이프)
  useEffect(() => {
    if (!ready || lyrics.lines.length === 0) return
    const lines = lyrics.lines
    let raf = 0
    const tick = () => {
      const t = getCurrentTime() - offsetRef.current // 초, 오프셋 보정(정확한 재생시간)
      const idx = findLineIndex(lines, t)
      let p = 0
      if (idx >= 0) {
        const cur = lines[idx].time
        const next = idx + 1 < lines.length ? lines[idx + 1].time : cur + 4
        const gap = next - cur
        // 실제 부르는 시간을 글자 수로 추정(쉬는/간주 구간이 길어도 색칠이 기어가지 않게)
        const est = Math.max(0.5, Array.from(lines[idx].text || '').length * 0.17)
        const dur = Math.min(gap, est)
        p = dur > 0 ? Math.min(1, Math.max(0, (t - cur) / dur)) : 1
      }
      setLyricPos((prev) => (prev.index === idx && Math.abs(prev.progress - p) < 0.02 ? prev : { index: idx, progress: p }))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ready, getCurrentTime, lyrics.lines])

  const finish = useCallback(() => {
    if (countdownTimer.current) clearInterval(countdownTimer.current)
    melodyRef.current?.flush()
    stopRecording() // 마이크 트랙 정지 전에 녹음 마무리(onstop이 디코드)
    stop()
    pause()

    // 분석: 호흡 + 약점 구간
    const frames = sessionLogRef.current
    const notes = noteMapRef.current ? noteMapRef.current.notes : null
    const breath = analyzeBreath(frames)
    const weak = computeWeakSections(frames, linesRef.current, notes)
    setResultData({ breath, weak })

    // 세션 저장(local-first)
    const sc = activeScorerRef.current
    if (sc && frames.length > 0) {
      saveSession({
        id: `${videoId}-${Date.now()}`,
        videoId,
        title: parsed?.trackName || title || videoId,
        mode,
        score: Math.round(sc.accuracy()),
        accuracy: Math.round(sc.accuracy()),
        maxCombo: sc.state.maxCombo,
        counts: sc.state.counts,
        breath,
        weak,
        dateMs: Date.now(),
      })
    }
    setPhase('done')
  }, [stop, pause, videoId, parsed, title, stopRecording])

  // 영상 종료 감지
  useEffect(() => {
    if (phase !== 'singing') return
    let raf = 0
    const check = () => {
      if (getPlayerState() === 0) {
        finish()
        return
      }
      raf = requestAnimationFrame(check)
    }
    raf = requestAnimationFrame(check)
    return () => cancelAnimationFrame(raf)
  }, [phase, getPlayerState, finish])

  const onStart = useCallback(async () => {
    if (!noteMapRef.current) {
      setExtractErr('정밀 채점을 위해 먼저 "원곡에서 자동 추출"을 해주세요.')
      return
    }
    historyRef.current = []
    sessionLogRef.current = []
    setResultData(null)
    setHud({ score: 0, combo: 0, judgment: null, key: 0 })
    melodyRef.current = new MelodyScorer(noteMapRef.current.notes)
    activeScorerRef.current = melodyRef.current
    const ok = await start()
    if (!ok) return
    startRecording() // 부르는 동안 백그라운드 자동 녹음
    setPhase('countdown')
    setCount(3)
    let c = 3
    countdownTimer.current = window.setInterval(() => {
      c -= 1
      if (c <= 0) {
        if (countdownTimer.current) clearInterval(countdownTimer.current)
        setPhase('singing')
        play()
      } else setCount(c)
    }, 1000)
  }, [start, play, startRecording])

  const onRetry = useCallback(() => {
    historyRef.current = []
    drawMelodyRibbon(canvasRef.current, historyRef.current, [], 0)
    try { recSrcRef.current?.stop() } catch { /* noop */ }
    setRecordedBuf(null)
    setPhase('idle')
    setHud({ score: 0, combo: 0, judgment: null, key: 0 })
  }, [])

  const removeNoteMap = useCallback(() => {
    deleteNoteMap(videoId)
    setNoteMap(null)
  }, [videoId])

  // 방법 A — 원곡에서 자동 추출 (force=true면 캐시 무시하고 재추출)
  const [extracting, setExtracting] = useState(false)
  const [extractErr, setExtractErr] = useState('')
  const [progress, setProgress] = useState<ExtractProgress | null>(null)
  const extractSecs = 60 // 자동(고정)
  const [extractMethod, setExtractMethod] = useState<ExtractMethod>('auto')
  const autoExtract = useCallback(
    async (force: boolean) => {
      setExtracting(true)
      setExtractErr('')
      setProgress({ stage: '시작', pct: 0 })
      const poll = window.setInterval(async () => {
        const p = await fetchExtractProgress(videoId)
        if (p) setProgress(p)
      }, 800)
      try {
        const nm = await extractNoteMapFromOriginal(videoId, parsed?.trackName || title || videoId, extractSecs, force, extractMethod)
        saveNoteMap(videoId, nm)
        setNoteMap(nm)
      } catch (e: any) {
        setExtractErr(e?.message ?? '추출 실패')
      } finally {
        clearInterval(poll)
        setExtracting(false)
        setProgress(null)
      }
    },
    [videoId, parsed, title, extractSecs, extractMethod],
  )

  useEffect(() => () => { if (countdownTimer.current) clearInterval(countdownTimer.current) }, [])

  const result = activeScorerRef.current

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--space-md) var(--space-gutter)' }}>
      <NavBar
        title={`${parsed ? `${parsed.artistName ? parsed.artistName + ' - ' : ''}${parsed.trackName}` : `영상 ID: ${videoId}`}${lyrics.status === 'ok' && lyrics.matched ? `  ·  가사: ${lyrics.matched}` : ''}`}
      />

      {/* ① 영상 (맨 위) + 오버레이 */}
      <div style={{ position: 'relative', paddingTop: '56.25%', marginBottom: 'var(--space-sm)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: '#000' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        {(phase === 'singing' || phase === 'countdown') && (
          <ScoreHUD score={hud.score} combo={hud.combo} judgment={hud.judgment} judgmentKey={hud.key} />
        )}
        {phase === 'countdown' && (
          <div style={overlayCenter}>
            <div key={count} style={{ fontSize: 96, fontWeight: 'var(--font-weight-heavy)', color: 'var(--color-text-inverse)', animation: 'countPop 1s var(--easing-bounce)' }}>{count}</div>
          </div>
        )}
        {status !== 'ready' && (
          <div style={{ ...overlayCenter, flexDirection: 'column', gap: 'var(--space-xs)', pointerEvents: status === 'error' ? 'auto' : 'none' }}>
            {status === 'loading' && <span style={{ opacity: 0.8, color: 'var(--color-text-inverse)' }}>플레이어 불러오는 중…</span>}
            {status === 'error' && (
              <>
                <span style={{ color: 'var(--color-cardinal)', fontWeight: 'var(--font-weight-bold)' }}>⚠ {errorMsg}</span>
                <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer" style={{ color: 'var(--color-macaw)', fontWeight: 'var(--font-weight-bold)' }}>유튜브에서 열기 ↗</a>
              </>
            )}
          </div>
        )}
      </div>

      {/* ② 게임형 피치 리본 + 가사 오버레이(현재 줄) */}
      <div style={{ position: 'relative', marginBottom: 'var(--space-sm)' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: 420, display: 'block', borderRadius: 'var(--radius-lg)', background: '#0d1117' }} />
        {/* 현재 가사 한 줄 오버레이 (음정 창 위에). 우측은 싱크 슬라이더 자리 비움 */}
        <div style={{ position: 'absolute', left: 0, right: 66, bottom: 12, textAlign: 'center', pointerEvents: 'none', padding: '0 var(--space-md)' }}>
          {lyrics.status === 'loading' && <span style={overlaySub}>가사 불러오는 중…</span>}
          {lyrics.status === 'notfound' && <span style={overlaySub}>이 곡의 가사를 찾지 못했어요</span>}
          {lyrics.status === 'error' && <span style={overlaySub}>가사 서버 오류</span>}
          {lyrics.status === 'ok' && (
            <>
              <WipeLine text={lyrics.lines[activeIndex]?.text || '♪'} progress={lyricPos.progress} />
              {lyrics.lines[activeIndex + 1]?.text && <div style={overlayNext}>{lyrics.lines[activeIndex + 1].text}</div>}
            </>
          )}
        </div>
        {/* 가사 싱크 세로 슬라이더 (차트 우측, 위=빨리·아래=늦게) */}
        {lyrics.status === 'ok' && lyrics.lines.length > 0 && (
          <LyricSyncSlider offset={lyricOffset} onChange={setOffset} />
        )}
      </div>

      {/* 가사 보조 컨트롤 — 두 토글을 한 줄에 분리 배치(겹치지 않게) */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginBottom: 'var(--space-xs)' }}>
        <button onClick={() => setShowFullLyrics((v) => !v)} style={lyricCtrlBtn}>
          📜 가사 전체 {showFullLyrics ? '접기 ▲' : '보기 ▼'}
        </button>
        <button
          onClick={() => {
            // 현재 추정값을 가수/제목 칸에 각각 채워둠
            setFixArtist(manualQuery?.artistName ?? parsed?.artistName ?? '')
            setFixTrack(manualQuery?.trackName ?? parsed?.trackName ?? '')
            setShowLyricFix((v) => !v)
          }}
          style={lyricCtrlBtn}
        >
          🔍 가사 직접 찾기 {showLyricFix ? '▲' : '▼'}
        </button>
        {lyrics.status === 'ok' && lyrics.matched && (
          <span style={{ alignSelf: 'center', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>
            현재 매칭: {lyrics.matched}
          </span>
        )}
        {/* 정확해요 — 체크 시 이 가사를 고정(로컬 저장)해 다음부턴 API 재호출 없이 즉시 사용 */}
        {(lyrics.status === 'ok' || lyricsConfirmed) && (
          <label style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-bold)', color: lyricsConfirmed ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={lyricsConfirmed} onChange={toggleLyricsConfirm} />
            ✓ 가사 정확해요 (고정)
          </label>
        )}
      </div>

      {showFullLyrics && (
        <div style={{ marginBottom: 'var(--space-sm)' }}>
          <LyricView lines={lyrics.lines} activeIndex={activeIndex} status={lyrics.status} plain={lyrics.plain} />
        </div>
      )}

      {showLyricFix && (
        <div style={{ border: 'var(--border-width) solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={fixArtist}
              onChange={(e) => setFixArtist(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitLyricFix() }}
              placeholder="가수 (예: 아이유)"
              style={{ ...fixInput, flex: '1 1 120px' }}
            />
            <input
              value={fixTrack}
              onChange={(e) => setFixTrack(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitLyricFix() }}
              placeholder="제목 (예: 밤편지)"
              style={{ ...fixInput, flex: '1 1 120px' }}
            />
            <button
              onClick={submitLyricFix}
              style={{ ...lyricCtrlBtn, color: 'var(--color-text-inverse)', background: 'var(--color-macaw)', borderColor: 'var(--color-macaw)' }}
            >
              가사 다시 찾기
            </button>
          </div>
          <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
            가수와 제목을 각 칸에 나눠 적으면 더 정확합니다. (한쪽만 적어도 검색돼요)
          </div>
        </div>
      )}


      {/* RMS 바 */}
      <div style={{ marginBottom: 'var(--space-sm)' }}>
        <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>마이크 입력 {running ? '' : '(시작 전)'}</div>
        <div style={{ height: 10, background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, rms * 800)}%`, background: 'var(--color-bee)', transition: 'width 80ms linear' }} />
        </div>
        {/* 자동 녹음 상태/토글 */}
        <div style={{ marginTop: 6, fontSize: 'var(--font-size-caption)' }}>
          {phase === 'singing' && recordEnabled ? (
            <span style={{ color: 'var(--color-cardinal)', fontWeight: 'var(--font-weight-bold)' }}>
              <span style={{ animation: 'glowPulse 1.2s var(--easing-default) infinite' }}>●</span> 내 목소리 녹음 중
            </span>
          ) : phase === 'idle' ? (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              <input type="checkbox" checked={recordEnabled} onChange={(e) => setRecordEnabled(e.target.checked)} />
              🎙 부르는 동안 내 목소리 녹음 (끝나면 다시듣기·음정 변조)
            </label>
          ) : null}
        </div>
      </div>

      {/* ★ 원곡 대조(노트맵) 패널 — 정밀 채점 전용 */}
      {(phase === 'idle' || phase === 'done') && (
        <div style={{ border: 'var(--border-width) solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-sm) var(--space-md)', marginBottom: 'var(--space-sm)' }}>
          <div style={{ fontWeight: 'var(--font-weight-bold)', marginBottom: 4 }}>🎯 원곡 멜로디 대조 (정밀 채점)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-xs)', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)' }}>
            추출 방식:
            <select value={extractMethod} onChange={(e) => setExtractMethod(e.target.value as ExtractMethod)} disabled={extracting} style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: 'var(--border-width) solid var(--color-border)', fontFamily: 'var(--font-family)' }}>
              <option value="auto">자동</option>
              <option value="crepe">발라드/잔잔(CREPE)</option>
              <option value="basicpitch">EDM/강한보컬(Basic Pitch)</option>
            </select>
          </div>
          {noteMap ? (
            <>
              <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
                <button onClick={() => autoExtract(true)} disabled={extracting} style={ghostBtn}>{extracting ? '재추출 중…' : '🔄 원곡 재추출(이상하면)'}</button>
                <button onClick={removeNoteMap} disabled={extracting} style={ghostBtn}>삭제</button>
              </div>
            </>
          ) : HAS_LOCAL_BACKEND ? (
            <>
              <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
                정밀 채점을 위해 <b>먼저 원곡 멜로디를 추출</b>해야 합니다. (수십 초 소요, 추출 후 캐시되어 다음엔 즉시)
              </div>
              <button onClick={() => autoExtract(false)} disabled={extracting} style={{ ...ghostBtn, borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                {extracting ? '⏳ 원곡 분석 중… (수십 초)' : '🎵 원곡에서 자동 추출'}
              </button>
            </>
          ) : (
            <ExtractRequest videoId={videoId} title={parsed?.trackName || title || videoId} />
          )}
          {extracting && progress && (
            <div style={{ marginTop: 'var(--space-xs)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                <span>{progress.stage}…</span>
                <span>{progress.pct}%</span>
              </div>
              <div style={{ height: 12, background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-pill)', overflow: 'hidden', position: 'relative' }}>
                <div style={{ height: '100%', width: `${progress.pct}%`, background: 'var(--color-primary)', borderRadius: 'var(--radius-pill)', transition: 'width 600ms var(--easing-default)' }} />
                {/* 단계 내에서도 활동 중임을 보이는 shimmer */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)', animation: 'shimmer 1.2s linear infinite' }} />
              </div>
            </div>
          )}
          {extractErr && <p style={{ color: 'var(--color-cardinal)', fontSize: 'var(--font-size-caption)', margin: '6px 0 0' }}>{extractErr}</p>}
        </div>
      )}

      {/* 컨트롤 */}
      <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
        {phase === 'idle' && (
          <button onClick={onStart} disabled={status !== 'ready' || !noteMap} style={{ ...primaryBtn, opacity: noteMap ? 1 : 0.5 }}>
            🎤 부르기 시작
          </button>
        )}
        {(phase === 'countdown' || phase === 'singing') && (
          <button onClick={finish} style={{ ...primaryBtn, background: 'var(--color-cardinal)', boxShadow: '0 4px 0 #d33' }}>■ 정지 · 결과 보기</button>
        )}
      </div>
      {phase === 'idle' && !noteMap && (
        <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-fox)', marginTop: 0 }}>
          ↑ 위에서 <b>원곡 멜로디를 먼저 추출</b>해야 부르기 시작할 수 있어요.
        </p>
      )}
      {phase === 'idle' && noteMap && (
        <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: 0 }}>
          ▶ 위 영상을 재생하면 추출된 <b>목표 멜로디 막대를 미리</b> 볼 수 있어요.
        </p>
      )}
      {error && <p style={{ color: 'var(--color-cardinal)' }}>{error}</p>}

      {/* 결과 화면 (M5) */}
      {phase === 'done' && result && resultData && (
        <ResultPanel
          score={Math.round(result.accuracy())}
          maxCombo={result.state.maxCombo}
          counts={result.state.counts}
          mode={mode}
          breath={resultData.breath}
          weak={resultData.weak}
          onReplay={(timeMs) => seekTo(timeMs / 1000)}
          onRetry={onRetry}
        />
      )}

      {/* 🎙 내 목소리 다시듣기 · 음정 변조 (자동 녹음분) */}
      {phase === 'done' && recordedBuf && (
        <div style={{ border: 'var(--border-width) solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-sm) var(--space-md)', marginTop: 'var(--space-sm)' }}>
          <div style={{ fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-xs)' }}>🎙 내 목소리 다시듣기 · 음정 바꿔듣기</div>
          <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
            {VOICE_SHIFTS.map((s) => (
              <button
                key={s}
                onClick={() => playMyVoice(s)}
                style={{
                  minWidth: 52, padding: 'var(--space-xs) var(--space-sm)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-heavy)',
                  borderRadius: 'var(--radius-lg)', cursor: 'pointer', fontFamily: 'var(--font-family)',
                  border: `var(--border-width) solid ${s === 0 ? 'var(--color-fox)' : 'var(--color-border)'}`,
                  background: s === 0 ? 'var(--color-fox)' : 'var(--color-bg)',
                  color: s === 0 ? 'var(--color-text-inverse)' : 'var(--color-text)',
                }}
              >
                {s > 0 ? `+${s}` : s === 0 ? '원음' : s}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: 6 }}>
            +면 높게, −면 낮게 (반음). 재생 속도는 그대로 유지돼요.
          </p>
        </div>
      )}

      <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-sm)' }}>
        팁: <b>유선 이어폰</b> 권장. 가이드 녹음은 <b>원곡(보컬 있는 영상)</b>을 틀고 멜로디를 흥얼거리면 가장 정확합니다. 정밀 모드는 그 가이드와 같은 영상에서 채점할 때 타임라인이 맞습니다.
      </p>
    </main>
  )
}

const overlayCur: React.CSSProperties = {
  fontSize: 'var(--font-size-subhead)', fontWeight: 'var(--font-weight-heavy)', color: '#ffffff',
  textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9)', lineHeight: 1.25,
}

// 노래방식 가사 색칠: 박스 없이 글자만 왼→오로 색이 차오름(부른 부분 노랑, 남은 부분 흰색)
function WipeLine({ text, progress }: { text: string; progress: number }) {
  const chars = Array.from(text)
  const filled = Math.round(Math.max(0, Math.min(1, progress)) * chars.length)
  return (
    <div style={overlayCur}>
      {chars.map((ch, i) => (
        <span key={i} style={{ color: i < filled ? 'var(--color-bee)' : 'rgba(255,255,255,0.92)' }}>
          {ch}
        </span>
      ))}
    </div>
  )
}
const overlayNext: React.CSSProperties = {
  fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-bold)', color: 'rgba(255,255,255,0.6)',
  textShadow: '0 2px 6px rgba(0,0,0,0.9)',
}
const lyricCtrlBtn: React.CSSProperties = {
  padding: '7px 14px', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text)', background: 'var(--color-bg)', border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
const fixInput: React.CSSProperties = {
  flex: 1, minWidth: 120, padding: '6px 10px', border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-family)', fontSize: 'var(--font-size-caption)',
}
const overlaySub: React.CSSProperties = {
  fontSize: 'var(--font-size-caption)', color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 4px rgba(0,0,0,0.9)',
}
const overlayCenter: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
}
const primaryBtn: React.CSSProperties = {
  padding: 'var(--space-sm) var(--space-lg)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text-inverse)', background: 'var(--color-primary)', border: 'none',
  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-button)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
const ghostBtn: React.CSSProperties = {
  padding: '6px 12px', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text)', background: 'var(--color-bg)', border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
