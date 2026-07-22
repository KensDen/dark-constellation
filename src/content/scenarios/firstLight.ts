// Scenario: FIRST LIGHT. 12 turns, escalating COLDWAKE activity, BLACKOUT
// CHAIN scripted mid-game and again as the finale. R3 wires the full
// 18-event deck into the campaign; economy numbers are unchanged from R1
// (tuning happens in the dynamics round, against the R3 baseline sweep).

import type { Scenario } from '../../engine/types'
import { ADVERSARY, CONSTELLATION, PLAYER_ORG, SQUADRON } from '../../config'
import { COUNTERMEASURES } from '../counters'
import { THREATS } from '../threats'

export const FIRST_LIGHT: Scenario = {
  id: 'first-light',
  name: 'FIRST LIGHT',
  totalTurns: 12,
  startCredits: 100,
  incomePerTurn: 20,
  slaBonus: { coverageMin: 60, credits: 10 },
  winThreshold: 70,
  collapseThreshold: 35,
  maiWeights: { coverage: 0.3, linkAvailability: 0.25, dataIntegrity: 0.2, sensorIntegrity: 0.25 },
  prices: {
    sat: 30,
    rpoSat: 35,
    drone: 15,
    groundStation: 25,
    tierAUpcharge: { sat: 10, drone: 5 },
    intelLevels: [8, 12, 16],
  },
  recovery: { base: 2, withIrRetainer: 6 },
  starterAssets: [
    { kind: 'sat', tier: 'B' },
    { kind: 'sat', tier: 'B' },
    { kind: 'rpoSat', tier: 'B' },
    { kind: 'drone', tier: 'B' },
    { kind: 'drone', tier: 'B' },
    { kind: 'groundStation', tier: 'B' },
  ],
  // The scripted beats from R1 hold their turns (implant on 5, chain on 7
  // and 12); the R3 events join the draw pools around them, quiet early
  // reconnaissance first, louder attacks as the campaign escalates.
  campaign: [
    { turn: 1, slots: [] },
    { turn: 2, slots: [{ drawFrom: ['ops-phishing', 'uplink-jamming', 'downlink-eavesdropping'] }] },
    { turn: 3, slots: [{ fixed: 'uplink-jamming' }] },
    { turn: 4, slots: [{ drawFrom: ['ops-phishing', 'uplink-jamming', 'debris-conjunction', 'telemetry-replay'] }] },
    { turn: 5, slots: [{ fixed: 'supply-chain-implant' }] },
    { turn: 6, slots: [{ fixed: 'pnt-jamming' }, { drawFrom: ['gnss-spoofing', 'time-spoof'] }] },
    { turn: 7, slots: [{ fixed: 'blackout-chain' }] },
    { turn: 8, slots: [{ fixed: 'ground-ransomware' }, { drawFrom: ['rogue-ground-station', 'training-data-poisoning'] }] },
    {
      turn: 9,
      slots: [
        { drawFrom: ['uplink-jamming', 'ops-phishing', 'rogue-ground-station'] },
        { drawFrom: ['debris-conjunction', 'lidar-injection', 'lidar-dazzle'] },
      ],
    },
    { turn: 10, slots: [{ fixed: 'debris-conjunction' }, { drawFrom: ['insider-exfil', 'backhaul-exfil'] }] },
    { turn: 11, slots: [{ fixed: 'pnt-jamming' }, { drawFrom: ['lidar-injection', 'lidar-blinding', 'uplink-jamming'] }] },
    {
      turn: 12,
      slots: [{ fixed: 'blackout-chain' }, { drawFrom: ['ground-ransomware', 'ops-phishing', 'training-data-poisoning'] }],
    },
  ],
  briefIntro: `You are the mission assurance architect at ${PLAYER_ORG}, standing up ${CONSTELLATION} (nine planned smallsats, one with a docking LiDAR package) and ${SQUADRON} (an ISR drone squadron on LiDAR and GNSS navigation) for a disaster-response tasking. ${ADVERSARY}, a threat group with a taste for layered attacks, has taken an interest. Twelve turns. Keep the Mission Assurance Index above threshold and stay solvent.`,
  events: THREATS,
  countermeasures: COUNTERMEASURES,
}
