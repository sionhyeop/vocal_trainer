// micCapture.ts — getUserMedia 마이크 캡처 (PLAN §4.1 + 통화/Zoom식 에코 제거)
//
// ★ MR 유입(에코) 문제 해결: 통화·Zoom과 같은 AEC(음향 반향 제거)를 켠다.
//   브라우저가 MR을 직접 재생하므로, AEC가 그 far-end 신호를 기준으로 마이크에서
//   MR 성분을 지운다 → 내 목소리만 남아 피치가 안정된다.
//   통화/Zoom과 동일하게 항상 켜서 MR 유입을 막는다(모드 통일).

export interface MicCapture {
  audioContext: AudioContext
  analyser: AnalyserNode
  stream: MediaStream
  readTimeDomain: (buf: Float32Array<ArrayBuffer>) => void
  stop: () => void
}

export async function startMicCapture(fftSize = 2048): Promise<MicCapture> {
  // 항상 통화 모드: 에코/잡음 제거 + AGC 켬 (표준 + Chrome 레거시 goog* 함께)
  const audio: Record<string, unknown> = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    googEchoCancellation: true,
    googEchoCancellation2: true,
    googNoiseSuppression: true,
    googNoiseSuppression2: true,
    googAutoGainControl: true,
    googHighpassFilter: true,
    googTypingNoiseDetection: true,
    channelCount: 1,
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audio as MediaTrackConstraints,
  })

  // 모바일 사파리/크롬은 사용자 제스처 후에만 resume 가능 → 이 함수는 "시작" 버튼에서 호출됨
  const audioContext = new AudioContext()
  await audioContext.resume()

  const source = audioContext.createMediaStreamSource(stream)
  // 작은 마이크 입력을 키우는 게인 — 통화 모드는 AGC가 있어 낮게
  const gain = audioContext.createGain()
  gain.gain.value = 1.3
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = fftSize
  source.connect(gain)
  gain.connect(analyser)
  // analyser는 destination에 연결하지 않는다(스피커로 마이크 입력이 새지 않도록)

  return {
    audioContext,
    analyser,
    stream,
    readTimeDomain: (buf) => analyser.getFloatTimeDomainData(buf),
    stop: () => {
      try {
        stream.getTracks().forEach((t) => t.stop())
        source.disconnect()
        gain.disconnect()
        analyser.disconnect()
        if (audioContext.state !== 'closed') void audioContext.close()
      } catch {
        /* noop */
      }
    },
  }
}
