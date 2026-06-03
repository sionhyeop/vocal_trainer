// noteMapStore.ts — videoId별 노트맵 로컬 저장 (방법 B; local-first §8)
import { NoteMapSchema, type NoteMap } from './noteMap'

const KEY = (videoId: string) => `notemap:${videoId}`

export function saveNoteMap(videoId: string, map: NoteMap): void {
  try {
    localStorage.setItem(KEY(videoId), JSON.stringify(map))
  } catch {
    /* 용량 초과 등 무시 */
  }
}

export function loadNoteMap(videoId: string): NoteMap | null {
  try {
    const raw = localStorage.getItem(KEY(videoId))
    if (!raw) return null
    return NoteMapSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

export function hasNoteMap(videoId: string): boolean {
  return !!localStorage.getItem(KEY(videoId))
}

export function deleteNoteMap(videoId: string): void {
  localStorage.removeItem(KEY(videoId))
}

/** 저장된 모든 노트맵 목록 (테스트/보기용) */
export function listNoteMaps(): { videoId: string; map: NoteMap }[] {
  const out: { videoId: string; map: NoteMap }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith('notemap:')) continue
    try {
      const map = NoteMapSchema.parse(JSON.parse(localStorage.getItem(k)!))
      out.push({ videoId: k.slice('notemap:'.length), map })
    } catch {
      /* skip */
    }
  }
  return out
}
