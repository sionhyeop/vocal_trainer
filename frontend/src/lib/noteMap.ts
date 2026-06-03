// noteMap.ts — Tier A 노트맵 JSON 포맷/스키마 정의 (PLAN §2.2)
// 이번 실행에서는 "포맷만" 정의한다. 실제 곡 데이터(assets/songs/*.json)는 후속.
// 채점 MVP는 Tier B(표현/안정성)로 고정이므로 이 스키마는 아직 채점에 쓰이지 않는다.
import { z } from 'zod'

/** 한 노트: 시작/끝(ms) + MIDI 음 높이 + 해당 가사 음절(자동 추출 시 없음) */
export const NoteSchema = z.object({
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  midiNote: z.number().int().min(0).max(127),
  lyric: z.string().optional(),
})

/** 곡 전체 노트맵 (Tier A/C 공통 포맷) */
export const NoteMapSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** 저작권: 번들링 곡은 PD/자작만 (예: "public-domain") */
  license: z.string(),
  /** IFrame 임베드용 (선택) */
  youtubeId: z.string().optional(),
  notes: z.array(NoteSchema),
})

export type Note = z.infer<typeof NoteSchema>
export type NoteMap = z.infer<typeof NoteMapSchema>

/** 런타임 검증 헬퍼 — 후속 단계에서 곡 JSON 로드 시 사용 */
export function parseNoteMap(data: unknown): NoteMap {
  return NoteMapSchema.parse(data)
}
