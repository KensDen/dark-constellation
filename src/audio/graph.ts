// The slice of Web Audio this project actually uses, written as structural
// types rather than taken from lib.dom (Round 4d).
//
// Why not just type against AudioContext: jsdom implements no Web Audio at
// all, so a suite typed against the real interfaces can only test through a
// cast, and a cast is exactly the thing that stops catching mismatches.
// These interfaces are small enough that a fake context in the suite
// implements them honestly, and a real AudioContext satisfies them
// structurally, so the same code runs against both and the fake cannot
// quietly drift into implementing something the browser does not have.
//
// This is the director's injected Scheduler argument again, one layer down:
// the thing that is hard to observe is handed in rather than reached for.

export interface AudioParamLike {
  value: number
  setValueAtTime(value: number, startTime: number): AudioParamLike
  linearRampToValueAtTime(value: number, endTime: number): AudioParamLike
  exponentialRampToValueAtTime(value: number, endTime: number): AudioParamLike
  cancelScheduledValues(startTime: number): AudioParamLike
}

// Two overloads, because the browser has two and Round 6b needs the second
// one. Connecting to a NODE routes audio; connecting to a PARAM modulates
// it, which is how the music bed's LFO moves a filter cutoff without being
// audible itself. They are different operations with different return
// types in the real API, and collapsing them into one would let the suite's
// fake accept a param where a node belongs and record the two identically.
export interface AudioNodeLike {
  connect(destination: AudioNodeLike): AudioNodeLike
  connect(destination: AudioParamLike): void
  disconnect(): void
}

export interface GainLike extends AudioNodeLike {
  gain: AudioParamLike
}

export interface OscillatorLike extends AudioNodeLike {
  type: string
  frequency: AudioParamLike
  start(when: number): void
  stop(when: number): void
}

export interface BiquadLike extends AudioNodeLike {
  type: string
  frequency: AudioParamLike
  Q: AudioParamLike
}

export interface AudioBufferLike {
  length: number
  getChannelData(channel: number): Float32Array
}

export interface BufferSourceLike extends AudioNodeLike {
  buffer: AudioBufferLike | null
  start(when: number): void
  stop(when: number): void
}

export interface AudioContextLike {
  readonly currentTime: number
  readonly sampleRate: number
  readonly destination: AudioNodeLike
  readonly state: string
  createOscillator(): OscillatorLike
  createGain(): GainLike
  createBiquadFilter(): BiquadLike
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike
  createBufferSource(): BufferSourceLike
  resume(): Promise<void>
  suspend(): Promise<void>
  close(): Promise<void>
}
