// VoicePlayer.tsx — 녹음된 내 목소리 플레이어.
// 재생/일시정지 + 탐색 가능한 프로그레스 바(드래그/클릭/키보드) + 시간표시 + 반복 + 처음으로 +
// 음정 0.5반음 변조(템포 유지) + 현재 음정으로 WAV 저장. Web Audio AudioBufferSource 기반.
import { useCallback, useEffect, useRef, useState } from 'react'
import { pitchShiftBuffer } from '../../lib/pitchShift'

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// AudioBuffer → 16bit PCM WAV Blob (저장용). gain으로 재생과 동일하게 정규화해 저장.
function bufferToWav(buf: AudioBuffer, gain = 1): Blob {
  const numCh = buf.numberOfChannels
  const sr = buf.sampleRate
  const frames = buf.length
  const bytes = 44 + frames * numCh * 2
  const ab = new ArrayBuffer(bytes)
  const view = new DataView(ab)
  let o = 0
  const str = (s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o++, s.charCodeAt(i)) }
  const u32 = (v: number) => { view.setUint32(o, v, true); o += 4 }
  const u16 = (v: number) => { view.setUint16(o, v, true); o += 2 }
  str('RIFF'); u32(bytes - 8); str('WAVE')
  str('fmt '); u32(16); u16(1); u16(numCh); u32(sr); u32(sr * numCh * 2); u16(numCh * 2); u16(16)
  str('data'); u32(frames * numCh * 2)
  const chans: Float32Array[] = []
  for (let c = 0; c < numCh; c++) chans.push(buf.getChannelData(c))
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      const x = Math.max(-1, Math.min(1, chans[c][i] * gain))
      view.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2
    }
  }
  return new Blob([ab], { type: 'audio/wav' })
}

