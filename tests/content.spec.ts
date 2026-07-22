// Content integrity battery (spec Section 11.3): schemas pass, every
// event carries at least one technique ref, every verified ref has a URL,
// and cross-references resolve. Counts assert consistency between data
// and derived exports, never against hardcoded expectations.

import { describe, expect, it } from 'vitest'

import { COUNTERMEASURE_COUNT, DEFAULT_SCENARIO, EVENT_COUNT, SCENARIOS } from '../src/content'
import { scenarioSchema } from '../src/content/schemas'

describe('content integrity', () => {
  it('every scenario passes its zod schema', () => {
    for (const scenario of SCENARIOS) {
      const result = scenarioSchema.safeParse(scenario)
      expect(result.success, result.success ? '' : result.error.message).toBe(true)
    }
  })

  it('every threat event has at least one technique ref, and refs have URLs', () => {
    for (const ev of DEFAULT_SCENARIO.events) {
      expect(ev.techniqueRefs.length).toBeGreaterThan(0)
      for (const ref of ev.techniqueRefs) {
        expect(ref.url).toMatch(/^https:\/\//)
      }
    }
  })

  // R3 shipped as structure-only: this session's network policy blocked
  // every framework site, so zero refs could be web-verified and all of
  // them remain explicitly verify-at-build. This acceptance test is the
  // tripwire for the verification round that completes R3; unskip it there.
  it.skip('R3-final acceptance (pending verification round): zero verify-at-build refs remain', () => {
    const unverified = DEFAULT_SCENARIO.events.flatMap((ev) =>
      ev.techniqueRefs.filter((r) => r.status !== 'verified').map((r) => `${ev.id}: ${r.framework} ${r.id}`),
    )
    expect(unverified).toEqual([])
  })

  it('partial-round invariant: no ref or source claims verified status without a verification pass', () => {
    // Until the verification round runs, nothing in the deck may present
    // itself as verified. Flipping any status to verified requires the
    // live web check that this test's skipped sibling then enforces.
    for (const ev of DEFAULT_SCENARIO.events) {
      for (const ref of ev.techniqueRefs) {
        expect(ref.status, `${ev.id}: ${ref.framework} ${ref.id}`).toBe('verify-at-build')
      }
      for (const card of ev.learnMoreCards) {
        for (const src of card.sources) {
          expect(src.status, `${ev.id}: ${src.url}`).toBe('verify-at-build')
        }
      }
    }
  })

  it('every event carries at least one sourced learn-more card', () => {
    for (const ev of DEFAULT_SCENARIO.events) {
      expect(ev.learnMoreCards.length, ev.id).toBeGreaterThan(0)
      for (const card of ev.learnMoreCards) {
        expect(card.sources.length, `${ev.id}: ${card.title}`).toBeGreaterThan(0)
      }
    }
  })

  it('every event is reachable through at least one campaign slot', () => {
    const reachable = new Set(
      DEFAULT_SCENARIO.campaign.flatMap((p) => p.slots.flatMap((s) => (s.fixed ? [s.fixed] : (s.drawFrom ?? [])))),
    )
    for (const ev of DEFAULT_SCENARIO.events) {
      expect(reachable.has(ev.id), ev.id).toBe(true)
    }
  })

  // Deferred with the verification round: SPARTA CM IDs and their
  // defense-in-depth tiers can only be mapped against the live site, which
  // this session could not reach. The structure (types, schema, UI) ships
  // now; unskip when the mapping lands.
  it.skip('R3-final acceptance (pending verification round): every countermeasure maps to SPARTA CMs', () => {
    for (const cm of DEFAULT_SCENARIO.countermeasures) {
      expect(cm.spartaCms.length, cm.id).toBeGreaterThan(0)
      for (const ref of cm.spartaCms) {
        expect(ref.url).toMatch(/^https:\/\//)
        expect(ref.tier, `${cm.id}: ${ref.id}`).toBeTruthy()
      }
    }
  })

  it('derived counts match the data they derive from', () => {
    expect(EVENT_COUNT).toBe(DEFAULT_SCENARIO.events.length)
    expect(COUNTERMEASURE_COUNT).toBe(DEFAULT_SCENARIO.countermeasures.length)
  })

  it('the campaign covers every turn of the scenario', () => {
    const turns = DEFAULT_SCENARIO.campaign.map((p) => p.turn)
    for (let t = 1; t <= DEFAULT_SCENARIO.totalTurns; t += 1) {
      expect(turns).toContain(t)
    }
  })

  it('the BLACKOUT CHAIN centerpiece is wired: jam trigger and exploit both present', () => {
    const jam = DEFAULT_SCENARIO.events.find((e) => e.effect.special === 'jamsGnss')
    const exploit = DEFAULT_SCENARIO.events.filter((e) => e.effect.special === 'chainExploit')
    expect(jam).toBeTruthy()
    expect(exploit.length).toBeGreaterThan(0)
    expect(jam?.chainsWith ?? []).toContain('blackout-chain')
  })

  it('purchasable countermeasure costs stay in the spec 5 to 15 band', () => {
    for (const cm of DEFAULT_SCENARIO.countermeasures) {
      if (cm.id === 'intelInvestment') continue // priced per level in scenario prices
      expect(cm.cost).toBeGreaterThanOrEqual(5)
      expect(cm.cost).toBeLessThanOrEqual(15)
    }
  })
})
