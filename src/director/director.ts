// The director (game-feel brief section 3, Round 2). Plays a derived beat
// list over the presented state. It decides only how the player sees the
// turn the engine already resolved: it never touches the engine, never
// blocks game logic, and always ends on the engine's real after-state.
// Framework-agnostic, so node tests drive it directly.
//
// TAPPED THROUGH since v1.3 Round 0 (brief 5.5): "The cards are tapped
// through. The v1.1 auto-advancing beat director is retired from play:
// dwell timers, speed control and the hold-to-resolve button go." The
// dwell, the speeds, the scheduler and the hidden-page pause went with
// them; a beat stays on screen until the player moves on. Round 3 replaces
// the beats with the hit card, the intel card and the end of turn.

import type { GameState } from '../engine/types'
import { applyPatch } from './patch'
import type { Beat } from './types'

// The spend a beat carries that the player asked for. Keyed on the beat
// kind rather than on the sign of the patch, so a future beat that costs
// credits without being a purchase is not quietly excused.
export function chosenCreditsOf(beat: Beat): number {
  if (beat.kind !== 'procurement') return 0
  const credits = beat.patch.credits ?? 0
  return credits < 0 ? -credits : 0
}

export interface DirectorSnapshot {
  status: 'playing' | 'done'
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

export class Director {
  readonly beats: Beat[]
  private readonly after: GameState
  private index = -1
  private presented: GameState
  private status: 'playing' | 'done' = 'playing'
  private chosenCredits = 0
  private listeners = new Set<() => void>()
  private readonly visibleTotal: number

  constructor(before: GameState, after: GameState, beats: Beat[]) {
    this.beats = beats
    this.after = after
    this.presented = before
    this.visibleTotal = beats.filter((b) => b.visible).length
    this.advance()
  }

  snapshot(): DirectorSnapshot {
    const beat = this.index >= 0 && this.index < this.beats.length ? this.beats[this.index] : null
    const visiblePosition = this.beats.slice(0, this.index + 1).filter((b) => b.visible).length
    return {
      status: this.status,
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

  private finish(): void {
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

  // A tap lands here: apply the next beat, passing silently over
  // invisible ones.
  advance(): void {
    if (this.status === 'done') return
    this.chosenCredits = 0
    while (this.index + 1 < this.beats.length) {
      this.index += 1
      const beat = this.beats[this.index]
      this.presented = applyPatch(this.presented, beat.patch)
      this.chosenCredits += chosenCreditsOf(beat)
      if (beat.visible) {
        this.emit()
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

  dispose(): void {
    this.listeners.clear()
  }
}
