// The synthesized voices (Round 4d, brief section 7: "a single sfx module
// with one function per cue"). Every sound in the game is scheduled here
// out of oscillators, a noise buffer and envelopes. There are no audio
// assets, so there is no license manifest, no bundle weight and no fetch.
//
// Each voice is a pure scheduling function over the injected context. It
// creates its nodes, connects them to the bus it is handed, and schedules
// start and stop; it never reads global state and never decides whether it
// is allowed to play. That decision belongs to the engine, which is what
// makes "muted means nothing is scheduled" a thing the suite can assert
// about the graph rather than about a boolean.

import { SOUND_MS, type SoundCue } from '../director/cues'
import type { AudioContextLike, AudioNodeLike, OscillatorLike } from './graph'

// A gain cannot ramp exponentially to zero, so silence is this instead.
const SILENCE = 0.0001
const ATTACK_S = 0.006

export interface VoiceOptions {
  // 0 to 1, how hard the beat hit. The brief asks for the adversary stab
  // to be pitched by severity; everything else ignores it.
  intensity?: number
}

function envelope(ctx: AudioContextLike, out: AudioNodeLike, at: number, ms: number, peak: number): AudioNodeLike {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(SILENCE, at)
  gain.gain.linearRampToValueAtTime(peak, at + ATTACK_S)
  gain.gain.exponentialRampToValueAtTime(SILENCE, at + ms / 1000)
  gain.connect(out)
  return gain
}

interface ToneSpec {
  type?: string
  from: number
  to?: number
  ms: number
  peak?: number
  delayMs?: number
}

function tone(ctx: AudioContextLike, out: AudioNodeLike, at: number, spec: ToneSpec): OscillatorLike {
  const start = at + (spec.delayMs ?? 0) / 1000
  const stop = start + spec.ms / 1000
  const osc = ctx.createOscillator()
  osc.type = spec.type ?? 'square'
  osc.frequency.setValueAtTime(spec.from, start)
  if (spec.to !== undefined && spec.to !== spec.from) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(spec.to, 1), stop)
  }
  osc.connect(envelope(ctx, out, start, spec.ms, spec.peak ?? 0.22))
  osc.start(start)
  osc.stop(stop)
  return osc
}

// A deterministic noise fill. Math.random would do, but a fixed sequence
// means the static in a BLACKOUT CHAIN is the same static every time, and
// it keeps every source of randomness in the project accounted for: this
// module has none, and the procedural music of Round 6 will need its own
// presentation-side generator rather than borrowing one from here.
function noiseBuffer(ctx: AudioContextLike, ms: number) {
  const length = Math.max(1, Math.floor((ctx.sampleRate * ms) / 1000))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let seed = 0x2f6e2b1
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    data[i] = (seed / 0x3fffffff) - 1
  }
  return buffer
}

interface NoiseSpec {
  ms: number
  peak?: number
  delayMs?: number
  filter?: { type: string; frequency: number; q?: number }
}

function noise(ctx: AudioContextLike, out: AudioNodeLike, at: number, spec: NoiseSpec): void {
  const start = at + (spec.delayMs ?? 0) / 1000
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, spec.ms)
  let sink: AudioNodeLike = envelope(ctx, out, start, spec.ms, spec.peak ?? 0.18)
  if (spec.filter) {
    const biquad = ctx.createBiquadFilter()
    biquad.type = spec.filter.type
    biquad.frequency.setValueAtTime(spec.filter.frequency, start)
    if (spec.filter.q !== undefined) biquad.Q.setValueAtTime(spec.filter.q, start)
    biquad.connect(sink)
    sink = biquad
  }
  src.connect(sink)
  src.start(start)
  src.stop(start + spec.ms / 1000)
}

export type Voice = (ctx: AudioContextLike, out: AudioNodeLike, at: number, opts: VoiceOptions) => void

// An alarm blip unique per condition, built from one shape so the family
// reads as a family: two pulses, and the pair of pitches is what tells the
// player which condition just attached.
const alarm = (high: number, low: number, ms: number): Voice =>
  (ctx, out, at) => {
    tone(ctx, out, at, { type: 'square', from: high, ms: ms * 0.38, peak: 0.2 })
    tone(ctx, out, at, { type: 'square', from: low, ms: ms * 0.42, peak: 0.2, delayMs: ms * 0.5 })
  }

