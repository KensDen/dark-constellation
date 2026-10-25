// Action scripts for the determinism and reachability tests. These are
// real play: legal action sequences fed through the public engine API,
// the same calls the UI makes. WIN_SCRIPT is a prepared architect;
// LOSS_SCRIPT ignores every warning and orders nothing.
//
// Six turns since v1.3 Round 0 (brief D1 a). The sweep gate's policies,
// which read TONIGHT and WORST CASE rather than following a script, live
// in tests/policies.ts.

import { NEW_DEFENSES_PER_NIGHT, resolveTurn } from '../src/engine/reducer'
import { mulberry32, turnRng } from '../src/engine/rng'
import type { AssetKind, GameState, TurnActions } from '../src/engine/types'

export const NO_OP: TurnActions = {
  buyAssets: [],
  buyCounters: [],
  intelBrief: false,
}

export const a = (partial: Partial<TurnActions>): TurnActions => ({ ...NO_OP, ...partial })

// Keyed by turn number, 1..6. One new defense a night since v1.4 (the
// engine refuses more): a drone and anti-jam first, then encrypted
// backhaul and link authentication, so turn 3's two slots are held
// outright and the defense streak reaches 2 (the most a capped game can,
// tests/sweep.spec.ts), then PNT authentication and a burn on the
// conjunction, the sensor stack before the LiDAR moves and the chain, and
// ground zero trust last. Before the cap it ordered both turn-1 primaries
// at once and two defenses on three later nights. It wins every one of
// seeds 1 to 500 on Standard, 67 of them at S.
export const WIN_SCRIPT: Record<number, TurnActions> = {
  1: a({ buyAssets: [{ kind: 'drone' }], buyCounters: ['antiJam'] }),
  2: a({ buyCounters: ['encryptedBackhaul'] }),
  3: a({ buyCounters: ['linkAuth'] }),
  4: a({ buyCounters: ['pntAuth'], debris: 'burn' }),
  5: a({ buyCounters: ['sensorFusion'] }),
  6: a({ buyCounters: ['groundZeroTrust'] }),
}

export const LOSS_SCRIPT: Record<number, TurnActions> = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i + 1, NO_OP]))

// LAZY_SCRIPT is the half-hearted middle line: some cheap, late, unfocused
// orders, no sensor fusion, no intel, no plan for the BLACKOUT CHAIN.
export const LAZY_SCRIPT: Record<number, TurnActions> = {
  ...LOSS_SCRIPT,
  2: a({ buyCounters: ['antiJam'] }),
  4: a({ buyCounters: ['groundZeroTrust'] }),
  5: a({ buyAssets: [{ kind: 'drone' }] }),
}

// MIXED_SCRIPT (R3.25): reasonable but imperfect play. Real defenses, but
// ordered a little late and incomplete, and the intel brief bought on the
// turns that draw from three moves.
export const MIXED_SCRIPT: Record<number, TurnActions> = {
  ...LOSS_SCRIPT,
  1: a({ buyCounters: ['antiJam'], buyAssets: [{ kind: 'drone' }] }),
  2: a({ buyCounters: ['groundZeroTrust'], intelBrief: true }),
  3: a({ buyCounters: ['linkAuth'] }),
  4: a({ buyCounters: ['pntAuth'], debris: 'hold' }),
  5: a({ buyCounters: ['sensorFusion'], intelBrief: true }),
  6: a({ buyCounters: ['irRetainer'] }),
}

// A line that orders the intel brief every night it is not free, so a
// fixture can read the named moves on any turn.
export const TOP_INTEL_SCRIPT: Record<number, TurnActions> = Object.fromEntries(
  Array.from({ length: 6 }, (_, i) => [i + 1, { ...(MIXED_SCRIPT[i + 1] ?? NO_OP), intelBrief: true }]),
)

// THE RANDOM LINE (v1.2 R5a), a seeded policy that plays legal, random
// turns rather than a plan. Each turn it may order the intel brief, a
// defense it does not own (the retainer among them; up to two before the
// v1.4 cap of one new defense a night) and up to two assets of any kind,
// and calls the debris on a coin. The engine is the judge of what is
// affordable: an order it refuses loses its last item until it is
// accepted, so the line is legal by construction and restates no price.
const KINDS: readonly AssetKind[] = ['sat', 'rpoSat', 'drone', 'groundStation']

export function randomPolicy(policySeed: number): (state: GameState) => TurnActions {
  return (state) => {
    const r = mulberry32((Math.imul(policySeed ^ 0x51ed270b, 2654435761) ^ Math.imul(state.turn + 1, 40503)) >>> 0)
    const buys: TurnActions[] = []
    if (r.chance(0.3)) buys.push(a({ intelBrief: true }))
    const unowned = state.scenario.countermeasures.map((c) => c.id).filter((id) => !state.counters.includes(id))
    for (let n = Math.min(r.int(3), NEW_DEFENSES_PER_NIGHT); n > 0 && unowned.length > 0; n -= 1) buys.push(a({ buyCounters: [unowned.splice(r.int(unowned.length), 1)[0]] }))
    for (let n = r.int(3); n > 0; n -= 1) buys.push(a({ buyAssets: [{ kind: r.pick(KINDS) }] }))
    const debris = r.chance(0.5) ? 'burn' : 'hold'
    const cart = (items: TurnActions[]): TurnActions => ({
      buyAssets: items.flatMap((i) => i.buyAssets),
      buyCounters: items.flatMap((i) => i.buyCounters),
      intelBrief: items.some((i) => i.intelBrief),
      debris,
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
    return { ...NO_OP, debris }
  }
}
