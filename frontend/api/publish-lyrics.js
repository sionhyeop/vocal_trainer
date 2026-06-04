// /api/publish-lyrics — dev 전용: 브라우저 가사 캐시(localStorage `vt:lyrics:<id>`)를
// 정적 배포 파일 public/lyrics/<videoId>.json 으로 기록한다. "배포해" 시 노트맵과 함께 커밋됨.
//   POST {items:[{videoId, lines?, synced?, plain?, matched?, offsetSec?}]} → 기존 파일과 병합 기록.
// Vercel은 read-only FS라 prod에선 쓰기 실패(무시). 같은 출처 요청만.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const DIR = resolve(process.cwd(), 'public', 'lyrics')
const VALID = /^[A-Za-z0-9_-]{6,}$/

function sameOrigin(req) {
  const host = req.headers.host || ''
  if (!host) return false
  const ok = (u) => { if (!u) return false; try { return new URL(u).host === host } catch { return false } }
  return ok(req.headers.origin) || ok(req.headers.referer)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method not allowed' })
  }
  if (!sameOrigin(req)) return res.status(403).json({ error: 'forbidden' })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const items = Array.isArray(body?.items) ? body.items : []
  if (!items.length) return res.status(400).json({ error: 'no items' })

  try { mkdirSync(DIR, { recursive: true }) } catch { /* noop */ }

  let written = 0
  const errors = []
  for (const it of items) {
    const vid = String(it?.videoId || '')
    if (!VALID.test(vid)) { errors.push(`${vid}: invalid videoId`); continue }
    const hasLyrics = (Array.isArray(it.lines) && it.lines.length) || it.synced || it.plain
    if (!hasLyrics) { errors.push(`${vid}: no lyrics`); continue }

    const path = resolve(DIR, `${vid}.json`)
    let existing = {}
    try { if (existsSync(path)) existing = JSON.parse(readFileSync(path, 'utf8')) } catch { /* 새로 */ }

    // matched 문자열("artist - track") 분리
    let ma = existing.matched_artist
    let mt = existing.matched_track
    const m = String(it.matched || '')
    if (m.includes(' - ')) { const [a, t] = m.split(' - '); ma = a.trim(); mt = t.trim() }

    const merged = {
      ...existing,
      ...(it.synced != null ? { synced: it.synced } : {}),
      ...(Array.isArray(it.lines) && it.lines.length ? { lines: it.lines } : {}),
      ...(it.plain != null ? { plain: it.plain } : {}),
      ...(ma ? { matched_artist: ma } : {}),
      ...(mt ? { matched_track: mt } : {}),
      ...(it.offsetSec != null && Number.isFinite(Number(it.offsetSec)) ? { offsetSec: Number(it.offsetSec) } : {}),
      source: existing.source || 'local-cache',
    }
    try { writeFileSync(path, JSON.stringify(merged)); written++ }
    catch (e) { errors.push(`${vid}: ${String(e?.message || e)}`) }
  }
  return res.status(200).json({ written, total: items.length, errors })
}
