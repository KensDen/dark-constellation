// Scenario: FIRST LIGHT. The R1 campaign: 12 turns, escalating COLDWAKE
// activity, BLACKOUT CHAIN scripted mid-game and again as the finale.
// Economy numbers start from the spec Section 9 placeholders; tuned so a
// prepared architect clears the win threshold and a passive one collapses.

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
  campaign: [
    { turn: 1, slots: [] },
    { turn: 2, slots: [{ drawFrom: ['ops-phishing', 'uplink-jamming'] }] },
    { turn: 3, slots: [{ fixed: 'uplink-jamming' }] },
    { turn: 4, slots: [{ drawFrom: ['ops-phishing', 'uplink-jamming', 'debris-conjunction'] }] },
    { turn: 5, slots: [{ fixed: 'supply-chain-implant' }] },
    { turn: 6, slots: [{ fixed: 'pnt-jamming' }] },
    { turn: 7, slots: [{ fixed: 'blackout-chain' }] },
    { turn: 8, slots: [{ fixed: 'ground-ransomware' }] },
    {
      turn: 9,
      slots: [{ drawFrom: ['uplink-jamming', 'ops-phishing'] }, { drawFrom: ['debris-conjunction', 'lidar-injection'] }],
    },
    { turn: 10, slots: [{ fixed: 'debris-conjunction' }] },
    { turn: 11, slots: [{ fixed: 'pnt-jamming' }, { drawFrom: ['lidar-injection', 'uplink-jamming'] }] },
    { turn: 12, slots: [{ fixed: 'blackout-chain' }, { drawFrom: ['ground-ransomware', 'ops-phishing'] }] },
  ],
  briefIntro: `You are the mission assurance architect at ${PLAYER_ORG}, standing up ${CONSTELLATION} (nine planned smallsats, one with a docking LiDAR package) and ${SQUADRON} (an ISR drone squadron on LiDAR and GNSS navigation) for a disaster-response tasking. ${ADVERSARY}, a threat group with a taste for layered attacks, has taken an interest. Twelve turns. Keep the Mission Assurance Index above threshold and stay solvent.`,
  events: THREATS,
  countermeasures: COUNTERMEASURES,
}
