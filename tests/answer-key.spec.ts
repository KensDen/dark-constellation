// GUARD (b), REWRITTEN TO RULING R1 (4 October 2026): the earned answer
// key. A defense names a threat it stops once the player has met that
// threat, or once tonight's intel brief has named it; it never names one
// the player has neither met nor been told about. v1.2's GUARD (b) said a
// defense named no threat at all; R1 replaced that rule, and brief 6.9
// keeps `met` per device, across games.
//
// The sweep plays one DEVICE through many games in a row, so `met` grows
// across them as it does on a phone, and at every turn's PROCURE asks the
// key of every defense with the brief as the board would read it (free, or
// queued in tonight's orders).

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { answerKey, metOnTurn } from '../src/engine/learning'
import { briefActive, candidatesTonight, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { POLICIES } from './policies'

describe('GUARD (b), rewritten to R1: the earned answer key', () => {
  it(
    'never names a threat the device has not met and tonight\'s brief has not named, and names every one it has',
    () => {
      const met = new Set<string>()
      let namedMet = 0
      let namedTonightOnly = 0
      let withheld = 0
      const leaks: string[] = []
      for (const p of POLICIES) {
        for (let seed = 1; seed <= 60; seed += 1) {
          let state: GameState = newGame(DEFAULT_SCENARIO, seed)
          while (state.status === 'playing') {
            const actions = p.policy(state)
            const named = new Set(briefActive(state, actions) ? candidatesTonight(state) : [])
            for (const cm of DEFAULT_SCENARIO.countermeasures) {
              const key = answerKey(cm, met, named)
              const where = `${p.name} seed ${seed} turn ${state.turn} ${cm.id}`
              for (const { id, tonight } of key.known) {
                if (!met.has(id) && !named.has(id)) leaks.push(`${where} names ${id}, neither met nor named`)
                if (tonight !== named.has(id)) leaks.push(`${where} marks ${id} tonight=${tonight}`)
                if (met.has(id) && !named.has(id)) namedMet += 1
                if (named.has(id) && !met.has(id)) namedTonightOnly += 1
              }
              // Complete as well as safe: every threat it stops that the
              // player has met or been told about is named, and the rest
              // are counted.
              const owed = cm.counters.filter((id) => met.has(id) || named.has(id))
              expect(key.known.map((k) => k.id), where).toEqual(owed)
              expect(key.unmet, where).toBe(cm.counters.length - owed.length)
              withheld += key.unmet
            }
            const after = resolveTurn(state, actions, turnRng(state.seed, state.turn))
            for (const id of metOnTurn(after.history.at(-1)!, DEFAULT_SCENARIO)) met.add(id)
            state = after
          }
        }
      }
      // Each branch of the rule was exercised: a name earned by meeting, a
      // name lent by tonight's brief alone, and threats held back unmet.
      expect(namedMet, 'no defense ever named a met threat').toBeGreaterThan(0)
      expect(namedTonightOnly, 'no defense ever named a threat on the brief alone').toBeGreaterThan(0)
      expect(withheld, 'no defense ever withheld an unmet threat').toBeGreaterThan(0)
      expect(leaks.slice(0, 20).join('\n'), `${leaks.length} leaks`).toBe('')
    },
    60_000,
  )

  it('counts only threats in met: an opportunity faced is not met', () => {
    const opportunity = DEFAULT_SCENARIO.events.find((e) => e.kind === 'opportunity')!
    expect(metOnTurn({ events: [{ eventId: opportunity.id } as never], named: [] }, DEFAULT_SCENARIO)).toEqual([])
  })
})
