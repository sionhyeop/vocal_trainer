import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// dev 전용: /api/* 요청을 ./api/**.js (Vercel 스타일 핸들러)로 직접 서빙.
// vercel dev가 Vite 8과 충돌하므로 직접 미들웨어로 붙인다. (.env의 서버 시크릿을 process.env로 주입)
function localApi(mode: string): Plugin {
  return {
    name: 'local-vercel-api',
    apply: 'serve',
    configResolved() {
      // .env(VITE_ 외 포함)를 process.env로 — 핸들러가 GH_QUEUE_TOKEN/ADMIN_SECRET 읽도록
      const env = loadEnv(mode, process.cwd(), '')
      for (const [k, v] of Object.entries(env)) {
        if (process.env[k] === undefined) process.env[k] = v
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ''
        if (!url.startsWith('/api/')) return next()
        try {
          const u = new URL(url, 'http://localhost')
          // /api/admin/song?x=1 → api/admin/song.js
          const rel = u.pathname.replace(/^\/api\//, 'api/')
          const file = resolve(process.cwd(), `${rel}.js`)
          if (!existsSync(file)) { res.statusCode = 404; res.end(JSON.stringify({ error: 'no such api' })); return }

          // 쿼리 주입
          const query: Record<string, string> = {}
          u.searchParams.forEach((v, k) => { query[k] = v })
          ;(req as any).query = query

          // 바디 수집(문자열로 — 핸들러가 JSON.parse)
          if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
            const chunks: Buffer[] = []
            for await (const c of req) chunks.push(c as Buffer)
            ;(req as any).body = Buffer.concat(chunks).toString('utf8')
          }

          // res 셰임: status().json()
          ;(res as any).status = (code: number) => { res.statusCode = code; return res }
          ;(res as any).json = (obj: unknown) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(obj))
          }

          const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`)
          await mod.default(req, res)
        } catch (e: any) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(e?.message || e) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), localApi(mode)],
}))
