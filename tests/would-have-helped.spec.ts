// What the aftermath says when a threat landed through every applicable
// defense (critique row M8). The one purchase left is the IR retainer, so
// the line names it, with how much faster it recovers read off the
// scenario: "three times" for the shipped 6 against 2, and a plain
// "faster" when a retune leaves no whole number of times. Since v1.3
// Round 0 the retainer is a countermeasure like any other, owned when it
// is in state.counters (there is no irRetainer flag on the state).

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame } from '../src/engine/reducer'
import type { ResolvedEvent, Scenario } from '../src/engine/types'
import { full, short } from '../src/ui/wouldHaveHelped'

const scenario = DEFAULT_SCENARIO
// A threat with defenses that is not the debris, which is a call with its
// own sentence (v1.3 Round 0 retired the Tier A share and the maneuver
// budget that used to gate a defense), so owning them all reaches the
// final branch.
const def = scenario.events.find((e) => e.kind !== 'opportunity' && e.counters.length > 0 && e.effect.special !== 'debrisStrike')!
const ev = { eventId: def.id, chainBonus: 0, mitigation: 0 } as ResolvedEvent
// Every applicable defense owned, and the retainer not.
const owned = { ...newGame(scenario, 1, 'standard'), counters: [...def.counters] }
const withRetainer = { ...owned, counters: [...def.counters, 'irRetainer' as const] }
const retuned = (base: number, withIrRetainer: number): Scenario => ({ ...scenario, recovery: { base, withIrRetainer } })

describe('the aftermath when every applicable defense was active', () => {
  it('names the retainer when it was not owned, three times faster as shipped', () => {
    expect(def, 'no threat in the deck reaches the final branch').toBeDefined()
    expect(owned.counters, 'the fixture owns the retainer already').not.toContain('irRetainer')
    expect(scenario.recovery).toEqual({ base: 2, withIrRetainer: 6 })
    expect(full(ev, owned, scenario)).toBe(
      'Every applicable defense was active. The incident response retainer would have recovered the damage three times faster.',
    )
  })

  it('keeps the ratio true when recovery is retuned', () => {
    const say = (s: Scenario) => full(ev, { ...owned, scenario: s }, s)
    expect(say(retuned(2, 8))).toContain('recovered the damage four times faster.')
    expect(say(retuned(2, 5))).toContain('recovered the damage faster.')
    expect(say(retuned(0, 6))).toContain('recovered the damage faster.')
    // No faster than base, so the retainer is not named at all.
    for (const s of [retuned(2, 2), retuned(3, 2)]) {
      expect(say(s)).toBe('Every applicable defense was active. What landed is what the attack buys through them.')
    }
  })

  it('says what it always said once the retainer is owned', () => {
    expect(full(ev, withRetainer, scenario)).toBe('Every applicable defense was active. What landed is what the attack buys through them.')
  })
})

// Each missing defense's worth (v1.3 brief 6.1): the event's first listed
// defense is its primary and cuts severity by 2, every other one by 1.
// Written out rather than read from the engine, so a change to the rule
// shows up here as well as in the engine's own tests.
describe('the worth of a missing defense', () => {
  const nothing = { ...newGame(scenario, 1, 'standard'), counters: [] }
  const evOf = (id: string) => ({ eventId: id, chainBonus: 0, mitigation: 0 }) as ResolvedEvent
  const nameOf = (id: string) => scenario.countermeasures.find((c) => c.id === id)!.name

  it('says the primary cuts 2 and a secondary cuts 1, whichever of them is missing', () => {
    const two = scenario.events.find((e) => e.kind !== 'opportunity' && e.counters.length === 2 && e.effect.special !== 'debrisStrike')
    expect(two, 'no threat in the deck lists a primary and a secondary').toBeDefined()
    const [primary, secondary] = two!.counters
    expect(full(evOf(two!.id), nothing, scenario)).toBe(
      `What would have helped: ${nameOf(primary)} (cuts severity by 2); ${nameOf(secondary)} (cuts severity by 1).`,
    )
    // The worth follows the defense's place in the threat's list, not
    // which of them happens to be missing.
    expect(full(evOf(two!.id), { ...nothing, counters: [primary] }, scenario)).toBe(
      `What would have helped: ${nameOf(secondary)} (cuts severity by 1).`,
    )
    expect(full(evOf(two!.id), { ...nothing, counters: [secondary] }, scenario)).toBe(
      `What would have helped: ${nameOf(primary)} (cuts severity by 2).`,
    )
  })

  it('makes the debris a call: SSA makes the burn free, and owning it leaves the hold as the gamble', () => {
    const debris = scenario.events.find((e) => e.effect.special === 'debrisStrike')
    expect(debris, 'no debris in the deck').toBeDefined()
    expect(debris!.counters).toEqual(['ssaManeuver'])
    expect(full(evOf(debris!.id), nothing, scenario)).toBe(
      `What would have helped: ${nameOf('ssaManeuver')} (makes the avoidance burn free instead of 10 CR).`,
    )
    expect(full(evOf(debris!.id), { ...nothing, counters: ['ssaManeuver'] }, scenario)).toBe(
      'The subscription was owned, so a burn would have moved the satellite clear for nothing. The hold played the odds.',
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
