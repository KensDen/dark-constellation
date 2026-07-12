// Action scripts for the determinism and reachability tests. These are
// real play: legal action sequences fed through the public engine API,
// the same calls the UI makes. WIN_SCRIPT is a prepared architect;
// LOSS_SCRIPT ignores every warning and buys nothing.

import type { TurnActions } from '../src/engine/types'

export const NO_OP: TurnActions = {
  buyAssets: [],
  buyCounters: [],
  buyIntelLevel: false,
  buyIrRetainer: false,
}

const a = (partial: Partial<TurnActions>): TurnActions => ({ ...NO_OP, ...partial })

// Keyed by turn number, 1..12.
export const WIN_SCRIPT: Record<number, TurnActions> = {
  1: a({ buyCounters: ['sensorFusion', 'antiJam'], buyAssets: [{ kind: 'sat', tier: 'B' }], buyIntelLevel: true }),
  2: a({ buyAssets: [{ kind: 'sat', tier: 'B' }] }),
  3: a({ buyCounters: ['groundZeroTrust'] }),
  4: a({ buyCounters: ['tierAAttestation'], buyIrRetainer: true }),
  5: a({ buyCounters: ['ssaManeuver'] }),
  6: a({ buyAssets: [{ kind: 'drone', tier: 'A' }] }),
  7: a({ buyAssets: [{ kind: 'drone', tier: 'A' }] }),
  8: a({ buyCounters: ['linkAuth'] }),
  9: a({ buyAssets: [{ kind: 'sat', tier: 'A' }] }),
  10: a({}),
  11: a({ buyAssets: [{ kind: 'drone', tier: 'A' }] }),
  12: a({}),
}

export const LOSS_SCRIPT: Record<number, TurnActions> = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [i + 1, NO_OP]),
)
