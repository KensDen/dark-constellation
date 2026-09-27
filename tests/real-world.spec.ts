// The REAL WORLD line (v1.2 R3, brief 4.8), the content half of guard (c):
// for every event in the deck, the line is the event's own first technique
// and the short name of its own first learn-more source, and the card it
// opens is the event's own. The DOM half, that each card on screen shows
// its event's line, is in tests/hits.dom.spec.tsx.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { techniqueLabel } from '../src/ui/labels'
import { realWorldFor, shortSourceName } from '../src/ui/realWorldLine'

describe('the REAL WORLD line (v1.2 R3)', () => {
  it("GUARD R3 (c): is built from each event's own content, for every event in the deck", () => {
    const threats = DEFAULT_SCENARIO.events.filter((e) => e.kind !== 'opportunity')
    expect(threats.length).toBeGreaterThanOrEqual(18)
    const lines = new Set<string>()
    for (const ev of threats) {
      const line = realWorldFor(ev)
      expect(line, `${ev.id} has no REAL WORLD line`).not.toBeNull()
      const source = ev.learnMoreCards[0].sources[0]
      expect(line!.technique, ev.id).toBe(techniqueLabel(ev.techniqueRefs[0]))
      expect(line!.ref, ev.id).toBe(ev.techniqueRefs[0])
      expect(line!.card, ev.id).toBe(ev.learnMoreCards[0])
      expect(line!.first.url, ev.id).toBe(source.url)
      // The short name is the title's own opening, cut at a colon or a
      // comma or not at all: never a word the content does not have.
      expect(
        source.title === line!.source || source.title.startsWith(`${line!.source}:`) || source.title.startsWith(`${line!.source},`),
        `${ev.id}: "${line!.source}" is not how "${source.title}" opens`,
      ).toBe(true)
      lines.add(`${line!.technique} · ${line!.source}`)
    }
    // Most events have a line of their own, so one line cannot stand in
    // for the deck.
    expect(lines.size, 'the deck collapses to too few lines').toBeGreaterThanOrEqual(12)
    // The opportunities carry nothing, so they get no line.
    for (const ev of DEFAULT_SCENARIO.events.filter((e) => e.kind === 'opportunity')) expect(realWorldFor(ev), ev.id).toBeNull()
  })

  it('shortens a title at its first colon or comma, and keeps one that has neither', () => {
    expect(shortSourceName('CISA AA22-076A: Strengthening Cybersecurity')).toBe('CISA AA22-076A')
    expect(shortSourceName('Cao et al., Adversarial Sensor Attack')).toBe('Cao et al.')
    expect(shortSourceName('NASA Orbital Debris Program Office')).toBe('NASA Orbital Debris Program Office')
  })
})
