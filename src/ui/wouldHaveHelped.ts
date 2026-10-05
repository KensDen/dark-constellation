// What would have helped against a threat that landed, in two forms
// (critique row M3). The sentence used to render only inside the
// aftermath's collapsed turn ledger, which is open by default only at
// INSTANT speed, so most players never read the one line that names the
// defense they were missing. `full` is that sentence, still the ledger's;
// `short` is the line the hit card and the verdict carry, where the player
// is looking. Naming the defense against a threat the player has met is
// the earned answer key of ruling R1 (4 October 2026); the HARDEN sheet
// still names no threat a defense answers.
//
// Kept free of React, so the node battery reads it.

import {
  CHAIN_BONUS,
  MITIGATION_PER_COUNTER,
  SSA_MITIGATION_BONUS,
  TIER_A_FLEET_SHARE,
} from '../engine/reducer'
import type { CountermeasureId, GameState, ResolvedEvent, Scenario } from '../engine/types'

const nameOf = (scenario: Scenario, c: CountermeasureId) => scenario.countermeasures.find((x) => x.id === c)?.name ?? c

// The threat's applicable defenses the final state did not own.
// state.counters after resolution reflects what was active.
function missingFor(ev: ResolvedEvent, state: GameState, scenario: Scenario) {
  const def = scenario.events.find((e) => e.id === ev.eventId)
  return { def, missing: def ? def.counters.filter((c) => !state.counters.includes(c)) : [] }
}

// Say in plain words why damage landed and what was missing, with each
// counter's real worth. When everything applicable was owned, name the
// gate that made an owned defense inert rather than blaming base
// severity.
export function full(ev: ResolvedEvent, state: GameState, scenario: Scenario): string {
  const { def, missing } = missingFor(ev, state, scenario)
  if (!def) return ''
  if (missing.length > 0) {
    const worth = (c: CountermeasureId): string => {
      if (c === 'ssaManeuver' && def.effect.special === 'debrisStrike') {
        return `cuts severity by ${MITIGATION_PER_COUNTER + SSA_MITIGATION_BONUS} when the maneuver budget is funded`
      }
      if (c === 'sensorFusion' && ev.chainBonus > 0) {
        return `cuts severity by ${MITIGATION_PER_COUNTER} and removes the +${CHAIN_BONUS} chain bonus`
      }
      if (c === 'tierAAttestation') {
        return `cuts severity by ${MITIGATION_PER_COUNTER} once at least a third of the sensored fleet flies Tier A`
      }
      return `cuts severity by ${MITIGATION_PER_COUNTER}`
    }
    const names = missing.map((c) => `${nameOf(scenario, c)} (${worth(c)})`)
    return `What would have helped: ${names.join('; ')}.`
  }
  const sensored = state.assets.filter((a) => a.integrity > 0 && a.kind !== 'groundStation')
  const tierAShare = sensored.length > 0 ? sensored.filter((a) => a.tier === 'A').length / sensored.length : 0
  if (def.counters.includes('tierAAttestation') && tierAShare < TIER_A_FLEET_SHARE) {
    return 'Firmware attestation was owned but inert: it bites once at least a third of the sensored fleet flies Tier A.'
  }
  if (def.effect.special === 'debrisStrike' && ev.mitigation < MITIGATION_PER_COUNTER + SSA_MITIGATION_BONUS) {
    return 'SSA was owned but the maneuver budget could not cover the avoidance burn.'
  }
  // Critique row M8: with every defense owned, the one purchase left is
  // the retainer, so name it. How much faster is read off the scenario,
  // and said as a plain "faster" when it is not a whole number of times;
  // a retune that left it no faster than base would make no claim at all.
  const { base, withIrRetainer } = scenario.recovery
  if (!state.irRetainer && withIrRetainer > base) {
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
