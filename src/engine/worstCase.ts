// WORST CASE (v1.3 brief 6.4, critique row M9): what the budget reads at
// turn close if tonight goes as badly as it can, before funding arrives.
//
//   worstCase = remaining - worstRepairs - upkeepNext
//
// remaining is the budget less tonight's orders. worstRepairs sums, over
// tonight's slots, the largest repair bill any candidate could produce at
// the mitigation the orders leave; on the debris night it is the larger of
// the burn's fuel and the loss review, since the player may choose either.
// upkeepNext is the upkeep on every defense owned once the orders land.
// Nothing else takes credits between EXECUTE and the solvency check
// (condition pressure costs meters, an opportunity only pays), so a turn
// that reads 0 or more here cannot close insolvent: tests/sweep.spec.ts
// holds that over 500 seeds of every policy on both difficulties.
//
// One function; the dock, the FIRST ORDERS check and the battery all call
// it (brief 6.4).

import { burnFuel, chainBonusOf, countersAfter, eventById, gnssDenied, lossReviewBill, mitigationOf, orderCost, planFor, repairBill } from './rules'
import type { GameState, TurnActions } from './types'

export interface WorstCase {
  remaining: number
  repairs: number
  upkeep: number
  value: number
}

export function worstCase(state: GameState, actions: TurnActions): WorstCase {
  const { scenario, difficulty } = state
  const counters = countersAfter(state, actions)
  const remaining = state.credits - orderCost(state, actions)
  // A chain exploit strikes harder while GNSS denial is live, and a jam
  // that lands earlier tonight makes it live for the slots after it.
  let denied = gnssDenied(state.conditions, scenario)
  let repairs = 0
  for (const slot of planFor(scenario, state.turn)?.slots ?? []) {
    let worst = 0
    let jams = false
    for (const id of slot.fixed ? [slot.fixed] : (slot.drawFrom ?? [])) {
      const ev = eventById(scenario, id)
      if (ev.effect.special === 'debrisStrike') {
        worst = Math.max(worst, burnFuel(counters.includes('ssaManeuver')), lossReviewBill(ev, difficulty))
        continue
      }
      const effective = Math.max(0, ev.baseSeverity + chainBonusOf(ev, denied) - mitigationOf(ev, counters))
      worst = Math.max(worst, repairBill(ev, effective, difficulty))
      if (ev.effect.special === 'jamsGnss' && ev.condition && effective > 0) jams = true
    }
    repairs += worst
    if (jams) denied = true
  }
  const upkeep = counters.length * scenario.upkeepPerDefense
  return { remaining, repairs, upkeep, value: remaining - repairs - upkeep }
}
