// titleParser.ts — 유튜브 MR 제목 → 곡명/아티스트 추출 (PLAN §6.7)
// MR 제목은 포맷이 제각각 → 정답 1개로 못 잡음. (주추정 + alternate) 2개를 가사 검색에서 둘 다 시도.
import { decodeEntities } from './youtube'

export interface ParsedTitle {
  trackName: string
  artistName: string
  // 좌-우 뒤바뀜 대비 (artist/track swap)
  alternate?: { trackName: string; artistName: string }
}

// 제거할 노이즈 단어
const NOISE =
  /\b(mr|inst|instrumental|karaoke|반주|가사|lyrics?|official|m\/?v|mv|audio|hd|4k|color\s*coded|가이드|guide)\b/gi

// 괄호류 통째 제거: [] () 【】 〈〉 《》 「」 『』 {}
const BRACKETS = /[[(【〈《「『{][^\])】〉》」』}]*[\])】〉》」』}]/g

const SEPARATORS = /\s[-–—−]\s/

function clean(s: string): string {
  return s.replace(NOISE, '').replace(/\s{2,}/g, ' ').trim()
}

export function parseVideoTitle(rawTitle: string): ParsedTitle {
  // ① 엔티티 디코딩 → ② 괄호류 제거 → ③ 노이즈 제거
  const decoded = decodeEntities(rawTitle)
  const stripped = clean(decoded.replace(BRACKETS, ' '))

  // ④ 구분자 분리
  const parts = stripped.split(SEPARATORS).map((p) => clean(p)).filter(Boolean)

  if (parts.length >= 2) {
    // ⑤ 좌-우 = artist-track (관례), 뒤바뀜 대비 alternate 반환
    const [left, right] = parts
    return {
      artistName: left,
      trackName: right,
      alternate: { artistName: right, trackName: left },
    }
  }

  // 구분자 없으면 전체를 트랙명으로
  const only = parts[0] ?? stripped
  return { trackName: only, artistName: '' }
}
