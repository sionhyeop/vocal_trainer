// levels.ts — 보컬 게임 레벨 데이터(데이터 기반). midi: C4=60
export interface ClimberLevel {
  id: string
  name: string
  notes: number[] // 등반 순서대로의 목표 음(midi)
  holdMs: number // 한 칸 잠그는 데 필요한 유지 시간
  tolSemi: number // 허용 오차(반음)
  timeLimitMs: number // 칸당 제한시간
}

// 멜로디 따라부르기 — 유명 발라드 5곡. melody=[midi, beats] (4분음표=1박).
// (가창 연습용으로 단순화한 시그니처 프레이즈, 부르기 편한 음역으로 이조)
export interface BalladSong {
  id: string
  title: string
  artist: string
  bpm: number
  tolSemi: number // 허용 오차(반음, 옥타브 무관)
  melody: [number, number][]
}

// 날아오는 음 깨기 — 절차적 생성용 레벨 파라미터
export interface BreakerLevel {
  id: string
  name: string
  scale: number[] // 음 풀(midi). 프로필 음역대로 이조됨
  count: number // 음표 개수
  gapMs: number // 음표 사이 간격(작을수록 빠르고 촘촘)
  speedPxPerSec: number // 흐르는 속도
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

export const BALLADS: BalladSong[] = [
  {
    id: 'b_sung', title: '너의 모든 순간', artist: '성시경', bpm: 82, tolSemi: 1,
    melody: [[60, 1], [62, 1], [64, 1.5], [62, 0.5], [60, 1], [62, 1], [64, 1], [65, 1.5], [64, 0.5], [62, 1], [60, 2]],
  },
  {
    id: 'b_inyeon', title: '인연', artist: '이선희', bpm: 76, tolSemi: 1,
    melody: [[64, 1], [62, 1], [60, 1], [62, 1], [64, 1], [67, 2], [65, 1], [64, 1], [62, 1], [60, 2]],
  },
  {
    id: 'b_wild', title: '야생화', artist: '박효신', bpm: 72, tolSemi: 1.1,
    melody: [[60, 1], [63, 1], [65, 1], [67, 2], [65, 1], [63, 1], [60, 1], [63, 1], [67, 1], [70, 2], [67, 1], [65, 2]],
  },
  {
    id: 'b_foryou', title: '너를 위해', artist: '임재범', bpm: 80, tolSemi: 1.1,
    melody: [[60, 1], [67, 1], [65, 1], [64, 1], [62, 1], [67, 2], [69, 1], [67, 1], [64, 1], [60, 2], [67, 1], [72, 2]],
  },
  {
    id: 'b_never', title: '네버엔딩스토리', artist: '부활', bpm: 78, tolSemi: 1.2,
    melody: [[62, 1], [64, 1], [65, 1], [67, 1], [69, 2], [67, 1], [65, 1], [64, 1], [62, 1], [60, 1], [67, 2], [72, 1], [71, 1], [69, 2]],
  },
]

export const BREAKER_LEVELS: BreakerLevel[] = [
  { id: 'k1', name: '입문 (느린 5음)', scale: [60, 62, 64, 65, 67], count: 12, gapMs: 1700, speedPxPerSec: 95, tolSemi: 1 },
  { id: 'k2', name: '펜타토닉', scale: [60, 62, 64, 67, 69], count: 16, gapMs: 1400, speedPxPerSec: 115, tolSemi: 1 },
  { id: 'k3', name: '한 옥타브', scale: [60, 62, 64, 65, 67, 69, 71, 72], count: 20, gapMs: 1200, speedPxPerSec: 135, tolSemi: 0.9 },
  { id: 'k4', name: '도약 + 빠르게', scale: [60, 64, 67, 72, 69, 65, 62], count: 24, gapMs: 1000, speedPxPerSec: 160, tolSemi: 0.9 },
]
