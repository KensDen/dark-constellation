// Threat deck, R1 skeleton subset: 8 of the 16 events in spec Section 7.
// Framework refs marked verify-at-build get web-verified in R3 (spec
// Section 12); refs marked verified were checked against SPARTA v3.2
// during spec drafting. The remaining 8 events arrive in R3.

import type { ThreatEvent } from '../engine/types'

export const THREATS: ThreatEvent[] = [
  {
    id: 'pnt-jamming',
    name: 'PNT jamming (GNSS denial over the AO)',
    layers: ['AIR'],
    vector: 'rf',
    baseSeverity: 2,
    counters: ['antiJam'],
    chainsWith: ['blackout-chain'],
    effect: { meters: ['linkAvailability'], special: 'jamsGnss', repairCostPerSeverity: 2 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'EX-0016.03',
        name: 'Jamming: Position, Navigation, and Timing (PNT)',
        url: 'https://sparta.aerospace.org/technique/EX-0016.03/',
        status: 'verified',
      },
    ],
    blurb:
      'Broadband noise where GNSS signals should be. Drones lose position fixes and fall back to whatever sensor is left, which is exactly what the adversary wants. Denial is rarely the end goal; it is the setup.',
  },
  {
    id: 'uplink-jamming',
    name: 'Uplink jamming (command link denial)',
    layers: ['ORBIT'],
    vector: 'rf',
    baseSeverity: 2,
    counters: ['antiJam', 'linkAuth'],
    effect: { meters: ['linkAvailability'], repairCostPerSeverity: 2 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'EX-0016.01',
        name: 'Jamming: Uplink Jamming',
        url: 'https://sparta.aerospace.org/technique/EX-0016.01/',
        status: 'verified',
      },
    ],
    blurb:
      'The constellation stops hearing you. Satellites ride out the silence in safe mode while tasking backlogs pile up. Availability is a security property.',
  },
  {
    id: 'lidar-injection',
    name: 'LiDAR point-cloud injection (phantom objects)',
    layers: ['AIR'],
    vector: 'optical',
    baseSeverity: 2,
    counters: ['sensorFusion', 'tierAAttestation'],
    chainsWith: ['pnt-jamming'],
    effect: { meters: ['sensorIntegrity'], special: 'chainExploit', repairCostPerSeverity: 3 },
    techniqueRefs: [
      {
        framework: 'ATLAS',
        id: 'AML.T0043',
        name: 'Craft Adversarial Data',
        url: 'https://atlas.mitre.org/techniques/AML.T0043',
        status: 'verify-at-build',
        citation: 'Pajic et al. (Duke); Cao et al. (ACM CCS 2019); Sun et al. (USENIX Security 2020)',
      },
    ],
    blurb:
      'Carefully timed laser pulses paint obstacles that do not exist into the point cloud. A drone that trusts a single sensor swerves around ghosts. Demonstrated in the lab against production LiDAR stacks.',
  },
  {
    id: 'supply-chain-implant',
    name: 'Sensor supply-chain firmware implant (Tier B)',
    layers: ['AIR', 'ORBIT'],
    vector: 'supplyChain',
    baseSeverity: 3,
    counters: ['tierAAttestation'],
    effect: { meters: ['sensorIntegrity', 'dataIntegrity'], special: 'implantTierB', repairCostPerSeverity: 4 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'PER-0002.02',
        name: 'Backdoor: Software',
        url: 'https://sparta.aerospace.org/technique/PER-0002.02/',
        status: 'verify-at-build',
        citation: 'Atlantic Council, Small Satellites: The Implications for National Security (2022)',
      },
      {
        framework: 'ATTACK',
        id: 'T1195',
        name: 'Supply Chain Compromise',
        url: 'https://attack.mitre.org/techniques/T1195/',
        status: 'verify-at-build',
      },
    ],
    blurb:
      'Firmware altered at manufacture or in transit, dormant until activation. The commodity sensor package saved thirty percent up front; the invoice arrives later. Only Tier B hardware is eligible.',
  },
  {
    id: 'ground-ransomware',
    name: 'Ground segment ransomware',
    layers: ['GROUND'],
    vector: 'cyber',
    baseSeverity: 3,
    counters: ['groundZeroTrust'],
    effect: { meters: ['dataIntegrity'], repairCostPerSeverity: 5 },
    techniqueRefs: [
      {
        framework: 'ATTACK',
        id: 'T1486',
        name: 'Data Encrypted for Impact',
        url: 'https://attack.mitre.org/techniques/T1486/',
        status: 'verify-at-build',
      },
    ],
    blurb:
      'Mission data encrypted, operations held hostage. The space segment is fine; the ground segment is the soft target that runs it. ICS-style segmentation buys the time that backups need.',
  },
  {
    id: 'ops-phishing',
    name: 'Mission ops credential phishing',
    layers: ['GROUND'],
    vector: 'human',
    baseSeverity: 1,
    counters: ['groundZeroTrust'],
    effect: { meters: ['dataIntegrity'], repairCostPerSeverity: 2 },
    techniqueRefs: [
      {
        framework: 'ATTACK',
        id: 'T1566',
        name: 'Phishing',
        url: 'https://attack.mitre.org/techniques/T1566/',
        status: 'verify-at-build',
      },
    ],
    blurb:
      'An operator clicks a convincing link and hands over credentials. Lateral movement follows. The oldest vector in the deck, and still the cheapest one COLDWAKE runs.',
  },
  {
    id: 'debris-conjunction',
    name: 'Debris conjunction (non-adversarial)',
    layers: ['ORBIT'],
    vector: 'environmental',
    baseSeverity: 2,
    counters: ['ssaManeuver'],
    effect: { meters: [], special: 'debrisStrike', repairCostPerSeverity: 3 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'DE-0009.01',
        name: 'Debris Field',
        url: 'https://sparta.aerospace.org/technique/DE-0009.01/',
        status: 'verified',
      },
    ],
    blurb:
      'Uncontrolled debris on a crossing orbit. Nobody attacked you; orbital mechanics does not care. SSA subscriptions and maneuver fuel compete with security spend, and both are mission assurance.',
  },
  {
    id: 'blackout-chain',
    name: 'BLACKOUT CHAIN (jam GNSS, then exploit the fallback)',
    layers: ['AIR'],
    vector: 'optical',
    baseSeverity: 3,
    counters: ['sensorFusion'],
    chainsWith: ['pnt-jamming'],
    effect: { meters: ['sensorIntegrity', 'dataIntegrity'], special: 'chainExploit', repairCostPerSeverity: 4 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'EX-0016.03',
        name: 'Jamming: Position, Navigation, and Timing (PNT)',
        url: 'https://sparta.aerospace.org/technique/EX-0016.03/',
        status: 'verified',
      },
      {
        framework: 'ATLAS',
        id: 'AML.T0043',
        name: 'Craft Adversarial Data',
        url: 'https://atlas.mitre.org/techniques/AML.T0043',
        status: 'verify-at-build',
      },
    ],
    blurb:
      'The signature move: deny GNSS so the squadron leans on LiDAR odometry, then inject into the only sensor it has left. Single-sensor dependence is a vulnerability an adversary can manufacture on demand. Layered sensing breaks the chain.',
  },
]
