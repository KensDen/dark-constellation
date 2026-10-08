// What would have helped against a threat that landed, in two forms
// (critique row M3). The sentence used to render only inside the
// aftermath's collapsed turn ledger, which is open by default only at
// INSTANT speed, so most players never read the one line that names the
// defense they were missing. `full` is that sentence, still the ledger's;
// `short` is the line the hit card and the verdict carry, where the player
// is looking. Naming the defense against a threat the player has met is
// the earned answer key of ruling R1 (4 October 2026).
//
// Each defense's worth is the v1.3 mitigation rule (brief 6.1 and 6.7):
// the primary takes PRIMARY_MITIGATION off, each other one
// SECONDARY_MITIGATION. The tiers and the paid SSA burn that used to gate
// a defense left in v1.3 Round 0; the debris is a call, not an attack.
//
// Kept free of React, so the node battery reads it.

import { BURN_FUEL_CREDITS, PRIMARY_MITIGATION, SECONDARY_MITIGATION, hasRetainer } from '../engine/reducer'
import type { CountermeasureId, GameState, ResolvedEvent, Scenario } from '../engine/types'

const nameOf = (scenario: Scenario, c: CountermeasureId) => scenario.countermeasures.find((x) => x.id === c)?.name ?? c

// The threat's applicable defenses the final state did not own.
// state.counters after resolution reflects what was active.
function missingFor(ev: ResolvedEvent, state: GameState, scenario: Scenario) {
  const def = scenario.events.find((e) => e.id === ev.eventId)
  return { def, missing: def ? def.counters.filter((c) => !state.counters.includes(c)) : [] }
}

// Say in plain words why damage landed and what was missing, with each
// counter's real worth. When everything applicable was owned, say what
// the attack still buys through them rather than blaming base severity.
export function full(ev: ResolvedEvent, state: GameState, scenario: Scenario): string {
  const { def, missing } = missingFor(ev, state, scenario)
  if (!def) return ''
  if (def.effect.special === 'debrisStrike') {
    // The debris call (brief 5.5 item 5): the subscription makes the burn
    // free; nothing makes a hold safe.
    return missing.length > 0
      ? `What would have helped: ${nameOf(scenario, 'ssaManeuver')} (makes the avoidance burn free instead of ${BURN_FUEL_CREDITS} CR).`
      : 'The subscription was owned, so a burn would have moved the satellite clear for nothing. The hold played the odds.'
  }
  if (missing.length > 0) {
    const worth = (c: CountermeasureId): string =>
      `cuts severity by ${def.counters.indexOf(c) === 0 ? PRIMARY_MITIGATION : SECONDARY_MITIGATION}`
    const names = missing.map((c) => `${nameOf(scenario, c)} (${worth(c)})`)
    return `What would have helped: ${names.join('; ')}.`
  }
  // Critique row M8: with every defense owned, the one purchase left is
  // the retainer, so name it. How much faster is read off the scenario,
  // and said as a plain "faster" when it is not a whole number of times;
  // a retune that left it no faster than base would make no claim at all.
  const { base, withIrRetainer } = scenario.recovery
  if (!hasRetainer(state) && withIrRetainer > base) {
    const times = withIrRetainer / base
    const pace = Number.isInteger(times) ? `${TIMES[times] ?? times} times faster` : 'faster'
    return `Every applicable defense was active. The incident response retainer would have recovered the damage ${pace}.`
  }
  return 'Every applicable defense was active. What landed is what the attack buys through them.'
}

const TIMES = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

// The missing defenses by name and nothing else: "Would have helped: A",
// "A or B", "A, B or C". Empty when every applicable defense was owned,
// since what made an owned one inert takes the ledger's sentence to say.
export function short(ev: ResolvedEvent, state: GameState, scenario: Scenario): string {
  const names = missingFor(ev, state, scenario).missing.map((c) => nameOf(scenario, c))
  if (names.length === 0) return ''
  const last = names.pop()
  return `Would have helped: ${names.length > 0 ? `${names.join(', ')} or ${last}` : last}`
}
