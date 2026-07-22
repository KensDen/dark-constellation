// Mission Assurance Index (spec Section 9): weighted average of Coverage,
// Link Availability, Data Integrity, Sensor Integrity. Coverage derives
// from the surviving fleet; the other three are damage-tracked meters.

import type { Asset, GameState, Scenario } from './types'

export const COVERAGE_PER_SAT = 12
export const COVERAGE_PER_DRONE = 4
// Coverage and the three trust meters are 0..100 percentages; this is the
// shared ceiling. Exported so UI copy interpolates it (R4 item 5).
export const METER_CAP = 100

export function coverage(assets: Asset[]): number {
  const sats = assets.filter((a) => (a.kind === 'sat' || a.kind === 'rpoSat') && a.integrity > 0).length
  const drones = assets.filter((a) => a.kind === 'drone' && a.integrity > 0).length
  return Math.min(METER_CAP, sats * COVERAGE_PER_SAT + drones * COVERAGE_PER_DRONE)
}

export function maiScore(state: GameState): number {
  const w = state.scenario.maiWeights
  const total = w.coverage + w.linkAvailability + w.dataIntegrity + w.sensorIntegrity
  const score =
    (coverage(state.assets) * w.coverage +
      state.meters.linkAvailability * w.linkAvailability +
      state.meters.dataIntegrity * w.dataIntegrity +
      state.meters.sensorIntegrity * w.sensorIntegrity) /
    total
  return Math.round(score * 10) / 10
}

export function assetPrice(scenario: Scenario, kind: Asset['kind'], tier: Asset['tier']): number {
  const p = scenario.prices
  const base = kind === 'sat' ? p.sat : kind === 'rpoSat' ? p.rpoSat : kind === 'drone' ? p.drone : p.groundStation
  if (tier === 'A' && (kind === 'sat' || kind === 'rpoSat')) return base + p.tierAUpcharge.sat
  if (tier === 'A' && kind === 'drone') return base + p.tierAUpcharge.drone
  return base
}
