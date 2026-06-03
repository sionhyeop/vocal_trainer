// account.ts — 로컬 닉네임 계정(서버 없음). 추후 Firebase 등으로 교체 가능. (zustand)
import { create } from 'zustand'

const KEY = 'vt:account'

export interface Account {
  name: string
  since: number
}

function load(): Account | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Account) : null
  } catch {
    return null
  }
}

interface AccountState {
  account: Account | null
  login: (name: string) => void
  logout: () => void
}

export const useAccountStore = create<AccountState>((set) => ({
  account: load(),
  login: (name) => {
    const a: Account = { name: name.trim().slice(0, 20) || '게스트', since: Date.now() }
    try {
      localStorage.setItem(KEY, JSON.stringify(a))
    } catch {
      /* noop */
    }
    set({ account: a })
  },
  logout: () => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* noop */
    }
    set({ account: null })
  },
}))
