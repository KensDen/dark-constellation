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

  // R3-final acceptance, unskipped in the verification round that closed
  // R3 (every ref and source live-verified 2026-07-12). This supersedes
  // the partial-round invariant that guarded the structure-only state.
  it('R3-final acceptance: zero verify-at-build refs or sources remain', () => {
    const unverified = DEFAULT_SCENARIO.events.flatMap((ev) => [
      ...ev.techniqueRefs.filter((r) => r.status !== 'verified').map((r) => `${ev.id}: ${r.framework} ${r.id}`),
      ...ev.learnMoreCards.flatMap((card) =>
        card.sources.filter((s) => s.status !== 'verified').map((s) => `${ev.id}: ${s.url}`),
      ),
    ])
    expect(unverified).toEqual([])
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

  // Unskipped in the verification round: every mapping below was read off
  // the live SPARTA CM pages, tier included.
  it('R3-final acceptance: every countermeasure maps to SPARTA CMs', () => {
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
