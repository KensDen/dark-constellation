// The Field Library's content (v1.2 R5b, brief 7.3), as data.
//
// GUARD R5b (a), principle 17 in both directions: a pairing that names an
// event the scenario does not have fails, and so does a threat that no
// entry names. The real list is handed to the validator from
// src/content/fieldLibraryData.ts, which does not validate on import, so a
// broken list fails here by name rather than taking the module down.

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { isGeneral, pairedEvents, validateLibrary, type Shelf } from '../src/content/librarySchema'
import { SHELVES_AS_DRAFTED } from '../src/content/fieldLibraryData'
import type { Scenario } from '../src/engine/types'

const copy = (): Shelf[] => JSON.parse(JSON.stringify(SHELVES_AS_DRAFTED))
const threats = DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat')
const entries = SHELVES_AS_DRAFTED.flatMap((s) => s.entries)
// Shelf, title and link of every entry, in order, as approved on 29
// September 2026. The draft file itself produces this hash.
const LIST_SHA256 = 'e7fdf6ff69bf3e85828e9556776696eb4b1c3dd17c06252833b0cd3b74a79d04'
// Every field of every entry (source, year, type, the verbatim why line,
// link note, pairings and checked date), as generated from the draft and
// checked against it on the same day.
const ENTRIES_SHA256 = 'e7ac2074eaa5d3f80c0a5c056f04faa93e7f055ce40c0f50bb57ad9abaeb62b0'

describe('GUARD R5b (a): every pairing names a real event, and every threat has one', () => {
  it('passes the list as approved, and the game reads that list', async () => {
    expect(() => validateLibrary(SHELVES_AS_DRAFTED, DEFAULT_SCENARIO)).not.toThrow()
    // Imported here rather than at the top, so a broken list fails this
    // test by name instead of the whole file at import.
    const { FIELD_LIBRARY } = await import('../src/content/fieldLibrary')
    expect(FIELD_LIBRARY).toBe(SHELVES_AS_DRAFTED)
  })

  it('fails a pairing that names an event the scenario does not have', () => {
    const broken = copy()
    broken[2].entries[0].pairs.push({ kind: 'event', event: 'downlink-eavesdroping' })
    expect(() => validateLibrary(broken, DEFAULT_SCENARIO)).toThrow(/pairs with unknown event downlink-eavesdroping/)
    // A layer note is not part of the id: written into it, the id is unknown.
    const noted = copy()
    const air = noted.flatMap((s) => s.entries).find((e) => e.pairs.some((p) => p.kind === 'event' && p.note === 'AIR'))!
    air.pairs = [{ kind: 'event', event: 'supply-chain-implant (AIR)' }]
    expect(() => validateLibrary(noted, DEFAULT_SCENARIO)).toThrow(/unknown event supply-chain-implant \(AIR\)/)
  })

  it('fails a threat that no entry names by id, whatever GENERAL and SPARTA entries cover it', () => {
    // debris-conjunction is named by one entry. Take that pairing away and
    // the threat is covered only by the GENERAL shelf and, being a SPARTA
    // technique, by the framework's derived pairing; neither is specific.
    const broken = copy()
    for (const e of broken.flatMap((s) => s.entries)) {
      e.pairs = e.pairs.filter((p) => !(p.kind === 'event' && p.event === 'debris-conjunction'))
      if (e.pairs.length === 0) e.pairs = [{ kind: 'general' }]
    }
    expect(DEFAULT_SCENARIO.events.find((e) => e.id === 'debris-conjunction')!.techniqueRefs.some((r) => r.framework === 'SPARTA')).toBe(true)
    expect(() => validateLibrary(broken, DEFAULT_SCENARIO)).toThrow(/event debris-conjunction has no specific pairing/)
  })

  it('checks the requirement against the scenario it is given, so a new threat needs a pairing too', () => {
    const scenario: Scenario = {
      ...DEFAULT_SCENARIO,
      events: [...DEFAULT_SCENARIO.events, { ...threats[0], id: 'new-threat' }],
    }
    expect(() => validateLibrary(SHELVES_AS_DRAFTED, scenario)).toThrow(/event new-threat has no specific pairing/)
  })

  it('requires no pairing for an opportunity, which has no technique and no source', () => {
    const opportunities = DEFAULT_SCENARIO.events.filter((e) => e.kind === 'opportunity')
    expect(opportunities.length, 'no opportunities, so this asserts nothing').toBeGreaterThan(0)
    for (const o of opportunities) {
      expect(o.techniqueRefs).toEqual([])
      expect(entries.some((e) => pairedEvents(e).includes(o.id))).toBe(false)
    }
  })
})

