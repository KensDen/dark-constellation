// The procedural music bed (Round 6b, brief section 7).
//
// Synthesized like the effects, so there is no file, no fetch, no licence
// and no seam: a slow pad from two detuned oscillators through a low-pass
// filter whose cutoff a very slow LFO moves, plus sparse pentatonic notes
// on long random intervals. It loops by construction because it never
// loops: nothing repeats, so there is nothing for the player to catch.
//
// THE FOURTH CHANNEL. The visibility policy in src/ui/cues/visibility.ts
// governs the director, the count-up and effects; music is the fourth
// thing that would otherwise guess. It answers the same way effects do and
// for the same reason: a bed that is not allowed to play SCHEDULES
// NOTHING, so "no music before a gesture", "the toggle works" and "a
// hidden page is silent" are all checkable against the graph rather than
// against a boolean. A hidden page does not start the bed and does not
// queue one, and the context suspending on hide stops the pad mid-note
// exactly as it stops a cue mid-envelope.
//
// REDUCED MOTION DOES NOTHING HERE, and that is a decision rather than an
// oversight. `prefers-reduced-motion` is a motion preference; the brief
// says in so many words that sound is unaffected by it unless muted, and
// Round 4e's whole correction was that conflating a motion preference with
// an information or audio preference is what silenced a reduced-motion
// player for a whole campaign. A slow filter sweep is not motion in the
// sense the preference means, and nothing here renders. The music toggle
// is the control for someone who does not want music, it is separate from
// the effects toggle precisely so it can be refused on its own, and
// tests/music.spec.ts asserts the graph is identical with the preference
// set rather than leaving that to this comment.

import { DUCKS_MUSIC, SOUND_MS, type SoundCue } from '../director/cues'
import { maiScore } from '../engine/scoring'
import type { GameState } from '../engine/types'
import type { AudioContextLike, AudioNodeLike, GainLike } from './graph'
import { defaultMusicRng, type MusicRng } from './musicRng'

// The same shape as the director's Scheduler, declared here rather than
// imported from it. Importing would pull the Director class and its own
// imports into this module's graph for a two-line type, and this module's
// graph is the thing tests/music.spec.ts walks.
export type MusicScheduler = (fn: () => void, ms: number) => () => void

const defaultScheduler: MusicScheduler = (fn, ms) => {
  const id = setTimeout(fn, ms)
  return () => clearTimeout(id)
}

// Layers fade over about two seconds and never hard-cut (brief section 7).
// The bed fades in over the same span on start, so arriving at the game is
// not a pad appearing at full level.
export const CROSSFADE_S = 2

// Ducking. The bed steps back to a quarter of its mix quickly, holds while
// the cue plays, and comes back slowly, because the return is the part a
// listener would notice if it were fast.
export const DUCK_FACTOR = 0.25
export const DUCK_ATTACK_S = 0.12
export const DUCK_RELEASE_S = 0.6

// How long the bed takes to get out of the way when it is switched off or
// torn down. The effects side has SILENCE_FADE_S for exactly this reason:
// an instantaneous change to zero on a sounding node clicks. Longer here
// than for a cue, because three pads dropping out at once is a bigger
// discontinuity than one short envelope ending early.
export const LEVEL_FADE_S = 0.18

// Sparse, long intervals: the notes are punctuation, not a melody.
export const NOTE_GAP_MIN_MS = 6000
export const NOTE_GAP_MAX_MS = 16000
export const NOTE_MS = 2600
export const NOTE_LEVEL = 0.16

// A minor pentatonic, which is the scale that cannot make a wrong interval
// against a drone on its root. Hz rather than note names because nothing
// else in this file thinks in note names.
export const PENTATONIC_HZ = [220, 261.63, 293.66, 329.63, 392, 440] as const

export type MusicLayerName = 'base' | 'tension' | 'threat'

// What the bed needs to know about the game, and nothing else. Built by
// musicStateFrom below so that the shape of a GameState is read in one
// place; the layer predicates take this rather than a GameState so they
// are drivable from a table in the suite without constructing a campaign.
export interface MusicState {
  mai: number
  // The scenario's own winning line, NOT a 70 written down here. The brief
  // says "MAI below 70" and firstLight's winThreshold is 70, which is the
  // kind of coincidence that becomes a bug the first time a scenario sets
  // a different one (principle 7: presentation never mirrors an engine
  // number it could import).
  threshold: number
  conditions: number
  chainArmed: boolean
  resolvingLoss: boolean
}

