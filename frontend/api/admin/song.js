// /api/admin/song — 차트 곡 추가/수정/삭제 (chartSongs.json 커밋)
//   GET            → 현재 곡 목록(리포 최신)
//   POST {op:'add'|'update', videoId,title,artist,category,ytTitle}
//   POST {op:'delete', videoId}
import { checkAdmin, hasToken, getFile, putFile, parseBody, VALID_VIDEO } from '../_admin-lib.js'

const PATH = 'frontend/src/assets/chartSongs.json'

export default async function handler(req, res) {
  if (!hasToken()) return res.status(503).json({ error: 'GH_QUEUE_TOKEN 미설정' })

  // 목록 조회는 인증 불필요(읽기)
  if (req.method === 'GET') {
    try {
      const { content } = await getFile(PATH)
      return res.status(200).json({ songs: content ? JSON.parse(content) : [] })
    } catch (e) {
      return res.status(502).json({ error: String(e.message || e) })
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'method not allowed' })
  }

  // 쓰기 = 관리자 인증
  const auth = checkAdmin(req)
  if (!auth.ok) return res.status(auth.code).json({ error: auth.error })

  const b = parseBody(req)
  const op = b.op || 'add'
  const videoId = String(b.videoId || '')
  if (!VALID_VIDEO.test(videoId)) return res.status(400).json({ error: 'invalid videoId' })

  try {
    const { content, sha } = await getFile(PATH)
    const songs = content ? JSON.parse(content) : []
    const idx = songs.findIndex((s) => s.videoId === videoId)

    if (op === 'delete') {
      if (idx < 0) return res.status(404).json({ error: '없는 곡' })
      songs.splice(idx, 1)
    } else {
      const entry = {
        title: String(b.title || '').slice(0, 100) || videoId,
        artist: String(b.artist || '').slice(0, 100),
        videoId,
        ytTitle: String(b.ytTitle || b.title || '').slice(0, 160),
        category: String(b.category || '한국').slice(0, 20),
      }
      if (idx >= 0) songs[idx] = entry
      else songs.push(entry)
    }

    const json = JSON.stringify(songs, null, 2) + '\n'
    await putFile(PATH, json, `admin: 곡 ${op} ${videoId}`, sha)
    return res.status(200).json({ ok: true, op, videoId, count: songs.length })
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) })
  }
}
