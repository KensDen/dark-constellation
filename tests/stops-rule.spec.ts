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
import { STATUS, firstOrders, moveStatus, shortName, stopVerb, stoppedByLine, stopsLine, turnsLeft } from '../src/ui/board/boardModel'
import { sayVerb } from '../src/ui/debriefModel'
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

  // R6b fresh eyes: a block two defenses make together was said of the
  // first alone ("Link-layer auth ... blocked Rogue ground station"; the
  // debrief's "stopped"), which its own points never do.
  it('names a joint block with its partner on the hit card, and the debrief says the credited defense helped block it', () => {
    for (const ev of threats) {
      if (mitigationOf(ev, ev.counters) < ev.baseSeverity) continue
      const { held, partner } = defensesFor(ev, ev.counters, scenario)
      if (blocksAlone(held!.id, ev)) {
        expect(partner, ev.id).toBeUndefined()
        expect(sayVerb('held', stopVerb(held!.id, ev))).toBe('stopped')
      } else {
        expect(partner, `${ev.id}: a block no one defense makes, with no partner named`).toBeDefined()
        expect(mitigationOf(ev, [held!.id, partner!.id])).toBeGreaterThanOrEqual(ev.baseSeverity)
        expect(sayVerb('held', stopVerb(held!.id, ev))).toBe('helped block')
      }
    }
    const rogue = threats.find((e) => e.id === 'rogue-ground-station')!
    const { held, partner } = defensesFor(rogue, rogue.counters, scenario)
    expect(copy.canNowSayWith(held!.name, shortName(rogue), partner!.name).join('')).toBe(
      `You can now say it: ${nameOf('linkAuth')} blocked ${shortName(rogue)} tonight, with ${nameOf('groundZeroTrust')}.`,
    )
  })

  // R6b fresh eyes: the hit card said JAMMED · 2 TURNS beside a chip that
  // said 1T; the card now counts turns left the one way (G-103).
  it("tags a hit's new condition with the turns left the night's chips show", () => {
    for (const ev of threats.filter((e) => e.condition)) {
      const left = turnsLeft({ remainingTurns: ev.condition!.turns }, true)
      expect(copy.conditionTag(ev.condition!.name, left), ev.id).toBe(`${ev.condition!.name} · ${left === 1 ? '1 TURN LEFT' : `${left} TURNS LEFT`}`)
    }
    expect(copy.conditionTag('JAMMED', 0)).toBe('JAMMED · TONIGHT ONLY')
  })

  // GUARD R7 (a), the model half: SSA answers the debris call; it never
  // blocks it (mitigation is 0 and HOLD can still lose the satellite), and
  // ANSWERED is a status of its own, its own word and icon.
  it('reads the debris call ANSWERED with SSA and YOUR CALL without, and nothing else ever ANSWERED or YOUR CALL', () => {
    const state = newGame(scenario, 1, 'standard')
    const debris = threats.find((e) => e.effect.special === 'debrisStrike')!
    expect(moveStatus(state, debris, ['ssaManeuver'])).toBe('answered')
    // YOUR CALL since v1.5 R1 (EXPOSED before): a hazard to decide.
    expect(moveStatus(state, debris, [])).toBe('call')
    for (const ev of threats) if (ev !== debris) expect(moveStatus(state, ev, []), ev.id).not.toBe('call')
    const everything = scenario.countermeasures.map((c) => c.id)
    for (const ev of threats) if (ev !== debris) expect(moveStatus(state, ev, everything), ev.id).not.toBe('answered')
    expect(moveStatus(state, debris, everything)).toBe('answered')
    const others = (['exposed', 'partial', 'blocked'] as const).map((k) => STATUS[k])
    expect(others.map((s) => s.word)).not.toContain(STATUS.answered.word)
    expect(others.map((s) => s.icon)).not.toContain(STATUS.answered.icon)
    expect([...others, STATUS.answered].map((s) => s.word)).not.toContain(STATUS.call.word)
    expect([...others, STATUS.answered].map((s) => s.icon)).not.toContain(STATUS.call.icon)
  })

  it('ticks FIRST ORDERS only when a move reads BLOCKED, not when an order only blunts it', () => {
    const state = newGame(scenario, 1, 'standard')
    const ticked = (buyCounters: CountermeasureId[]) => firstOrders(state, { buyAssets: [], buyCounters, intelBrief: false }).find((o) => o.id === 'defense')!.done
    expect(ticked([]), 'nothing ordered').toBe(false)
    expect(ticked(['linkAuth']), 'an order that at most blunts uplink jamming').toBe(false)
    expect(ticked(['antiJam']), 'the primary blocks uplink jamming').toBe(true)
  })
})
