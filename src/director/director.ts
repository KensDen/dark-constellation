// The director (game-feel brief section 3, Round 2). Plays a derived beat
// list as a timed sequence over the presented state. It decides only when
// and how the player sees the turn the engine already resolved: it never
// touches the engine, never blocks game logic, and always ends on the
// engine's real after-state. Framework-agnostic; the scheduler is injected
// so node tests drive it without timers.

import type { GameState } from '../engine/types'
import { VISUAL_MS, visualFor } from './cues'
import { applyPatch } from './patch'
import type { Beat } from './types'

export type Speed = '1x' | '2x' | 'instant'
export const SPEEDS: Speed[] = ['1x', '2x', 'instant']
export const SPEED_LABEL: Record<Speed, string> = { '1x': '1x', '2x': '2x', instant: 'INSTANT' }

// Dwell per visible beat at 1x. The brief's playtest bar wants a normal
// turn's adversary phase under about 12 seconds; a busy turn is eight to
// ten visible beats. Tuned in Round 7.
export const BEAT_DWELL_MS = 1200
const SPEED_DIVISOR: Record<Speed, number> = { '1x': 1, '2x': 2, instant: 0 }

// The spend a beat carries that the player asked for. Keyed on the beat
// kind rather than on the sign of the patch, so a future beat that costs
// credits without being a purchase is not quietly excused.
export function chosenCreditsOf(beat: Beat): number {
  if (beat.kind !== 'procurement') return 0
  const credits = beat.patch.credits ?? 0
  return credits < 0 ? -credits : 0
}

// How long the beat's own treatment needs. The dwell is a floor on
// reading time, not a ceiling on the cue: at 2x the dwell is 600ms while
// the BLACKOUT CHAIN and the arrival light declare 900ms, so the two
// signature cues of the round were being replaced a third of the way from
// the end. Speed changes how fast the turn reads, not how fast an
// animation plays.
export function beatCueMs(beat: Beat): number {
  const visual = visualFor(beat.cueKey, beat.kind)
  return visual ? VISUAL_MS[visual] ?? 0 : 0
}

export const PLAYBACK_SPEED_KEY = 'dc-playback-speed'

export const isSpeed = (v: unknown): v is Speed => typeof v === 'string' && (SPEEDS as string[]).includes(v)

// Default speed: a stored preference wins; otherwise reduced motion selects
// instant (brief section 3), and everyone else gets 1x.
export function defaultSpeed(reducedMotion: boolean, stored?: unknown): Speed {
  if (isSpeed(stored)) return stored
  return reducedMotion ? 'instant' : '1x'
}

export function loadSpeedPreference(): unknown {
  try {
    return localStorage.getItem(PLAYBACK_SPEED_KEY)
  } catch {
    return undefined
  }
}

export function saveSpeedPreference(speed: Speed): void {
  try {
    localStorage.setItem(PLAYBACK_SPEED_KEY, speed)
  } catch {
    // no storage: the preference lasts the session only
  }
}

export type Cancel = () => void
export type Scheduler = (fn: () => void, ms: number) => Cancel

const defaultScheduler: Scheduler = (fn, ms) => {
  const id = setTimeout(fn, ms)
  return () => clearTimeout(id)
}

export interface DirectorSnapshot {
  status: 'playing' | 'done'
  speed: Speed
  // Index of the beat currently shown, or -1 before the first and
  // beats.length once done.
  index: number
  beat: Beat | null
  // Position among visible beats, for "beat 3 of 9".
  visiblePosition: number
  visibleTotal: number
  presented: GameState
  // Credits spent by the player's own purchases in the patches applied
  // since the previous emit. The procurement beat is silent bookkeeping,
  // so its spend arrives folded into the next visible beat; without this
  // the ticker reads the player's own buy as damage.
  chosenCredits: number
}

export interface DirectorOptions {
  speed: Speed
  schedule?: Scheduler
  dwellMs?: number
  // Injected so a test can drive the dwell floor without the registry.
  cueMs?: (beat: Beat) => number
}

