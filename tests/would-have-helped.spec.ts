// What would have helped (critique rows M3 and M8), as the night says it.
// The sentences used to come from src/ui/wouldHaveHelped.ts (a full form
// for the aftermath's ledger, a short one for the hit card and the
// verdict), which v1.3 R3 retired with the director and the aftermath
// card. The night's hit card says it now (brief 5.5 item 2): an
// UNDEFENDED block names the one defense that would have helped, its
// price, what it stops and that PROCURE has it next turn; a REDUCED block
// names the one that would have finished it. Which defense each block
// names is the night model's defensesFor; the words are
// src/ui/night/nightCopy.ts. The cards themselves, over real play, are in
// tests/would-have-helped.dom.spec.tsx.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { ASSET_HEAL_PER_TURN } from '../src/engine/rules'
import type { GameState } from '../src/engine/types'
import * as copy from '../src/ui/night/nightCopy'
import { defensesFor, nightOf } from '../src/ui/night/nightModel'
import { POLICIES } from './policies'
import { LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

const scenario = DEFAULT_SCENARIO
const nameOf = (id: string) => scenario.countermeasures.find((c) => c.id === id)!.name
const costOf = (id: string) => scenario.countermeasures.find((c) => c.id === id)!.cost

// Which defense a block names (v1.3 brief 6.1): the event's first listed
// defense is its primary, and the block names the first one in that order
// the player owned (HELD, REDUCED) and the first one they did not (what
// would have helped, what would have finished it).
describe('the defense the outcome block names', () => {
  const two = scenario.events.find((e) => e.kind !== 'opportunity' && e.counters.length === 2 && e.effect.special !== 'debrisStrike')!

  it('follows the threat\'s own order, whichever of its defenses is owned', () => {
    expect(two, 'no threat in the deck lists a primary and a secondary').toBeDefined()
    const [primary, secondary] = two.counters
    const ids = (owned: string[]) => {
      const d = defensesFor(two, owned, scenario)
      return { held: d.held?.id, missing: d.missing?.id }
    }
    expect(ids([])).toEqual({ held: undefined, missing: primary })
    expect(ids([primary])).toEqual({ held: primary, missing: secondary })
    // The worth follows the defense's place in the threat's list, not which
    // of them happens to be missing.
    expect(ids([secondary])).toEqual({ held: secondary, missing: primary })
    // Once every applicable defense is owned, nothing is missing, and a
    // block has nothing to name.
    expect(ids([primary, secondary])).toEqual({ held: primary, missing: undefined })
  })

  it('names exactly what the engine credits and records missed, on every threat of real play', () => {
    // Derived both ways, so the card and the engine cannot drift apart:
    // the defense a HELD or REDUCED block names is the one the engine
    // credits with the block, and the one an UNDEFENDED or REDUCED block
    // says would have helped is the one the engine records the player
    // missed (src/engine/reducer.ts, learn).
    const lines = [WIN_SCRIPT, MIXED_SCRIPT, LOSS_SCRIPT].map((s) => (state: GameState) => s[state.turn] ?? NO_OP)
    let held = 0
    let missed = 0
    for (const line of [...lines, ...POLICIES.map((p) => p.policy)]) {
      for (const seed of [20260712, 4041, 1, 2, 3]) {
        let state = newGame(scenario, seed, 'standard')
        while (state.status === 'playing') {
          const after = resolveTurn(state, line(state), turnRng(state.seed, state.turn))
          for (const step of nightOf(state, after).steps) {
            if (step.kind !== 'threat') continue
            const d = defensesFor(step.def, step.after.counters, scenario)
            const where = `seed ${seed} turn ${state.turn} ${step.def.id}`
            if (d.held) {
              expect(after.learned.some((l) => l.counter === d.held!.id && l.threat === step.def.id), `${where}: the card credits a defense the engine did not`).toBe(true)
              held += 1
            }
            if (d.missing && step.ev.effectiveSeverity > 0) {
              expect(after.learned.some((l) => l.counter === d.missing!.id && l.threat === step.def.id), `${where}: the card names a defense the engine did not record missed`).toBe(true)
              missed += 1
            }
          }
          state = after
        }
      }
    }
    expect(held, 'no block was credited in the sweep').toBeGreaterThan(0)
    expect(missed, 'nothing was missed in the sweep').toBeGreaterThan(0)
  })
})

// The words (critique row M3: the defense by name, its price, and where to
// get it), held to the sentences the brief gives.
describe('what the blocks say', () => {
  const id = scenario.countermeasures[0].id
  const say = (parts: readonly string[]) => parts.join('')

  it('says what would have helped with its price, what it stops, and that PROCURE has it next turn', () => {
    expect(say(copy.wouldHaveHelped(nameOf(id), costOf(id)))).toBe(`What would have helped: ${nameOf(id)}, ${costOf(id)} CR.`)
    expect(copy.itStops([['stops', ['GNSS spoofing']]])).toBe('It stops GNSS spoofing.')
    expect(copy.itStops([['stops', ['GNSS spoofing', 'GNSS jamming']]])).toBe('It stops GNSS spoofing and GNSS jamming.')
    // A defense that only blunts a move says so, its move's group first
    // (R6 question 2).
    expect(copy.itStops([['blunts', ['BLACKOUT CHAIN']], ['stops', ['LiDAR blinding']]])).toBe('It blunts BLACKOUT CHAIN and stops LiDAR blinding.')
    expect(copy.itStops([['blunts', ['BLACKOUT CHAIN']], ['stops', []]])).toBe('It blunts BLACKOUT CHAIN.')
    // Past two names, this move and a count (the line stays a line).
    expect(copy.itStops([['blunts', ['A']], ['stops', ['B', 'C']]])).toBe('It blunts A and answers 2 more threats you have met.')
    // Cut from the brief's "...next turn with that written on it." by Ken,
    // 22 October 2026 (R3 report, question 4).
    expect(copy.IN_PROCURE).toBe('It is in PROCURE next turn.')
  })

  it('says what would have finished a partial, with its price', () => {
    expect(say(copy.finishedIt(nameOf(id), costOf(id)))).toBe(`Would have finished it: ${nameOf(id)}, ${costOf(id)} CR.`)
  })

  it('makes the debris a call: the SSA service makes the burn free, and owning it leaves the hold as the gamble', () => {
    const debris = scenario.events.find((e) => e.effect.special === 'debrisStrike')
    expect(debris, 'no debris in the deck').toBeDefined()
    expect(debris!.counters).toEqual(['ssaManeuver'])
    const ssa = scenario.countermeasures.find((c) => c.id === 'ssaManeuver')!
    // A satellite lost on the hold, and a call made without the service.
    expect(say(copy.debrisHelp(true, ssa.name, ssa.cost))).toBe(`What would have helped: ${ssa.name}, ${ssa.cost} CR, for exact odds and free fuel.`)
    expect(say(copy.debrisHelp(false, ssa.name, ssa.cost))).toBe(`Would have made this an easy call: ${ssa.name}, ${ssa.cost} CR, for exact odds and free fuel.`)
    // With the service the burn is budgeted, and the odds are exact; the
    // fuel is on the button's face (v1.3 R3 fresh-eyes review).
    expect(copy.burnFace(0)).toBe('BURN · 0 CR')
    expect(copy.burnFace(10)).toBe('BURN · 10 CR')
    expect(copy.burnLine(true, 0.35, 'SG-2', null)).toBe('Fuel already budgeted. SG-2 dodges a collision chance of 35 percent.')
    expect(copy.burnLine(false, 0.35, 'SG-2', null)).toBe('Unbudgeted fuel. SG-2 dodges a collision chance of somewhere between 20 and 60 percent.')
    // The coverage bonus is named only when the burn puts it at risk.
    expect(copy.burnLine(false, 0.35, 'SG-2', 10)).toContain('can lose you the 10 CR coverage bonus')
    expect(copy.burnLine(false, 0.35, 'SG-2', null)).not.toContain('coverage bonus')
  })
})

// When every applicable defense was active (critique row M8), the one
// purchase left is the incident response retainer, and END OF TURN names it on a damaged
// board (tests/would-have-helped.dom.spec.tsx renders it). The figures are
// read off the scenario and the rules, so a retune moves the words with
// them; and since the R6b fresh-eyes pass the line says what the retainer
// speeds (the link, data and sensor recovery) and what it does not (an
// asset's overnight heal), where it had said all repair ran 3 times faster.
describe('the retainer at the close', () => {
  it('says what the retainer speeds, from the scenario and the rules, and that asset repair is the same either way', () => {
    expect(scenario.recovery).toEqual({ base: 2, withIrRetainer: 6 })
    expect(ASSET_HEAL_PER_TURN).toBe(10)
    expect(copy.recoverySlow(ASSET_HEAL_PER_TURN, 2, 6)).toBe(
      'Damaged assets recover 10 integrity a night either way. Link, data and sensor health recover 2 a night; an incident response retainer makes it 6.',
    )
    expect(copy.recoveryFast(ASSET_HEAL_PER_TURN, 2, 6)).toBe(
      'Damaged assets recover 10 integrity a night. Your incident response retainer recovers link, data and sensor health 6 a night instead of 2.',
    )
  })
})