export interface MusicLayerDef {
  readonly name: MusicLayerName
  // Why this layer exists, in the brief's own terms, so the registry
  // carries the reason and the report does not have to.
  readonly why: string
  readonly active: (state: MusicState) => boolean
  // The voice. Two oscillators a little apart in Hz, through a low-pass
  // the LFO moves around `cutoff` by `lfoDepth`.
  readonly rootHz: number
  readonly detuneHz: number
  readonly wave: string
  readonly cutoffHz: number
  readonly q: number
  readonly lfoHz: number
  readonly lfoDepthHz: number
  readonly level: number
}

// The registry, and the only place the three layers are named. Everything
// downstream walks this: the bed builds one voice per entry, update() sets
// one gain per entry, and the suite asserts one row per entry rather than
// restating three names of its own (principle 17).
export const MUSIC_LAYERS: readonly MusicLayerDef[] = [
  {
    name: 'base',
    why: 'always',
    active: () => true,
    rootHz: 55,
    detuneHz: 0.7,
    wave: 'sine',
    cutoffHz: 420,
    q: 1.8,
    lfoHz: 0.06,
    lfoDepthHz: 160,
    level: 0.9,
  },
  {
    name: 'tension',
    why: 'MAI below the scenario threshold, or any condition active',
    active: (s) => s.mai < s.threshold || s.conditions > 0,
    // A fifth above the base root, so it sits on the drone rather than
    // beside it.
    rootHz: 82.41,
    detuneHz: 1.1,
    wave: 'triangle',
    cutoffHz: 620,
    q: 3.5,
    lfoHz: 0.09,
    lfoDepthHz: 260,
    level: 0.55,
  },
  {
    name: 'threat',
    why: 'BLACKOUT CHAIN armed, or a loss resolving',
    active: (s) => s.chainArmed || s.resolvingLoss,
    // A whole step below the base root: the one interval in here that is
    // meant to sound wrong.
    rootHz: 49,
    detuneHz: 1.6,
    wave: 'sawtooth',
    cutoffHz: 300,
    q: 6,
    lfoHz: 0.13,
    lfoDepthHz: 220,
    level: 0.5,
  },
]

// What plays when there is no campaign: the start screen, the menus, the
// glossary. Base only, by construction rather than by a flag, because
// `100 < 0` is false and no condition, chain or loss exists off a
// campaign. The threshold is 0 rather than the scenario's, so this
// constant contains no copy of a number the content data owns.
export const MENU_MUSIC_STATE: MusicState = {
  mai: 100,
  threshold: 0,
  conditions: 0,
  chainArmed: false,
  resolvingLoss: false,
}

export function musicStateFrom(state: GameState): MusicState {
  return {
    mai: maiScore(state),
    threshold: state.scenario.winThreshold,
    conditions: state.conditions.length,
    chainArmed: state.flags.lidarFallback,
    resolvingLoss: state.status === 'lost',
  }
}

// The gate, as a pure function, exactly as shouldSchedule is for effects.
// Same three questions, same order, and the same rule that a "no" means
// nothing is built rather than something built and silenced.
export interface MusicGateState {
  unlocked: boolean
  music: boolean
  visible: boolean
}

export function shouldPlayMusic(state: MusicGateState): boolean {
  return state.unlocked && state.music && state.visible
}

export interface MusicBedOptions {
  rng?: MusicRng
  schedule?: MusicScheduler
}

interface Fade {
  from: number
  to: number
  startedAt: number
  endsAt: number
}

interface LiveNote {
  node: AudioNodeLike
  endsAt: number
}

