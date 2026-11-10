// THE NIGHT'S MODEL AGAINST THE ENGINE (v1.3 R3, brief 5.5). The night
// shows a resolved turn one event at a time, and two figures it shows the
// engine records only at the turn's end: the board between events (for
// the hit card's "-d" and the strip) and the defense streak after each
// event. src/ui/night/nightModel.ts carries both forward from the record;
// this proves that on every turn of 600 games, on both difficulties and a
// random line of play, the board it ends the night on, closed by the
// engine's own ledger, is the engine's next state, and its last streak is
// the record's. It also holds the debris call to what EXECUTE relies on:
// the BURN and HOLD resolutions agree on every event before the call.
//
// v1.7 R1, THE RESPONSE: two games in three of the sweep are now played
// with the night's choices made (the `sensible` and `careless` responders
// of tests/policies.ts, through the engine's own openChoice and answered),
// so the model's replay of a move a response blocked, of a halved move's
// half damage, and of the response's cost on the budget is held to the
// engine as well, step by step: the score of the board after each move is
// the score the engine recorded for it.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { answered, openChoice, responseOptions, type Responder } from '../src/engine/responses'
import { turnRng } from '../src/engine/rng'
import { maiScore } from '../src/engine/scoring'
import type { GameState, TurnActions } from '../src/engine/types'
import { HELD, HOOK, OFFICER } from '../src/ui/night/nightCopy'
import { callIndex, nightOf, resultOf } from '../src/ui/night/nightModel'
import { careless, ride, sensible } from './policies'
import { randomPolicy } from './scripts'

// A night with a responder making each choice as it comes, as playNight
// (src/engine/responses.ts) plays it, but keeping the answers too: the
// sweep resolves the same night again with the other debris call, and
// needs the same responses to do it.
function nightWith(state: GameState, actions: TurnActions, respond: Responder): { after: GameState; responses: (string | null)[] } {
  let responses: (string | null)[] = []
  for (;;) {
    const after = resolveTurn(state, { ...actions, responses }, turnRng(state.seed, state.turn))
    const events = after.history.at(-1)!.events
    const i = openChoice(events, responses)
    if (i < 0) return { after, responses }
    const def = state.scenario.events.find((e) => e.id === events[i].eventId)!
    responses = answered(responses, i, respond({ state, index: i, ev: events[i], def, options: responseOptions(def, events[i], state.difficulty) }))
  }
}

// A third of the sweep's games ride every move out, as every game did
// through v1.6; a third take the first response that fits; a third take it
// two times in three (v1.7 R1).
const RESPONDERS: Responder[] = [ride, sensible, careless]

