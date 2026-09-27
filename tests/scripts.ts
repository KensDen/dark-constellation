// Action scripts for the determinism and reachability tests. These are
// real play: legal action sequences fed through the public engine API,
// the same calls the UI makes. WIN_SCRIPT is a prepared architect;
// LOSS_SCRIPT ignores every warning and buys nothing.

import { resolveTurn } from '../src/engine/reducer'
import { mulberry32, turnRng } from '../src/engine/rng'
import type { AssetKind, GameState, TurnActions } from '../src/engine/types'

export const NO_OP: TurnActions = {
  buyAssets: [],
  buyCounters: [],
  buyIntelLevel: false,
  buyIrRetainer: false,
}

export const a = (partial: Partial<TurnActions>): TurnActions => ({ ...NO_OP, ...partial })

// Keyed by turn number, 1..12.
//
// TURN 9 BUYS ITS SAT AT TIER B since v1.2 Round 5a. At Tier A the line
// could not afford it on Expert at some seeds, and resolveTurn refused the
// cart: at 41, 104, 238 and 277 before the deck stream, and at 8, 36, 50,
// 69, 72 and 77 after it, each 6 to 11 credits short entering turn 9. At
// Tier B it is legal on every difficulty across 300 seeds and wins as
// often, within four seeds in three hundred on each difficulty.
// tests/reading-diet.spec.ts now asserts the first 100 seeds on every
// difficulty, as it already did for TOP_INTEL_SCRIPT, so a shortfall is
// a failing test rather than a comment.
export const WIN_SCRIPT: Record<number, TurnActions> = {
  1: a({ buyCounters: ['sensorFusion', 'antiJam'], buyAssets: [{ kind: 'sat', tier: 'B' }], buyIntelLevel: true }),
  2: a({ buyAssets: [{ kind: 'sat', tier: 'B' }] }),
  3: a({ buyCounters: ['groundZeroTrust'] }),
  4: a({ buyCounters: ['tierAAttestation'], buyIrRetainer: true }),
  5: a({ buyCounters: ['ssaManeuver'] }),
  6: a({ buyAssets: [{ kind: 'drone', tier: 'A' }] }),
  7: a({ buyAssets: [{ kind: 'drone', tier: 'A' }] }),
  8: a({ buyCounters: ['linkAuth'] }),
  9: a({ buyAssets: [{ kind: 'sat', tier: 'B' }] }),
  10: a({}),
  11: a({ buyAssets: [{ kind: 'drone', tier: 'A' }] }),
  12: a({}),
}

export const LOSS_SCRIPT: Record<number, TurnActions> = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [i + 1, NO_OP]),
)

// LAZY_SCRIPT is the half-hearted middle line for the balance sweep: some
// cheap, late, unfocused buys, no sensor fusion, no intel, no plan for the
// BLACKOUT CHAIN. The tuning target for the dynamics round is that this
// line loses far more often than the prepared line.
export const LAZY_SCRIPT: Record<number, TurnActions> = {
  ...LOSS_SCRIPT,
  2: a({ buyCounters: ['antiJam'] }),
  4: a({ buyCounters: ['groundZeroTrust'] }),
  6: a({ buyAssets: [{ kind: 'drone', tier: 'B' }] }),
  8: a({ buyCounters: ['linkAuth'] }),
}

// MIXED_SCRIPT (R3.25): reasonable but imperfect play. Real defenses, but
// bought a little late and incomplete: fusion retrofit lands just before
// the first chain rather than well ahead of it, intel only reaches level
// 1, coverage is grown but never maxed, and there is no Tier A fleet.
// Deploy slips and hidden condition durations make the outcome genuinely
// uncertain seed to seed. This is the balance-uncertainty line.
export const MIXED_SCRIPT: Record<number, TurnActions> = {
  ...LOSS_SCRIPT,
  1: a({ buyCounters: ['antiJam'], buyIntelLevel: true, buyAssets: [{ kind: 'sat', tier: 'B' }] }),
  2: a({ buyCounters: ['groundZeroTrust'], buyAssets: [{ kind: 'sat', tier: 'B' }] }),
  3: a({ buyCounters: ['linkAuth'] }),
  4: a({ buyCounters: ['pntAuth'] }),
  5: a({ buyCounters: ['ssaManeuver'] }),
  6: a({ buyCounters: ['sensorFusion'], buyAssets: [{ kind: 'drone', tier: 'B' }] }),
  8: a({ buyCounters: ['encryptedBackhaul'], buyIrRetainer: true }),
  10: a({ buyAssets: [{ kind: 'drone', tier: 'B' }] }),
}