// One entry per cue, which is what makes the coverage test possible: the
// battery walks the registry's sound slots and looks each one up here, so a
// cue with no voice fails the build rather than playing nothing.
export const VOICES: Record<SoundCue, Voice> = {
  // Two real decisions, not absences: a slot nobody has filled yet fails
  // the battery, and a beat that is deliberately silent schedules nothing.
  placeholder: () => {},
  silent: () => {},

  'data-burst': (ctx, out, at) => {
    const ms = SOUND_MS['data-burst']
    for (let i = 0; i < 4; i += 1) {
      tone(ctx, out, at, { type: 'square', from: 880 + i * 190, ms: ms * 0.13, peak: 0.13, delayMs: i * ms * 0.2 })
    }
  },

  'buy-click': (ctx, out, at) => {
    const ms = SOUND_MS['buy-click']
    tone(ctx, out, at, { type: 'square', from: 1320, to: 990, ms: ms * 0.25, peak: 0.2 })
    tone(ctx, out, at, { type: 'triangle', from: 660, to: 440, ms: ms * 0.6, peak: 0.16, delayMs: ms * 0.3 })
  },

  'denied-buzz': (ctx, out, at) => {
    tone(ctx, out, at, { type: 'sawtooth', from: 150, to: 95, ms: SOUND_MS['denied-buzz'], peak: 0.2 })
  },

  'execute-sweep': (ctx, out, at) => {
    const ms = SOUND_MS['execute-sweep']
    tone(ctx, out, at, { type: 'sawtooth', from: 180, to: 900, ms, peak: 0.16 })
    tone(ctx, out, at, { type: 'square', from: 360, to: 1800, ms, peak: 0.08 })
  },

  // The one voice the brief asks to vary: pitched by severity, so a heavy
  // hit lands lower and reads as heavier.
  'hit-stab': (ctx, out, at, opts) => {
    const ms = SOUND_MS['hit-stab']
    const intensity = Math.min(1, Math.max(0, opts.intensity ?? 0.5))
    const top = 520 - intensity * 260
    tone(ctx, out, at, { type: 'square', from: top, to: top / 3, ms: ms * 0.7, peak: 0.24 })
    noise(ctx, out, at, { ms: ms * 0.5, peak: 0.14, filter: { type: 'lowpass', frequency: 1400 } })
  },

  'alarm-gnss': alarm(980, 700, SOUND_MS['alarm-gnss']),
  'alarm-uplink': alarm(620, 880, SOUND_MS['alarm-uplink']),
  'alarm-spoof': alarm(840, 845, SOUND_MS['alarm-spoof']),
  'alarm-eavesdrop': alarm(520, 1040, SOUND_MS['alarm-eavesdrop']),
  'alarm-exfil': alarm(1180, 590, SOUND_MS['alarm-exfil']),
  'alarm-ransom': alarm(300, 240, SOUND_MS['alarm-ransom']),

  // Round 7b. The turn resolved and nothing hit you. Two soft notes rising
  // a fourth, well under the alarm register, so it reads as the absence of
  // a hit rather than as a faint one.
  'all-clear': (ctx, out, at) => {
    const ms = SOUND_MS['all-clear']
    tone(ctx, out, at, { type: 'sine', from: 523, ms: ms * 0.5, peak: 0.1 })
    tone(ctx, out, at, { type: 'sine', from: 698, ms: ms * 0.62, peak: 0.09, delayMs: ms * 0.38 })
  },

  'soft-tick': (ctx, out, at) => {
    tone(ctx, out, at, { type: 'triangle', from: 1480, ms: SOUND_MS['soft-tick'], peak: 0.1 })
  },

  'resolve-chime': (ctx, out, at) => {
    const ms = SOUND_MS['resolve-chime']
    tone(ctx, out, at, { type: 'triangle', from: 784, ms: ms * 0.5, peak: 0.16 })
    tone(ctx, out, at, { type: 'triangle', from: 1175, ms: ms * 0.6, peak: 0.14, delayMs: ms * 0.34 })
  },

  'tick-up': (ctx, out, at) => {
    tone(ctx, out, at, { type: 'square', from: 1200, ms: SOUND_MS['tick-up'], peak: 0.07 })
  },

  'tick-down': (ctx, out, at) => {
    tone(ctx, out, at, { type: 'square', from: 700, ms: SOUND_MS['tick-down'], peak: 0.07 })
  },

  'warn-low': (ctx, out, at) => {
    const ms = SOUND_MS['warn-low']
    tone(ctx, out, at, { type: 'sawtooth', from: 220, to: 160, ms: ms * 0.55, peak: 0.18 })
    tone(ctx, out, at, { type: 'sawtooth', from: 200, to: 146, ms: ms * 0.5, peak: 0.16, delayMs: ms * 0.5 })
  },

  // Three rising notes, and the last one has to land inside the declared
  // duration: the first version ran 18ms over because the delay and the
  // note length were chosen separately, which the battery caught.
  'relief-chime': (ctx, out, at) => {
    const ms = SOUND_MS['relief-chime']
    tone(ctx, out, at, { type: 'triangle', from: 587, ms: ms * 0.42, peak: 0.15 })
    tone(ctx, out, at, { type: 'triangle', from: 880, ms: ms * 0.42, peak: 0.15, delayMs: ms * 0.29 })
    tone(ctx, out, at, { type: 'triangle', from: 1175, ms: ms * 0.42, peak: 0.12, delayMs: ms * 0.58 })
  },

  // The signature row, and the only effect written as a sequence: the
  // navigation lock breaking, a beat of nothing, then the static that is
  // all the drones have left. The silence is the part that lands, so it is
  // scheduled as an actual gap rather than as a quieter passage.
  'blackout-chain': (ctx, out, at) => {
    const ms = SOUND_MS['blackout-chain']
    tone(ctx, out, at, { type: 'sine', from: 660, to: 70, ms: ms * 0.34, peak: 0.26 })
    noise(ctx, out, at, {
      ms: ms * 0.42,
      peak: 0.2,
      delayMs: ms * 0.58,
      filter: { type: 'highpass', frequency: 900 },
    })
  },

  'surge-burn': (ctx, out, at) => {
    const ms = SOUND_MS['surge-burn']
    noise(ctx, out, at, { ms: ms * 0.6, peak: 0.16, filter: { type: 'bandpass', frequency: 1800, q: 0.7 } })
    tone(ctx, out, at, { type: 'square', from: 240, to: 60, ms: ms * 0.34, peak: 0.24, delayMs: ms * 0.62 })
  },

  'commendation-fanfare': (ctx, out, at) => {
    const ms = SOUND_MS['commendation-fanfare']
    const notes = [523, 659, 784]
    notes.forEach((hz, i) => {
      tone(ctx, out, at, { type: 'square', from: hz, ms: ms * 0.42, peak: 0.16, delayMs: i * ms * 0.2 })
    })
  },

  'arrive-chime': (ctx, out, at) => {
    const ms = SOUND_MS['arrive-chime']
    tone(ctx, out, at, { type: 'triangle', from: 440, to: 880, ms: ms * 0.6, peak: 0.17 })
    tone(ctx, out, at, { type: 'sine', from: 1320, ms: ms * 0.36, peak: 0.12, delayMs: ms * 0.55 })
  },

  'victory-fanfare': (ctx, out, at) => {
    const ms = SOUND_MS['victory-fanfare']
    const notes = [523, 659, 784, 1047]
    notes.forEach((hz, i) => {
      tone(ctx, out, at, { type: 'square', from: hz, ms: ms * 0.36, peak: 0.18, delayMs: i * ms * 0.16 })
    })
  },

  'defeat-sting': (ctx, out, at) => {
    const ms = SOUND_MS['defeat-sting']
    tone(ctx, out, at, { type: 'sawtooth', from: 330, to: 82, ms: ms * 0.3, peak: 0.22 })
    tone(ctx, out, at, { type: 'sine', from: 55, ms: ms * 0.62, peak: 0.13, delayMs: ms * 0.34 })
  },
}