// One bed, hung off the engine's music bus. It owns its own oscillators
// for the life of a session: a pad is not a cue, so it is started once and
// its gains move, rather than being rebuilt whenever the state changes.
export class MusicBed {
  private readonly gains = new Map<MusicLayerName, GainLike>()
  // The fade each layer is on, as this class scheduled it: where it came
  // from, where it is going, and when.
  //
  // THE ROUND'S CRITICAL DEFECT, TWICE. The first version wrote
  // `gain.gain.value = target` after scheduling the ramp, believing
  // `.value` to be an inert field. It is not: the spec defines assigning
  // it as setValueAtTime(value, currentTime), so it planted an event at
  // the ramp's own start instant and collapsed every crossfade into the
  // hard cut section 7 forbids by name.
  //
  // The fix for that replaced the write with a Map of TARGETS and read
  // `from` out of it, which was wrong in the other direction and was
  // caught by the re-review. A target is where a layer is HEADING, not
  // where it IS. Beats land every 1200ms against a 2000ms crossfade, so a
  // ramp interrupted in flight is the normal case: anchoring at the target
  // jumps a layer being removed UP to full before fading it, and drops a
  // layer being restored to silence before swelling it back.
  //
  // So this records the whole fade and layerValueAt interpolates it, which
  // is the technique busValueAt already used for the bus. The two halves
  // of the same problem now use the same answer.
  private readonly fades = new Map<MusicLayerName, Fade>()
  private readonly owned: AudioNodeLike[] = []
  private readonly rng: MusicRng
  private readonly schedule: MusicScheduler
  private cancelNote: (() => void) | null = null
  private cancelTeardown: (() => void) | null = null
  // Nodes that are fading out and have not been released yet. Held apart
  // from `owned` so a dispose arriving mid-fade can still find them: the
  // first version spliced them into a local and dispose then iterated an
  // empty list, leaving the whole graph connected.
  private retiring: AudioNodeLike[] = []
  private notes: LiveNote[] = []
  // The duck currently scheduled on the bus, as this class scheduled it.
  // Kept as the whole shape rather than a single deadline because the bus
  // spends DUCK_ATTACK_S and DUCK_RELEASE_S on RAMPS, and a second cue
  // landing inside either window needs to know where the bus actually is.
  // The first version tracked one deadline and answered with a two-valued
  // step function, so a cue arriving during the release re-anchored the
  // bus at FULL level and the bed jumped up before diving again.
  private duck_: { startedAt: number; releaseAt: number; endsAt: number } | null = null
  private started = false

  private readonly ctx: AudioContextLike
  private readonly bus: GainLike
  // The music mix level the bus sits at when nothing is ducking it. Passed
  // in rather than imported so the bed has no opinion about the toggle:
  // zero here is what "music off" looks like from in here.
  private level: number

  constructor(ctx: AudioContextLike, bus: GainLike, level: number, options: MusicBedOptions = {}) {
    this.ctx = ctx
    this.bus = bus
    this.level = level
    this.rng = options.rng ?? defaultMusicRng()
    this.schedule = options.schedule ?? defaultScheduler
  }

  get running(): boolean {
    return this.started
  }

  // Exposed for the suite and the dev sound board: the guarantee is about
  // the graph, so the graph is what is inspectable.
  layerGain(name: MusicLayerName): GainLike | undefined {
    return this.gains.get(name)
  }

  start(state: MusicState): void {
    if (this.started) return
    this.started = true
    const now = this.ctx.currentTime
    for (const layer of MUSIC_LAYERS) {
      const gain = this.buildLayer(layer, now)
      this.gains.set(layer.name, gain)
      // Every layer starts at silence and is ramped up from there by the
      // call below, so the bed fades in rather than arriving at level.
      this.fades.set(layer.name, { from: 0, to: 0, startedAt: now, endsAt: now })
    }
    this.applyLayers(state, now)
    this.scheduleNextNote()
  }

  private buildLayer(layer: MusicLayerDef, now: number): GainLike {
    const gain = this.ctx.createGain()
    gain.gain.value = 0
    gain.connect(this.bus)
    this.owned.push(gain)

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = layer.cutoffHz
    filter.Q.value = layer.q
    filter.connect(gain)
    this.owned.push(filter)

    // The LFO. It connects to the filter's frequency PARAM, not to a node:
    // it is never heard, it only moves the cutoff. Its own depth gain is
    // what turns a unit oscillator into a swing of lfoDepthHz.
    const lfo = this.ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = layer.lfoHz
    const depth = this.ctx.createGain()
    depth.gain.value = layer.lfoDepthHz
    lfo.connect(depth)
    depth.connect(filter.frequency)
    lfo.start(now)
    this.owned.push(lfo, depth)

    // Two oscillators a little apart, which is the whole of why a pad
    // sounds like a pad: the beating between them is the movement.
    //
    // They SHARE the layer's level rather than each taking it. Two unity
    // oscillators summed into a gain chosen as if there were one puts the
    // three layers together past full scale, so the loudest state of the
    // game, a losing campaign with the chain armed and all three layers
    // up, would be delivered clipped. Derived from the array rather than
    // written as 0.5, so a third voice stays in range without an edit.
    const voices = [0, layer.detuneHz]
    const share = this.ctx.createGain()
    share.gain.value = 1 / voices.length
    share.connect(filter)
    this.owned.push(share)
    for (const offset of voices) {
      const osc = this.ctx.createOscillator()
      osc.type = layer.wave
      osc.frequency.value = layer.rootHz + offset
      osc.connect(share)
      osc.start(now)
      this.owned.push(osc)
    }
    return gain
  }

