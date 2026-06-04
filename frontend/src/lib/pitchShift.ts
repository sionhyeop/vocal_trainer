// pitchShift.ts — soundtouchjs로 피치만 N반음 이동(템포 유지). 녹음 재생/변조 공용.
import { SoundTouch, SimpleFilter, WebAudioBufferSource } from 'soundtouchjs'

function toStereo(ctx: AudioContext, buf: AudioBuffer): AudioBuffer {
  if (buf.numberOfChannels >= 2) return buf
  const st = ctx.createBuffer(2, buf.length, buf.sampleRate)
  const d = buf.getChannelData(0)
  st.getChannelData(0).set(d)
  st.getChannelData(1).set(d)
  return st
}

/** 피치만 semitones 반음 이동(템포 유지)한 새 AudioBuffer 반환 */
export function pitchShiftBuffer(ctx: AudioContext, input: AudioBuffer, semitones: number): AudioBuffer {
  const st = new SoundTouch()
  st.tempo = 1
  st.pitch = Math.pow(2, semitones / 12)
  const source = new WebAudioBufferSource(toStereo(ctx, input))
  const filter = new SimpleFilter(source, st)
  const BUF = 8192
  const inter = new Float32Array(BUF * 2)
  // 샘플별 boxed-number push(수백만 개)는 긴 녹음에서 메인스레드를 멈춘다.
  // extract 청크를 Float32Array로 복사해 모았다가 한 번에 디인터리브.
  const chunks: Float32Array[] = []
  let total = 0
  let n: number
  while ((n = filter.extract(inter, BUF)) > 0) {
    chunks.push(inter.slice(0, n * 2))
    total += n
  }
  const out = ctx.createBuffer(2, Math.max(1, total), input.sampleRate)
  const L = out.getChannelData(0)
  const R = out.getChannelData(1)
  let off = 0
  for (const c of chunks) {
    const frames = c.length / 2
    for (let i = 0; i < frames; i++) { L[off + i] = c[i * 2]; R[off + i] = c[i * 2 + 1] }
    off += frames
  }
  return out
}