export default function VoicePlayer({ buffer }: { buffer: AudioBuffer }) {
  const duration = buffer.duration

  const ctxRef = useRef<AudioContext | null>(null)
  const srcRef = useRef<AudioBufferSourceNode | null>(null)
  const startedAtRef = useRef(0) // 재생 시작 시점의 ctx.currentTime
  const offsetRef = useRef(0) // 재생 시작 시 버퍼 오프셋(초)
  const rafRef = useRef(0)
  // 피치시프트는 오프라인 연산 — shift별로 캐시(재방문 시 재계산 없이 즉시)
  const shiftCacheRef = useRef<Map<number, AudioBuffer>>(new Map())
  const shiftRef = useRef(0)
  const playingRef = useRef(false)
  const loopRef = useRef(false)
  const gainRef = useRef(1) // 녹음이 작을 때 클리핑 없이 키우는 정규화 게인

  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [shift, setShift] = useState(0)
  const [loop, setLoop] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null) // 드래그 중 미리보기 위치
  const barRef = useRef<HTMLDivElement>(null)

  const getCtx = () => (ctxRef.current ??= new AudioContext())

  // 현재 shift의 재생 버퍼(0=원음). 캐시 미스 때만 시프트 계산.
  const playBuffer = useCallback((): AudioBuffer => {
    const s = shiftRef.current
    if (s === 0) return buffer
    const cached = shiftCacheRef.current.get(s)
    if (cached) return cached
    const buf = pitchShiftBuffer(getCtx(), buffer, s)
    shiftCacheRef.current.set(s, buf)
    return buf
  }, [buffer])

  const stopSrc = () => {
    const src = srcRef.current
    srcRef.current = null // onended가 자연종료로 오인하지 않게 먼저 끊는다
    if (src) { try { src.onended = null; src.stop() } catch { /* noop */ } }
  }

  const tick = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx || !srcRef.current) return
    const pos = Math.min(duration, offsetRef.current + (ctx.currentTime - startedAtRef.current))
    setPlayhead(pos)
    rafRef.current = requestAnimationFrame(tick)
  }, [duration])

  const playFrom = useCallback(async (fromSec: number) => {
    const ctx = getCtx()
    await ctx.resume()
    stopSrc()
    cancelAnimationFrame(rafRef.current)
    const from = Math.max(0, Math.min(duration - 0.02, fromSec))
    const src = ctx.createBufferSource()
    src.buffer = playBuffer()
    const g = ctx.createGain()
    g.gain.value = gainRef.current
    src.connect(g)
    g.connect(ctx.destination)
    src.onended = () => {
      if (srcRef.current !== src) return // 수동 stop은 무시
      cancelAnimationFrame(rafRef.current)
      srcRef.current = null
      if (loopRef.current) { playFrom(0) } // 반복
      else { playingRef.current = false; setPlaying(false); offsetRef.current = 0; setPlayhead(0) }
    }
    src.start(0, from)
    srcRef.current = src
    startedAtRef.current = ctx.currentTime
    offsetRef.current = from
    playingRef.current = true
    setPlaying(true)
    setPlayhead(from)
    rafRef.current = requestAnimationFrame(tick)
  }, [duration, playBuffer, tick])

  const pause = useCallback(() => {
    const ctx = ctxRef.current
    if (ctx && srcRef.current) {
      offsetRef.current = Math.min(duration, offsetRef.current + (ctx.currentTime - startedAtRef.current))
      setPlayhead(offsetRef.current)
    }
    cancelAnimationFrame(rafRef.current)
    stopSrc()
    playingRef.current = false
    setPlaying(false)
  }, [duration])

  const toggle = useCallback(() => {
    if (playingRef.current) pause()
    else playFrom(playhead >= duration - 0.02 ? 0 : playhead)
  }, [pause, playFrom, playhead, duration])

  const seek = useCallback((sec: number) => {
    const s = Math.max(0, Math.min(duration, sec))
    if (playingRef.current) playFrom(s)
    else { offsetRef.current = s; setPlayhead(s) }
  }, [duration, playFrom])

  const restart = useCallback(() => { seek(0); if (!playingRef.current) playFrom(0) }, [seek, playFrom])

  // 음정 0.5반음 조절 → 현재 위치에서 새 음정으로 바로 들려줌(미리듣기)
  const adjustShift = useCallback((delta: number) => {
    const v = Math.max(-7, Math.min(7, Math.round((shiftRef.current + delta) * 2) / 2))
    shiftRef.current = v
    setShift(v)
    const ctx = ctxRef.current
    const pos = playingRef.current && ctx
      ? Math.min(duration, offsetRef.current + (ctx.currentTime - startedAtRef.current))
      : playhead
    playFrom(pos)
  }, [duration, playFrom, playhead])

  const resetShift = useCallback(() => {
    shiftRef.current = 0
    setShift(0)
    const ctx = ctxRef.current
    const pos = playingRef.current && ctx
      ? Math.min(duration, offsetRef.current + (ctx.currentTime - startedAtRef.current))
      : playhead
    playFrom(pos)
  }, [duration, playFrom, playhead])

  const download = useCallback(() => {
    const blob = bufferToWav(playBuffer(), gainRef.current)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `my-voice${shiftRef.current ? `_${shiftRef.current > 0 ? '+' : ''}${shiftRef.current}key` : ''}.wav`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [playBuffer])

  // 새 녹음(buffer prop 교체) 시 초기화
  useEffect(() => {
    // 정규화 게인: 최대 피크가 0.97에 닿도록(클리핑 방지), 단 1~8배로 제한.
    let peak = 0
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c)
      for (let i = 0; i < d.length; i++) { const a = d[i] < 0 ? -d[i] : d[i]; if (a > peak) peak = a }
    }
    gainRef.current = peak > 1e-4 ? Math.min(8, Math.max(1, 0.97 / peak)) : 1
    cancelAnimationFrame(rafRef.current)
    stopSrc()
    shiftCacheRef.current = new Map()
    shiftRef.current = 0
    playingRef.current = false
    setPlaying(false)
    setShift(0)
    setPlayhead(0)
    offsetRef.current = 0
  }, [buffer])

  // 언마운트 정리
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      stopSrc()
      try { ctxRef.current?.close() } catch { /* noop */ }
    }
  }, [])

  // ── 프로그레스 바 탐색(드래그/클릭/키보드) ──
  const secFromX = (clientX: number): number => {
    const r = barRef.current?.getBoundingClientRect()
    if (!r || r.width === 0) return 0
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    return frac * duration
  }
  const onBarDown = (e: React.PointerEvent) => {
    barRef.current?.setPointerCapture(e.pointerId)
    setScrub(secFromX(e.clientX))
  }
  const onBarMove = (e: React.PointerEvent) => {
    if (scrub != null) setScrub(secFromX(e.clientX))
  }
  const onBarUp = (e: React.PointerEvent) => {
    if (scrub != null) { seek(secFromX(e.clientX)); setScrub(null) }
  }
  const onBarKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); seek(playhead - 2) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(playhead + 2) }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle() }
  }

  const shown = scrub != null ? scrub : playhead
  const pct = duration > 0 ? (shown / duration) * 100 : 0

  return (
    <div style={shell}>
      <div style={{ fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-sm)' }}>🎙 내 목소리 다시듣기</div>

      {/* 재생 + 프로그레스 + 시간 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <button onClick={toggle} style={playBtn} aria-label={playing ? '일시정지' : '재생'}>
          {playing ? '⏸' : '▶'}
        </button>
        <div
          ref={barRef}
          role="slider"
          aria-label="재생 위치"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(shown)}
          tabIndex={0}
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={onBarUp}
          onKeyDown={onBarKey}
          style={track}
        >
          <div style={{ ...fill, width: `${pct}%` }} />
          <div style={{ ...knob, left: `${pct}%` }} />
        </div>
        <span style={time}>{fmt(shown)} / {fmt(duration)}</span>
      </div>

      {/* 보조 컨트롤 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginTop: 'var(--space-sm)', flexWrap: 'wrap' }}>
        <button onClick={restart} style={chip} aria-label="처음으로">⏮ 처음으로</button>
        <button onClick={() => { const v = !loop; setLoop(v); loopRef.current = v }} aria-pressed={loop}
          style={{ ...chip, ...(loop ? chipOn : null) }}>🔁 반복</button>
        <button onClick={download} style={chip} aria-label="녹음 저장">⬇ 저장(WAV)</button>
      </div>

      {/* 음정 변조 (0.5반음) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-bold)' }}>음정</span>
        <button onClick={() => adjustShift(-0.5)} disabled={shift <= -7} style={stepBtn} aria-label="반음 0.5 낮추기">−</button>
        <div style={{ ...shiftBox, ...(shift !== 0 ? shiftBoxOn : null) }}>
          {shift === 0 ? '원음' : `${shift > 0 ? '+' : ''}${shift} 반음`}
        </div>
        <button onClick={() => adjustShift(0.5)} disabled={shift >= 7} style={stepBtn} aria-label="반음 0.5 높이기">＋</button>
        {shift !== 0 && <button onClick={resetShift} style={chip}>원음</button>}
      </div>

      <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: 6 }}>
        막대를 끌거나 눌러 위치 이동(←→ 키 ±2초). 음정 −/＋는 0.5반음씩(재생 속도는 그대로). 저장은 현재 음정으로 WAV.
      </p>
    </div>
  )
}

const shell: React.CSSProperties = {
  border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-lg)', padding: 'var(--space-sm) var(--space-md)', marginTop: 'var(--space-sm)',
}
const playBtn: React.CSSProperties = {
  flexShrink: 0, width: 44, height: 44, fontSize: 18, lineHeight: 1,
  color: 'var(--color-text-inverse)', background: 'var(--color-primary)', border: 'none',
  borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
const track: React.CSSProperties = {
  position: 'relative', flex: 1, height: 12, minWidth: 80,
  background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-pill)',
  cursor: 'pointer', touchAction: 'none',
}
const fill: React.CSSProperties = {
  position: 'absolute', left: 0, top: 0, bottom: 0, background: 'var(--color-primary)',
  borderRadius: 'var(--radius-pill)', pointerEvents: 'none',
}
const knob: React.CSSProperties = {
  position: 'absolute', top: '50%', width: 16, height: 16, marginLeft: -8,
  transform: 'translateY(-50%)', background: 'var(--color-primary)', borderRadius: '50%',
  boxShadow: 'var(--shadow-sm)', pointerEvents: 'none',
}
const time: React.CSSProperties = {
  flexShrink: 0, fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)',
  fontVariantNumeric: 'tabular-nums', minWidth: 78, textAlign: 'right',
}
const chip: React.CSSProperties = {
  padding: '6px 12px', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text)', background: 'var(--color-bg)', border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
const chipOn: React.CSSProperties = {
  color: 'var(--color-text-inverse)', background: 'var(--color-fox)', borderColor: 'var(--color-fox)',
}
const stepBtn: React.CSSProperties = {
  width: 40, height: 40, fontSize: 22, fontWeight: 'var(--font-weight-heavy)', lineHeight: 1,
  color: 'var(--color-text)', background: 'var(--color-bg)', border: 'var(--border-width) solid var(--color-border)',
  borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
const shiftBox: React.CSSProperties = {
  minWidth: 88, textAlign: 'center', padding: 'var(--space-xs) var(--space-sm)',
  borderRadius: 'var(--radius-lg)', border: 'var(--border-width) solid var(--color-border)',
  background: 'var(--color-bg)', color: 'var(--color-text)',
  fontWeight: 'var(--font-weight-heavy)', fontSize: 'var(--font-size-body)',
}
const shiftBoxOn: React.CSSProperties = {
  border: 'var(--border-width) solid var(--color-fox)', background: 'var(--color-fox)', color: 'var(--color-text-inverse)',
}