describe('the list as approved', () => {
  it('holds the approved list exactly: 36 entries on 11 shelves, in its order', () => {
    // The draft states its own count, and the screen derives everything
    // else. The list as approved is pinned by a hash of each entry's
    // shelf, title and link in order, so an entry added, dropped, moved or
    // relinked (anything from the draft's excluded list included) changes
    // the hash and costs a deliberate edit here.
    expect(SHELVES_AS_DRAFTED.length).toBe(11)
    expect(entries.length).toBe(36)
    const listing = SHELVES_AS_DRAFTED.flatMap((s) => s.entries.map((e) => [s.name, e.title, e.url].join(' | '))).join('\n')
    expect(createHash('sha256').update(listing).digest('hex')).toBe(LIST_SHA256)
    // And every field, so a paraphrased why line, a dropped pairing or a
    // changed date costs a deliberate edit too.
    const whole = SHELVES_AS_DRAFTED.flatMap((s) => s.entries.map((e) => `${s.name} | ${JSON.stringify(e)}`)).join('\n')
    expect(createHash('sha256').update(whole).digest('hex')).toBe(ENTRIES_SHA256)
  })

  it('derives the SPARTA entry\'s pairings from the events\' technique references', () => {
    const sparta = entries.find((e) => e.pairs.some((p) => p.kind === 'sparta'))!
    const tagged = DEFAULT_SCENARIO.events.filter((e) => e.techniqueRefs.some((r) => r.framework === 'SPARTA')).map((e) => e.id)
    expect(tagged.length).toBeGreaterThan(0)
    expect(pairedEvents(sparta).sort()).toEqual(tagged.sort())
    // Derived, not listed: tag another event SPARTA and it pairs too.
    const untagged = DEFAULT_SCENARIO.events.find((e) => !tagged.includes(e.id) && (e.kind ?? 'threat') === 'threat')!
    const retagged: Scenario = {
      ...DEFAULT_SCENARIO,
      events: DEFAULT_SCENARIO.events.map((e) =>
        e.id === untagged.id ? { ...e, techniqueRefs: [...e.techniqueRefs, { ...DEFAULT_SCENARIO.events.find((x) => tagged.includes(x.id))!.techniqueRefs.find((r) => r.framework === 'SPARTA')! }] } : e,
      ),
    }
    expect(pairedEvents(sparta, retagged)).toContain(untagged.id)
  })

  it('keeps a layer note as display text beside its id, and GENERAL entries paired with no event', () => {
    const noted = entries.flatMap((e) => e.pairs.filter((p) => p.kind === 'event' && p.note))
    expect(noted).toEqual([{ kind: 'event', event: 'supply-chain-implant', note: 'AIR' }])
    const general = entries.filter(isGeneral)
    expect(general.length).toBeGreaterThan(0)
    for (const e of general) expect(pairedEvents(e), e.title).toEqual([])
  })

  it('dates every check, 26 September 2026 unless the entry names its own day', () => {
    for (const e of entries) expect(['2026-09-26', '2026-09-27'], e.title).toContain(e.checked)
    expect(entries.filter((e) => e.checked === '2026-09-27').map((e) => e.source)).toEqual(['Andy Greenberg and Matt Burgess, WIRED'])
  })

  it('links every entry over https, each URL once', () => {
    const urls = entries.map((e) => e.url)
    expect(new Set(urls).size).toBe(urls.length)
    for (const u of urls) expect(new URL(u).protocol, u).toBe('https:')
  })
})
