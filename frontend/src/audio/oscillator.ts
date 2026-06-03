// oscillator.ts — 목표음/이어트레이닝용 톤 생성 (PLAN §2.1, Web Audio OscillatorNode)

/** hz 음을 durationMs 동안 재생(페이드 아웃). 버튼 클릭(제스처) 안에서 호출할 것. */
export function playTone(
  hz: number,
  durationMs = 900,
  type: OscillatorType = 'sine',
): void {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = hz

  const now = ctx.currentTime
  const dur = durationMs / 1000
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02) // 살짝 어택
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)

  osc.connect(gain).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + dur)
  osc.onended = () => {
    if (ctx.state !== 'closed') void ctx.close()
  }
}
