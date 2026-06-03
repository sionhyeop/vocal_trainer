declare module 'soundtouchjs' {
  export class SoundTouch {
    tempo: number
    rate: number
    pitch: number
    pitchSemitones: number
  }
  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer)
  }
  export class SimpleFilter {
    constructor(source: WebAudioBufferSource, pipe: SoundTouch)
    extract(target: Float32Array, numFrames: number): number
  }
}
