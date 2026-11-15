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
//
// Since v2.0 R3 (Ken's ruling of 15 November 2026: voices for the threats)
// the module also holds a voice of its own for each threat in the deck,
// at the bottom of VOICES. Still no audio assets.

import { SOUND_MS, type SoundCue } from '../cues'
import type { AudioContextLike, AudioNodeLike, OscillatorLike } from './graph'

// A gain cannot ramp exponentially to zero, so silence is this instead.
const SILENCE = 0.0001
const ATTACK_S = 0.006

export interface VoiceOptions {
  // 0 to 1, how hard the beat hit. The brief asks for the adversary stab
  // to be pitched by severity; everything else ignores it.
  intensity?: number
}

// `hold` (v2.0 R3) is the share of the length, 0 to 1, that the sound
// stands at its peak before it dies away. Without it every sound is a
// pluck, loudest at the start, and a threat's voice sometimes has to be a
// thing that stays: a band of noise that sits on a link, a tone that is
// there until something puts it out.
function envelope(ctx: AudioContextLike, out: AudioNodeLike, at: number, ms: number, peak: number, hold = 0): AudioNodeLike {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(SILENCE, at)
  gain.gain.linearRampToValueAtTime(peak, at + ATTACK_S)
  if (hold) gain.gain.setValueAtTime(peak, at + (hold * ms) / 1000)
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
  hold?: number
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
  osc.connect(envelope(ctx, out, start, spec.ms, spec.peak ?? 0.22, spec.hold))
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
  hold?: number
  // `to` (v2.0 R3) slides the filter over the length of the burst, so a
  // band of noise can close down or open up instead of only standing.
  filter?: { type: string; frequency: number; to?: number; q?: number }
}

