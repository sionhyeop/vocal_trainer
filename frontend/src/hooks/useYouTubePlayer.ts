// useYouTubePlayer.ts — YouTube IFrame Player API 로더 + getCurrentTime (PLAN §3, §4.4)
// IFrame Player API는 npm 패키지가 아니라 런타임 script 태그로 로드한다. 키 불필요.
import { useCallback, useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
  }
}

let ytReadyPromise: Promise<any> | null = null
let hostIdCounter = 0

function loadYT(): Promise<any> {
  if (ytReadyPromise) return ytReadyPromise
  ytReadyPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT)
      return
    }
    // 여러 인스턴스가 콜백을 덮어쓰지 않도록 체이닝
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(window.YT)
    }
    let tag = document.querySelector<HTMLScriptElement>('script[data-yt-iframe-api]')
    if (!tag) {
      tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      tag.dataset.ytIframeApi = '1'
      tag.onerror = () =>
        reject(new Error('YouTube 플레이어 스크립트를 불러오지 못했습니다(네트워크/차단).'))
      document.head.appendChild(tag)
    }
    // 차단/지연 시 무한 대기 방지
    window.setTimeout(() => {
      if (!(window.YT && window.YT.Player)) {
        reject(new Error('YouTube 플레이어 로드 시간이 초과되었습니다.'))
      }
    }, 10000)
  })
  // 실패 시 재시도 가능하도록 캐시 비움
  ytReadyPromise.catch(() => {
    ytReadyPromise = null
  })
  return ytReadyPromise
}

// YT onError 코드 → 한국어
function ytErrorText(code: unknown): string {
  switch (code) {
    case 2:
      return '잘못된 영상 ID입니다.'
    case 5:
      return 'HTML5 플레이어 오류입니다.'
    case 100:
      return '영상을 찾을 수 없습니다(삭제/비공개).'
    case 101:
    case 150:
      return '소유자가 외부 재생을 차단한 영상입니다. 다른 결과를 선택하세요.'
    default:
      return '영상을 재생할 수 없습니다.'
  }
}

export type PlayerStatus = 'loading' | 'ready' | 'error'

export function useYouTubePlayer(videoId: string) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<PlayerStatus>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setStatus('loading')
    setErrorMsg('')

    loadYT()
      .then((YT) => {
        if (cancelled || !containerRef.current) return
        // ★ React가 관리하지 않는 host div를 만들어 YT가 그걸 iframe으로 치환하게 한다.
        //   (containerRef를 직접 넘기면 YT가 React 노드를 교체해 트리가 깨진다.)
        containerRef.current.innerHTML = ''
        const host = document.createElement('div')
        host.id = `yt-player-${++hostIdCounter}`
        host.style.width = '100%'
        host.style.height = '100%'
        containerRef.current.appendChild(host)

        playerRef.current = new YT.Player(host, {
          width: '100%',
          height: '100%',
          videoId,
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onReady: () => {
              if (!cancelled) {
                setReady(true)
                setStatus('ready')
              }
            },
            onError: (e: any) => {
              if (!cancelled) {
                setStatus('error')
                setErrorMsg(ytErrorText(e?.data))
              }
            },
          },
        })
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setStatus('error')
          setErrorMsg(err.message)
        }
      })

    return () => {
      cancelled = true
      try {
        playerRef.current?.destroy?.()
      } catch {
        /* noop */
      }
      playerRef.current = null
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [videoId])

  const getCurrentTime = useCallback((): number => {
    try {
      return playerRef.current?.getCurrentTime?.() ?? 0
    } catch {
      return 0
    }
  }, [])

  const play = useCallback(() => {
    try {
      playerRef.current?.playVideo?.()
    } catch {
      /* noop */
    }
  }, [])

  const seekTo = useCallback((seconds: number) => {
    try {
      playerRef.current?.seekTo?.(seconds, true)
      playerRef.current?.playVideo?.()
    } catch {
      /* noop */
    }
  }, [])

  const pause = useCallback(() => {
    try {
      playerRef.current?.pauseVideo?.()
    } catch {
      /* noop */
    }
  }, [])

  // YT.PlayerState: ENDED=0, PLAYING=1, PAUSED=2 ...
  const getPlayerState = useCallback((): number => {
    try {
      return playerRef.current?.getPlayerState?.() ?? -1
    } catch {
      return -1
    }
  }, [])

  return { containerRef, ready, status, errorMsg, getCurrentTime, play, pause, seekTo, getPlayerState }
}
