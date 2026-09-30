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

// What a sensor trust tier means, as the PROCURE sheet has always said it.
// A constant since v1.2 R3 so a tile's intel card can say the same thing
// rather than a second version of it.
export const TIER_NOTE =
  'Tier B sensor packages are cheap with a hidden supply-chain risk: only Tier B hardware can host the firmware implant. Tier A packages cost more on sats and drones, are immune to the implant, and an all Tier A drone fleet breaks the BLACKOUT CHAIN. Ground stations carry no sensor package.'

// The frameworks as MITRE and the others spell them. The enum says ATTACK,
// and it stays that way: the engine writes it into every turn's history
// (firedTechniqueRefs), which the determinism snapshot hashes and every
// save code carries. Only the player's copy changes, here. Keyed by the
// TechniqueRef union, so the type checker refuses a framework added there
// without a label; tests/technique-tag.spec.ts reads the schema's list for
// one added only to the schema, which nothing joins to that union.
export const frameworkLabels: Record<TechniqueRef['framework'], string> = {
  SPARTA: 'SPARTA',
  ATLAS: 'ATLAS',
  ATTACK: 'ATT&CK',
  ATTACK_ICS: 'ATT&CK for ICS',
  NSA: 'NSA',
  RESEARCH: 'RESEARCH',
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
  return `${frameworkLabels[ref.framework]} ${ref.id}`
}
