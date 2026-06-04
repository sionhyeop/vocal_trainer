// /api/coach — AI 코칭 (M7). 세션 지표를 받아 Claude(Haiku 4.5)로 한국어 코칭 생성.
//   POST {score, maxCombo, counts, mode, breath, weak[]} → {강점, 개선점[], 연습팁[], 한줄응원}
//
// 서버측 시크릿: ANTHROPIC_API_KEY (브라우저에 절대 노출 금지 — 그래서 서버리스에서만 호출).
// 키 미설정이면 503 → 프론트는 "코칭 준비 중" 폴백을 보여준다.
//
// 남용 방지: 무인증 공개 엔드포인트가 유료 API를 호출하므로, 같은 출처(브라우저)에서 온
// 요청만 허용한다(Origin/Referer 검사). curl 등 출처 없는 호출은 403으로 막아 비용 폭주를 차단.
import Anthropic from '@anthropic-ai/sdk'

// Claude가 채우는 코칭 스키마 — 구조화 출력으로 강제.
const SCHEMA = {
  type: 'object',
  properties: {
    강점: { type: 'string', description: '잘한 점 1문장(구체적 수치 인용)' },
    개선점: { type: 'array', items: { type: 'string' }, description: '가장 효과적인 개선점 2~3개, 각 1문장' },
    연습팁: { type: 'array', items: { type: 'string' }, description: '집에서 바로 해볼 실전 연습 2~3개, 각 1문장' },
    한줄응원: { type: 'string', description: '따뜻한 한 줄 응원' },
  },
  required: ['강점', '개선점', '연습팁', '한줄응원'],
  additionalProperties: false,
}

// 응답이 스키마대로 다 찼는지(빈 200/부분 응답이 클라 렌더 크래시 내지 않게) 서버에서 한 번 더 검증.
function validCoaching(c) {
  return (
    c &&
    typeof c.강점 === 'string' &&
    c.강점.trim() &&
    Array.isArray(c.개선점) &&
    c.개선점.length > 0 &&
    Array.isArray(c.연습팁) &&
    c.연습팁.length > 0 &&
    typeof c.한줄응원 === 'string' &&
    c.한줄응원.trim()
  )
}

// 지표를 Claude가 읽기 쉬운 한국어 요약으로
function describe(m) {
  const c = m.counts || {}
  const b = m.breath || {}
  const weak = (m.weak || [])
    .slice(0, 3)
    .map((w) => `- ${fmt(w.timeMs)} "${w.label}" 평균 ${w.deviation}센트 이탈`)
    .join('\n') || '(약점 구간 데이터 부족)'
  return [
    `채점 모드: ${m.mode === 'melody' ? '정밀(원곡 음정 대조)' : '자유(안정성)'}`,
    `총점: ${Math.round(m.score)}/100, 최대 콤보: ${m.maxCombo}`,
    `판정: Perfect ${c.Perfect ?? 0} / Great ${c.Great ?? 0} / Good ${c.Good ?? 0} / Miss ${c.Miss ?? 0}`,
    `음 안정성: ${b.stability ?? '-'}/100`,
    `유성음 비율: ${pct(b.voicedRatio)}, 바람 새는 비율: ${pct(b.breathyRatio)}`,
    `한 호흡 최장 발성: ${b.longestPhraseMs != null ? (b.longestPhraseMs / 1000).toFixed(1) + '초' : '-'}`,
    `약점 구간:`,
    weak,
  ].join('\n')
}
const pct = (x) => (x == null ? '-' : Math.round(x * 100) + '%')
const fmt = (ms) => {
  const s = Math.max(0, Math.round((ms || 0) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// 요청이 같은 출처(이 사이트의 브라우저)에서 왔는지. 브라우저는 POST에 Origin을 항상 보낸다.
function sameOrigin(req) {
  const host = req.headers.host || ''
  if (!host) return false
  const okHost = (u) => {
    if (!u) return false
    try { return new URL(u).host === host } catch { return false }
  }
  return okHost(req.headers.origin) || okHost(req.headers.referer)
}

const SYSTEM = `당신은 따뜻하고 전문적인 한국어 보컬 코치입니다.
노래방 채점 지표를 보고 초보 가수에게 힘이 되는 맞춤 코칭을 합니다.
규칙:
- 반드시 한국어. 친근하지만 실력 있는 코치 말투(존댓말).
- 수치를 막연히 나열하지 말고, 무엇을 의미하는지 해석해서 말합니다.
- 약점 구간이 있으면 그 시각/구간을 콕 집어 언급합니다.
- 개선점·연습팁은 추상적 조언이 아니라 당장 따라 할 수 있는 구체적 행동으로.
- 점수가 낮아도 먼저 잘한 점을 찾아 격려한 뒤 개선점을 제시합니다.`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method not allowed' })
  }
  // 비용 남용 방지: 같은 출처 브라우저 요청만 허용(curl/외부 스팸 차단).
  if (!sameOrigin(req)) {
    return res.status(403).json({ error: 'forbidden' })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI 코칭이 아직 설정되지 않았습니다(ANTHROPIC_API_KEY 미설정).' })
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }
  if (!body || typeof body.score !== 'number') {
    return res.status(400).json({ error: 'invalid metrics' })
  }

  try {
    // 타임아웃을 함수 플랫폼 한도보다 짧게 둬, 상류 지연이 깔끔한 502로 떨어지게.
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 25000, maxRetries: 1 })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content: `다음 가창 결과를 코칭해 주세요.\n\n${describe(body)}` }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    })

    // refusal/비텍스트/잘린 응답을 빈 객체로 흘려보내지 않고 명시적으로 실패 처리.
    const textBlock = response.content.find((b) => b.type === 'text')
    if (response.stop_reason === 'refusal' || !textBlock) {
      console.error('coach: no coaching text, stop_reason=', response.stop_reason)
      return res.status(502).json({ error: 'AI 코칭 생성 실패' })
    }
    let coaching
    try {
      coaching = JSON.parse(textBlock.text)
    } catch (e) {
      console.error('coach: JSON parse failed:', e)
      return res.status(502).json({ error: 'AI 코칭 생성 실패' })
    }
    if (!validCoaching(coaching)) {
      console.error('coach: coaching failed validation:', JSON.stringify(coaching).slice(0, 200))
      return res.status(502).json({ error: 'AI 코칭 생성 실패' })
    }
    return res.status(200).json({ coaching })
  } catch (e) {
    // 상류/SDK 에러 원문은 클라에 노출하지 않고 서버 로그로만(정보 노출 방지).
    console.error('coach: call failed:', e)
    const status = e?.status === 401 ? 401 : 502
    return res.status(status).json({ error: 'AI 코칭 생성 실패' })
  }
}
