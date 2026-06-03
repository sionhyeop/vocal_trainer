// levels.ts — 보컬 게임 레벨 데이터(데이터 기반). midi: C4=60
export interface ClimberLevel {
  id: string
  name: string
  notes: number[] // 등반 순서대로의 목표 음(midi)
  holdMs: number // 한 칸 잠그는 데 필요한 유지 시간
  tolSemi: number // 허용 오차(반음)
  timeLimitMs: number // 칸당 제한시간
}

export interface EchoLevel {
  id: string
  name: string
  scale: number[] // 멜로디를 구성할 음 풀(midi)
  startLen: number // 시작 멜로디 길이
  maxLen: number // 클리어 길이
  noteMs: number // 재생 시 음당 길이
  tolSemi: number // 허용 오차(반음)
}

export const CLIMBER_LEVELS: ClimberLevel[] = [
  { id: 'c1', name: '첫 등반 (도~솔)', notes: [60, 62, 64, 65, 67], holdMs: 900, tolSemi: 0.8, timeLimitMs: 9000 },
  { id: 'c2', name: '한 옥타브', notes: [60, 62, 64, 65, 67, 69, 71, 72], holdMs: 900, tolSemi: 0.8, timeLimitMs: 9000 },
  { id: 'c3', name: '내리막 (솔~도)', notes: [67, 65, 64, 62, 60], holdMs: 900, tolSemi: 0.8, timeLimitMs: 9000 },
  { id: 'c4', name: '점프 (옥타브 도약)', notes: [60, 67, 62, 69, 64, 71], holdMs: 800, tolSemi: 0.9, timeLimitMs: 10000 },
]

// 음 듣고 맞히기(청음). note=음 이름, interval=두 음의 간격
export interface EarLevel {
  id: string
  name: string
  kind: 'note' | 'interval'
  pool: number[] // note: 후보 음(midi) / interval: 기준음 풀
  intervals?: number[] // interval kind에서 테스트할 반음 수
  rounds: number
}

export const EAR_LEVELS: EarLevel[] = [
  { id: 'ear1', name: '계이름 (도~시)', kind: 'note', pool: [60, 62, 64, 65, 67, 69, 71], rounds: 10 },
  { id: 'ear2', name: '반음 포함 (12음)', kind: 'note', pool: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71], rounds: 10 },
  { id: 'ear3', name: '음정 간격 (인터벌)', kind: 'interval', pool: [60, 62, 64, 65, 67], intervals: [2, 4, 5, 7, 12], rounds: 10 },
]

export const ECHO_LEVELS: EchoLevel[] = [
  { id: 'e1', name: '도레미 (3음)', scale: [60, 62, 64], startLen: 3, maxLen: 5, noteMs: 600, tolSemi: 1 },
  { id: 'e2', name: '펜타토닉', scale: [60, 62, 64, 67, 69], startLen: 3, maxLen: 6, noteMs: 550, tolSemi: 1 },
  { id: 'e3', name: '도약 멜로디', scale: [60, 64, 67, 72], startLen: 3, maxLen: 6, noteMs: 520, tolSemi: 1 },
]