export class Director {
  readonly beats: Beat[]
  private readonly after: GameState
  private readonly schedule: Scheduler
  private readonly dwellMs: number
  private readonly cueMs: (beat: Beat) => number
  private speed: Speed
  private index = -1
  private presented: GameState
  private status: 'playing' | 'done' = 'playing'
  private cancelTimer: Cancel | null = null
  private paused = false
  private chosenCredits = 0
  private listeners = new Set<() => void>()
  private readonly visibleTotal: number

  constructor(before: GameState, after: GameState, beats: Beat[], opts: DirectorOptions) {
    this.beats = beats
    this.after = after
    this.schedule = opts.schedule ?? defaultScheduler
    this.dwellMs = opts.dwellMs ?? BEAT_DWELL_MS
    this.cueMs = opts.cueMs ?? beatCueMs
    this.speed = opts.speed
    this.presented = before
    this.visibleTotal = beats.filter((b) => b.visible).length
    if (this.speed === 'instant') this.skip()
    else this.advance()
  }

  snapshot(): DirectorSnapshot {
    const beat = this.index >= 0 && this.index < this.beats.length ? this.beats[this.index] : null
    const visiblePosition = this.beats.slice(0, this.index + 1).filter((b) => b.visible).length
    return {
      status: this.status,
      speed: this.speed,
      index: this.index,
      beat,
      visiblePosition,
      visibleTotal: this.visibleTotal,
      presented: this.presented,
      chosenCredits: this.chosenCredits,
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn()
  }

  private clearTimer(): void {
    if (this.cancelTimer) {
      this.cancelTimer()
      this.cancelTimer = null
    }
  }

  private finish(): void {
    this.clearTimer()
    // Skipping applies every remaining patch at once, so the spend still
    // has to be declared or the jump to the after-state reads as damage.
    this.chosenCredits = 0
    for (let i = this.index + 1; i < this.beats.length; i += 1) this.chosenCredits += chosenCreditsOf(this.beats[i])
    this.index = this.beats.length
    // The engine's own output, by identity, so nothing presented can drift
    // from what was actually resolved.
    this.presented = this.after
    this.status = 'done'
    this.emit()
  }

  private arm(): void {
    this.clearTimer()
    // Hidden means paused (src/ui/cues/visibility.ts): the beat on screen
    // when the phone locked is the beat on screen when it wakes. Tapping
    // still advances, because that is the player asking.
    if (this.status === 'done' || this.speed === 'instant' || this.paused) return
    const divisor = SPEED_DIVISOR[this.speed]
    const beat = this.index >= 0 && this.index < this.beats.length ? this.beats[this.index] : null
    const dwell = Math.max(this.dwellMs / divisor, beat ? this.cueMs(beat) : 0)
    this.cancelTimer = this.schedule(() => {
      this.cancelTimer = null
      this.advance()
    }, dwell)
  }

  // Tap-to-advance and the auto-advance timer both land here: apply the
  // next beat (passing silently over invisible ones), then re-arm.
  advance(): void {
    if (this.status === 'done') return
    this.clearTimer()
    this.chosenCredits = 0
    while (this.index + 1 < this.beats.length) {
      this.index += 1
      const beat = this.beats[this.index]
      this.presented = applyPatch(this.presented, beat.patch)
      this.chosenCredits += chosenCreditsOf(beat)
      if (beat.visible) {
        this.emit()
        this.arm()
        return
      }
    }
    this.finish()
  }

  // Skip at any point: the remaining patches apply at once and the
  // presented state becomes the engine's after-state.
  skip(): void {
    if (this.status === 'done') return
    this.finish()
  }

  // The page went away or came back. Pausing holds the current beat;
  // resuming re-arms from where it stopped rather than catching up, since
  // nothing was missed that the player could have seen.
  setPaused(paused: boolean): void {
    if (paused === this.paused) return
    this.paused = paused
    if (this.status === 'done') return
    if (paused) this.clearTimer()
    else this.arm()
    this.emit()
  }

  setSpeed(speed: Speed): void {
    if (speed === this.speed) return
    this.speed = speed
    if (this.status === 'done') {
      this.emit()
      return
    }
    if (speed === 'instant') {
      this.skip()
      return
    }
    this.arm()
    this.emit()
  }

  dispose(): void {
    this.clearTimer()
    this.listeners.clear()
  }
}
