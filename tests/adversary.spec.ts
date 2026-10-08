// GUARD R0 (a): THE BOARD'S LIKELY TARGET IS THE ENGINE'S PICK (v1.3 brief
// 6.3). The TONIGHT card reads adversaryPicks with the queued orders
// included; resolveTurn plays it with the defenses owned at EXECUTE. Over
// every slot of 200 seeds of every policy, what the board would flag must
// be what the engine then played: the one LIKELY TARGET when there is one,
// one of the EITHER moves when several tie, and in either case exactly the
// pick the board's own read makes. The engine's pick is read from the
// record, never by calling the function again, so a resolver that read the
// defenses at another moment, or broke a tie another way, fails here.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { adversaryPicks } from '../src/engine/adversary'
import { countersAfter, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { POLICIES } from './policies'

const SEEDS = 200

describe("GUARD R0 (a): the board's LIKELY TARGET equals the engine's pick", () => {
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
              // The board's read: the queued orders included, on a fresh
              // deck stream, as the TONIGHT card computes it.
              const board = adversaryPicks(state, countersAfter(state, actions))
              const after = resolveTurn(state, actions, turnRng(state.seed, state.turn))
              const played = after.history.at(-1)!.events.slice(0, board.length).map((e) => e.eventId)
              board.forEach((read, i) => {
                const where = `${p.name} ${difficulty} seed ${seed} turn ${state.turn} slot ${i + 1}`
                if (read.fixed) fixed += 1
                else if (read.least.length === 1) likely += 1
                else either += 1
                if (!read.least.includes(played[i])) wrong.push(`${where}: board flagged ${read.least.join(' or ')}, engine played ${played[i]}`)
                else if (read.pick !== played[i]) wrong.push(`${where}: board's tie-break said ${read.pick}, engine played ${played[i]}`)
              })
              state = after
            }
          }
        }
      }
      // Every kind of slot was seen, so the guard is not vacuous: a single
      // LIKELY TARGET, a tie the deck stream broke, and a CONFIRMED move.
      expect(likely, 'no slot had a single LIKELY TARGET').toBeGreaterThan(100)
      expect(either, 'no slot had an EITHER tie').toBeGreaterThan(100)
      expect(fixed, 'no CONFIRMED slot was played').toBeGreaterThan(100)
      expect(wrong.slice(0, 20).join('\n'), `${wrong.length} slots disagreed`).toBe('')
    },
    120_000,
  )

  it('breaks a tie on the deck stream alone, the same for every player on the seed', () => {
    // Two players on one seed with the same defenses face the same pick,
    // whatever else they ordered (D3 a): assets and the brief do not move
    // the deck stream.
    for (let seed = 1; seed <= 50; seed += 1) {
      const s = newGame(DEFAULT_SCENARIO, seed)
      const bare = resolveTurn(s, { buyAssets: [], buyCounters: [], intelBrief: false }, turnRng(seed, 1))
      const busy = resolveTurn(s, { buyAssets: [{ kind: 'drone' }, { kind: 'sat' }], buyCounters: [], intelBrief: true }, turnRng(seed, 1))
      expect(busy.history[0].events[0].eventId, `seed ${seed}`).toBe(bare.history[0].events[0].eventId)
    }
  })
})
