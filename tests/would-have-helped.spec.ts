// What the aftermath says when a threat landed through every applicable
// defense (critique row M8). The one purchase left is the IR retainer, so
// the line names it, with how much faster it recovers read off the
// scenario: "three times" for the shipped 6 against 2, and a plain
// "faster" when a retune leaves no whole number of times.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame } from '../src/engine/reducer'
import type { ResolvedEvent, Scenario } from '../src/engine/types'
import { whatWouldHaveHelped } from '../src/ui/board/AftermathCard'

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
    expect(whatWouldHaveHelped(ev, { ...owned, irRetainer: false }, scenario)).toBe(
      'Every applicable defense was active. The incident response retainer would have recovered the damage three times faster.',
    )
  })

  it('keeps the ratio true when recovery is retuned', () => {
    const say = (s: Scenario) => whatWouldHaveHelped(ev, { ...owned, irRetainer: false, scenario: s }, s)
    expect(say(retuned(2, 8))).toContain('recovered the damage four times faster.')
    expect(say(retuned(2, 5))).toContain('recovered the damage faster.')
    expect(say(retuned(0, 6))).toContain('recovered the damage faster.')
    // No faster than base, so the retainer is not named at all.
    for (const s of [retuned(2, 2), retuned(3, 2)]) {
      expect(say(s)).toBe('Every applicable defense was active. What landed is what the attack buys through them.')
    }
  })

  it('says what it always said once the retainer is owned', () => {
    expect(whatWouldHaveHelped(ev, { ...owned, irRetainer: true }, scenario)).toBe(
      'Every applicable defense was active. What landed is what the attack buys through them.',
    )
  })
})
