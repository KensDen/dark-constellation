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

// LAZY_SCRIPT is the half-hearted middle line for the balance sweep: some
// cheap, late, unfocused buys, no sensor fusion, no intel, no plan for the
// BLACKOUT CHAIN. The tuning target for the dynamics round is that this
// line loses far more often than the prepared line.
export const LAZY_SCRIPT: Record<number, TurnActions> = {
  ...LOSS_SCRIPT,
  2: a({ buyCounters: ['antiJam'] }),
  4: a({ buyCounters: ['groundZeroTrust'] }),
  6: a({ buyAssets: [{ kind: 'drone', tier: 'B' }] }),
  8: a({ buyCounters: ['linkAuth'] }),
}

// MIXED_SCRIPT (R3.25): reasonable but imperfect play. Real defenses, but
// bought a little late and incomplete: fusion retrofit lands just before
// the first chain rather than well ahead of it, intel only reaches level
// 1, coverage is grown but never maxed, and there is no Tier A fleet.
// Deploy slips and hidden condition durations make the outcome genuinely
// uncertain seed to seed. This is the balance-uncertainty line.
export const MIXED_SCRIPT: Record<number, TurnActions> = {
  ...LOSS_SCRIPT,
  1: a({ buyCounters: ['antiJam'], buyIntelLevel: true, buyAssets: [{ kind: 'sat', tier: 'B' }] }),
  2: a({ buyCounters: ['groundZeroTrust'], buyAssets: [{ kind: 'sat', tier: 'B' }] }),
  3: a({ buyCounters: ['linkAuth'] }),
  4: a({ buyCounters: ['pntAuth'] }),
  5: a({ buyCounters: ['ssaManeuver'] }),
  6: a({ buyCounters: ['sensorFusion'], buyAssets: [{ kind: 'drone', tier: 'B' }] }),
  8: a({ buyCounters: ['encryptedBackhaul'], buyIrRetainer: true }),
  10: a({ buyAssets: [{ kind: 'drone', tier: 'B' }] }),
}