  // The state changed: move every layer toward where this state puts it.
  // Ramped over CROSSFADE_S, never set: a hard cut is the one thing the
  // brief forbids by name.
  update(state: MusicState): void {
    if (!this.started) return
    this.applyLayers(state, this.ctx.currentTime)
  }

  private applyLayers(state: MusicState, now: number): void {
    for (const layer of MUSIC_LAYERS) {
      const gain = this.gains.get(layer.name)
      if (!gain) continue
      const target = layer.active(state) ? layer.level : 0
      // Already going there: leave the ramp in flight alone rather than
      // restarting it from wherever it has reached, which would stretch
      // every crossfade out over the whole turn as beats kept arriving.
      if (this.fades.get(layer.name)?.to === target) continue
      const from = this.layerValueAt(layer.name, now)
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(from, now)
      gain.gain.linearRampToValueAtTime(target, now + CROSSFADE_S)
      this.fades.set(layer.name, { from, to: target, startedAt: now, endsAt: now + CROSSFADE_S })
    }
  }

  // Where a layer's gain actually is at `t`, interpolated from the fade
  // this class scheduled. Exact, because nothing else writes these params.
  private layerValueAt(name: MusicLayerName, t: number): number {
    const f = this.fades.get(name)
    if (!f) return 0
    if (t <= f.startedAt) return f.from
    if (t >= f.endsAt) return f.to
    return f.from + (f.to - f.from) * ((t - f.startedAt) / (f.endsAt - f.startedAt))
  }

  // Step back under a cue that owns the moment. The set of such cues is
  // DUCKS_MUSIC, which is total over SoundCue, so this function names no
  // cue at all and a new voice cannot join the game without deciding.
  duck(cue: SoundCue): void {
    if (!this.started || this.level <= 0) return
    if (!DUCKS_MUSIC[cue]) return
    const now = this.ctx.currentTime
    const bottom = this.level * DUCK_FACTOR
    // The later of this cue's end and any duck already in flight, so two
    // overlapping fanfares hold the bed down once rather than letting the
    // shorter one lift it under the longer one.
    const releaseAt = Math.max(now + SOUND_MS[cue] / 1000, this.duck_?.releaseAt ?? 0)
    const from = this.busValueAt(now)
    this.bus.gain.cancelScheduledValues(now)
    this.bus.gain.setValueAtTime(from, now)
    this.bus.gain.linearRampToValueAtTime(bottom, now + DUCK_ATTACK_S)
    this.bus.gain.setValueAtTime(bottom, releaseAt)
    this.bus.gain.linearRampToValueAtTime(this.level, releaseAt + DUCK_RELEASE_S)
    this.duck_ = { startedAt: now, releaseAt, endsAt: releaseAt + DUCK_RELEASE_S }
  }

  // Where the bus actually is at `t`, computed from the schedule this
  // class wrote rather than read back off the param.
  //
  // Reading is not an option: AudioParam.value is the last value ASSIGNED,
  // not the value automation currently has, and assigning it is itself an
  // automation event (see `targets` above). Computing is exact here
  // because nothing else writes this param while a duck is in flight.
  private busValueAt(t: number): number {
    const d = this.duck_
    if (!d) return this.level
    const bottom = this.level * DUCK_FACTOR
    if (t >= d.endsAt || t <= d.startedAt) return this.level
    const attackEndsAt = Math.min(d.startedAt + DUCK_ATTACK_S, d.releaseAt)
    if (t < attackEndsAt) {
      const through = (t - d.startedAt) / (attackEndsAt - d.startedAt)
      return this.level + (bottom - this.level) * through
    }
    if (t < d.releaseAt) return bottom
    const through = (t - d.releaseAt) / DUCK_RELEASE_S
    return bottom + (this.level - bottom) * through
  }

  // The toggle moved, or the mix changed. The bus is the music level and
  // the bed does not argue with it; a duck in flight is abandoned, because
  // returning to the old level would undo the change that just happened.
  setLevel(level: number): void {
    const now = this.ctx.currentTime
    // Anchor at where the bus really is before moving it, so abandoning a
    // duck in flight is a short fade rather than a jump, and RAMP to the
    // new level rather than stepping: three pads cut to zero at once is
    // the loudest click the game can make, and it used to happen on every
    // press of the music toggle.
    const from = this.busValueAt(now)
    this.level = level
    this.duck_ = null
    this.bus.gain.cancelScheduledValues(now)
    this.bus.gain.setValueAtTime(from, now)
    this.bus.gain.linearRampToValueAtTime(level, now + LEVEL_FADE_S)
  }

