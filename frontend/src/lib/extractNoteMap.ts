// extractNoteMap.ts — 백엔드(방법 A)에서 원곡 멜로디 곡선을 받아 노트맵 생성
import { buildNoteMap } from './contourToNoteMap'
import type { NoteMap } from './noteMap'

const API = import.meta.env.VITE_LYRICS_API as string | undefined

type ContourPt = { tMs: number; midi: number }
type RawContour = (ContourPt | [number, number])[]

interface NotemapResponse {
  videoId: string
  contour: RawContour
  extractor: string
  separated: boolean
  durationMs: number
}

// contour 정규화: 신포맷 [[tMs,midi],...](용량 절감) / 구포맷 [{tMs,midi},...] 모두 {tMs,midi}[]로.
function normalizeContour(raw: RawContour | undefined): ContourPt[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  if (Array.isArray(raw[0])) {
    return (raw as [number, number][]).map(([tMs, midi]) => ({ tMs, midi }))
  }
  return raw as ContourPt[]
}

// 공통: contour 응답 → NoteMap (10점 미만이면 무효)
function contourToMap(
  videoId: string,
  title: string,
  data: { contour?: RawContour; separated?: boolean },
): NoteMap | null {
  const contour = normalizeContour(data.contour)
  if (contour.length < 10) return null
  return buildNoteMap(videoId, title || videoId, contour, {
    youtubeId: videoId,
    license: data.separated ? 'auto-extract-vocals' : 'auto-extract-mix',
  })
}

/**
 * 캐시(사전 추출)에 있으면 즉시 NoteMap, 없으면 null (추출 안 함). 차트곡 자동 로드용.
 * 1) 정적 파일(/notemaps/<videoId>.json) — 백엔드 없이 동작(정적 배포)
 * 2) 백엔드 캐시(VITE_LYRICS_API) — 로컬/풀배포 시
 */
export async function loadCachedNoteMap(videoId: string, title: string): Promise<NoteMap | null> {
  // 1) 정적 동봉 캐시 우선
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}notemaps/${videoId}.json`)
    if (res.ok) {
      const map = contourToMap(videoId, title, await res.json())
      if (map) return map
    }
  } catch {
    /* 정적 파일 없음 → 백엔드 시도 */
  }

  // 2) 백엔드 캐시 (있을 때만)
  if (!API) return null
  const url = new URL(`${API}/api/notemap`)
  url.searchParams.set('videoId', videoId)
  url.searchParams.set('cachedOnly', 'true')
  try {
    const res = await fetch(url.toString())
    if (!res.ok) return null
    return contourToMap(videoId, title, await res.json())
  } catch {
    return null
  }
}

/** 원곡에서 자동 추출 → NoteMap. 첫 곡은 다운로드+분리+추출로 수십 초 걸린다. */
export type ExtractMethod = 'auto' | 'crepe' | 'basicpitch'

export interface ExtractProgress {
  stage: string
  pct: number
}

export async function fetchExtractProgress(videoId: string): Promise<ExtractProgress | null> {
  if (!API) return null
  try {
    const res = await fetch(`${API}/api/notemap/progress?videoId=${encodeURIComponent(videoId)}`)
    if (!res.ok) return null
    return (await res.json()) as ExtractProgress
  } catch {
    return null
  }
}

export async function extractNoteMapFromOriginal(
  videoId: string,
  title: string,
  maxSeconds = 60,
  force = false,
  method: ExtractMethod = 'auto',
): Promise<NoteMap> {
  if (!API) throw new Error('이 데모에서는 인기곡 차트의 곡만 채점할 수 있어요(미리 분석됨). 임의 곡 실시간 분석은 로컬 실행 시 가능합니다.')
  const url = new URL(`${API}/api/notemap`)
  url.searchParams.set('videoId', videoId)
  url.searchParams.set('maxSeconds', String(maxSeconds))
  url.searchParams.set('method', method)
  if (force) url.searchParams.set('force', 'true')

  const res = await fetch(url.toString())
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json())?.detail ?? ''
    } catch {
      /* noop */
    }
    throw new Error(`원곡 추출 실패 (${res.status})${detail ? ': ' + detail : ''}`)
  }
  const data = (await res.json()) as NotemapResponse
  const contour = normalizeContour(data.contour)
  if (contour.length < 20) throw new Error('추출된 음이 너무 적습니다(보컬 인식 실패). 구간을 늘려보세요.')

  return buildNoteMap(videoId, title || videoId, contour, {
    youtubeId: videoId,
    license: data.separated ? 'auto-extract-vocals' : 'auto-extract-mix',
  })
}
