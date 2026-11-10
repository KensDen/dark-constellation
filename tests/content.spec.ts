// Content integrity battery (spec Section 11.3): schemas pass, every
// event carries at least one technique ref, every verified ref has a URL,
// and cross-references resolve. Counts assert consistency between data
// and derived exports, never against hardcoded expectations.

import { describe, expect, it } from 'vitest'

import {
  COUNTERMEASURE_COUNT,
  DEFAULT_SCENARIO,
  EVENT_COUNT,
  OPPORTUNITY_EVENT_COUNT,
  SCENARIOS,
  THREAT_EVENT_COUNT,
} from '../src/content'
import { RESPONSE_TEXT } from '../src/content/responseText'
import { scenarioSchema } from '../src/content/schemas'

const threats = DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat')
const opportunities = DEFAULT_SCENARIO.events.filter((e) => e.kind === 'opportunity')
// The attacks (v1.7 R1): every threat but the debris conjunction, which is
// the player's call and not a move a response answers.
const attacks = threats.filter((e) => e.effect.special !== 'debrisStrike')

describe('content integrity', () => {
  it('every scenario passes its zod schema', () => {
    for (const scenario of SCENARIOS) {
      const result = scenarioSchema.safeParse(scenario)
      expect(result.success, result.success ? '' : result.error.message).toBe(true)
    }
  })

  it('every threat event has at least one technique ref, and refs have URLs', () => {
    for (const ev of threats) {
      expect(ev.techniqueRefs.length, ev.id).toBeGreaterThan(0)
      for (const ref of ev.techniqueRefs) {
        expect(ref.url).toMatch(/^https:\/\//)
      }
    }
  })

  it('opportunity events carry a benefit and no framework refs', () => {
    expect(opportunities.length).toBeGreaterThan(0)
    for (const ev of opportunities) {
      expect(ev.benefit, ev.id).toBeTruthy()
      expect(Object.keys(ev.benefit ?? {}).length, ev.id).toBeGreaterThan(0)
      expect(ev.techniqueRefs.length, ev.id).toBe(0)
    }
  })

  // R3-final acceptance, unskipped in the verification round that closed
  // R3 (every ref and source live-verified 2026-07-12). This supersedes
  // the partial-round invariant that guarded the structure-only state.
  it('R3-final acceptance: zero verify-at-build refs or sources remain', () => {
    const unverified = threats.flatMap((ev) => [
      ...ev.techniqueRefs.filter((r) => r.status !== 'verified').map((r) => `${ev.id}: ${r.framework} ${r.id}`),
      ...ev.learnMoreCards.flatMap((card) =>
        card.sources.filter((s) => s.status !== 'verified').map((s) => `${ev.id}: ${s.url}`),
      ),
    ])
    expect(unverified).toEqual([])
  })

  it('every threat event carries at least one sourced learn-more card', () => {
    for (const ev of threats) {
      expect(ev.learnMoreCards.length, ev.id).toBeGreaterThan(0)
      for (const card of ev.learnMoreCards) {
        expect(card.sources.length, `${ev.id}: ${card.title}`).toBeGreaterThan(0)
      }
    }
  })

  it('every event is reachable through a campaign slot or opportunity roll', () => {
    const reachable = new Set(
      DEFAULT_SCENARIO.campaign.flatMap((p) => [
        ...p.slots.flatMap((s) => (s.fixed ? [s.fixed] : (s.drawFrom ?? []))),
        ...(p.opportunity?.drawFrom ?? []),
      ]),
    )
    for (const ev of DEFAULT_SCENARIO.events) {
      expect(reachable.has(ev.id), ev.id).toBe(true)
    }
  })

  it('derived event counts split threats and opportunities from the data', () => {
    expect(THREAT_EVENT_COUNT).toBe(threats.length)
    expect(OPPORTUNITY_EVENT_COUNT).toBe(opportunities.length)
    expect(THREAT_EVENT_COUNT + OPPORTUNITY_EVENT_COUNT).toBe(EVENT_COUNT)
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

  it("names every move in sentence case, as a proper noun (v1.6 R2, R1's fresh eyes F14)", () => {
    // The name a sentence carries is the part before its parenthesis
    // (shortName, src/ui/board/boardModel.ts): "Time spoof", "Blackout
    // chain". One in capitals ("BLACKOUT CHAIN") read as a different kind
    // of thing beside the rest, mid-sentence, on the debrief and the cards.
    for (const e of DEFAULT_SCENARIO.events) {
      const short = e.name.split(' (')[0]
      expect(short[0], e.id).toBe(short[0].toUpperCase())
      const words = short.split(' ').filter((w) => /^[A-Za-z]{4,}$/.test(w))
      expect(words.every((w) => w === w.toUpperCase()) && words.length > 0, `${e.id}: "${short}" is in capitals`).toBe(false)
    }
  })

  it('the BLACKOUT CHAIN centerpiece is wired: jam trigger and exploit both present', () => {
    const jam = DEFAULT_SCENARIO.events.find((e) => e.effect.special === 'jamsGnss')
    const exploit = DEFAULT_SCENARIO.events.filter((e) => e.effect.special === 'chainExploit')
    expect(jam).toBeTruthy()
    expect(exploit.length).toBeGreaterThan(0)
    expect(jam?.chainsWith ?? []).toContain('blackout-chain')
  })

  it('conditions land on the mapped events and not the one-shots, each on a fixed clock', () => {
    const withCondition = new Set(threats.filter((e) => e.condition).map((e) => e.id))
    // RF jams and spoofing, the eavesdropping variants, and ransomware press
    // over time; debris, insider, and phishing stay single strikes (R3.25).
    for (const id of ['pnt-jamming', 'uplink-jamming', 'gnss-spoofing', 'downlink-eavesdropping', 'backhaul-exfil', 'ground-ransomware']) {
      expect(withCondition.has(id), id).toBe(true)
    }
    for (const id of ['debris-conjunction', 'insider-exfil', 'ops-phishing']) {
      expect(withCondition.has(id), id).toBe(false)
    }
    // Fixed per event and shown as turns left (brief 6.5): 2 for the jams
    // and GNSS denial, the clocks the brief names, and for the rest, which
    // it does not name, the same 2.
    const names = new Set<string>()
    for (const ev of threats) {
      if (!ev.condition) continue
      expect(ev.condition.turns, ev.id).toBe(2)
      expect(names.has(ev.condition.name), `${ev.id} shares a chip name`).toBe(false)
      names.add(ev.condition.name)
    }
    expect(DEFAULT_SCENARIO.events.find((e) => e.id === 'uplink-jamming')!.condition!.name).toBe('JAMMED')
    expect(DEFAULT_SCENARIO.events.find((e) => e.id === 'pnt-jamming')!.condition!.name).toBe('GNSS DENIED')
  })

  it('the BLACKOUT CHAIN jam trigger is a persistent condition', () => {
    const jam = DEFAULT_SCENARIO.events.find((e) => e.effect.special === 'jamsGnss')
    expect(jam?.condition, 'the jam that arms the chain must persist as a condition').toBeTruthy()
  })

  it('purchasable countermeasure costs stay in the spec 5 to 15 band', () => {
    for (const cm of DEFAULT_SCENARIO.countermeasures) {
      expect(cm.cost).toBeGreaterThanOrEqual(5)
      expect(cm.cost).toBeLessThanOrEqual(15)
    }
  })

  // THE RESPONSES (v1.7 R1): what the night offers when a move would land.
  // The ids and effects are the deck's (src/content/threats.ts), the words
  // a module of their own (src/content/responseText.ts), joined by id, so
  // the join is held here in both directions.
  it('gives every attack one or two responses with ids of their own, and none to the debris call or an opportunity', () => {
    expect(attacks.length, 'the deck has no attack').toBeGreaterThan(0)
    for (const ev of attacks) {
      const ids = (ev.responses ?? []).map((r) => r.id)
      expect(ids.length, `${ev.id} offers ${ids.length} responses`).toBeGreaterThanOrEqual(1)
      expect(ids.length, `${ev.id} offers ${ids.length} responses`).toBeLessThanOrEqual(2)
      expect(new Set(ids).size, `${ev.id} names a response twice`).toBe(ids.length)
      for (const r of ev.responses ?? []) expect(['block', 'halve'], `${ev.id}/${r.id}`).toContain(r.effect)
    }
    const others = DEFAULT_SCENARIO.events.filter((e) => !attacks.includes(e))
    // The positive control: the debris call and the opportunities exist.
    expect(others.some((e) => e.effect.special === 'debrisStrike')).toBe(true)
    expect(others.some((e) => e.kind === 'opportunity')).toBe(true)
    for (const ev of others) expect(ev.responses, `${ev.id} carries responses`).toBeUndefined()
  })

  it('lists a block before a halve wherever a threat offers both, and never two of a kind', () => {
    // Strongest first (src/engine/types.ts): the card draws them in this
    // order, and a responder that takes the first that fits takes the
    // block when the budget allows.
    // Two of a kind would be one answer twice: the rules price and resolve
    // a response by its effect alone (src/engine/rules.ts).
    let both = 0
    for (const ev of attacks) {
      const effects = (ev.responses ?? []).map((r) => r.effect)
      expect(new Set(effects).size, `${ev.id} offers two responses that do the same`).toBe(effects.length)
      if (!effects.includes('block')) continue
      expect(effects[0], `${ev.id} lists its block after its halve`).toBe('block')
      if (effects.includes('halve')) both += 1
    }
    expect(both, 'no threat offers both, so the order was never tested').toBeGreaterThan(0)
  })

  it('has exactly one line of words for every response, and no line for a response that does not exist', () => {
    const offered = new Set(attacks.flatMap((ev) => (ev.responses ?? []).map((r) => `${ev.id}/${r.id}`)))
    const worded = new Set(Object.entries(RESPONSE_TEXT).flatMap(([event, lines]) => Object.keys(lines).map((id) => `${event}/${id}`)))
    expect(offered.size).toBeGreaterThan(0)
    expect([...offered].filter((k) => !worded.has(k)), 'responses with no words').toEqual([])
    expect([...worded].filter((k) => !offered.has(k)), 'words for a response no threat offers').toEqual([])
    // No entry for a threat that offers nothing, even an empty one.
    const ids = new Set(attacks.map((e) => e.id))
    expect(Object.keys(RESPONSE_TEXT).filter((id) => !ids.has(id)), 'words keyed by an id that is no attack').toEqual([])
    for (const [event, lines] of Object.entries(RESPONSE_TEXT)) {
      for (const [id, line] of Object.entries(lines)) {
        expect(typeof line, `${event}/${id}`).toBe('string')
        expect(line.trim().length, `${event}/${id} is empty`).toBeGreaterThan(0)
        expect(line, `${event}/${id} carries stray space`).toBe(line.trim())
        expect(line, `${event}/${id} is more than one line`).not.toMatch(/[\n\r]/)
      }
      // Two answers to one move must not read the same.
      expect(new Set(Object.values(lines)).size, `${event} says two responses in the same words`).toBe(Object.values(lines).length)
    }
  })

  it('writes no response with an em or en dash', () => {
    for (const [event, lines] of Object.entries(RESPONSE_TEXT)) {
      for (const [id, line] of Object.entries(lines)) expect(line, `${event}/${id}: "${line}"`).not.toMatch(/[\u2013\u2014]/)
    }
  })

  it('has the schema refuse a threat without responses, and a debris call or an opportunity with them', () => {
    const withEvents = (events: unknown[]) => scenarioSchema.safeParse({ ...DEFAULT_SCENARIO, events })
    const swap = (id: string, change: (ev: (typeof DEFAULT_SCENARIO.events)[number]) => unknown) =>
      withEvents(DEFAULT_SCENARIO.events.map((ev) => (ev.id === id ? change(ev) : ev)))
    // The positive control: the deck as it is passes through the same path.
    expect(withEvents([...DEFAULT_SCENARIO.events]).success).toBe(true)
    const attack = attacks[0]
    const debris = DEFAULT_SCENARIO.events.find((e) => e.effect.special === 'debrisStrike')!
    const opportunity = opportunities[0]
    const one = [{ id: 'anything', effect: 'block' }]
    const messageOf = (result: ReturnType<typeof withEvents>) => (result.success ? '' : result.error.message)
    // A threat with none, and with an empty list.
    const bare = swap(attack.id, ({ responses: _dropped, ...rest }) => rest)
    expect(bare.success, 'a threat with no responses passed').toBe(false)
    expect(messageOf(bare)).toContain(`threat ${attack.id} offers no response`)
    expect(swap(attack.id, (ev) => ({ ...ev, responses: [] })).success, 'a threat with an empty list passed').toBe(false)
    // The debris call and an opportunity with one.
    for (const ev of [debris, opportunity]) {
      const given = swap(ev.id, (e) => ({ ...e, responses: one }))
      expect(given.success, `${ev.id} passed with a response`).toBe(false)
      expect(messageOf(given)).toContain(`${ev.id} must not carry responses`)
    }
    // And the shape of one: an id used twice, an effect the rules do not
    // know, a field the type does not have.
    expect(swap(attack.id, (ev) => ({ ...ev, responses: [{ id: 'same', effect: 'block' }, { id: 'same', effect: 'halve' }] })).success, 'an id used twice passed').toBe(false)
    expect(swap(attack.id, (ev) => ({ ...ev, responses: [{ id: 'x', effect: 'dodge' }] })).success, 'an unknown effect passed').toBe(false)
    expect(swap(attack.id, (ev) => ({ ...ev, responses: [{ id: 'x', effect: 'block', cost: 1 }] })).success, 'a response with a cost of its own passed').toBe(false)
  })
})
