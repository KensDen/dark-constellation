// THE ADVICE AND THE GUARD (v2.0 R4, Ken's rulings of 15 November 2026).
//   4. BEST SPOT and FIX NEXT count the watch post they give up, so the
//      advice never raises AT STAKE (src/ui/three/gameModel.ts, spotAdvice
//      and fixNext).
//   5. WORST CASE warns only when the risk is real: it counts the moves
//      COLDVEIL can take, and holds back what tomorrow is likely to need
//      (src/engine/worstCase.ts).
// Held over the nights the sweep's own Prepared and Novice lines reach, so
// the boards are ones a game arrives at, with posts standing and COLDVEIL
// already turned from what is covered.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { adversaryPicks } from '../src/engine/adversary'
import { newGame } from '../src/engine/reducer'
import { playNight } from '../src/engine/responses'
import { domainOf, eventById, mitigationOf, orderCost, postOf, repairBill } from '../src/engine/rules'
import type { GameState, TurnActions } from '../src/engine/types'
import { heldForLater, movesOpen, worstCase } from '../src/engine/worstCase'
import { NO_ORDERS, atStakeOf, contactsFor, dodgeOf, eventDef, fixNext, spotAdvice, type Orders } from '../src/ui/three/gameModel'
import { nightOf } from '../src/ui/night/nightModel'
import { WATCH } from './policies'

const SEEDS = 120
const ordersOf = (a: TurnActions): Orders => ({ defense: null, place: null, assets: a.buyAssets.map((b) => b.kind), scans: a.scans ?? [], sighted: a.sighted ?? [] })

function* nights(seeds = SEEDS): Generator<{ state: GameState; actions: TurnActions; after: GameState; where: string }> {
  for (const line of WATCH.filter((l) => l.name === 'prepared' || l.name === 'novice')) {
    for (const difficulty of ['standard', 'easy'] as const) {
      for (let seed = 1; seed <= seeds; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          const actions = line.policy(state)
          const after = playNight(state, actions, line.respond)
          yield { state, actions, after, where: `${line.name} ${difficulty} seed ${seed} night ${state.turn}` }
          state = after
        }
      }
    }
  }
}

describe('ruling 4: the advice counts the watch post it gives up', () => {
  it('BEST SPOT never leaves AT STAKE worse than the night stands without the piece, and where every spot would, none is called best', () => {
    let pieces = 0
    let posted = 0
    let cost = 0
    let saved = 0
    for (const { state, actions, where } of nights(20)) {
      const orders = ordersOf(actions)
      const before = atStakeOf(contactsFor(state, orders))
      for (const cm of state.scenario.countermeasures) {
        if (state.counters.includes(cm.id)) continue
        pieces += 1
        const advice = spotAdvice(state, orders, cm.id)
        expect(advice.before, `${where} ${cm.id}: the night as it stands`).toBe(before)
        expect(advice.best, `${where} ${cm.id}: no spot`).toBeDefined()
        // What the card shows once it is placed there is what the advice said.
        const placed = atStakeOf(contactsFor(state, { ...orders, defense: cm.id, place: advice.best! }))
        expect(placed, `${where} ${cm.id}: AT STAKE on the recommended spot`).toBe(advice.after)
        const kinds = domainOf(state.scenario, cm.id)
        const spots = state.assets.filter((a) => a.integrity > 0 && kinds.includes(a.kind)).map((a) => atStakeOf(contactsFor(state, { ...orders, defense: cm.id, place: a.id })))
        if (advice.raises) {
          // Not called best, and truly so: no spot it can sit on holds the line.
          cost += 1
          expect(Math.max(...spots), `${where} ${cm.id}: a spot that held was passed over`).toBeLessThan(before - 0.05)
          expect(advice.after).toBe(Math.max(...spots))
          expect(advice.gives, `${where} ${cm.id}: the post it gives up is not named`).toBe(postOf(state))
        } else {
          expect(placed, `${where} ${cm.id}: BEST SPOT raised AT STAKE from ${before} to ${placed}`).toBeGreaterThanOrEqual(before - 0.05)
          // The case the R3 reviewer met: some spot would have raised it.
          if (Math.min(...spots) < before - 0.05) saved += 1
        }
        if (postOf(state)) posted += 1
      }
    }
    // Not vacuous: boards with a post standing, pieces that cost it
    // wherever they go, and pieces with a wrong spot the advice avoided.
    expect(pieces).toBeGreaterThan(2500)
    expect(posted).toBeGreaterThan(pieces / 2)
    expect(cost, 'no piece ever cost the post, so the warning went untested').toBeGreaterThan(10)
    expect(saved, 'no piece ever had a spot that raised AT STAKE, so the choice went untested').toBeGreaterThan(100)
    if (process.env.SWEEP) process.stderr.write(`\nadvice: ${pieces} pieces, ${posted} with a post standing, ${cost} cost the post wherever they go, ${saved} had a spot that raised AT STAKE\n`)
  }, 120_000)

  it('FIX NEXT names a piece only when placing it tomorrow leaves tomorrow no worse, and names the post when none can', () => {
    let fixes = 0
    let costly = 0
    let none = 0
    for (const { state, after, where } of nights()) {
      const night = nightOf(state, after)
      const through = night.steps
        .filter((s) => s.kind === 'threat' && s.ev.effectiveSeverity > 0)
        .sort((a, b) => a.scoreAfter - a.scoreBefore - (b.scoreAfter - b.scoreBefore))
        .map((s) => s.def)
      const fix = fixNext(after, through)
      if (!through.length) {
        expect(fix, where).toBeNull()
        continue
      }
      expect(fix, where).not.toBeNull()
      if (!fix!.cm) none += 1
      else if (fix!.gives) {
        costly += 1
        // Every piece that answers what got through would cost the post.
        for (const def of through) {
          const id = def.counters.find((c) => !after.counters.includes(c))
          if (id) expect(spotAdvice(after, NO_ORDERS, id).raises, `${where}: ${id} was passed over`).toBe(true)
        }
        expect(fix!.gives).toBe(postOf(after))
      } else {
        fixes += 1
        expect(after.counters, where).not.toContain(fix!.cm.id)
        expect(fix!.def.counters, where).toContain(fix!.cm.id)
        if (after.status === 'playing') {
          const advice = spotAdvice(after, NO_ORDERS, fix!.cm.id)
          expect(advice.raises, `${where}: FIX NEXT ${fix!.cm.id} raises tomorrow's AT STAKE from ${advice.before} to ${advice.after}`).toBe(false)
        }
      }
    }
    expect(fixes).toBeGreaterThan(500)
    expect(costly + none, 'the advice never had to hold back').toBeGreaterThan(0)
  })

  it('a result names the switch, and never calls a piece what would have helped against a move COLDVEIL would have left', () => {
    let switched = 0
    let stayed = 0
    for (const { state, actions, after, where } of nights()) {
      void actions
      for (const step of nightOf(state, after).steps) {
        if (step.kind !== 'threat' || step.ev.effectiveSeverity === 0) continue
        const id = step.def.counters.find((c) => !step.after.counters.includes(c))
        if (!id) continue
        const dodge = dodgeOf(step.before, step.def, id)
        const read = adversaryPicks(step.before, [...step.before.counters, id]).find((r) => r.candidates.some((c) => c.id === step.def.id))!
        if (dodge) {
          switched += 1
          // COLDVEIL would have left this move, for one that still lands.
          expect(read.least, where).not.toContain(step.def.id)
          expect(read.least, where).toContain(dodge.id)
          expect(dodge.baseSeverity - mitigationOf(dodge, [...step.before.counters, id]), where).toBeGreaterThanOrEqual(0)
        } else stayed += 1
      }
    }
    expect(switched, 'no result ever met a switch').toBeGreaterThan(50)
    expect(stayed).toBeGreaterThan(50)
  })
})

