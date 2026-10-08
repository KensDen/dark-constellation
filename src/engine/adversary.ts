// THE REACTING ADVERSARY (v1.3 brief 6.3, critique row M23). For each drawn
// slot COLDVEIL takes the candidate the defenses mitigate least, and
// breaks a tie with the deck stream. This is the one function that picks:
// resolveTurn calls it with the defenses owned at EXECUTE, and the TONIGHT
// card calls it with the queued orders included, which is the same set, so
// LIKELY TARGET and EITHER on the board are exactly what the engine will
// do. tests/adversary.spec.ts holds the board's flag to the engine's pick
// on every slot of a 200-seed sweep.
//
// One draw per drawn slot, tie or not, so where the deck stream stands
// after the slots (the opportunity roll comes next) never depends on what
// the player bought. Under D3 (a) the Daily uses the same rules: two
// players on a seed who defend the same way face the same night.

import type { Rng } from './rng'
import { turnRng } from './rng'
import { eventById, mitigationOf, planFor } from './rules'
import type { CountermeasureId, GameState } from './types'

export interface SlotRead {
  // A fixed slot is CONFIRMED: its one event lands whatever is owned.
  fixed: boolean
  candidates: { id: string; mitigation: number }[]
  // The least mitigated candidates: LIKELY TARGET when there is one, EITHER
  // on each when there are several. A fixed slot's is its event.
  least: string[]
  // What the adversary plays.
  pick: string
}

export function adversaryPicks(
  state: Pick<GameState, 'scenario' | 'seed' | 'turn'>,
  counters: readonly CountermeasureId[],
  deck: Rng = turnRng(state.seed, state.turn, 'deck'),
): SlotRead[] {
  const { scenario } = state
  const reads: SlotRead[] = []
  for (const slot of planFor(scenario, state.turn)?.slots ?? []) {
    if (slot.fixed) {
      const mitigation = mitigationOf(eventById(scenario, slot.fixed), counters)
      reads.push({ fixed: true, candidates: [{ id: slot.fixed, mitigation }], least: [slot.fixed], pick: slot.fixed })
      continue
    }
    const ids = slot.drawFrom ?? []
    if (ids.length === 0) continue
    const candidates = ids.map((id) => ({ id, mitigation: mitigationOf(eventById(scenario, id), counters) }))
    const floor = Math.min(...candidates.map((c) => c.mitigation))
    const least = candidates.filter((c) => c.mitigation === floor).map((c) => c.id)
    reads.push({ fixed: false, candidates, least, pick: least[deck.int(least.length)] })
  }
  return reads
}
