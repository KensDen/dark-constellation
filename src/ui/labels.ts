// Player-facing names for engine enum values. Kept in a module that
// imports nothing, so the director's ledger can name things the way the
// HUD does without pulling the asset layer (and its nine SVG imports)
// into the module graph the node battery loads.

import type { AssetKind, Vector } from '../engine/types'

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
