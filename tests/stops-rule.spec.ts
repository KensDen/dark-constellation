// THE STOPS RULE (v1.3 R6, Decisions question 2): the game says a defense
// "stops" a move only where its own rule blocks it, which is when that
// defense's own points reach the move's strength (the primary takes 2,
// any other 1, src/engine/rules.ts); otherwise it "blunts" it, and the
// debris call is "answered", never stopped. These guards read every
// pairing in the deck, so a pairing the engine round changes stays true.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../src/content'
import { PRIMARY_MITIGATION, SECONDARY_MITIGATION, mitigationOf } from '../src/engine/rules'
import type { CountermeasureId, ThreatEvent } from '../src/engine/types'
import { shortName, stopVerb, stoppedByLine } from '../src/ui/board/boardModel'
import * as copy from '../src/ui/night/nightCopy'
import { defensesFor } from '../src/ui/night/nightModel'

const scenario = DEFAULT_SCENARIO
const threats = scenario.events.filter((e) => (e.kind ?? 'threat') === 'threat')
const nameOf = (id: CountermeasureId) => scenario.countermeasures.find((c) => c.id === id)!.name
const blocksAlone = (cm: CountermeasureId, ev: ThreatEvent) =>
  ev.effect.special !== 'debrisStrike' && (ev.counters[0] === cm ? PRIMARY_MITIGATION : SECONDARY_MITIGATION) >= ev.baseSeverity

describe('the stops rule (R6 question 2)', () => {
  it('says "stops" of a pairing exactly when that defense alone blocks the move, "answers" of the debris call', () => {
    for (const ev of threats)
      for (const cm of ev.counters) {
        const verb = stopVerb(cm, ev)
        if (ev.effect.special === 'debrisStrike') expect(verb, `${cm} on ${ev.id}`).toBe('answers')
        else expect(verb, `${cm} on ${ev.id}`).toBe(blocksAlone(cm, ev) ? 'stops' : 'blunts')
      }
    // The strength-3 moves with one defense are never stopped alone (brief 6.1).
    for (const id of ['ground-ransomware', 'supply-chain-implant', 'blackout-chain']) {
      const ev = threats.find((e) => e.id === id)!
      expect(stopVerb(ev.counters[0], ev), id).toBe('blunts')
    }
  })

  it('GUARD: STOPPED BY on a move\'s card and the Dossier lists only defenses that block alone, and says when none does', () => {
    for (const ev of threats) {
      const { label, text } = stoppedByLine(ev, scenario)
      if (ev.effect.special === 'debrisStrike') {
        expect(label).toBe('ANSWERED BY')
        continue
      }
      const alone = ev.counters.filter((c) => blocksAlone(c, ev))
      if (alone.length === 0) {
        expect(label, ev.id).toBe('BLUNTED BY')
        for (const c of ev.counters) expect(text).toContain(nameOf(c))
        expect(text.includes('together they block it'), ev.id).toBe(ev.counters.length > 1 && mitigationOf(ev, ev.counters) >= ev.baseSeverity)
        continue
      }
      expect(label, ev.id).toBe('STOPPED BY')
      const [stopped, blunted = ''] = text.split('; also blunts: ')
      for (const c of ev.counters) expect(alone.includes(c) ? stopped : blunted, `${ev.id}: ${c}`).toContain(nameOf(c))
    }
  })

  // R6b fresh eyes: a block two defenses make together was said of the
  // first alone ("Link-layer auth ... blocked Rogue ground station"),
  // which its own points never do.
  it('names a joint block with its partner on the move\'s card', () => {
    for (const ev of threats) {
      if (mitigationOf(ev, ev.counters) < ev.baseSeverity) continue
      const { held, partner } = defensesFor(ev, ev.counters, scenario)
      if (blocksAlone(held!.id, ev)) {
        expect(partner, ev.id).toBeUndefined()
      } else {
        expect(partner, `${ev.id}: a block no one defense makes, with no partner named`).toBeDefined()
        expect(mitigationOf(ev, [held!.id, partner!.id])).toBeGreaterThanOrEqual(ev.baseSeverity)
      }
    }
    const rogue = threats.find((e) => e.id === 'rogue-ground-station')!
    const { held, partner } = defensesFor(rogue, rogue.counters, scenario)
    expect(copy.canNowSayWith(held!.name, shortName(rogue), partner!.name).join('')).toBe(
      `You can now say it: ${nameOf('linkAuth')} blocked ${shortName(rogue)} tonight, with ${nameOf('groundZeroTrust')}.`,
    )
  })

  // R6b fresh eyes: the hit card said JAMMED · 2 TURNS beside a chip that
  // said 1T; a card counts turns left the one way (G-103): the nights the
  // condition still presses after the one it landed on.
  it("tags a hit's new condition with the nights it still presses after this one", () => {
    for (const ev of threats.filter((e) => e.condition)) {
      const left = Math.max(0, ev.condition!.turns - 1)
      expect(copy.conditionTag(ev.condition!.name, left), ev.id).toBe(`${ev.condition!.name} · ${left === 1 ? '1 TURN LEFT' : `${left} TURNS LEFT`}`)
    }
    expect(copy.conditionTag('JAMMED', 0)).toBe('JAMMED · TONIGHT ONLY')
  })
})
