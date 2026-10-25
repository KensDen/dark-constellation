// THE INTEL BRIEF LOCKS ONCE IT HAS NAMED THE MOVES (v1.5 R2, Ken's ruling
// of 24 October 2026). A paid brief names tonight's moves the moment it is
// ordered, so ordering it, reading it and cancelling it read it free (v1.5
// R1's re-review, screen 11). revealBrief records the turn on the state,
// and on that turn the engine charges the brief whatever the orders say:
// nothing cancels or refunds it. PROCURE's side is in
// tests/game.dom.spec.tsx and tests/hits.dom.spec.tsx.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { briefActive, briefLocked, newGame, orderCost, resolveTurn, revealBrief } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { restoreGame } from '../src/persistence/codec'
import { captureGame } from '../src/persistence'
import { NO_OP, a } from './scripts'

const PRICE = DEFAULT_SCENARIO.prices.intelBrief
const step = (s: GameState, actions = NO_OP) => resolveTurn(s, actions, turnRng(s.seed, s.turn))
// Turn 2 of a game: the brief is not free.
const turn2 = () => step(newGame(DEFAULT_SCENARIO, 11))

describe('the intel brief locks once revealed (v1.5 R2)', () => {
  it('GUARD v1.5 R2: a revealed brief cannot be cancelled: EXECUTE charges it and names the moves with the order taken out', () => {
    const before = turn2()
    expect(briefActive(before, NO_OP), 'turn 2 has a free brief, so the lock proves nothing').toBe(false)
    const revealed = revealBrief(before)
    expect(briefLocked(revealed)).toBe(true)
    // The orders say no brief; the lock says it stands.
    const cancelled = step(revealed, a({ intelBrief: false }))
    const rec = cancelled.history.at(-1)!
    expect(rec.briefed, 'the cancelled brief went dark').toBe(true)
    expect(rec.named.length, 'the cancelled brief named nothing').toBeGreaterThan(0)
    expect(rec.ledger.ordered, 'the cancelled brief was refunded').toBe(PRICE)
    expect(rec.purchases).toContain(`Intel brief (-${PRICE})`)
    // Exactly what ordering it and keeping it costs.
    const kept = step(revealed, a({ intelBrief: true }))
    expect(JSON.stringify(cancelled.history), 'cancelling a locked brief played differently from keeping it').toBe(JSON.stringify(kept.history))
    expect(cancelled.credits).toBe(kept.credits)
    // And the price the board reads before EXECUTE.
    expect(orderCost(revealed, NO_OP)).toBe(PRICE)
  })

  it('locks the turn it was revealed on and no other, and resolveTurn clears it', () => {
    const revealed = revealBrief(turn2())
    const next = step(revealed)
    expect('briefRevealed' in next, 'the lock outlived its turn').toBe(false)
    expect(briefLocked(next)).toBe(false)
    expect(briefLocked({ ...next, briefRevealed: next.turn - 1 })).toBe(false)
    // The next turn's brief is the player's to order again.
    expect(orderCost(next, NO_OP)).toBe(0)
  })

  it('locks nothing on a turn the brief is free, and refuses one the balance cannot meet', () => {
    const t1 = newGame(DEFAULT_SCENARIO, 11)
    expect(revealBrief(t1), 'a free brief was locked').toBe(t1)
    const poor = { ...turn2(), credits: PRICE - 1 }
    expect(() => revealBrief(poor)).toThrow(/orders exceed the budget/)
    expect(revealBrief({ ...poor, credits: PRICE }).briefRevealed).toBe(2)
  })

  it('travels in a save, so a reload keeps the lock, and an old save without it still loads', () => {
    const revealed = revealBrief(turn2())
    const back = restoreGame(JSON.parse(JSON.stringify(captureGame(revealed, 'brief', '2026-10-24T00:00:00Z')))).state
    expect(briefLocked(back), 'the save dropped the lock').toBe(true)
    const plain = restoreGame(JSON.parse(JSON.stringify(captureGame(turn2(), 'brief', '2026-10-24T00:00:00Z')))).state
    expect(briefLocked(plain)).toBe(false)
    expect(() => restoreGame({ ...JSON.parse(JSON.stringify(captureGame(revealed, 'brief', '2026-10-24T00:00:00Z'))), state: { ...revealed, scenario: undefined, briefRevealed: 'two' } })).toThrow()
  })
})
