// What the aftermath says when a threat landed through every applicable
// defense (critique row M8). The one purchase left is the IR retainer, so
// the line names it, with how much faster it recovers read off the
// scenario: "three times" for the shipped 6 against 2, and a plain
// "faster" when a retune leaves no whole number of times.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame } from '../src/engine/reducer'
import type { ResolvedEvent, Scenario } from '../src/engine/types'
import { full, short } from '../src/ui/wouldHaveHelped'

const scenario = DEFAULT_SCENARIO
// A threat whose defenses carry no gate of their own (no Tier A share, no
// maneuver budget), so owning them all reaches the final branch.
const def = scenario.events.find(
  (e) => e.kind !== 'opportunity' && e.counters.length > 0 && !e.counters.includes('tierAAttestation') && e.effect.special !== 'debrisStrike',
)!
const ev = { eventId: def.id, chainBonus: 0, mitigation: 0 } as ResolvedEvent
const owned = { ...newGame(scenario, 1, 'standard'), counters: [...def.counters] }
const retuned = (base: number, withIrRetainer: number): Scenario => ({ ...scenario, recovery: { base, withIrRetainer } })

describe('the aftermath when every applicable defense was active', () => {
  it('names the retainer when it was not owned, three times faster as shipped', () => {
    expect(def, 'no threat in the deck reaches the final branch').toBeDefined()
    expect(scenario.recovery).toEqual({ base: 2, withIrRetainer: 6 })
    expect(full(ev, { ...owned, irRetainer: false }, scenario)).toBe(
      'Every applicable defense was active. The incident response retainer would have recovered the damage three times faster.',
    )
  })

  it('keeps the ratio true when recovery is retuned', () => {
    const say = (s: Scenario) => full(ev, { ...owned, irRetainer: false, scenario: s }, s)
    expect(say(retuned(2, 8))).toContain('recovered the damage four times faster.')
    expect(say(retuned(2, 5))).toContain('recovered the damage faster.')
    expect(say(retuned(0, 6))).toContain('recovered the damage faster.')
    // No faster than base, so the retainer is not named at all.
    for (const s of [retuned(2, 2), retuned(3, 2)]) {
      expect(say(s)).toBe('Every applicable defense was active. What landed is what the attack buys through them.')
    }
  })

  it('says what it always said once the retainer is owned', () => {
    expect(full(ev, { ...owned, irRetainer: true }, scenario)).toBe(
      'Every applicable defense was active. What landed is what the attack buys through them.',
    )
  })
})

// The short form (critique row M3), for the hit card and the verdict: the
// missing defenses by name, no parentheticals.
describe('the short form', () => {
  const nameOf = (id: string) => scenario.countermeasures.find((c) => c.id === id)!.name
  const nothing = { ...newGame(scenario, 1, 'standard'), counters: [] }
  const evOf = (id: string) => ({ eventId: id, chainBonus: 0, mitigation: 0 }) as ResolvedEvent
  const two = scenario.events.find((e) => e.counters.length === 2)!

  it('names one missing defense, two with "or", and three as a list ending in "or"', () => {
    expect(two, 'no threat in the deck lists two defenses').toBeDefined()
    const [a, b] = two.counters
    expect(short(evOf(two.id), nothing, scenario)).toBe(`Would have helped: ${nameOf(a)} or ${nameOf(b)}`)
    expect(short(evOf(two.id), { ...nothing, counters: [a] }, scenario)).toBe(`Would have helped: ${nameOf(b)}`)
    const c = scenario.countermeasures.find((cm) => cm.counters.length > 0 && !two.counters.includes(cm.id))!.id
    const three: Scenario = { ...scenario, events: scenario.events.map((e) => (e.id === two.id ? { ...e, counters: [a, b, c] } : e)) }
    expect(short(evOf(two.id), nothing, three)).toBe(`Would have helped: ${nameOf(a)}, ${nameOf(b)} or ${nameOf(c)}`)
  })

  it('is empty once every applicable defense was owned', () => {
    expect(short(evOf(two.id), { ...nothing, counters: [...two.counters] }, scenario)).toBe('')
  })

  it('names exactly the defenses the full sentence names, for every threat in the deck', () => {
    // Derived both ways, so the two forms cannot drift apart: what the
    // card says is missing is what the ledger says is missing.
    const threats = scenario.events.filter((e) => e.kind !== 'opportunity')
    expect(threats.length).toBeGreaterThan(0)
    for (const e of threats) {
      const inShort = short(evOf(e.id), nothing, scenario).replace('Would have helped: ', '').split(/, | or /)
      const inFull = full(evOf(e.id), nothing, scenario)
        .replace('What would have helped: ', '')
        .split('; ')
        .map((part) => part.replace(/ \(.*$/, ''))
      expect(inShort, e.id).toEqual(inFull)
      expect(inShort, e.id).toEqual(e.counters.map(nameOf))
    }
  })
})
