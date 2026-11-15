// THE STOPS RULE AND A MOVE'S NAME (v1.3 brief 5.3, 5.4): which of a
// move's defenses stops it, blunts it or answers it, and the words that
// say so, as pure functions of the deck. The pixel board's TONIGHT card,
// orders card and PROCURE read the rest of this file until the board was
// retired in v2.0 R3; the 3D game's cards, its Dossier and the debrief
// read what is left.

import { PRIMARY_MITIGATION, SECONDARY_MITIGATION, mitigationOf } from '../../engine/rules'
import type { CountermeasureId, GameState, ThreatEvent } from '../../engine/types'

// The defense that answers the debris conjunction: not an attack, so it
// is never mitigated, but SSA makes the burn free (brief 6.6).
const SSA: CountermeasureId = 'ssaManeuver'

// THE STOPS RULE (R6 question 2): a defense stops a move on its own only
// when its own points reach the move's strength (the primary takes
// PRIMARY_MITIGATION, each other SECONDARY_MITIGATION); otherwise it blunts
// it. The debris conjunction is never stopped: no attack, no mitigation,
// so its defense answers the call instead. Every "stops" on a move's card,
// the Dossier and the debrief reads this, so the game says "stops" only
// where its own rule blocks.
export type StopVerb = 'stops' | 'blunts' | 'answers'
export function stopVerb(cm: CountermeasureId, ev: ThreatEvent): StopVerb {
  if (ev.effect.special === 'debrisStrike') return 'answers'
  const i = ev.counters.indexOf(cm)
  const points = i === 0 ? PRIMARY_MITIGATION : i > 0 ? SECONDARY_MITIGATION : 0
  return points >= ev.baseSeverity ? 'stops' : 'blunts'
}

// What the debris call's defense does, said where others say "stops".
export const STOPPED_BY = 'STOPPED BY'
export const ANSWERED_BY = 'ANSWERED BY'
export const BLUNTED_BY = 'BLUNTED BY'
export const SSA_ANSWER = 'exact odds, free burn'

// A move's defenses in its card's and the Dossier's words: the ones
// that block it alone under STOPPED BY, then "also blunts:" the rest; when
// none blocks it alone, BLUNTED BY, and whether together they block it.
export function stoppedByLine(ev: ThreatEvent, scenario: GameState['scenario']): { label: string; text: string } {
  const name = (id: CountermeasureId) => scenario.countermeasures.find((c) => c.id === id)?.name ?? id
  if (ev.effect.special === 'debrisStrike') return { label: ANSWERED_BY, text: `${name(SSA)} (${SSA_ANSWER})` }
  const stops = ev.counters.filter((c) => stopVerb(c, ev) === 'stops').map(name)
  const blunts = ev.counters.filter((c) => stopVerb(c, ev) === 'blunts').map(name)
  if (stops.length) return { label: STOPPED_BY, text: `${stops.join('; ')}${blunts.length ? `; also blunts: ${blunts.join('; ')}` : ''}` }
  const together = mitigationOf(ev, ev.counters) >= ev.baseSeverity
  return { label: BLUNTED_BY, text: `${blunts.join('; ')}${together && blunts.length > 1 ? ' (together they block it)' : ''}` }
}

// A move's name without its gloss: "Uplink jamming" for "Uplink jamming
// (command link denial)".
export const shortName = (ev: Pick<ThreatEvent, 'name'>) => ev.name.split(' (')[0]
