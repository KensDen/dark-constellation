// What would have helped (critique rows M3 and M8), as the night says it.
// A move's card says it (brief 5.5 item 2): a move nothing stopped names
// the one defense that would have helped and its price; a move a defense
// only reduced names the one that would have finished it. Which defense
// each names is the night model's defensesFor; the words are
// src/ui/night/nightCopy.ts, and the 3D game's cards print them
// (src/ui/three/cards3d.tsx).

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import * as copy from '../src/ui/night/nightCopy'
import { defensesFor, nightOf } from '../src/ui/night/nightModel'
import { POLICIES } from './policies'
import { LOSS_SCRIPT, MIXED_SCRIPT, WIN_SCRIPT, scripted } from './scripts'

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
    // Each script as a line the engine takes (tests/scripts.ts, scripted).
    const lines = [WIN_SCRIPT, MIXED_SCRIPT, LOSS_SCRIPT].map((s) => scripted(s))
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

  it('says what would have helped, with its price', () => {
    expect(say(copy.wouldHaveHelped(nameOf(id), costOf(id)))).toBe(`What would have helped: ${nameOf(id)}, ${costOf(id)} CR.`)
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
    // With the service the burn is budgeted, and the odds are exact.
    expect(copy.burnLine(true, 0.35, 'SG-2', null)).toBe('Fuel already budgeted. SG-2 dodges a collision chance of 35 percent.')
    expect(copy.burnLine(false, 0.35, 'SG-2', null)).toBe('Unbudgeted fuel. SG-2 dodges a collision chance of 20 to 60 percent.')
    // The coverage bonus is named only when the burn puts it at risk.
    expect(copy.burnLine(false, 0.35, 'SG-2', 10)).toContain('can lose you the 10 CR coverage bonus')
    expect(copy.burnLine(false, 0.35, 'SG-2', null)).not.toContain('coverage bonus')
  })
})
