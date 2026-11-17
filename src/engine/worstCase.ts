// WORST CASE (v1.3 brief 6.4, critique row M9; loosened in v2.0 R4): what
// the budget reads if tonight goes as badly as COLDVEIL can make it, with
// what tomorrow night is likely to need held back.
//
//   worstCase = remaining - worstRepairs - upkeepNext - heldForLater
//
// remaining is the budget less tonight's orders. worstRepairs sums, over
// tonight's slots, the largest repair bill COLDVEIL could leave with the
// moves it can take at the defenses the orders leave; on the debris night
// it is the larger of the burn's fuel and the loss review, since the player
// may choose either. upkeepNext is the upkeep on every defense owned once
// the orders land. Nothing else takes credits between EXECUTE and the
// solvency check (condition pressure costs meters, an opportunity only
// pays), so a turn that reads 0 or more here cannot close insolvent:
// tests/sweep.spec.ts holds that over 500 seeds of every policy on both
// difficulties.
//
// LOOSENED IN v2.0 R4 (Ken's ruling of 15 November 2026: warn only when
// the risk is real, so players stop learning to ignore it). Through R3 it
// was too careful twice over, and the round's first-time reviewer was told
// an 8 CR piece was dangerous with 62 CR in the bank, was not hurt, and
// stopped believing the warning.
//   1. It counted the costliest move on every track, including moves
//      COLDVEIL had turned from. COLDVEIL takes the move the defenses cover
//      least (src/engine/adversary.ts), so the bill it can leave is the
//      largest among those, and that is what is counted now: still every
//      move it can play, so a reading of 0 or more is still safe tonight.
//   2. It held back the worst bill of EVERY night to come: 61 CR of an
//      opening 80 on STANDARD, and on night 2 a watch with 69 CR and
//      nothing ordered read 6 CR short. It now holds back what TOMORROW is
//      likely to need and no further (heldForLater): the one night whose
//      bills the player cannot plan against after seeing them.
// MEASURED over Prepared's 500 games (3,000 nights), each mark ignored
// once and the game then played on inside the guard. The R3 guard, at R3's
// numbers, on STANDARD: 30.8 percent of the pieces the budget could buy
// marked risky, on a third of all nights, and of 1,231 marks ignored none
// ended insolvent; on EASY 18.2 percent, and 19 of 666. This one, at the
// numbers as re-tuned: 3.6 percent of pieces on 1 night in 15, and 38 of
// 183 ignored ended insolvent (1 in 5); on EASY 0.2 percent, and 3 of 10.
// No line that obeys it goes insolvent, on either difficulty. Tomorrow
// read at its worst as well (the first cut of this round): 5.7 percent of
// pieces on 1 night in 9, and 40 of 292 (1 in 7), with the bands where
// they are. Holding back nothing for tomorrow: 2.8 percent, and 48 of 141
// (1 in 3), but a line that grows the fleet then goes insolvent in 111
// games of 500, and under R3's numbers Prepared bought early, could not
// buy late, and won 64 percent. A FIRST-TIME PLAYER WHO SPENDS FREELY
// STILL MEETS IT LATE IN A GAME: both of the round's reviewers were warned
// on nights 4 to 6 with 22 to 29 CR in hand and finished solvent. Part of
// that is what the figure is: the budget at the solvency check, before the
// night's funding and coverage bonus arrive, so the next morning's budget
// reads up to 17 CR above it. The loosening moved the bands, and the
// numbers were re-tuned to them (src/content/scenarios/firstLight.ts).
//
// One function; the plan card, the sweep's lines and the battery all call
// it (brief 6.4). It ignores the answers and the post, so it can only be
// too careful.

import { burnFuel, chainBonusOf, countersAfter, eventById, fundingOf, gnssDenied, lossReviewBill, mitigationOf, orderCost, repairBill, worstBillOf } from './rules'
import { planFor } from './campaign'
import type { CountermeasureId, GameState, TurnActions } from './types'

export interface WorstCase {
  remaining: number
  repairs: number
  upkeep: number
  // Held for tomorrow night (heldForLater below).
  later: number
  value: number
}

// The moves COLDVEIL can play on each of a night's tracks at these
// defenses: a fixed slot's one event, and on a drawn slot the candidates
// the defenses mitigate least, which is the set its pick is drawn from
// (src/engine/adversary.ts, adversaryPicks).
export function movesOpen(state: Pick<GameState, 'scenario' | 'seed'>, turn: number, counters: readonly CountermeasureId[]): string[][] {
  return (planFor(state, turn)?.slots ?? []).map((slot) => {
    if (slot.fixed) return [slot.fixed]
    const ids = slot.drawFrom ?? []
    const cover = ids.map((id) => mitigationOf(eventById(state.scenario, id), counters))
    const floor = Math.min(...cover)
    return ids.filter((_, i) => cover[i] === floor)
  })
}

export function worstCase(state: GameState, actions: TurnActions): WorstCase {
  const { scenario, difficulty } = state
  const counters = countersAfter(state, actions)
  const remaining = state.credits - orderCost(state, actions)
  // A chain exploit strikes harder while GNSS denial is live, and a jam
  // that lands earlier tonight makes it live for the slots after it.
  let denied = gnssDenied(state.conditions, scenario)
  let repairs = 0
  for (const ids of movesOpen(state, state.turn, counters)) {
    let worst = 0
    let jams = false
    for (const id of ids) {
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

// HELD FOR TOMORROW NIGHT (v1.7 R1 as every night to come; tomorrow alone,
// and at what it is likely to cost, since v2.0 R4). The player cannot see
// tomorrow's moves tonight, so tonight's orders may not spend what
// tomorrow's bills are likely to need: on each of tomorrow's tracks the
// AVERAGE repair bill of the moves COLDVEIL can take at the defenses owned
// now (it draws among them evenly), plus the upkeep, less the mission
// funding that arrives before it (0 on the last turn, and whenever funding
// covers it). Tonight is read at its worst, because tonight can end the
// operation; tomorrow is read at its average, because holding back for the
// worst of both nights at once marked twice as many pieces and was right
// less often (the figures are at the head of this file). Without it a
// turn's orders could read 0 or more and leave the next night's bills
// unpayable before the player could do anything about it. The nights after
// tomorrow are not held for: the player reads this figure again before
// each of them, with that night's moves in sight.
export function heldForLater(state: Pick<GameState, 'scenario' | 'seed' | 'turn' | 'difficulty'>, counters: readonly CountermeasureId[]): number {
  const { scenario, difficulty } = state
  const turn = state.turn + 1
  if (turn > scenario.totalTurns) return 0
  let bills = 0
  for (const ids of movesOpen(state, turn, counters)) bills += ids.reduce((n, id) => n + worstBillOf(eventById(scenario, id), counters, difficulty), 0) / Math.max(1, ids.length)
  return Math.max(0, Math.ceil(bills + counters.length * scenario.upkeepPerDefense - fundingOf(state)))
}
