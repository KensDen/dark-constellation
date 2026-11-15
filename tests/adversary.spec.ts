// GUARD R0 (a): THE PLAN'S READ IS THE ENGINE'S PICK (v1.3 brief 6.3). The
// game's plan reads adversaryPicks with the queued orders included;
// resolveTurn plays it with the defenses owned as the night begins. Over
// every slot of 200 seeds of every policy, what the plan would mark must
// be what the engine then played: the one least-covered move when there is
// one, one of them when several tie, and in either case exactly the pick
// the plan's own read makes. The engine's pick is read from the record,
// never by calling the function again, so a resolver that read the
// defenses at another moment, or broke a tie another way, fails here.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { adversaryPicks } from '../src/engine/adversary'
import { countersAfter, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { POLICIES, scanFor } from './policies'

const SEEDS = 200

describe("GUARD R0 (a): the plan's read of the adversary equals the engine's pick", () => {
  it(
    `over every slot of ${SEEDS} seeds of every policy, on both difficulties`,
    () => {
      let likely = 0
      let either = 0
      let fixed = 0
      const wrong: string[] = []
      for (const difficulty of ['standard', 'easy'] as const) {
        for (const p of POLICIES) {
          for (let seed = 1; seed <= SEEDS; seed += 1) {
            let state: GameState = newGame(DEFAULT_SCENARIO, seed, difficulty)
            while (state.status === 'playing') {
              const actions = p.policy(state)
              // The plan's read: the queued orders included, on a fresh
              // deck stream.
              const board = adversaryPicks(state, countersAfter(state, actions))
              const after = resolveTurn(state, actions, turnRng(state.seed, state.turn))
              const played = after.history.at(-1)!.events.slice(0, board.length).map((e) => e.eventId)
              board.forEach((read, i) => {
                const where = `${p.name} ${difficulty} seed ${seed} turn ${state.turn} slot ${i + 1}`
                if (read.fixed) fixed += 1
                else if (read.least.length === 1) likely += 1
                else either += 1
                if (!read.least.includes(played[i])) wrong.push(`${where}: the plan marked ${read.least.join(' or ')}, engine played ${played[i]}`)
                else if (read.pick !== played[i]) wrong.push(`${where}: the plan's tie-break said ${read.pick}, engine played ${played[i]}`)
              })
              state = after
            }
          }
        }
      }
      // Every kind of slot was seen, so the guard is not vacuous: a single
      // least-covered move, a tie the deck stream broke, and a fixed slot.
      expect(likely, 'no slot had a single least-covered move').toBeGreaterThan(100)
      expect(either, 'no slot had a tie').toBeGreaterThan(100)
      expect(fixed, 'no fixed slot was played').toBeGreaterThan(100)
      expect(wrong.slice(0, 20).join('\n'), `${wrong.length} slots disagreed`).toBe('')
    },
    120_000,
  )

  it('breaks a tie on the deck stream alone, the same for every player on the seed', () => {
    // Two players on one seed with the same defenses face the same pick,
    // whatever else they ordered (D3 a): assets and the scan do not move
    // the deck stream.
    let scanned = 0
    for (let seed = 1; seed <= 50; seed += 1) {
      const s = newGame(DEFAULT_SCENARIO, seed)
      const bare = resolveTurn(s, { buyAssets: [], buyCounters: [] }, turnRng(seed, 1))
      const scans = scanFor(s)
      scanned += scans.length
      const busy = resolveTurn(s, { buyAssets: [{ kind: 'drone' }, { kind: 'sat' }], buyCounters: [], scans }, turnRng(seed, 1))
      expect(busy.history[0].events[0].eventId, `seed ${seed}`).toBe(bare.history[0].events[0].eventId)
    }
    expect(scanned, 'no night 1 had a signature to scan, so the scan went unchecked').toBeGreaterThan(0)
  })
})
