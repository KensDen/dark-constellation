// README count gate (R5). The README states counts about the content deck.
// This test derives those numbers from the data and fails if the prose has
// drifted, so "every count derives from the data" is enforced, not asserted.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  COUNTERMEASURE_COUNT,
  DEFAULT_SCENARIO,
  OPPORTUNITY_EVENT_COUNT,
  SOURCE_COUNT,
  TECHNIQUE_REF_COUNT,
  THREAT_EVENT_COUNT,
  UNVERIFIED_REF_COUNT,
} from '../src/content'
import { glossaryEntries } from '../src/ui/reference'

const README = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'README.md'), 'utf8')

const spartaCmCount = new Set(
  DEFAULT_SCENARIO.countermeasures.flatMap((c) => c.spartaCms.map((r) => r.id)),
).size

describe('README counts match the content data', () => {
  const claims: [string, string][] = [
    ['threat events', `**${THREAT_EVENT_COUNT} threat events**`],
    ['framework techniques', `**${TECHNIQUE_REF_COUNT}\ndistinct framework techniques**`],
    ['cited sources', `**${SOURCE_COUNT} cited sources**`],
    ['unverified references', `**${UNVERIFIED_REF_COUNT} unverified references**`],
    ['countermeasures', `**${COUNTERMEASURE_COUNT} countermeasures**`],
    ['SPARTA CMs', `**${spartaCmCount} distinct\nSPARTA CMs**`],
    ['glossary entries', `all **${glossaryEntries().length} entries**`],
  ]

  for (const [label, claim] of claims) {
    it(`states the derived ${label}`, () => {
      // Compare against the README with line wrapping normalized, so the
      // prose can be rewrapped without breaking the gate.
      const flat = README.replace(/\s+/g, ' ')
      expect(flat, `README must state the derived ${label}`).toContain(claim.replace(/\s+/g, ' '))
    })
  }

  it('states the scenario turn count', () => {
    expect(README.replace(/\s+/g, ' ')).toContain(`across ${DEFAULT_SCENARIO.totalTurns} turns`)
  })

  it('does not claim any unverified references while the deck is fully verified', () => {
    expect(UNVERIFIED_REF_COUNT).toBe(0)
    expect(OPPORTUNITY_EVENT_COUNT).toBeGreaterThan(0)
  })
})
