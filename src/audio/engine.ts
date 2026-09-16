// The audio engine (Round 4d): context lifecycle, the gesture unlock, the
// two buses, and the one decision about whether a cue is allowed to make a
// sound at all.
//
// The rule this module is built around: a cue that is not allowed to play
// SCHEDULES NOTHING. It does not play into a muted gain, and it does not
// queue for later. That is what makes "nothing is audible before a
// gesture" and "muting works" checkable against the audio graph rather
// than against a boolean somebody could leave true, and it is what the
// visibility policy asks for in so many words: do not start while hidden,
// and do not queue what could not be played.
//
// Sound is the third channel of the policy in src/ui/cues/visibility.ts,
// not a fourth thing with its own opinion. Hidden means paused; the
// context suspends with the page and resumes on return, and no beat is
// replayed to catch up, because the player would be hearing the aftermath
// of something they never saw.

import { onVisibilityChange, pageVisible, audioSuspended } from '../ui/cues/visibility'
import { SOUND_MS, type SoundCue } from '../director/cues'
import type { AudioContextLike, GainLike } from './graph'
import { DEFAULT_SOUND_PREFS, loadSoundPrefs, saveSoundPrefs, type SoundPrefs } from './prefs'
import { VOICES, type VoiceOptions } from './voices'

// Starting mix from the brief; Round 7 tunes it against a real playtest.
export const EFFECTS_LEVEL = 1
export const MUSIC_LEVEL = 0.35

// Long enough not to click, short enough to read as "stopped".
export const SILENCE_FADE_S = 0.02

export interface ScheduleState {
  unlocked: boolean
  effects: boolean
  visible: boolean
}

// The whole policy, as a pure function, so the reason a cue did not play
// can be asserted directly. play() below is the only caller, and the suite
// drives play() against a real graph as well: a pure function nobody
// consults is a pin on the spelling of a rule, not a guard on it.
export function shouldSchedule(state: ScheduleState, cue: SoundCue): boolean {
  if (cue === 'silent' || cue === 'placeholder') return false
  return state.unlocked && state.effects && state.visible
}

// Deliberately typed as the REAL AudioContext and returned as
// AudioContextLike, with no cast between them. That return is the only
// thing checking that the interfaces in ./graph.ts still describe the
// browser: casting through `globalThis as { AudioContext?: new () =>
// AudioContextLike }` would compile whatever they said, including a shape
// no browser has, and the suite's fake would agree with it.
function defaultContextFactory(): AudioContextLike | null {
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
  if (typeof Ctor !== 'function') return null
  try {
    return new Ctor()
  } catch {
    return null
  }
}

export interface AudioEngineOptions {
  // Injected so the suite can drive a real graph without a browser, the
  // same way the director takes its Scheduler.
  createContext?: () => AudioContextLike | null
  prefs?: SoundPrefs
  // Injected for the same reason. Defaults to the shared visibility policy.
  isVisible?: () => boolean
  watchVisibility?: boolean
}

export class AudioEngine {
  private ctx: AudioContextLike | null = null
  private effectsBus: GainLike | null = null
  private musicBus: GainLike | null = null
  private prefs: SoundPrefs
  private visible: boolean
  // Every cue in flight, with the time it is due to finish. Each one plays
  // through a gain of its own so it can be silenced without touching the
  // bus, which is what lets SKIP and leaving the screen actually stop a
  // sound rather than only stopping the next one.
  private live: { gain: GainLike; endsAt: number }[] = []
  private readonly createContext: () => AudioContextLike | null
  private stopWatchingVisibility: (() => void) | null = null

  constructor(options: AudioEngineOptions = {}) {
    this.createContext = options.createContext ?? defaultContextFactory
    this.prefs = options.prefs ?? { ...DEFAULT_SOUND_PREFS }
    this.visible = (options.isVisible ?? pageVisible)()
    if (options.watchVisibility !== false) {
      this.stopWatchingVisibility = onVisibilityChange((visible) => this.setVisible(visible))
    }
  }

  get unlocked(): boolean {
    return this.ctx !== null
  }

  get preferences(): SoundPrefs {
    return { ...this.prefs }
  }

  // Exposed for the suite and for the dev sound board, both of which need
  // to look at the graph rather than at a claim about it.
  get context(): AudioContextLike | null {
    return this.ctx
  }

  // The first gesture, and only a real one: browsers refuse to start a
  // context otherwise, and starting one from script would be a context
  // stuck in 'suspended' that quietly swallows every cue after it.
  unlock(): void {
    if (this.ctx) {
      // A context can be suspended again by the browser after an unlock
      // (returning from a locked phone, a backgrounded tab), so a later
      // gesture is a chance to bring it back rather than a no-op.
      if (this.visible) void this.ctx.resume()
      return
    }
    const ctx = this.createContext()
    if (!ctx) return
    this.ctx = ctx
    this.effectsBus = ctx.createGain()
    this.effectsBus.gain.value = EFFECTS_LEVEL
    this.effectsBus.connect(ctx.destination)
    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = MUSIC_LEVEL
    this.musicBus.connect(ctx.destination)
    // Round 6 hangs the procedural bed off musicBus. Nothing plays into it
    // yet, which is why only the toggle ships this round.
    if (!this.visible) void ctx.suspend()
  }

