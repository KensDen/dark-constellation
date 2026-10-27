// THE FIXED-ORDER SEARCH (v1.6 R1's instrument, kept as a tool in v1.6 R2).
// Every one-a-turn order of the eight defenses that matter, played on
// every seed whatever TONIGHT says: a drone on turn 1, a burn on the
// debris night, one new defense a night in the order given (none on a
// night the budget cannot meet it). The orders share their prefixes, so
// the search plays each turn of each prefix once (about 29,000 turns a
// seed, not 121,000), and a game that ends early counts for every order
// that starts with its prefix. The best orders over the first seeds are
// then played over all of them.
//
// Ken's ruling of 27 October 2026 (option (a)) asked for no fixed order to
// win more often than Prepared on STANDARD. No campaign measured in v1.6
// R2 that keeps the section 7 targets does that (brief 6.1), so this is a
// tool the sweep runs on request (SWEEP_ORDERS=1, tests/sweep.spec.ts),
// not a gate.

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { CountermeasureId, GameState, Scenario, TurnActions } from '../src/engine/types'

export const ORDER_DEFENSES: readonly CountermeasureId[] = ['antiJam', 'encryptedBackhaul', 'linkAuth', 'pntAuth', 'sensorFusion', 'groundZeroTrust', 'irRetainer', 'tierAAttestation']

function night(s: GameState, defense: CountermeasureId): GameState {
  const actions: TurnActions = { buyAssets: s.turn === 1 ? [{ kind: 'drone' }] : [], buyCounters: [defense], intelBrief: false, debris: 'burn' }
  try {
    return resolveTurn(s, actions, turnRng(s.seed, s.turn))
  } catch {
    return resolveTurn(s, { ...actions, buyCounters: [] }, turnRng(s.seed, s.turn))
  }
}

export function playOrder(order: readonly CountermeasureId[], seed: number, scenario: Scenario = DEFAULT_SCENARIO): boolean {
  let s = newGame(scenario, seed, 'standard')
  while (s.status === 'playing') s = night(s, order[s.turn - 1])
  return s.status === 'won'
}

// Wins over seeds 1 to `seeds` for every order of `defenses.length` taken
// `turns` at a time, keyed by the order joined with spaces.
export function orderWins(seeds: number, scenario: Scenario = DEFAULT_SCENARIO, defenses: readonly CountermeasureId[] = ORDER_DEFENSES, turns = scenario.totalTurns): Map<string, number> {
  const wins = new Map<string, number>()
  const rest = (used: readonly CountermeasureId[], n: number): CountermeasureId[][] =>
    n === 0 ? [[]] : defenses.filter((d) => !used.includes(d)).flatMap((d) => rest([...used, d], n - 1).map((r) => [d, ...r]))
  const walk = (s: GameState, prefix: CountermeasureId[]) => {
    if (s.status !== 'playing') {
      if (s.status === 'won') for (const r of rest(prefix, turns - prefix.length)) wins.set([...prefix, ...r].join(' '), (wins.get([...prefix, ...r].join(' ')) ?? 0) + 1)
      return
    }
    for (const d of defenses) if (!prefix.includes(d)) walk(night(s, d), [...prefix, d])
  }
  for (let seed = 1; seed <= seeds; seed += 1) walk(newGame(scenario, seed, 'standard'), [])
  return wins
}

// The best `top` orders over the first `screen` seeds, each confirmed over
// seeds 1 to `seeds`: [order, wins of `seeds`], best first.
export function bestOrders(screen = 60, top = 8, seeds = 500, scenario: Scenario = DEFAULT_SCENARIO): [string, number][] {
  const screened = [...orderWins(screen, scenario)].sort((a, b) => b[1] - a[1]).slice(0, top)
  return screened
    .map(([order]): [string, number] => {
      let wins = 0
      for (let seed = 1; seed <= seeds; seed += 1) if (playOrder(order.split(' ') as CountermeasureId[], seed, scenario)) wins += 1
      return [order, wins]
    })
    .sort((a, b) => b[1] - a[1])
}
