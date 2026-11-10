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

import { burnFuel, chainBonusOf, countersAfter, eventById, gnssDenied, lossReviewBill, mitigationOf, orderCost, repairBill, worstBillOf } from './rules'
import { planFor } from './campaign'
import type { CountermeasureId, GameState, TurnActions } from './types'

export interface WorstCase {
  remaining: number
  repairs: number
  upkeep: number
  // Held for the nights ahead (v1.7 R1, heldForLater below).
  later: number
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
  for (const slot of planFor(state, state.turn)?.slots ?? []) {
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
  const later = heldForLater(state, counters)
  return { remaining, repairs, upkeep, later, value: remaining - repairs - upkeep - later }
}

// HELD FOR THE NIGHTS AHEAD (v1.7 R1). A response is paid in the night,
// where the player cannot see the turns to come, so it may not spend what
// those turns' bills could need: for each turn after this one, the largest
// repair bill each of its slots could leave at the defenses owned now,
// plus their upkeep, less the mission funding that arrives before it. The
// running total's highest point is what stays held (0 on the last turn,
// and whenever funding covers every night ahead). With it, a player who
// answers every move tonight and then never orders again can ride every
// later night out and stay solvent; without it, a response on turn 4
// could end the run at turn 6's close, with nothing on screen to say so.
// WORST CASE on the board holds orders to the same figure (worstCase,
// above), so one number guards both: with money tight since responses, a
// turn's orders could read 0 or more and still leave the next night's
// bills unpayable before the player could do anything about it.
export function heldForLater(state: Pick<GameState, 'scenario' | 'seed' | 'turn' | 'difficulty'>, counters: readonly CountermeasureId[]): number {
  const { scenario, difficulty } = state
  const upkeep = counters.length * scenario.upkeepPerDefense
  let running = 0
  let held = 0
  for (let turn = state.turn + 1; turn <= scenario.totalTurns; turn += 1) {
    let bills = 0
    for (const slot of planFor(state, turn)?.slots ?? []) {
      bills += Math.max(0, ...(slot.fixed ? [slot.fixed] : (slot.drawFrom ?? [])).map((id) => worstBillOf(eventById(scenario, id), counters, difficulty)))
    }
    running += bills + upkeep - scenario.incomePerTurn
    held = Math.max(held, running)
  }
  return held
}