  private scheduleNextNote(): void {
    const gap = this.rng.between(NOTE_GAP_MIN_MS, NOTE_GAP_MAX_MS)
    this.cancelNote = this.schedule(() => {
      this.playNote()
      this.scheduleNextNote()
    }, gap)
  }

  private playNote(): void {
    if (!this.started) return
    const now = this.ctx.currentTime
    this.reapNotes(now)
    const hz = this.rng.pick(PENTATONIC_HZ)
    const seconds = NOTE_MS / 1000
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = hz
    const env = this.ctx.createGain()
    env.gain.value = 0
    env.gain.setValueAtTime(0, now)
    // A third of the note rising, the rest falling away: a bell that was
    // struck softly rather than a note that was played.
    env.gain.linearRampToValueAtTime(NOTE_LEVEL, now + seconds / 3)
    env.gain.linearRampToValueAtTime(0, now + seconds)
    osc.connect(env)
    env.connect(this.bus)
    osc.start(now)
    osc.stop(now + seconds)
    this.notes.push({ node: env, endsAt: now + seconds })
  }

  private reapNotes(now: number): void {
    const keep: LiveNote[] = []
    for (const note of this.notes) {
      if (note.endsAt <= now) note.node.disconnect()
      else keep.push(note)
    }
    this.notes = keep
  }

  // Take the bed down over LEVEL_FADE_S rather than at once.
  //
  // Every path that removes a bed goes through here: the music toggle, the
  // page going hidden, and dispose. All three used to be an instantaneous
  // drop from full mix to zero on three sounding pads, which is the same
  // discontinuity SILENCE_FADE_S exists to prevent on the effects side.
  // The oscillators are told to stop at the END of the fade and the graph
  // is released after it, through the injected scheduler so the suite can
  // drive it.
  stop(): void {
    if (!this.started && this.owned.length === 0) return
    this.cancelNote?.()
    this.cancelNote = null
    this.started = false
    const now = this.ctx.currentTime
    const endsAt = now + LEVEL_FADE_S
    const duckInFlight = this.duck_ !== null && now < this.duck_.endsAt
    for (const layer of MUSIC_LAYERS) {
      const gain = this.gains.get(layer.name)
      if (!gain) continue
      gain.gain.cancelScheduledValues(now)
      // Where it IS, not where it was heading. Anchoring at the target
      // made a stop inside a crossfade blip the bed up to full level
      // before fading, or cut a fading layer to silence in one sample:
      // the same defect as applyLayers had, in the one method whose whole
      // purpose is to avoid a discontinuity.
      gain.gain.setValueAtTime(this.layerValueAt(layer.name, now), now)
      gain.gain.linearRampToValueAtTime(0, endsAt)
    }
    this.fades.clear()
    // The bus belongs to the engine and outlives this bed, so a duck in
    // flight is handed back rather than left on the shared param for
    // whatever bed comes next to inherit. ONLY when one is in flight: on
    // the mute path setLevel has already re-anchored this param, and
    // cancelling here took its fade out with it.
    if (duckInFlight) {
      this.bus.gain.cancelScheduledValues(now)
      this.bus.gain.setValueAtTime(this.busValueAt(now), now)
      this.bus.gain.linearRampToValueAtTime(this.level, endsAt)
    }
    this.duck_ = null
    this.cancelTeardown?.()
    this.retiring.push(...this.owned.splice(0, this.owned.length), ...this.notes.map((n) => n.node))
    this.notes = []
    this.gains.clear()
    this.cancelTeardown = this.schedule(() => {
      this.cancelTeardown = null
      this.release(endsAt)
    }, LEVEL_FADE_S * 1000)
  }

  private release(stopAt: number): void {
    for (const node of this.retiring) {
      const osc = node as { stop?: (when: number) => void }
      if (typeof osc.stop === 'function') osc.stop(stopAt)
      node.disconnect()
    }
    this.retiring = []
  }

  // Drop everything now, fade or no fade. Used when the engine is going
  // away entirely and there is nothing left to hear the fade with.
  dispose(): void {
    this.stop()
    this.cancelTeardown?.()
    this.cancelTeardown = null
    this.release(this.ctx.currentTime)
  }
}
