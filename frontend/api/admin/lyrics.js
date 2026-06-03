// /api/admin/lyrics — 곡별 고정 가사 저장/삭제 (frontend/public/lyrics/<videoId>.json 커밋)
//   POST {videoId, synced?, plain?}  → 고정(저장/수정)
//   POST {op:'delete', videoId}      → 고정 해제(파일 삭제 → 다시 자동 lrclib)
import { checkAdmin, hasToken, getFile, putFile, deleteFile, parseBody, VALID_VIDEO } from '../_admin-lib.js'

const filePath = (vid) => `frontend/public/lyrics/${vid}.json`

export default async function handler(req, res) {
  if (!hasToken()) return res.status(503).json({ error: 'GH_QUEUE_TOKEN 미설정' })
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method not allowed' })
  }
  const auth = checkAdmin(req)
  if (!auth.ok) return res.status(auth.code).json({ error: auth.error })

  const b = parseBody(req)
  const videoId = String(b.videoId || '')
  if (!VALID_VIDEO.test(videoId)) return res.status(400).json({ error: 'invalid videoId' })
  const path = filePath(videoId)

  try {
    const { sha } = await getFile(path)

    if (b.op === 'delete') {
      if (!sha) return res.status(200).json({ ok: true, note: '이미 없음(자동 가사 사용)' })
      await deleteFile(path, `admin: 가사 고정 해제 ${videoId}`, sha)
      return res.status(200).json({ ok: true, op: 'delete', videoId })
    }

    const synced = typeof b.synced === 'string' ? b.synced : null
    const plain = typeof b.plain === 'string' ? b.plain : null
    if (!synced && !plain) return res.status(400).json({ error: 'synced 또는 plain 가사가 필요합니다' })

    const data = { synced, plain, source: 'admin', updatedMs: Number(b.nowMs) || 0 }
    const json = JSON.stringify(data, null, 2) + '\n'
    await putFile(path, json, `admin: 가사 고정 ${videoId}`, sha)
    return res.status(200).json({ ok: true, op: sha ? 'update' : 'create', videoId })
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) })
  }
}
