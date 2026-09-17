// Player-facing names for engine enum values. Kept in a module that
// imports nothing, so the director's ledger can name things the way the
// HUD does without pulling the asset layer (and its nine SVG imports)
// into the module graph the node battery loads.

import type { AssetKind, TechniqueRef, Vector } from '../engine/types'

// The words the fleet list uses, so a delta line and the HUD cannot
// disagree about what a thing is called.
export const kindLabels: Record<AssetKind, string> = {
  sat: 'Imaging sat',
  rpoSat: 'RPO servicing sat',
  drone: 'Drone',
  groundStation: 'Ground station',
}

// Five of the six vector values happen to be ordinary words; supplyChain
// is a camelCase identifier and must never reach the screen as one.
export const vectorLabels: Record<Vector, string> = {
  rf: 'RF',
  optical: 'optical',
  cyber: 'cyber',
  supplyChain: 'supply chain',
  human: 'human',
  environmental: 'environmental',
}

// How a framework technique is named wherever the player sees one: the
// brief's tag, the GLOSSARY term, the report card's recap, and the
// countermeasure detail line.
//
// ONE FUNCTION BECAUSE FIVE COPIES OF IT EXISTED. The expression
// `${framework} ${id}` was written out in brief.ts, three times in
// reportCard.ts, inline in Game.tsx, and once as a private helper in
// reference.ts. That is principle 17 in the product rather than in a
// guard: five structures computing the same key, each free to drift, and
// nothing joining them.
//
// It became load-bearing in Round 6e. The intel brief's technique tag now
// opens that technique's GLOSSARY entry, and it finds the entry BY THIS
// KEY. Two independent copies of the expression would make that a string
// coincidence that happens to hold today; one function makes it true by
// construction.
export function techniqueLabel(ref: Pick<TechniqueRef, 'framework' | 'id'>): string {
  return `${ref.framework} ${ref.id}`
}