// A line that pays for intel until it is capped, so the copy budget is
// measured at the fidelity that produces the longest brief: the named lead
// event, the "plus N more" suffix, the carried vector clause and the
// technique tag, on a mid-campaign turn rather than only in the opening.
//
// Built on the mixed line, with the intel buys replacing those turns'
// purchases rather than stacking on top of them. The first attempt added
// them to the prepared line, which costs 28 credits it does not have on
// expert: the engine refuses a cart it cannot pay for, so that fixture
// threw on about one expert seed in twenty, and the suite stayed green
// only because it sweeps twelve seeds and the first bad one is 19. This
// version is legal on every difficulty: measured clean across 300 seeds,
// and tests/reading-diet.spec.ts asserts the first 100 of them on every
// difficulty rather than assuming it.
export const TOP_INTEL_SCRIPT: Record<number, TurnActions> = {
  ...MIXED_SCRIPT,
  2: a({ buyIntelLevel: true }),
  3: a({ buyIntelLevel: true }),
}

// THE RANDOM LINE (v1.2 R5a), for calibrating the grade (brief 7.2): a
// seeded policy that plays legal, random turns rather than a plan. Each
// turn it may buy intel, the IR retainer, up to two countermeasures it does
// not own and up to two assets of any kind and tier, and may spend a surge
// token on a random live condition. The engine is the judge of what is
// affordable: a cart it refuses loses its last item until it is accepted,
// so the line is legal by construction and restates no price.
const KINDS: readonly AssetKind[] = ['sat', 'rpoSat', 'drone', 'groundStation']

export function randomPolicy(policySeed: number): (state: GameState) => TurnActions {
  return (state) => {
    const r = mulberry32((Math.imul(policySeed ^ 0x51ed270b, 2654435761) ^ Math.imul(state.turn + 1, 40503)) >>> 0)
    const buys: TurnActions[] = []
    if (state.intelLevel < 3 && r.chance(0.3)) buys.push(a({ buyIntelLevel: true }))
    if (!state.irRetainer && r.chance(0.2)) buys.push(a({ buyIrRetainer: true }))
    const unowned = state.scenario.countermeasures
      .map((c) => c.id)
      .filter((id) => id !== 'irRetainer' && id !== 'intelInvestment' && !state.counters.includes(id) && !state.pendingCounters.some((p) => p.id === id))
    for (let n = r.int(3); n > 0 && unowned.length > 0; n -= 1) buys.push(a({ buyCounters: [unowned.splice(r.int(unowned.length), 1)[0]] }))
    for (let n = r.int(3); n > 0; n -= 1) {
      const kind = r.pick(KINDS)
      buys.push(a({ buyAssets: [{ kind, tier: kind === 'groundStation' || r.chance(0.5) ? 'B' : 'A' }] }))
    }
    const surge = state.surgeTokens > 0 && state.conditions.length > 0 && r.chance(0.5) ? r.pick(state.conditions).instanceId : undefined
    const cart = (items: TurnActions[]): TurnActions => ({
      buyAssets: items.flatMap((i) => i.buyAssets),
      buyCounters: items.flatMap((i) => i.buyCounters),
      buyIntelLevel: items.some((i) => i.buyIntelLevel),
      buyIrRetainer: items.some((i) => i.buyIrRetainer),
      spendSurgeOn: surge,
    })
    for (let kept = buys.length; kept >= 0; kept -= 1) {
      const actions = cart(buys.slice(0, kept))
      try {
        resolveTurn(state, actions, turnRng(state.seed, state.turn))
        return actions
      } catch {
        // Refused: drop the last item and ask again.
      }
    }
    return { ...NO_OP, spendSurgeOn: surge }
  }
}
