// THE STOPS RULE (v1.3 R6, Decisions question 2): the game says a defense
// "stops" a move only where its own rule blocks it, which is when that
// defense's own points reach the move's strength (the primary takes 2,
// any other 1, src/engine/rules.ts); otherwise it "blunts" it, and the
// debris call is "answered", never stopped. These guards read every
// pairing in the deck, so a pairing the engine round changes stays true.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../src/content'
import { PRIMARY_MITIGATION, SECONDARY_MITIGATION, mitigationOf } from '../src/engine/rules'
import { newGame } from '../src/engine/reducer'
import type { CountermeasureId, ThreatEvent } from '../src/engine/types'
import { firstOrders, shortName, stopVerb, stoppedByLine, stopsLine } from '../src/ui/board/boardModel'

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

  it("GUARD: PROCURE's line names under Stops only what the defense blocks alone, and under Blunts only what it does not", () => {
    const state = newGame(scenario, 1, 'standard')
    const all = new Set(threats.map((e) => e.id))
    for (const cm of scenario.countermeasures) {
      if (cm.counters.length === 0 || cm.id === 'ssaManeuver') continue
      const line = stopsLine(cm, state, new Set(), all)
      const stops = line.match(/Stops: ([^·]*)/)?.[1] ?? ''
      const blunts = line.match(/Blunts: ([^·+]*)/)?.[1] ?? ''
      for (const id of cm.counters) {
        const ev = threats.find((e) => e.id === id)!
        const name = shortName(ev)
        if (blocksAlone(cm.id, ev)) {
          expect(stops, `${cm.id}: ${name} is not under Stops in "${line}"`).toContain(name)
          expect(blunts, `${cm.id}: ${name} is under Blunts in "${line}"`).not.toContain(name)
        } else {
          expect(blunts, `${cm.id}: ${name} is not under Blunts in "${line}"`).toContain(name)
          expect(stops, `${cm.id}: ${name} is under Stops in "${line}"`).not.toContain(name)
        }
      }
    }
  })

  it('GUARD: STOPPED BY on the intel card and the Dossier lists only defenses that block alone, and says when none does', () => {
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

  it('ticks FIRST ORDERS only when a move reads BLOCKED, not when an order only blunts it', () => {
    const state = newGame(scenario, 1, 'standard')
    const ticked = (buyCounters: CountermeasureId[]) => firstOrders(state, { buyAssets: [], buyCounters, intelBrief: false }).find((o) => o.id === 'defense')!.done
    expect(ticked([]), 'nothing ordered').toBe(false)
    expect(ticked(['linkAuth']), 'an order that at most blunts uplink jamming').toBe(false)
    expect(ticked(['antiJam']), 'the primary blocks uplink jamming').toBe(true)
  })
})
