// WRITTEN GAMES (v2.0 R3): whole games as literals, for the suites that
// pin what a fixed game comes to (the determinism snapshot in
// tests/engine.spec.ts, the share text in tests/share-text.spec.ts). Each
// night is its orders with what was scanned, where the new defense was set
// down, the call on the hold and the answer to each move in the order
// they came, played through plain resolveTurn: nothing is chosen as the
// night goes, so the game is its literals and a retuned policy or
// responder cannot move a pin.
//
// Both games were written down on 15 November 2026 from what the sweep's
// Prepared line (tests/policies.ts: it scans, sets its defense on the
// asset the move is aimed at, reads its holds and takes the first answer
// offered) played on these seeds, on STANDARD. The written WIN_SCRIPT of
// tests/scripts.ts, which anchored these pins through v2.0 R2 under the
// pixel board's rules, no longer wins either seed.

import { resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'

export function playWritten(from: GameState, nights: readonly TurnActions[]): GameState {
  let state = from
  for (const night of nights) state = resolveTurn(state, night, turnRng(state.seed, state.turn))
  return state
}

// Seed 20260712, won at 81.9: the time spoof, the uplink jamming and the
// backhaul exfiltration each blocked with an answer, two moves let through
// on night 4, the debris burned on night 5, and all three holds called
// rightly.
export const WIN_GAME_SEED = 20260712
export const WIN_GAME: readonly TurnActions[] = [
  { buyAssets: [{ kind: 'drone' }], buyCounters: [], scans: ['pnt-jamming', 'time-spoof'], tiebreak: null, responses: ['onboard-clock'] },
  { buyAssets: [], buyCounters: ['groundZeroTrust'], scans: ['ops-phishing', 'uplink-jamming'], placeOn: { groundZeroTrust: 'start-rpoSat-3' }, tiebreak: null, responses: ['backup-link'] },
  { buyAssets: [], buyCounters: ['antiJam'], scans: ['uplink-jamming', 'downlink-eavesdropping'], placeOn: { antiJam: 'start-sat-2' }, tiebreak: null, responses: [null, 'link-down'] },
  { buyAssets: [], buyCounters: ['mlPipelineIntegrity'], scans: ['ground-ransomware', 'training-data-poisoning'], placeOn: { mlPipelineIntegrity: 'start-drone-4' }, tiebreak: 'override', responses: [null, null] },
  { buyAssets: [], buyCounters: ['pntAuth'], scans: ['gnss-spoofing', 'lidar-dazzle'], debris: 'burn', placeOn: { pntAuth: 'start-rpoSat-3' }, tiebreak: 'stand', responses: [null, null] },
  { buyAssets: [], buyCounters: ['sensorFusion'], scans: ['ops-phishing', 'ground-ransomware'], placeOn: { sensorFusion: 'start-drone-4' }, tiebreak: 'override', responses: [null, null] },
]

// The Daily Op of 27 September 2026 (seed 289227389, tests/daily.spec.ts),
// won at 82.5: night 1's PNT jamming blocked with an answer, night 2's
// hold overridden rightly and its uplink jamming blocked with an answer,
// night 3 held by the defenses, night 4's insider blocked with the last
// answer and the LiDAR blinding let through, night 5's debris burned and
// its hold left standing, night 6's chain held.
export const DAILY_WIN_GAME: readonly TurnActions[] = [
  { buyAssets: [{ kind: 'drone' }], buyCounters: [], scans: ['pnt-jamming', 'time-spoof'], tiebreak: null, responses: ['backup-nav'] },
  { buyAssets: [], buyCounters: ['groundZeroTrust'], scans: ['ops-phishing', 'uplink-jamming'], placeOn: { groundZeroTrust: 'start-sat-1' }, tiebreak: 'override', responses: ['backup-link'] },
  { buyAssets: [], buyCounters: ['antiJam'], scans: ['uplink-jamming', 'downlink-eavesdropping'], placeOn: { antiJam: 'start-sat-1' }, tiebreak: null, responses: [null, null] },
  { buyAssets: [], buyCounters: ['mlPipelineIntegrity'], scans: ['ground-ransomware', 'training-data-poisoning'], placeOn: { mlPipelineIntegrity: 'start-drone-5' }, tiebreak: null, responses: ['suspend-account', null] },
  { buyAssets: [], buyCounters: ['pntAuth'], scans: ['gnss-spoofing', 'lidar-dazzle'], debris: 'burn', placeOn: { pntAuth: 'start-rpoSat-3' }, tiebreak: 'stand', responses: [null, null, null] },
  { buyAssets: [], buyCounters: ['sensorFusion'], scans: ['ops-phishing', 'ground-ransomware'], placeOn: { sensorFusion: 't1-drone-1' }, tiebreak: 'stand', responses: [null, null] },
]