  setPreferences(prefs: SoundPrefs, persist = true): void {
    this.prefs = { ...prefs }
    if (persist) saveSoundPrefs(this.prefs)
    if (this.musicBus) this.musicBus.gain.value = prefs.music ? MUSIC_LEVEL : 0
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    if (!this.ctx) return
    if (audioSuspended(visible)) void this.ctx.suspend()
    else void this.ctx.resume()
  }

  // Returns whether the cue was scheduled, so a caller that cares (the dev
  // sound board) can say why nothing happened.
  play(cue: SoundCue, opts: VoiceOptions = {}): boolean {
    if (!shouldSchedule({ unlocked: this.unlocked, effects: this.prefs.effects, visible: this.visible }, cue)) {
      return false
    }
    const ctx = this.ctx
    const bus = this.effectsBus
    if (!ctx || !bus) return false
    const voice = VOICES[cue]
    if (!voice) return false
    const now = ctx.currentTime
    this.reap(now)
    // A gain per cue, between the voice and the bus. The alternative is
    // fire and forget, which is what this was: a scheduled voice could not
    // be stopped by anything, so pressing SKIP 300ms into the BLACKOUT
    // CHAIN still delivered its static burst 570ms later, over whatever
    // screen the player had moved to. The bus cannot be used for this
    // because turning the bus down would take every later cue with it.
    const cueGain = ctx.createGain()
    cueGain.gain.value = 1
    cueGain.connect(bus)
    voice(ctx, cueGain, now, opts)
    this.live.push({ gain: cueGain, endsAt: now + SOUND_MS[cue] / 1000 })
    return true
  }

  // Drop the gains of cues that have finished. Called on each play rather
  // than on a timer, so nothing is scheduled just to tidy up.
  private reap(now: number): void {
    const keep: typeof this.live = []
    for (const entry of this.live) {
      if (entry.endsAt <= now) entry.gain.disconnect()
      else keep.push(entry)
    }
    this.live = keep
  }

  // Stop everything in flight. Faded over SILENCE_FADE_S rather than cut,
  // because an instant change to zero clicks. Used when playback is
  // skipped or the view carrying it goes away.
  silenceAll(): void {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    for (const entry of this.live) {
      entry.gain.gain.setValueAtTime(entry.gain.gain.value, now)
      entry.gain.gain.linearRampToValueAtTime(0, now + SILENCE_FADE_S)
      entry.endsAt = now + SILENCE_FADE_S
    }
  }

  dispose(): void {
    for (const entry of this.live) entry.gain.disconnect()
    this.live = []
    this.stopWatchingVisibility?.()
    this.stopWatchingVisibility = null
    this.effectsBus?.disconnect()
    this.musicBus?.disconnect()
    this.effectsBus = null
    this.musicBus = null
    const ctx = this.ctx
    this.ctx = null
    if (ctx) void ctx.close()
  }
}

// The app's one engine. A module singleton rather than a React context:
// the unlock listener has to live outside the tree anyway (the first
// gesture can land on any control, including ones that unmount), and a
// second engine would mean a second context and a second unlock.
let shared: AudioEngine | null = null

export function getAudioEngine(): AudioEngine {
  if (!shared) shared = new AudioEngine({ prefs: loadSoundPrefs() })
  return shared
}

export function resetAudioEngineForTests(): void {
  shared?.dispose()
  shared = null
}

const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const

// Listens once for the first real gesture anywhere in the document and
// unlocks. Returns an uninstall, and uninstalls itself on the first
// gesture, so the listeners are not carried for the life of the session.
//
// CAPTURE PHASE, and that is the whole point of the argument. A bubbling
// listener runs after the event has reached its target, which means the
// control the player actually pressed has already run its own handler and
// asked for a sound that no context existed to play: the first press of a
// session was silent, and only the first, which is the hardest kind of
// thing to notice by hand. Capture runs before any target handler, so the
// gesture that unlocks the context is also the gesture that gets to use
// it. Found by tests/sound.dom.spec.tsx, and unstateable as a source pin:
// it is a fact about dispatch order, not about this file's text.
//
// Still inside the user activation either way, so the autoplay policy is
// satisfied in both phases; only the ordering differs.
export function installGestureUnlock(engine: AudioEngine = getAudioEngine()): () => void {
  if (typeof document === 'undefined') return () => {}
  let removed = false
  const onGesture = () => {
    engine.unlock()
    uninstall()
  }
  const uninstall = () => {
    if (removed) return
    removed = true
    for (const type of GESTURES) document.removeEventListener(type, onGesture, true)
  }
  for (const type of GESTURES) document.addEventListener(type, onGesture, true)
  return uninstall
}
