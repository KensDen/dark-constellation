// Reference data derived entirely from the content deck (R3.5). The
// GLOSSARY has zero hand-maintained entries: every technique, every
// countermeasure with its SPARTA CM tiers, and every threat and
// opportunity is read off DEFAULT_SCENARIO. If the content changes, the
// glossary changes with it.

import { DEFAULT_SCENARIO } from '../content'
import type { TechniqueRef } from '../engine/types'

export interface GlossaryEntry {
  term: string
  category: 'Technique' | 'Countermeasure' | 'Threat event' | 'Opportunity'
  body: string
  refs: { label: string; url: string }[]
}

const scenario = DEFAULT_SCENARIO

function techniqueLabel(r: TechniqueRef): string {
  return `${r.framework} ${r.id}`
}

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
      term: `${techniqueLabel(ref)}: ${ref.name}`,
      category: 'Technique' as const,
      body: `${ref.framework === 'NSA' ? 'NSA cybersecurity advisory' : `${ref.framework} framework technique`}. Appears in: ${[...events].join(', ')}.`,
      refs: [{ label: 'Framework page', url: ref.url }],
    }))
    .sort((a, b) => a.term.localeCompare(b.term))
}

function countermeasureEntries(): GlossaryEntry[] {
  return scenario.countermeasures
    .map((cm) => ({
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
