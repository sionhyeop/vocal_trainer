// youtube.ts — YouTube 검색(Data API v3) + 영상 ID 파싱 (PLAN §5)
// 검색 = Data API(키 필요) / 재생 = IFrame Player API(키 불필요). 둘은 다른 API다.

export interface YouTubeResult {
  videoId: string
  title: string
  channelTitle: string
  thumbnail?: string
}

// YouTube 제목은 &amp; &#39; &quot; 같은 엔티티로 옴 → textarea 트릭으로 디코딩 (§5.3 #1)
export function decodeEntities(str: string): string {
  if (!str) return ''
  const el = document.createElement('textarea')
  el.innerHTML = str
  return el.value
}

// MR/반주/노래방류 판별 (이런 제목은 기본 검색에서 뒤로 보냄)
const INSTRUMENTAL_RE =
  /(\bmr\b|\binst\b|instrumental|karaoke|backing\s*track|off\s*vocal|반주|노래방|инструментал)/i

export async function searchYouTube(
  query: string,
  apiKey: string,
): Promise<YouTubeResult[]> {
  // 기본은 원곡(보컬 포함)을 검색 — MR을 강제로 붙이지 않는다.
  // 사용자가 직접 "MR/반주" 등을 입력했을 때만 그 의도를 존중한다.
  const wantsInstrumental = INSTRUMENTAL_RE.test(query)
  const q = encodeURIComponent(query)
  const url =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet&type=video&videoEmbeddable=true&maxResults=12&q=${q}&key=${apiKey}`
  // videoEmbeddable=true 필수 — 빠지면 검색은 되는데 재생이 까만 화면 (§5.3 #2)

  const res = await fetch(url)
  if (!res.ok) {
    // 403의 두 원인: (a) 쿼터 소진 (b) 키 제한. 응답 본문 reason으로 구분 (§5.3 #3)
    let reason = ''
    try {
      const body = await res.json()
      reason = body?.error?.errors?.[0]?.reason ?? body?.error?.message ?? ''
    } catch {
      /* noop */
    }
    throw new Error(`YouTube API ${res.status}${reason ? ` (${reason})` : ''}`)
  }
  const data = await res.json()
  const results: YouTubeResult[] = (data.items ?? []).map(
    (item: any): YouTubeResult => ({
      videoId: item.id.videoId,
      title: decodeEntities(item.snippet.title), // ⚠ 반드시 디코딩
      channelTitle: decodeEntities(item.snippet.channelTitle ?? ''),
      thumbnail:
        item.snippet.thumbnails?.medium?.url ??
        item.snippet.thumbnails?.default?.url,
    }),
  )

  // 사용자가 MR을 직접 원하지 않은 경우, 보컬 포함(원곡) 버전을 앞으로.
  // MR/반주/노래방류 제목은 뒤로 보낸다(나머지는 API 순서 유지 — 안정 정렬).
  if (!wantsInstrumental) {
    return results
      .map((r, i) => ({ r, i, inst: INSTRUMENTAL_RE.test(r.title) }))
      .sort((a, b) => (a.inst === b.inst ? a.i - b.i : a.inst ? 1 : -1))
      .map((x) => x.r)
  }
  return results
}

// videoId로 영상 제목 조회 (검색 외 경로로 진입했을 때 곡명/아티스트 자동 추출용)
export async function fetchVideoTitle(videoId: string, apiKey: string): Promise<string> {
  if (!apiKey) return ''
  const url =
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
  try {
    const res = await fetch(url)
    if (!res.ok) return ''
    const data = await res.json()
    const item = data.items?.[0]
    return item ? decodeEntities(item.snippet.title) : ''
  } catch {
    return ''
  }
}

// 무키 fallback: 전체 URL / youtu.be 단축 / 임베드 / 11자 순수 ID 에서 videoId 추출
export function parseVideoId(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  // 순수 11자 ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s
  try {
    const u = new URL(s)
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.slice(1)
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
    }
    // watch?v=, /embed/<id>, /shorts/<id>
    const v = u.searchParams.get('v')
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v
    const m = u.pathname.match(/\/(embed|shorts)\/([a-zA-Z0-9_-]{11})/)
    if (m) return m[2]
  } catch {
    /* not a URL */
  }
  return null
}
