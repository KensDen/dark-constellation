// The sweep's policies do what their comments say (v1.3 R0b).
//
// R0b found that the gated Prepared line answered each slot's flag once, so
// the reacting adversary took the next least covered move and no drawn-slot
// order touched the move that landed that night. The line that follows
// the flag is the same player reading the same board. These hold each
// line to its own description, so a later edit that changes how either one
// reads TONIGHT fails here by name rather than moving the sweep quietly.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { adversaryPicks } from '../src/engine/adversary'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { NEW_DEFENSES_PER_NIGHT, chainBonusOf, countersAfter, eventById, gnssDenied, mitigationOf, orderCost } from '../src/engine/rules'
import { planFor } from '../src/engine/campaign'
import type { CountermeasureId, GameState, TurnActions } from '../src/engine/types'
import { worstCase } from '../src/engine/worstCase'
import { prepared, preparedFollow, type Policy } from './policies'

const SEEDS = 100

// Every state each line meets, with its orders, over SEEDS seeds on both
// difficulties.
function* decisions(policy: Policy): Generator<{ state: GameState; actions: TurnActions; where: string }> {
  for (const difficulty of ['standard', 'easy'] as const) {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
      while (state.status === 'playing') {
        const actions = policy(state)
        yield { state, actions, where: `${difficulty} seed ${seed} turn ${state.turn}` }
        state = resolveTurn(state, actions, turnRng(state.seed, state.turn))
      }
    }
  }
}

const blocked = (state: GameState, eventId: string, counters: readonly CountermeasureId[]) => {
  const ev = eventById(state.scenario, eventId)
  return ev.effect.special === 'debrisStrike' || ev.baseSeverity + chainBonusOf(ev, gnssDenied(state.conditions, state.scenario)) - mitigationOf(ev, counters) <= 0
}
const affordable = (state: GameState, actions: TurnActions) => state.credits - orderCost(state, actions) >= 0 && worstCase(state, actions).value >= 0
// The defenses tonight's orders bought, as a set.
const bought = (state: GameState, actions: TurnActions) => countersAfter(state, actions).filter((id) => !state.counters.includes(id))

describe('the sweep policies do what their comments say (R0b)', () => {
  it('the Prepared line that follows the flag leaves no flagged move it could still answer, until the cap', () => {
    // After its orders, either tonight's one new defense is ordered (v1.4,
    // NEW_DEFENSES_PER_NIGHT), or every move COLDVEIL is flagged to take on
    // a slot is blocked, has no listed defense left, or would take WORST
    // CASE below 0 with the next one: the flag has nowhere left to move
    // that the budget and the cap allow the player to follow.
    const open: string[] = []
    let followed = 0
    for (const { state, actions, where } of decisions(preparedFollow)) {
      expect(bought(state, actions).length, `${where}: more than one new defense`).toBeLessThanOrEqual(NEW_DEFENSES_PER_NIGHT)
      // Tonight's defense is in: the flag it moved is the one the cap
      // leaves for tomorrow.
      if (bought(state, actions).length === NEW_DEFENSES_PER_NIGHT) {
        followed += 1
        continue
      }
      const counters = countersAfter(state, actions)
      for (const [i, read] of adversaryPicks(state, counters).entries()) {
        for (const id of read.least) {
          if (blocked(state, id, counters)) continue
          const next = eventById(state.scenario, id).counters.find((c) => !counters.includes(c))
          if (!next) continue
          if (affordable(state, { ...actions, buyCounters: [...actions.buyCounters, next] })) open.push(`${where} slot ${i + 1}: ${id} still open, ${next} affordable`)
        }
      }
    }
    expect(open.slice(0, 10).join('\n'), `${open.length} flags left unanswered`).toBe('')
    // Not vacuous: on most of its nights the line orders tonight's defense.
    // Before the cap it answered a slot more than once on over SEEDS of
    // them, following the flag as it moved; the cap ends that at one.
    expect(followed, 'the line never ordered a defense, so it never followed the flag').toBeGreaterThan(SEEDS)
  })

  it('the gated Prepared line answers each slot once, so the flag it leaves moves to an open door', () => {
    // The R0 line, kept as the gate's Prepared until Ken rules: at most one
    // defense a slot, and on most turns a flagged move it could still
    // answer is left open, which is the R0b finding.
    let leftOpen = 0
    let turns = 0
    for (const { state, actions, where } of decisions(prepared)) {
      turns += 1
      // The slots a defense can answer: the debris call is a choice, not a
      // threat, so turn 4's fixed conjunction does not count (the R0b
      // review: counting it let a second order on turn 4's drawn slot
      // through).
      const answerable = (planFor(state, state.turn)?.slots ?? []).filter(
        (slot) => !(slot.fixed && eventById(state.scenario, slot.fixed).effect.special === 'debrisStrike'),
      ).length
      expect(bought(state, actions).length, `${where}: more than one defense a slot`).toBeLessThanOrEqual(answerable)
      expect(bought(state, actions).length, `${where}: more than one new defense`).toBeLessThanOrEqual(NEW_DEFENSES_PER_NIGHT)
      const counters = countersAfter(state, actions)
      const open = adversaryPicks(state, counters).some((read) =>
        read.least.some((id) => !blocked(state, id, counters) && eventById(state.scenario, id).counters.some((c) => !counters.includes(c))),
      )
      if (open) leftOpen += 1
    }
    expect(leftOpen / turns, 'the one-order line no longer leaves a flagged move open on most turns').toBeGreaterThan(0.5)
  })
})
