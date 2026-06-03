// _admin-lib.js — 관리자 쓰기 API 공용 (라우트 아님: _ 접두사).
//   GitHub Contents API로 리포 파일을 읽고/쓰고/지운다. 쓰기는 ADMIN_SECRET로 인증.
const REPO = process.env.GH_QUEUE_REPO || 'sionhyeop/vocal_trainer'
const GH = 'https://api.github.com'

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GH_QUEUE_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'vocal-trainer-admin',
  }
}

// 관리자 시크릿 검증 (x-admin-secret 헤더)
export function checkAdmin(req) {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return { ok: false, code: 503, error: '관리자 기능 미설정(ADMIN_SECRET 없음)' }
  const got = req.headers['x-admin-secret']
  if (got !== secret) return { ok: false, code: 401, error: '관리자 인증 실패' }
  return { ok: true }
}

export function hasToken() {
  return !!process.env.GH_QUEUE_TOKEN
}

// 파일 읽기 → { content(string)|null, sha|null }
export async function getFile(path) {
  const res = await fetch(`${GH}/repos/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
    headers: ghHeaders(),
  })
  if (res.status === 404) return { content: null, sha: null }
  if (!res.ok) throw new Error(`getFile ${res.status}`)
  const data = await res.json()
  const content = Buffer.from(data.content || '', 'base64').toString('utf8')
  return { content, sha: data.sha }
}

// 파일 쓰기(생성/수정) — sha 있으면 업데이트
export async function putFile(path, contentStr, message, sha) {
  const body = {
    message,
    content: Buffer.from(contentStr, 'utf8').toString('base64'),
    ...(sha ? { sha } : {}),
  }
  const res = await fetch(`${GH}/repos/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`putFile ${res.status}: ${t.slice(0, 200)}`)
  }
  return res.json()
}

// 파일 삭제
export async function deleteFile(path, message, sha) {
  const res = await fetch(`${GH}/repos/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
    method: 'DELETE',
    headers: ghHeaders(),
    body: JSON.stringify({ message, sha }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`deleteFile ${res.status}: ${t.slice(0, 200)}`)
  }
  return res.json()
}

export function parseBody(req) {
  let b = req.body
  if (typeof b === 'string') { try { b = JSON.parse(b) } catch { b = {} } }
  return b || {}
}

export const VALID_VIDEO = /^[a-zA-Z0-9_-]{11}$/
