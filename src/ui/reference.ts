// Reference data derived entirely from the content deck (R3.5). The
// GLOSSARY has zero hand-maintained entries: every technique, every
// countermeasure with its SPARTA CM tiers, and every threat and
// opportunity is read off DEFAULT_SCENARIO. If the content changes, the
// glossary changes with it.

import { DEFAULT_SCENARIO } from '../content'
import type { TechniqueRef } from '../engine/types'
import { frameworkLabels, techniqueLabel } from './labels'

export interface GlossaryEntry {
  // The stable key a caller can find this entry by. For a technique it is
  // techniqueLabel(ref), which is the same string the intel brief renders
  // as its tag, so the tag resolves to the entry by construction rather
  // than by a substring match on the display term.
  key: string
  term: string
  category: 'Technique' | 'Countermeasure' | 'Threat event' | 'Opportunity'
  body: string
  refs: { label: string; url: string }[]
}

// Whether an entry answers the GLOSSARY filter: its term or body contains
// the query, ignoring case, as the text reads on screen or with each
// ampersand read as an a. ATT&CK is said and typed "attack", so "attack"
// finds its techniques as "att&ck" does; dropping the ampersand instead
// would leave "attck", which nobody types.
export function glossaryMatches(entry: GlossaryEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  return [entry.term, entry.body].some((text) => {
    const lower = text.toLowerCase()
    return lower.includes(q) || lower.replaceAll('&', 'a').includes(q)
  })
}

const scenario = DEFAULT_SCENARIO



// Techniques: one entry per distinct framework ref across the deck, with
// the events that cite it.
function techniqueEntries(): GlossaryEntry[] {
  const byKey = new Map<string, { ref: TechniqueRef; events: Set<string> }>()
  for (const ev of scenario.events) {
    for (const ref of ev.techniqueRefs) {
      const key = techniqueLabel(ref)
      if (!byKey.has(key)) byKey.set(key, { ref, events: new Set() })
      byKey.get(key)!.events.add(ev.name.split(' (')[0])
    }
  }
  return [...byKey.values()]
    .map(({ ref, events }) => ({
      key: techniqueLabel(ref),
      term: `${techniqueLabel(ref)}: ${ref.name}`,
      category: 'Technique' as const,
      body: `${ref.framework === 'NSA' ? 'NSA cybersecurity advisory' : `${frameworkLabels[ref.framework]} framework technique`}. Appears in: ${[...events].join(', ')}.`,
      refs: [{ label: 'Framework page', url: ref.url }],
    }))
    .sort((a, b) => a.term.localeCompare(b.term))
}

function countermeasureEntries(): GlossaryEntry[] {
  return scenario.countermeasures
    .map((cm) => ({
      // A countermeasure is looked up by its own name; nothing addresses
      // one by another key, so the key is the term.
      key: cm.name,
      term: cm.name,
      category: 'Countermeasure' as const,
      body:
        `${cm.blurb} Answers: ${cm.counters.map((id) => scenario.events.find((e) => e.id === id)?.name.split(' (')[0] ?? id).join(', ') || 'posture-wide'}.` +
        (cm.spartaCms.length
          ? ` SPARTA controls: ${cm.spartaCms.map((c) => `${c.id} ${c.name} (${c.tier})`).join('; ')}.`
          : ''),
      refs: cm.spartaCms.map((c) => ({ label: `${c.id} ${c.name}`, url: c.url })),
    }))
    .sort((a, b) => a.term.localeCompare(b.term))
}

function eventEntries(): GlossaryEntry[] {
  return scenario.events
    .map((ev) => ({
      key: ev.id,
      term: ev.name.split(' (')[0],
      category: (ev.kind === 'opportunity' ? 'Opportunity' : 'Threat event') as GlossaryEntry['category'],
      body: ev.blurb,
      refs: ev.techniqueRefs.map((r) => ({ label: techniqueLabel(r), url: r.url })),
    }))
    .sort((a, b) => a.term.localeCompare(b.term))
}

export function glossaryEntries(): GlossaryEntry[] {
  return [...techniqueEntries(), ...countermeasureEntries(), ...eventEntries()]
}

// Counts for the reference screens, all derived.
export const GLOSSARY_COUNT = glossaryEntries().length
