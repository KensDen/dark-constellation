// ONE NEW DEFENSE A NIGHT (v1.4, Ken's ruling of 24 October 2026 on the
// R6b measurement, option A). The cap lives in the engine, not only in
// PROCURE: resolveTurn refuses orders that add a second defense the player
// does not already own, on both difficulties, and every line the sweep
// plays plans its one order itself (tests/policies.ts), so no night of any
// line records two.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { NEW_DEFENSES_PER_NIGHT, defenseOpen, newDefenses, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { CountermeasureId, GameState } from '../src/engine/types'
import { POLICIES, REPORTED } from './policies'
import { a } from './scripts'

const IDS = DEFAULT_SCENARIO.countermeasures.map((c) => c.id)
const play = (state: GameState, buyCounters: CountermeasureId[]) => resolveTurn(state, a({ buyCounters }), turnRng(state.seed, state.turn))

describe('one new defense a night (v1.4)', () => {
  it('is one', () => {
    expect(NEW_DEFENSES_PER_NIGHT).toBe(1)
  })

  it('GUARD v1.4: the engine refuses a second new defense in a night, every pair, on both difficulties', () => {
    for (const difficulty of ['standard', 'easy'] as const) {
      const start = newGame(DEFAULT_SCENARIO, 7, difficulty)
      for (const first of IDS) {
        for (const second of IDS) {
          if (second === first) continue
          // Rich enough that the budget is never the reason.
          const rich: GameState = { ...start, credits: 1000 }
          expect(() => play(rich, [first, second]), `${difficulty}: ${first} and ${second} together`).toThrow(/one new defense a night/)
        }
      }
    }
  })

  it('refuses it on any night, not only the first', () => {
    let s = newGame(DEFAULT_SCENARIO, 3)
    for (const id of ['antiJam', 'pntAuth', 'sensorFusion'] as const) {
      expect(() => play({ ...s, credits: 1000 }, [id, 'groundZeroTrust'])).toThrow(/one new defense a night/)
      s = play(s, [id])
    }
    expect(s.counters).toEqual(['antiJam', 'pntAuth', 'sensorFusion'])
  })

  it('counts only what is new: a defense already owned, or one listed twice, is not a second', () => {
    const owned: GameState = { ...newGame(DEFAULT_SCENARIO, 5), counters: ['pntAuth'] }
    expect(newDefenses(owned, a({ buyCounters: ['pntAuth', 'antiJam', 'antiJam'] }))).toEqual(['antiJam'])
    const after = play(owned, ['pntAuth', 'antiJam', 'antiJam'])
    expect(after.counters).toEqual(['pntAuth', 'antiJam'])
    expect(after.history[0].ledger.ordered).toBe(10)
    // Nothing new is not a refusal either.
    expect(() => play(owned, ['pntAuth'])).not.toThrow()
  })

  it('says whether tonight has room for one, as PROCURE reads it', () => {
    const s = newGame(DEFAULT_SCENARIO, 5)
    expect(defenseOpen(s, a({}))).toBe(true)
    expect(defenseOpen(s, a({ buyCounters: ['antiJam'] }))).toBe(false)
    expect(defenseOpen({ ...s, counters: ['antiJam'] }, a({ buyCounters: ['antiJam'] }))).toBe(true)
  })

  it('leaves the state as it was when it refuses', () => {
    const s = { ...newGame(DEFAULT_SCENARIO, 9), credits: 1000 }
    const before = JSON.stringify({ ...s, scenario: undefined })
    expect(() => play(s, ['antiJam', 'pntAuth'])).toThrow()
    expect(JSON.stringify({ ...s, scenario: undefined })).toBe(before)
  })

  it('no night of any line the sweep plays records more than one new defense, on 100 seeds of both difficulties', () => {
    const defenseNames = new Set(DEFAULT_SCENARIO.countermeasures.map((c) => c.name))
    let nights = 0
    let ordered = 0
    for (const { name, policy } of [...POLICIES, ...REPORTED]) {
      for (const difficulty of ['standard', 'easy'] as const) {
        for (let seed = 1; seed <= 100; seed += 1) {
          let s = newGame(DEFAULT_SCENARIO, seed, difficulty)
          while (s.status === 'playing') s = resolveTurn(s, policy(s), turnRng(s.seed, s.turn))
          for (const rec of s.history) {
            nights += 1
            const added = rec.purchases.filter((p) => defenseNames.has(p.replace(/\s*\(-[^)]*\)$/, '')))
            if (added.length > 0) ordered += 1
            expect(added.length, `${name} ${difficulty} seed ${seed} turn ${rec.turn}: ${added.join(', ')}`).toBeLessThanOrEqual(NEW_DEFENSES_PER_NIGHT)
          }
        }
      }
    }
    // Not vacuous: most nights of play order a defense.
    expect(ordered).toBeGreaterThan(nights / 3)
  })
})
