// END OF TURN's ledger shows every line that made the budget (section 4
// rule 5; v1.3 R6, Decisions question 12): the first row is what tonight's
// orders left, then the burn's fuel and an opportunity's windfall each on
// a row of its own, and the rows above the total add up to it on every
// turn of every swept game.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnRecord } from '../src/engine/types'
import { shortName } from '../src/ui/board/boardModel'
import { ledgerRows } from '../src/ui/night/closeModel'
import * as copy from '../src/ui/night/nightCopy'

// Games that burn on the debris night and order nothing else, so fuel and
// windfall land on turns of their own.
function games(n: number): { record: TurnRecord; after: GameState }[] {
  const out: { record: TurnRecord; after: GameState }[] = []
  for (let seed = 1; seed <= n; seed += 1) {
    let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
    while (state.status === 'playing') {
      state = resolveTurn(state, { buyAssets: [], buyCounters: [], intelBrief: false, debris: 'burn' }, turnRng(state.seed, state.turn))
      out.push({ record: state.history[state.history.length - 1], after: state })
    }
  }
  return out
}

describe("END OF TURN's ledger (R6 question 12)", () => {
  const all = games(120)

  it('adds up to the total on every turn, and starts from the orders alone', () => {
    for (const { record, after } of all) {
      const rows = ledgerRows(record, after)
      const total = rows.find((r) => r.key === 'total')!
      const sum = rows.filter((r) => r.key !== 'total').reduce((n, r) => n + r.value, 0)
      expect(sum, `seed ${after.seed}, turn ${record.turn}: ${JSON.stringify(rows)}`).toBe(total.value)
      expect(rows[0].value).toBe(record.ledger.start - record.ledger.ordered)
    }
  })

  it('gives the burn fuel and each windfall a row of its own, named', () => {
    const fuel = all.filter(({ record }) => record.ledger.fuel > 0)
    const windfall = all.filter(({ record }) => record.ledger.windfall > 0)
    expect(fuel.length, 'no swept turn burned fuel').toBeGreaterThan(0)
    expect(windfall.length, 'no swept turn had a windfall').toBeGreaterThan(0)
    for (const { record, after } of fuel) expect(ledgerRows(record, after).find((r) => r.key === 'fuel')).toMatchObject({ label: copy.BURN_FUEL, value: -record.ledger.fuel })
    const names = new Set<string>()
    for (const { record, after } of windfall) {
      const row = ledgerRows(record, after).find((r) => r.key === 'windfall')!
      expect(row.value).toBe(record.ledger.windfall)
      names.add(row.label)
    }
    // The rider by its own name, and the rideshare's seat when it was resold.
    const rider = DEFAULT_SCENARIO.events.find((e) => e.kind === 'opportunity' && e.benefit?.credits)!
    expect([...names].every((n) => n === shortName(rider) || n === copy.RESOLD), [...names].join(', ')).toBe(true)
    expect(names.has(shortName(rider))).toBe(true)
  })
})
