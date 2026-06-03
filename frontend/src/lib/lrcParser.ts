// lrcParser.ts — LRC 싱크 가사 파서 (PLAN §6.6)
export interface LyricLine {
  time: number // 초
  text: string
}

// "[00:12.00]" 또는 "[01:30.50]" 형태. 한 줄에 여러 개 올 수 있음.
const TIME_RE = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g

// "[00:12.00][01:30.00]가사" → [{time:12,text:'가사'},{time:90,text:'가사'}]
export function parseLrc(lrcText: string): LyricLine[] {
  if (!lrcText) return []
  const lines: LyricLine[] = []
  for (const raw of lrcText.split(/\r?\n/)) {
    TIME_RE.lastIndex = 0
    const stamps: number[] = []
    let m: RegExpExecArray | null
    let lastEnd = 0
    while ((m = TIME_RE.exec(raw)) !== null) {
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      const fracStr = m[3] ?? '0'
      const frac = parseInt(fracStr, 10) / Math.pow(10, fracStr.length)
      stamps.push(min * 60 + sec + frac)
      lastEnd = m.index + m[0].length
    }
    if (stamps.length === 0) continue
    const text = raw.slice(lastEnd).trim()
    // 한 줄 다중 타임스탬프를 스탬프마다 펼침
    for (const time of stamps) lines.push({ time, text })
  }
  // 시간 오름차순 정렬
  lines.sort((a, b) => a.time - b.time)
  return lines
}

// 짧은 줄을 인접 줄과 합쳐 한 줄에 더 많은 단어가 담기게 (minChars 도달 + 시간 간격 가까울 때만)
export function mergeShortLines(lines: LyricLine[], minChars = 18, maxGapSec = 3): LyricLine[] {
  const out: LyricLine[] = []
  for (const line of lines) {
    const last = out[out.length - 1]
    if (last && last.text.length < minChars && line.time - last.time <= maxGapSec) {
      last.text = `${last.text} ${line.text}`.trim()
    } else {
      out.push({ time: line.time, text: line.text })
    }
  }
  return out
}

// 현재 재생시간(초)의 라인 인덱스 — 이진 탐색 O(log n) (§4.4: 매 프레임 호출 가능)
export function findLineIndex(lines: LyricLine[], currentTime: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= currentTime) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}
