// session.ts — 선택한 곡 + 검색 캐시 (zustand)
import { create } from 'zustand'
import type { YouTubeResult } from '../lib/youtube'

export interface SelectedVideo {
  videoId: string
  title: string
  channelTitle?: string
  thumbnail?: string
}

// 검색 캐시를 sessionStorage에도 저장 → 뒤로가기 + 새로고침 모두 유지
const SEARCH_KEY = 'vt:search'
function loadSearch(): { q: string; r: YouTubeResult[] } {
  try {
    const raw = sessionStorage.getItem(SEARCH_KEY)
    if (raw) {
      const d = JSON.parse(raw)
      return { q: d.q ?? '', r: Array.isArray(d.r) ? d.r : [] }
    }
  } catch {
    /* noop */
  }
  return { q: '', r: [] }
}

interface SessionState {
  selected: SelectedVideo | null
  setSelected: (v: SelectedVideo) => void
  // 검색 캐시 — 뒤로가기/새로고침 시 검색어/결과 유지
  searchQuery: string
  searchResults: YouTubeResult[]
  setSearch: (query: string, results: YouTubeResult[]) => void
}

const initial = loadSearch()

export const useSessionStore = create<SessionState>((set) => ({
  selected: null,
  setSelected: (selected) => set({ selected }),
  searchQuery: initial.q,
  searchResults: initial.r,
  setSearch: (searchQuery, searchResults) => {
    try {
      sessionStorage.setItem(SEARCH_KEY, JSON.stringify({ q: searchQuery, r: searchResults }))
    } catch {
      /* 용량 초과 등 무시 */
    }
    set({ searchQuery, searchResults })
  },
}))