function noise(ctx: AudioContextLike, out: AudioNodeLike, at: number, spec: NoiseSpec): void {
  const start = at + (spec.delayMs ?? 0) / 1000
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, spec.ms)
  let sink: AudioNodeLike = envelope(ctx, out, start, spec.ms, spec.peak ?? 0.18, spec.hold)
  if (spec.filter) {
    const biquad = ctx.createBiquadFilter()
    biquad.type = spec.filter.type
    biquad.frequency.setValueAtTime(spec.filter.frequency, start)
    if (spec.filter.to) biquad.frequency.exponentialRampToValueAtTime(spec.filter.to, start + spec.ms / 1000)
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

// THE THREATS' OWN VOICES (v2.0 R3, Ken's ruling of 15 November 2026:
// voices for the threats). Through R2 a threat was heard as a rhythm of
// voices borrowed from other cues; each now has a timbre and a shape that
// say what it does, so two threats can be told apart with the eyes shut.
//
// A voice is written as its parts, one line each, because seventeen
// voices in the first download have to be small: a part is a tone (named
// by its waveform) or a burst of the noise above (named by the filter it
// passes through), when it starts, how long it runs, how loud, and its
// pitch or its band, with where that slides to, how long it holds
// (envelope) and how narrow the band is. Times are milliseconds from the
// start of the voice, and the last part must end inside SOUND_MS, which
// the battery holds.
//
// THE PEAKS ARE MEASURED, NOT CHOSEN BY EAR: nobody had heard these when
// they were written. Each voice was rendered by scripts/measure-mix.js and
// its peaks scaled until two figures sat among the effects that were
// already there (tests/mix-measurement.json): its K-weighted level while
// it sounds, held inside one 4 dB band under the stab, and the K-weighted
// level of its loudest 400 ms, held at or under the stab's, because a
// tone that holds is louder to the ear than a tick at the same level. So
// no threat shouts, and none is louder leaving than the hit is landing.
// That is why the peaks are odd numbers. What each voice should sound
// like is the comment over it, for the ear that checks it at #soundboard;
// a change to a shape or a peak means measuring again.
type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle'
type Band = 'lowpass' | 'bandpass' | 'highpass'
type Part = readonly [kind: Wave | Band, atMs: number, ms: number, peak: number, hz: number, toHz?: number, hold?: number, q?: number]

const threat =
  (...parts: Part[]): Voice =>
  (ctx, out, at) => {
    for (const [kind, delayMs, ms, peak, from, to, hold, q] of parts) {
      // The three filter names are the three kinds that end this way.
      if (kind.endsWith('pass')) noise(ctx, out, at, { ms, peak, delayMs, hold, filter: { type: kind, frequency: from, to, q } })
      else tone(ctx, out, at, { type: kind, from, to, ms, peak, delayMs, hold })
    }
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

  // A clear navigation tone, swallowed by a wide wash of noise that
  // settles over it: the signal is still there and cannot be heard.
  'threat-pnt-jamming': threat(['sine', 0, 260, 0.106, 1575], ['bandpass', 40, 580, 0.198, 1400, 500, 0.6]),

  // Three hard bursts of noise in one narrow, high band: a single link
  // being stepped on, where PNT jamming is a wash over everything.
  'threat-uplink-jamming': threat(...[0, 170, 340].map((t): Part => ['bandpass', t, 150, 0.506, 2600, 2600, 0.5, 9])),

  // One steady tone and a twin that starts on it and slides off sharp, so
  // the two beat against each other faster and faster: the false signal
  // walking the receiver away from the true one.
  'threat-gnss-spoofing': threat(['triangle', 0, 700, 0.04, 660, 660, 0.7], ['sine', 0, 700, 0.04, 660, 740, 0.7]),

  // A dry clock, tick and tock, that comes in early once and then late:
  // time that can no longer be trusted.
  'threat-time-spoof': threat(...[0, 150, 300, 380, 600].map((t, i): Part => ['square', t, 40, 0.137, i % 2 ? 1800 : 2400])),

  // A zap that climbs out of hearing, a burst of bright hiss, and a high
  // ring left behind like an afterimage: a sensor flooded with light.
  'threat-lidar-dazzle': threat(['sawtooth', 0, 130, 0.106, 900, 5200], ['highpass', 60, 240, 0.165, 5000], ['sine', 110, 350, 0.079, 3520]),

  // Soft pops at pitches and moments that follow no pattern, each one
  // sliding up as if something were there: shapes that are not.
  'threat-lidar-injection': threat(
    ...[[0, 520], [90, 780], [230, 440], [300, 930], [450, 620]].map(([t, hz]): Part => ['sine', t, 90, 0.182, hz, hz * 1.6]),
  ),

  // A steady tone that sags as a dull noise closes over it, and then
  // nothing: the thing is still there and the sensor has stopped seeing it.
  'threat-lidar-blinding': threat(['triangle', 0, 460, 0.073, 988, 494, 0.5], ['lowpass', 120, 440, 0.11, 2000, 90, 0.3]),

  // A clean three note figure, three times: true, then with its top note
  // wrong, then wrong all through. One bad sample, and it spreads.
  'threat-training-data-poisoning': threat(
    ...[523, 659, 784, 523, 659, 831, 554, 698, 831].map((hz, i): Part => ['triangle', i * 70, 140, 0.151, hz]),
  ),

  // A heartbeat, twice, low and inside: something alive in the hardware
  // that was not put there by its maker.
  'threat-supply-chain-implant': threat(
    ...[0, 520].flatMap((t): Part[] => [['triangle', t, 130, 0.334, 330, 80], ['triangle', t + 160, 150, 0.268, 280, 70]]),
  ),

  // A two note handshake, and the same handshake answered in a rougher
  // voice and the wrong key: a station that is not yours taking the call.
  'threat-rogue-ground-station': threat(
    ['square', 0, 110, 0.163, 784],
    ['square', 100, 130, 0.163, 1047],
    ['sawtooth', 300, 110, 0.163, 740],
    ['sawtooth', 400, 140, 0.163, 932],
  ),

  // One chirp of data and its full stop, then the same again, and again,
  // exactly: yesterday's good telemetry, played back as today's.
  'threat-telemetry-replay': threat(
    ...[0, 240, 480].flatMap((t): Part[] => [['square', t, 90, 0.132, 1100, 1900], ['square', t + 100, 80, 0.132, 1480]]),
  ),

  // A soft high ping, and the same ping again a moment later, fainter and
  // a shade flat: the downlink arriving somewhere else as well.
  'threat-downlink-eavesdropping': threat(['sine', 0, 300, 0.166, 1568], ['sine', 210, 380, 0.083, 1568, 1540]),

  // A fast run of data tones falling from the top of the register to the
  // bottom without a pause: what was on the link, draining away.
  'threat-backhaul-exfil': threat(...Array.from({ length: 8 }, (_, i): Part => ['square', i * 55, 65, 0.111, 2093 * 0.82 ** i])),

  // Two heavy bolts going home, each lower than the last, and a low buzz
  // that holds: the station locked, and staying locked.
  'threat-ground-ransomware': threat(
    ['sawtooth', 0, 160, 0.18, 294, 147],
    ['lowpass', 0, 70, 0.27, 900],
    ['sawtooth', 180, 160, 0.18, 220, 110],
    ['sawtooth', 360, 400, 0.108, 123, 123, 0.5],
  ),

  // A friendly two note chime, the kind a real message makes, and a third
  // note that comes in flat, buzzing and sinking: the message was bait.
  'threat-ops-phishing': threat(['triangle', 0, 220, 0.154, 880], ['triangle', 150, 240, 0.154, 1319], ['sawtooth', 340, 420, 0.086, 1245, 1047, 0.35]),

  // A soft door latch, a pause, and a short quiet run of notes going down:
  // somebody with a key, leaving with the data.
  'threat-insider-exfil': threat(
    ['lowpass', 0, 40, 0.166, 1800],
    ['sine', 0, 70, 0.124, 260, 130],
    ...[1175, 988, 784, 587].map((hz, i): Part => ['triangle', 240 + i * 70, 90, 0.216, hz]),
  ),

  // A low ping that comes round again sooner each time and higher each
  // time: something on a crossing orbit, closing.
  'threat-debris-conjunction': threat(...[0, 240, 420, 550, 640, 700].map((t, i): Part => ['triangle', t, 90, 0.238, 330 * 1.122 ** i])),
}