describe('ruling 5: WORST CASE warns only when the risk is real', () => {
  it('counts the moves COLDVEIL can take tonight, and holds back tomorrow and no further', () => {
    let turned = 0
    for (const { state, actions, where } of nights()) {
      const wc = worstCase(state, actions)
      const counters = [...state.counters, ...actions.buyCounters.filter((c) => !state.counters.includes(c))]
      // Tonight: every move the engine's own pick can be drawn from.
      const open = movesOpen(state, state.turn, counters)
      const picks = adversaryPicks(state, counters)
      expect(open, where).toEqual(picks.map((r) => r.least))
      if (picks.some((r) => r.least.length < r.candidates.length)) turned += 1
      // The nights after tomorrow are not held for.
      const last = state.turn >= state.scenario.totalTurns
      expect(wc.later, where).toBe(heldForLater(state, counters))
      if (last) expect(wc.later, `${where}: held back on the last night`).toBe(0)
      else {
        // Tomorrow at its average: on each track the mean bill of the moves
        // COLDVEIL can take, plus upkeep, less the funding before it (a
        // debris night's own figure aside).
        const tomorrow = movesOpen(state, state.turn + 1, counters)
        if (!tomorrow.flat().some((id) => eventDef(state, id).effect.special === 'debrisStrike')) {
          let bills = 0
          for (const ids of tomorrow) {
            bills +=
              ids.reduce((n, id) => {
                const ev = eventById(state.scenario, id)
                return n + repairBill(ev, Math.max(0, ev.baseSeverity + (ev.effect.special === 'chainExploit' ? 1 : 0) - mitigationOf(ev, counters)), state.difficulty)
              }, 0) / ids.length
          }
          expect(wc.later, where).toBe(Math.max(0, Math.ceil(bills + counters.length * state.scenario.upkeepPerDefense - state.scenario.incomePerTurn)))
        }
      }
      expect(wc.value, where).toBe(state.credits - orderCost(state, actions) - wc.repairs - wc.upkeep - wc.later)
    }
    expect(turned, 'COLDVEIL never turned from a move, so the reading went untested').toBeGreaterThan(100)
  })

  it('does not call a first piece dangerous on a full budget: the R3 reviewer was warned off an 8 CR piece with 62 CR in the bank', () => {
    for (const difficulty of ['standard', 'easy'] as const) {
      for (let seed = 1; seed <= 60; seed += 1) {
        const state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        for (const cm of state.scenario.countermeasures) {
          const wc = worstCase(state, { buyAssets: [], buyCounters: [cm.id] })
          expect(wc.value, `${difficulty} seed ${seed}: ${cm.id} at ${cm.cost} CR on ${state.credits} CR reads ${wc.value}`).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })
})
