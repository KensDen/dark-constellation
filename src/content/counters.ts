// Countermeasure catalog, full spec Section 8 set (R3 structure). The
// spartaCms arrays are intentionally EMPTY this round: mapping each item
// to SPARTA countermeasure IDs and their published defense-in-depth tiers
// requires reading sparta.aerospace.org live, which the authoring session
// could not reach. The verification round fills them; the skipped
// acceptance test in tests/content.spec.ts is the tripwire. Costs for the
// four R3 additions are first-pass values inside the spec 5 to 15 band;
// tuning happens in the dynamics round.

import type { Countermeasure } from '../engine/types'

export const COUNTERMEASURES: Countermeasure[] = [
  {
    id: 'antiJam',
    name: 'Anti-jam antennas and RF filtering',
    cost: 10,
    counters: ['pnt-jamming', 'uplink-jamming'],
    spartaCms: [],
    blurb: 'Reduces jamming severity. It does not eliminate it; physics always gets a vote.',
  },
  {
    id: 'linkAuth',
    name: 'Link-layer auth and key rotation',
    cost: 8,
    counters: ['uplink-jamming', 'rogue-ground-station', 'telemetry-replay', 'downlink-eavesdropping', 'backhaul-exfil'],
    spartaCms: [],
    blurb: 'Baseline crypto hygiene for command links. Cheap, boring, load-bearing.',
  },
  {
    id: 'pntAuth',
    name: 'PNT authentication and multi-constellation receivers',
    cost: 10,
    counters: ['gnss-spoofing', 'time-spoof'],
    spartaCms: [],
    blurb:
      'Authenticated navigation signals plus more than one constellation to cross-check. A counterfeit position or epoch has to beat all of them at once.',
  },
  {
    id: 'sensorFusion',
    name: 'Sensor fusion cross-checks',
    cost: 15,
    counters: ['lidar-dazzle', 'lidar-injection', 'lidar-blinding', 'blackout-chain'],
    spartaCms: [],
    blurb:
      'LiDAR, radar, and vision voting. The answer to the BLACKOUT CHAIN: an injected point cloud loses the vote two to one.',
  },
  {
    id: 'tierAAttestation',
    name: 'Tier A sensor procurement and firmware attestation',
    cost: 12,
    counters: ['lidar-dazzle', 'lidar-injection', 'lidar-blinding', 'supply-chain-implant'],
    spartaCms: [],
    blurb:
      'Audited firmware and an assured supply chain. Only pulls its weight once most of the fleet actually flies Tier A packages.',
  },
  {
    id: 'mlPipelineIntegrity',
    name: 'ML pipeline integrity',
    cost: 10,
    counters: ['training-data-poisoning'],
    spartaCms: [],
    blurb:
      'Dataset provenance, poisoning detection, and gated retraining for the perception models. The model is only as honest as the data it ate.',
  },
  {
    id: 'groundZeroTrust',
    name: 'Ground zero-trust segmentation and MFA',
    cost: 12,
    counters: ['rogue-ground-station', 'ground-ransomware', 'ops-phishing'],
    spartaCms: [],
    blurb: 'Compartmentalized ground segment. A phished credential opens one door, not all of them.',
  },
  {
    id: 'insiderProgram',
    name: 'Least privilege and insider program',
    cost: 8,
    counters: ['insider-exfil'],
    spartaCms: [],
    blurb:
      'Background vetting, compartmentalization, and audit logging. Trust is a control surface, so instrument it.',
  },
  {
    id: 'ssaManeuver',
    name: 'SSA subscription and maneuver budget',
    cost: 10,
    counters: ['debris-conjunction'],
    spartaCms: [],
    blurb: 'Conjunction warnings plus fuel to act on them. Not every threat has a motive.',
  },
  {
    id: 'encryptedBackhaul',
    name: 'Encrypted satellite backhaul',
    cost: 8,
    counters: ['downlink-eavesdropping', 'backhaul-exfil'],
    spartaCms: [],
    blurb:
      'Encrypt every link that touches the bird, payload and backhaul alike. A dish on a roof can hear anything sent in the clear.',
  },
  {
    id: 'intelInvestment',
    name: 'Intel investment',
    cost: 0,
    counters: [],
    spartaCms: [],
    blurb: 'Levels 1 to 3, bought in the procure phase. Sharper forecasts of the coming turn.',
  },
  {
    id: 'irRetainer',
    name: 'Incident response retainer',
    cost: 12,
    counters: [],
    spartaCms: [],
    blurb: 'Faster recovery on every meter, every turn. Paid before the incident, like it has to be.',
  },
]
