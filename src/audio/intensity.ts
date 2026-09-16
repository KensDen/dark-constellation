// How hard a beat hit, as a number between 0 and 1 (Round 4d). The brief
// asks for exactly one varying voice: "Hit stab, pitched by severity".
//
// The ceiling is derived from the deck and the engine's own exported
// constant rather than written down here (principle 7: counts derive from
// data, and presentation never mirrors a private engine number). Raising
// an event's severity in the content data, or the chain bonus in the
// engine, moves this without anyone editing the audio layer.

import { DEFAULT_SCENARIO } from '../content'
import { CHAIN_BONUS } from '../engine/reducer'
import type { Beat } from '../director/types'

// The deck types baseSeverity as a literal union, so this is already a
// number and the filter is about a deck that might one day carry an event
// without one, not about narrowing a type.
const deckMax = Math.max(0, ...DEFAULT_SCENARIO.events.map((e) => Number(e.baseSeverity)).filter(Number.isFinite))

export const MAX_EFFECTIVE_SEVERITY = deckMax + CHAIN_BONUS

// A beat with no severity is not a hit, so it gets the middle of the range
// rather than the bottom: the bottom is what a fully mitigated event
// sounds like, and that difference is the point of the cue.
export const NEUTRAL_INTENSITY = 0.5

export function beatIntensity(beat: Pick<Beat, 'severity'>): number {
  const effective = beat.severity?.effective
  if (typeof effective !== 'number' || !Number.isFinite(effective)) return NEUTRAL_INTENSITY
  if (MAX_EFFECTIVE_SEVERITY <= 0) return NEUTRAL_INTENSITY
  return Math.min(1, Math.max(0, effective / MAX_EFFECTIVE_SEVERITY))
}
