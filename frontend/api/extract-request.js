// /api/extract-request — 원곡 추출 요청 큐 (GitHub Issues 기반)
//   POST {videoId, title, user} → 이슈 생성(큐 적재). 이미 노트맵 있거나 대기 중이면 그 상태 반환.
//   GET  ?videoId=…          → 상태 조회 (done | processing | queued | none)
//
// 서버측 시크릿: GH_QUEUE_TOKEN(이슈 쓰기 권한), (선택) GH_QUEUE_REPO="owner/repo"
// 로그인은 클라이언트 닉네임이라 서버 검증 불가 — user는 귀속/중복방지용으로만 받는다.

const REPO = process.env.GH_QUEUE_REPO || 'sionhyeop/vocal_trainer'
const LABEL = 'extract-request'
const GH = 'https://api.github.com'

function gh(path, init = {}) {
  return fetch(`${GH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GH_QUEUE_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'vocal-trainer-queue',
      ...(init.headers || {}),
    },
  })
}

// 이 비디오에 대한 열린 이슈 찾기 (제목에 videoId 포함 + 라벨)
async function findOpenIssue(videoId) {
  const res = await gh(`/repos/${REPO}/issues?state=open&labels=${LABEL}&per_page=100`)
  if (!res.ok) return null
  const issues = await res.json()
  return issues.find((i) => (i.title || '').includes(videoId)) || null
}

// 정적 노트맵 이미 배포돼 있나 (done 판정)
async function notemapExists(host, videoId) {
  try {
    const proto = host.startsWith('localhost') ? 'http' : 'https'
    const r = await fetch(`${proto}://${host}/notemaps/${videoId}.json`, { method: 'HEAD' })
    return r.ok
  } catch {
    return false
  }
}

const VALID = /^[a-zA-Z0-9_-]{11}$/

export default async function handler(req, res) {
  const host = req.headers.host || ''

  if (!process.env.GH_QUEUE_TOKEN) {
    return res.status(503).json({ error: '추출 요청 기능이 아직 설정되지 않았습니다(GH_QUEUE_TOKEN 미설정).' })
  }

  // ── 상태 조회 ──
  if (req.method === 'GET') {
    const videoId = String(req.query.videoId || '')
    if (!VALID.test(videoId)) return res.status(400).json({ error: 'invalid videoId' })
    if (await notemapExists(host, videoId)) return res.status(200).json({ status: 'done' })
    const issue = await findOpenIssue(videoId)
    if (!issue) return res.status(200).json({ status: 'none' })
    const processing = (issue.labels || []).some((l) => (l.name || l) === 'processing')
    return res.status(200).json({ status: processing ? 'processing' : 'queued', issue: issue.number })
  }

  // ── 요청 등록 ──
  if (req.method === 'POST') {
    let body = req.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
    const videoId = String(body?.videoId || '')
    const title = String(body?.title || '').slice(0, 120)
    const user = String(body?.user || '익명').slice(0, 40)
    if (!VALID.test(videoId)) return res.status(400).json({ error: 'invalid videoId' })

    // 이미 있으면 새로 안 만든다
    if (await notemapExists(host, videoId)) return res.status(200).json({ status: 'done' })
    const existing = await findOpenIssue(videoId)
    if (existing) return res.status(200).json({ status: 'queued', issue: existing.number, existed: true })

    // 큐 적재 = 이슈 생성
    const create = await gh(`/repos/${REPO}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: `extract: ${title || videoId} [${videoId}]`,
        body: `자동 추출 요청\n\n- videoId: \`${videoId}\`\n- title: ${title || '(없음)'}\n- 요청자: ${user}\n- watch: https://youtu.be/${videoId}`,
        labels: [LABEL],
      }),
    })
    if (!create.ok) {
      const t = await create.text()
      return res.status(502).json({ error: 'queue 적재 실패', detail: t.slice(0, 200) })
    }
    const issue = await create.json()
    return res.status(201).json({ status: 'queued', issue: issue.number })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'method not allowed' })
}
