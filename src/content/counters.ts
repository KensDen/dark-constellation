// Countermeasure catalog, full spec Section 8 set. Every spartaCms entry
// was verified against sparta.aerospace.org in the R3 verification round
// (2026-07-12): each CM page fetched live, ID and name confirmed, and the
// published defense-in-depth tier (SPARTA's Tier I/II/III prioritization,
// shown per CM as 'Tier: I/II/III') recorded verbatim. Where one game
// card spans several SPARTA controls, the closest controls are listed
// together. Costs for the four R3 additions are first-pass values inside
// the spec 5 to 15 band; tuning happens in the dynamics round.

import type { Countermeasure } from '../engine/types'

export const COUNTERMEASURES: Countermeasure[] = [
  {
    id: 'antiJam',
    name: 'Anti-jam antennas and RF filtering',
    cost: 10,
    counters: ['pnt-jamming', 'uplink-jamming'],
    spartaCms: [
      { id: 'CM0083', name: 'Antenna Nulling and Adaptive Filtering', url: 'https://sparta.aerospace.org/countermeasures/CM0083', tier: 'Tier II' },
      { id: 'CM0029', name: 'TRANSEC', url: 'https://sparta.aerospace.org/countermeasures/CM0029', tier: 'Tier I' },
    ],
    blurb: 'Reduces jamming severity. It does not eliminate it; physics always gets a vote.',
  },
  {
    id: 'linkAuth',
    name: 'Link-layer auth and key rotation',
    cost: 8,
    counters: ['uplink-jamming', 'rogue-ground-station', 'telemetry-replay', 'downlink-eavesdropping', 'backhaul-exfil'],
    spartaCms: [
      { id: 'CM0031', name: 'Authentication', url: 'https://sparta.aerospace.org/countermeasures/CM0031', tier: 'Tier I' },
      { id: 'CM0030', name: 'Crypto Key Management', url: 'https://sparta.aerospace.org/countermeasures/CM0030', tier: 'Tier I' },
    ],
    blurb: 'Baseline crypto hygiene for command links. Cheap, boring, load-bearing.',
  },
  {
    id: 'pntAuth',
    name: 'PNT authentication and multi-constellation receivers',
    cost: 10,
    counters: ['gnss-spoofing', 'time-spoof'],
    spartaCms: [
      { id: 'CM0048', name: 'Resilient Position, Navigation, and Timing', url: 'https://sparta.aerospace.org/countermeasures/CM0048', tier: 'Tier I' },
    ],
    blurb:
      'Authenticated navigation signals plus more than one constellation to cross-check. A counterfeit position or epoch has to beat all of them at once.',
  },
  {
    id: 'sensorFusion',
    name: 'Sensor fusion cross-checks',
    cost: 15,
    counters: ['lidar-dazzle', 'lidar-injection', 'lidar-blinding', 'blackout-chain'],
    spartaCms: [
      { id: 'CM0048', name: 'Resilient Position, Navigation, and Timing', url: 'https://sparta.aerospace.org/countermeasures/CM0048', tier: 'Tier I' },
      { id: 'CM0042', name: 'Robust Fault Management', url: 'https://sparta.aerospace.org/countermeasures/CM0042', tier: 'Tier I' },
    ],
    blurb:
      'LiDAR, radar, and vision voting. The answer to the BLACKOUT CHAIN: an injected point cloud loses the vote two to one.',
  },
  {
    id: 'tierAAttestation',
    name: 'Tier A sensor procurement and firmware attestation',
    cost: 12,
    counters: ['lidar-dazzle', 'lidar-injection', 'lidar-blinding', 'supply-chain-implant'],
    spartaCms: [
      { id: 'CM0025', name: 'Supplier Review', url: 'https://sparta.aerospace.org/countermeasures/CM0025', tier: 'Tier II' },
      { id: 'CM0014', name: 'Secure Boot', url: 'https://sparta.aerospace.org/countermeasures/CM0014', tier: 'Tier I' },
      { id: 'CM0024', name: 'Anti-counterfeit Hardware', url: 'https://sparta.aerospace.org/countermeasures/CM0024', tier: 'Tier II' },
    ],
    blurb:
      'Audited firmware and an assured supply chain. Only pulls its weight once most of the fleet actually flies Tier A packages.',
  },
  {
    id: 'mlPipelineIntegrity',
    name: 'ML pipeline integrity',
    cost: 10,
    counters: ['training-data-poisoning'],
    spartaCms: [
      { id: 'CM0049', name: 'Machine Learning Data Integrity', url: 'https://sparta.aerospace.org/countermeasures/CM0049', tier: 'Tier II' },
    ],
    blurb:
      'Dataset provenance, poisoning detection, and gated retraining for the perception models. The model is only as honest as the data it ate.',
  },
  {
    id: 'groundZeroTrust',
    name: 'Ground zero-trust segmentation and MFA',
    cost: 12,
    counters: ['rogue-ground-station', 'ground-ransomware', 'ops-phishing'],
    spartaCms: [
      { id: 'CM0005', name: 'Ground-based Countermeasures', url: 'https://sparta.aerospace.org/countermeasures/CM0005', tier: 'Tier II' },
      { id: 'CM0038', name: 'Segmentation', url: 'https://sparta.aerospace.org/countermeasures/CM0038', tier: 'Tier I' },
      { id: 'CM0035', name: 'Protect Authenticators', url: 'https://sparta.aerospace.org/countermeasures/CM0035', tier: 'Tier I' },
    ],
    blurb: 'Compartmentalized ground segment. A phished credential opens one door, not all of them.',
  },
  {
    id: 'insiderProgram',
    name: 'Least privilege and insider program',
    cost: 8,
    counters: ['insider-exfil'],
    spartaCms: [
      { id: 'CM0052', name: 'Insider Threat Protection', url: 'https://sparta.aerospace.org/countermeasures/CM0052', tier: 'Tier II' },
      { id: 'CM0039', name: 'Least Privilege', url: 'https://sparta.aerospace.org/countermeasures/CM0039', tier: 'Tier I' },
    ],
    blurb:
      'Background vetting, compartmentalization, and audit logging. Trust is a control surface, so instrument it.',
  },
  {
    id: 'ssaManeuver',
    name: 'SSA subscription and maneuver budget',
    cost: 10,
    counters: ['debris-conjunction'],
    spartaCms: [
      { id: 'CM0077', name: 'Space Domain Awareness', url: 'https://sparta.aerospace.org/countermeasures/CM0077', tier: 'Tier II' },
      { id: 'CM0079', name: 'Maneuverability', url: 'https://sparta.aerospace.org/countermeasures/CM0079', tier: 'Tier III' },
    ],
    blurb: 'Conjunction warnings plus fuel to act on them. Not every threat has a motive.',
  },
  {
    id: 'encryptedBackhaul',
    name: 'Encrypted satellite backhaul',
    cost: 8,
    counters: ['downlink-eavesdropping', 'backhaul-exfil'],
    spartaCms: [
      { id: 'CM0002', name: 'COMSEC', url: 'https://sparta.aerospace.org/countermeasures/CM0002', tier: 'Tier I' },
    ],
    blurb:
      'Encrypt every link that touches the bird, payload and backhaul alike. A dish on a roof can hear anything sent in the clear.',
  },
  {
    id: 'intelInvestment',
    name: 'Intel investment',
    cost: 0,
    counters: [],
    spartaCms: [
      { id: 'CM0009', name: 'Threat Intelligence Program', url: 'https://sparta.aerospace.org/countermeasures/CM0009', tier: 'Tier II' },
    ],
    blurb: 'Levels 1 to 3, bought in the procure phase. Sharper forecasts of the coming turn.',
  },
  {
    id: 'irRetainer',
    name: 'Incident response retainer',
    cost: 12,
    counters: [],
    spartaCms: [
      { id: 'CM0088', name: 'Organizational Policy', url: 'https://sparta.aerospace.org/countermeasures/CM0088', tier: 'Tier III' },
      { id: 'CM0005', name: 'Ground-based Countermeasures', url: 'https://sparta.aerospace.org/countermeasures/CM0005', tier: 'Tier II' },
    ],
    blurb: 'Faster recovery on every meter, every turn. Paid before the incident, like it has to be.',
  },
]
