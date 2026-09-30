// The Field Library's shape and its rules (v1.2 R5b, brief 7.3): the
// types, the schema, the validator and how pairings resolve. No list
// lives here and nothing is validated on import, so a test can hand the
// validator the real list, or a broken copy of it, and see it fail by
// name. ./fieldLibrary.ts is where the game's list is validated.
//
// PAIRINGS, BOTH DIRECTIONS (principle 17). A pairing that names an event
// the scenario does not have fails. So does a threat that no entry names
// by id: a "specific" pairing is one that names the event, not a GENERAL
// entry and not the SPARTA framework, which pairs by derivation. The
// opportunities carry no technique and no source, and their cards no
// REAL WORLD line, so no entry pairs with them and none is required to.

import { z } from 'zod'
import type { Scenario } from '../engine/types'
import { DEFAULT_SCENARIO } from '.'

export type Pairing = { kind: 'event'; event: string; note?: string } | { kind: 'general' } | { kind: 'sparta' }

export interface LibraryEntry {
  title: string
  source: string
  year?: string
  type: string
  why: string
  url: string
  urlNote?: string
  pairs: Pairing[]
  // YYYY-MM-DD
  checked: string
}

export interface Shelf {
  name: string
  entries: LibraryEntry[]
}

const text = z.string().min(1)

// A plain union: zod lives in the first download, and a builder only the
// library used (discriminatedUnion) would take about 350 bytes there with it.
const pairingSchema = z.union([
  z.object({ kind: z.literal('event'), event: text, note: text.optional() }).strict(),
  z.object({ kind: z.literal('general') }).strict(),
  z.object({ kind: z.literal('sparta') }).strict(),
])

const entrySchema = z
  .object({
    title: text,
    source: text,
    year: text.optional(),
    type: text,
    why: text,
    url: z.string().url().startsWith('https://'),
    urlNote: text.optional(),
    pairs: z.array(pairingSchema).min(1),
    checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()

const shelfSchema = z.object({ name: text, entries: z.array(entrySchema).min(1) }).strict()

const isThreat = (e: Scenario['events'][number]) => (e.kind ?? 'threat') === 'threat'
const hasSparta = (e: Scenario['events'][number]) => e.techniqueRefs.some((r) => r.framework === 'SPARTA')

export function librarySchemaFor(scenario: Scenario) {
  const known = new Set(scenario.events.map((e) => e.id))
  return z
    .array(shelfSchema)
    .min(1)
    .superRefine((shelves, ctx) => {
      const entries = shelves.flatMap((s) => s.entries)
      const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
      for (const key of ['title', 'url'] as const) {
        const seen = new Set<string>()
        for (const e of entries) {
          if (seen.has(e[key])) issue(`two entries share the ${key} ${e[key]}`)
          seen.add(e[key])
        }
      }
      for (const e of entries) {
        const named = e.pairs.flatMap((p) => (p.kind === 'event' ? [p.event] : []))
        for (const id of named) {
          if (!known.has(id)) issue(`"${e.title}" pairs with unknown event ${id}`)
        }
        if (new Set(e.pairs.map((p) => (p.kind === 'event' ? p.event : p.kind))).size !== e.pairs.length) {
          issue(`"${e.title}" lists a pairing twice`)
        }
        if (e.pairs.some((p) => p.kind === 'sparta') && !scenario.events.some(hasSparta)) {
          issue(`"${e.title}" pairs with every event with a SPARTA tag, and no event has one`)
        }
      }
      for (const ev of scenario.events.filter(isThreat)) {
        if (!entries.some((e) => e.pairs.some((p) => p.kind === 'event' && p.event === ev.id))) {
          issue(`event ${ev.id} has no specific pairing, so its card's learn more would open an empty shelf`)
        }
      }
    })
}

export function validateLibrary(shelves: Shelf[], scenario: Scenario): Shelf[] {
  const parsed = librarySchemaFor(scenario).safeParse(shelves)
  if (!parsed.success) throw new Error(`content validation failed for the Field Library:\n${parsed.error.message}`)
  return shelves
}

// The events an entry pairs with: those it names, and for the SPARTA
// entry every event whose technique references include SPARTA, read from
// the events themselves. A GENERAL entry pairs with none.
export function pairedEvents(entry: LibraryEntry, scenario: Scenario = DEFAULT_SCENARIO): string[] {
  const ids = new Set<string>()
  for (const p of entry.pairs) {
    if (p.kind === 'event') ids.add(p.event)
    if (p.kind === 'sparta') scenario.events.filter(hasSparta).forEach((e) => ids.add(e.id))
  }
  return [...ids]
}

export const isGeneral = (entry: LibraryEntry) => entry.pairs.some((p) => p.kind === 'general')

// The layer note an entry carries for one event, such as "AIR".
export const pairNote = (entry: LibraryEntry, eventId: string) =>
  entry.pairs.find((p): p is Extract<Pairing, { kind: 'event' }> => p.kind === 'event' && p.event === eventId)?.note