describe('the night model', () => {
  it('lands on the engine: the board it ends on, closed by the ledger, is the next state, on every turn of 600 games', () => {
    let turns = 0
    let calls = 0
    const taken = { block: 0, halve: 0 }
    let offeredAndRidden = 0
    for (let seed = 1; seed <= 300; seed += 1) {
      for (const difficulty of ['standard', 'easy'] as const) {
        let s = newGame(DEFAULT_SCENARIO, seed * 7919, difficulty)
        const policy = randomPolicy(seed)
        const respond = RESPONDERS[seed % RESPONDERS.length]
        while (s.status === 'playing') {
          const act = policy(s)
          const { after: hold, responses } = nightWith(s, { ...act, debris: 'hold' }, respond)
          const k = callIndex(hold)
          if (k >= 0) {
            calls += 1
            const burn = resolveTurn(s, { ...act, debris: 'burn', responses }, turnRng(s.seed, s.turn))
            expect(burn.history.at(-1)!.events.slice(0, k), `seed ${s.seed} turn ${s.turn}: BURN and HOLD differ before the call`).toEqual(
              hold.history.at(-1)!.events.slice(0, k),
            )
          }
          const night = nightOf(s, hold)
          const last = night.steps.at(-1)?.after ?? night.opening
          const l = night.record.ledger
          const where = `seed ${s.seed} turn ${s.turn}`
          // Each move as the model replays it (v1.7 R1): the board after it
          // scores what the engine recorded, so a halved move did its half
          // and a move a response blocked did nothing, on the meters and
          // on the tile; and the budget fell by the response's cost there.
          for (const step of night.steps) {
            expect(maiScore(step.after), `${where}: the score after ${step.ev.eventId}`).toBe(step.ev.scoreAfter)
            if (step.kind !== 'threat') continue
            expect(step.before.credits - step.after.credits, `${where}: what ${step.ev.eventId} took from the budget`).toBe(step.ev.response?.cost ?? 0)
            if (step.ev.response) taken[step.ev.response.effect] += 1
            else if (step.ev.room !== undefined) offeredAndRidden += 1
          }
          expect(l.responses ?? 0, `${where}: the ledger's responses`).toBe(night.steps.reduce((n, x) => n + (x.ev.response?.cost ?? 0), 0))
          expect(last.credits, `${where}: the budget after the night`).toBe(l.afterNight)
          for (const key of ['linkAvailability', 'dataIntegrity', 'sensorIntegrity'] as const) {
            expect(Math.min(100, last.meters[key] + l.recovery), `${where}: ${key}`).toBe(hold.meters[key])
          }
          for (const a of last.assets) {
            const engine = hold.assets.find((x) => x.id === a.id)!
            const healed = !l.insolvent && a.integrity > 0 && a.integrity < 100 ? Math.min(100, a.integrity + 10) : a.integrity
            expect(healed, `${where}: ${a.id}`).toBe(engine.integrity)
          }
          const counted = last.conditions.map((c) => ({ ...c, remainingTurns: c.remainingTurns - 1 })).filter((c) => c.remainingTurns > 0)
          expect(counted, `${where}: conditions`).toEqual(hold.conditions)
          expect(night.steps.filter((x) => x.kind === 'threat').at(-1)?.streak ?? s.streak, `${where}: streak`).toBe(night.record.streak)
          s = hold
          turns += 1
        }
      }
    }
    // The sweep reached the call and played many turns.
    expect(calls).toBeGreaterThan(300)
    expect(turns).toBeGreaterThan(2500)
    // And it met the response in each of its forms (v1.7 R1): blocks,
    // halves, and moves that offered one and were ridden out.
    expect(taken.block, 'the sweep blocked too few moves with a response').toBeGreaterThan(200)
    expect(taken.halve, 'the sweep halved too few moves').toBeGreaterThan(50)
    expect(offeredAndRidden, 'the sweep rode out too few moves that offered a response').toBeGreaterThan(200)
  })

  it('reads the result panel off the record: blocked first, and the verdict from what got through', () => {
    const r = resultOf({ baseSeverity: 3, chainBonus: 1, effectiveSeverity: 1 } as never)
    expect(r).toEqual({ strength: 4, blocked: 3, through: 1, chained: true, halved: 0, verdict: 'PARTIAL' })
    expect(resultOf({ baseSeverity: 2, chainBonus: 0, effectiveSeverity: 0 } as never).verdict).toBe('BLOCKED')
    expect(resultOf({ baseSeverity: 2, chainBonus: 0, effectiveSeverity: 2 } as never).verdict).toBe('HIT')
    // The response (v1.7 R1). A halved move lands at its strength, so every
    // point that got through is a halved one and the verdict says so, even
    // where a defense took a point first; a move a response blocked reads
    // as any block does.
    const halve = { id: 'x', effect: 'halve', cost: 8 } as const
    expect(resultOf({ baseSeverity: 2, chainBonus: 0, effectiveSeverity: 2, response: halve } as never)).toEqual({ strength: 2, blocked: 0, through: 2, chained: false, halved: 2, verdict: 'HALVED' })
    expect(resultOf({ baseSeverity: 3, chainBonus: 0, effectiveSeverity: 1, response: halve } as never)).toMatchObject({ blocked: 2, through: 1, halved: 1, verdict: 'HALVED' })
    expect(resultOf({ baseSeverity: 2, chainBonus: 0, effectiveSeverity: 0, response: { id: 'y', effect: 'block', cost: 16 } } as never)).toMatchObject({ blocked: 2, through: 0, halved: 0, verdict: 'BLOCKED' })
  })

  it('has an officer line and a hook for every threat in the deck, and a held line for every one a defense can hold', () => {
    for (const ev of DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat')) {
      expect(OFFICER[ev.id], `no officer line for ${ev.id}`).toBeTruthy()
      expect(HOOK[ev.id], `no hook for ${ev.id}`).toBeTruthy()
      if (ev.effect.special !== 'debrisStrike') expect(HELD[ev.id], `no held line for ${ev.id}`).toBeTruthy()
    }
  })
})
