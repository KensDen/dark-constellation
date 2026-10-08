// Mission assurance (spec Section 9): weighted average of Coverage, Link
// Availability, Data Integrity, Sensor Integrity. Coverage derives from
// the surviving fleet; the other three are damage-tracked meters.

import type { Asset, AssetKind, GameState, Scenario } from './types'

// Coverage per kind at full integrity (v1.3 brief 6.1, critique row M12):
// a wounded asset covers in proportion to its integrity, so a hit that
// leaves a tile standing still costs coverage. v1.2 counted sats and RPO
// sats at 12 and drones at 4 whatever their integrity, and ground stations
// not at all.
export const COVERAGE_PER_KIND: Record<AssetKind, number> = {
  sat: 13,
  rpoSat: 8,
  drone: 9,
  groundStation: 6,
}
// Coverage and the three trust meters are 0..100 percentages; this is the
// shared ceiling. Exported so UI copy interpolates it (R4 item 5).
export const METER_CAP = 100

// `offStation` leaves out assets that are up but not covering tonight: a
// satellite that burned out of a debris corridor (brief 5.5 item 5), for
// the coverage bonus check at turn close.
//
// Summed in whole hundredths and divided once: every term is a whole
// weight times a whole integrity, so the exact figure is a multiple of
// 0.01, and adding the terms as fractions left float noise in it (56.22
// came out 56.220000000000006, and a fleet worth exactly 60 could come out
// a hair under the bonus line).
export function coverage(assets: readonly Asset[], offStation?: ReadonlySet<string>): number {
  let hundredths = 0
  for (const a of assets) {
    if (a.integrity <= 0 || offStation?.has(a.id)) continue
    hundredths += COVERAGE_PER_KIND[a.kind] * a.integrity
  }
  return Math.min(METER_CAP, hundredths / 100)
}

// The unrounded score, for the engine's own arithmetic (points saved
// subtracts two of these). What anything shows is maiScore.
export function maiRaw(state: Pick<GameState, 'scenario' | 'assets' | 'meters'>): number {
  const w = state.scenario.maiWeights
  const total = w.coverage + w.linkAvailability + w.dataIntegrity + w.sensorIntegrity
  return (
    (coverage(state.assets) * w.coverage +
      state.meters.linkAvailability * w.linkAvailability +
      state.meters.dataIntegrity * w.dataIntegrity +
      state.meters.sensorIntegrity * w.sensorIntegrity) /
    total
  )
}

export function maiScore(state: Pick<GameState, 'scenario' | 'assets' | 'meters'>): number {
  return Math.round(maiRaw(state) * 10) / 10
}

// One price per kind since the tiers left (D2 a).
export function assetPrice(scenario: Scenario, kind: AssetKind): number {
  return scenario.prices[kind]
}
