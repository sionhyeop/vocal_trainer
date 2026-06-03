// ExtractRequest.tsx — (정적 배포 전용) 노트맵 없는 곡을 "추출 요청" → GitHub 큐 → 내 PC 워커가 처리.
// 로그인(로컬 닉네임) 상태에서만 요청 가능. 상태를 폴링해 완료되면 새로고침 유도.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccountStore } from '../../store/account'

type Status = 'checking' | 'none' | 'queued' | 'processing' | 'done' | 'error'

const API = '/api/extract-request'
const POLL_MS = 15000

export default function ExtractRequest({ videoId, title }: { videoId: string; title: string }) {
  const account = useAccountStore((s) => s.account)
  const [status, setStatus] = useState<Status>('checking')
  const [msg, setMsg] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const timer = useRef<number | null>(null)
  const startedRef = useRef(0)

  const check = useCallback(async (): Promise<Status> => {
    try {
      const res = await fetch(`${API}?videoId=${encodeURIComponent(videoId)}`)
      if (!res.ok) return 'none'
      const d = await res.json()
      return (d.status as Status) ?? 'none'
    } catch {
      return 'none'
    }
  }, [videoId])

  // 마운트 시 현재 상태 확인
  useEffect(() => {
    let alive = true
    check().then((s) => { if (alive) setStatus(s === 'done' ? 'done' : s) })
    return () => { alive = false }
  }, [check])

  // queued/processing이면 폴링
  useEffect(() => {
    if (status !== 'queued' && status !== 'processing') {
      if (timer.current) { clearInterval(timer.current); timer.current = null }
      return
    }
    if (!startedRef.current) startedRef.current = Date.now()
    timer.current = window.setInterval(async () => {
      setElapsed(Math.round((Date.now() - startedRef.current) / 1000))
      const s = await check()
      if (s === 'done') setStatus('done')
      else if (s === 'processing') setStatus('processing')
      else if (s === 'none') { /* 워커가 닫았지만 아직 배포 전 — 유지 */ }
    }, POLL_MS)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [status, check])

  const request = useCallback(async () => {
    if (!account) return
    setMsg('')
    setStatus('queued')
    startedRef.current = Date.now()
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, title, user: account.name }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setStatus('error'); setMsg(d?.error || '요청에 실패했어요.'); return }
      setStatus(d.status === 'done' ? 'done' : d.status === 'processing' ? 'processing' : 'queued')
    } catch {
      setStatus('error'); setMsg('네트워크 오류로 요청하지 못했어요.')
    }
  }, [account, videoId, title])

  return (
    <div style={{ fontSize: 'var(--font-size-caption)' }}>
      {status === 'done' ? (
        <div>
          <div style={{ color: 'var(--color-primary)', fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-xs)' }}>
            ✅ 이 곡의 음정 분석이 준비됐어요!
          </div>
          <button onClick={() => window.location.reload()} style={cta}>🔄 새로고침하고 채점 시작</button>
        </div>
      ) : status === 'queued' || status === 'processing' ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'var(--font-weight-bold)', color: 'var(--color-fox)' }}>
            <span style={{ animation: 'glowPulse 1.2s var(--easing-default) infinite' }}>●</span>
            {status === 'processing' ? '내 컴퓨터에서 분석 중…' : '대기열에 등록됨'}
          </div>
          <div style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            요청이 접수되어 분석 서버(관리자 PC)에서 처리 중이에요. 완료되면 자동으로 반영됩니다.
            {elapsed > 0 && ` (${elapsed}초 경과)`}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
            아직 이 곡은 음정 분석이 없어요. {account ? '추출을 요청하면 분석 후 채점할 수 있어요.' : '로그인하면 추출을 요청할 수 있어요.'}
          </div>
          {account ? (
            <button onClick={request} style={cta}>🎵 이 곡 음정 분석 요청</button>
          ) : (
            <span style={{ color: 'var(--color-macaw)', fontWeight: 'var(--font-weight-bold)' }}>← 우측 상단에서 로그인</span>
          )}
          {status === 'error' && <div style={{ color: 'var(--color-cardinal)', marginTop: 6 }}>{msg}</div>}
        </div>
      )}
    </div>
  )
}

const cta: React.CSSProperties = {
  padding: 'var(--space-xs) var(--space-md)', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-text-inverse)', background: 'var(--color-primary)', border: 'none',
  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-button)', cursor: 'pointer', fontFamily: 'var(--font-family)',
}
