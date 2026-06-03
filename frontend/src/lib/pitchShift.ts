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
  const L: number[] = []
  const R: number[] = []
  let n: number
  while ((n = filter.extract(inter, BUF)) > 0) {
    for (let i = 0; i < n; i++) {
      L.push(inter[i * 2])
      R.push(inter[i * 2 + 1])
    }
  }
  const out = ctx.createBuffer(2, Math.max(1, L.length), input.sampleRate)
  out.getChannelData(0).set(L)
  out.getChannelData(1).set(R)
  return out
}
