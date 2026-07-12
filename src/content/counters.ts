// Countermeasure catalog, R1 subset (spec Section 8): exactly the items
// the 8-event skeleton deck needs. SPARTA CM ID mapping happens in R3.

import type { Countermeasure } from '../engine/types'

export const COUNTERMEASURES: Countermeasure[] = [
  {
    id: 'antiJam',
    name: 'Anti-jam antennas and RF filtering',
    cost: 10,
    counters: ['pnt-jamming', 'uplink-jamming'],
    blurb: 'Reduces jamming severity. It does not eliminate it; physics always gets a vote.',
  },
  {
    id: 'linkAuth',
    name: 'Link-layer auth and key rotation',
    cost: 8,
    counters: ['uplink-jamming'],
    blurb: 'Baseline crypto hygiene for command links. Cheap, boring, load-bearing.',
  },
  {
    id: 'sensorFusion',
    name: 'Sensor fusion cross-checks',
    cost: 15,
    counters: ['lidar-injection', 'blackout-chain'],
    blurb:
      'LiDAR, radar, and vision voting. The answer to the BLACKOUT CHAIN: an injected point cloud loses the vote two to one.',
  },
  {
    id: 'tierAAttestation',
    name: 'Tier A sensor procurement and firmware attestation',
    cost: 12,
    counters: ['lidar-injection', 'supply-chain-implant'],
    blurb:
      'Audited firmware and an assured supply chain. Only pulls its weight once most of the fleet actually flies Tier A packages.',
  },
  {
    id: 'groundZeroTrust',
    name: 'Ground zero-trust segmentation and MFA',
    cost: 12,
    counters: ['ground-ransomware', 'ops-phishing'],
    blurb: 'Compartmentalized ground segment. A phished credential opens one door, not all of them.',
  },
  {
    id: 'ssaManeuver',
    name: 'SSA subscription and maneuver budget',
    cost: 10,
    counters: ['debris-conjunction'],
    blurb: 'Conjunction warnings plus fuel to act on them. Not every threat has a motive.',
  },
  {
    id: 'intelInvestment',
    name: 'Intel investment',
    cost: 0,
    counters: [],
    blurb: 'Levels 1 to 3, bought in the procure phase. Sharper forecasts of the coming turn.',
  },
  {
    id: 'irRetainer',
    name: 'Incident response retainer',
    cost: 12,
    counters: [],
    blurb: 'Faster recovery on every meter, every turn. Paid before the incident, like it has to be.',
  },
]
