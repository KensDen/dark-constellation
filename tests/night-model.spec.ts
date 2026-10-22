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

import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { HELD, HOOK, OFFICER } from '../src/ui/night/nightCopy'
import { callIndex, nightOf, resultOf } from '../src/ui/night/nightModel'
import { randomPolicy } from './scripts'

describe('the night model', () => {
  it('lands on the engine: the board it ends on, closed by the ledger, is the next state, on every turn of 600 games', () => {
    let turns = 0
    let calls = 0
    for (let seed = 1; seed <= 300; seed += 1) {
      for (const difficulty of ['standard', 'easy'] as const) {
        let s = newGame(DEFAULT_SCENARIO, seed * 7919, difficulty)
        const policy = randomPolicy(seed)
        while (s.status === 'playing') {
          const act = policy(s)
          const hold = resolveTurn(s, { ...act, debris: 'hold' }, turnRng(s.seed, s.turn))
          const k = callIndex(hold)
          if (k >= 0) {
            calls += 1
            const burn = resolveTurn(s, { ...act, debris: 'burn' }, turnRng(s.seed, s.turn))
            expect(burn.history.at(-1)!.events.slice(0, k), `seed ${s.seed} turn ${s.turn}: BURN and HOLD differ before the call`).toEqual(
              hold.history.at(-1)!.events.slice(0, k),
            )
          }
          const night = nightOf(s, hold)
          const last = night.steps.at(-1)?.after ?? night.opening
          const l = night.record.ledger
          const where = `seed ${s.seed} turn ${s.turn}`
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
  })

  it('reads the result panel off the record: blocked first, and the verdict from what got through', () => {
    const r = resultOf({ baseSeverity: 3, chainBonus: 1, effectiveSeverity: 1 } as never)
    expect(r).toEqual({ strength: 4, blocked: 3, through: 1, chained: true, verdict: 'PARTIAL' })
    expect(resultOf({ baseSeverity: 2, chainBonus: 0, effectiveSeverity: 0 } as never).verdict).toBe('BLOCKED')
    expect(resultOf({ baseSeverity: 2, chainBonus: 0, effectiveSeverity: 2 } as never).verdict).toBe('HIT')
  })

  it('has an officer line and a hook for every threat in the deck, and a held line for every one a defense can hold', () => {
    for (const ev of DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat')) {
      expect(OFFICER[ev.id], `no officer line for ${ev.id}`).toBeTruthy()
      expect(HOOK[ev.id], `no hook for ${ev.id}`).toBeTruthy()
      if (ev.effect.special !== 'debrisStrike') expect(HELD[ev.id], `no held line for ${ev.id}`).toBeTruthy()
    }
  })
})
