// Threat deck, full R3 set: all 18 rows of spec Section 7 (the 6a/6b and
// 11a/11b splits included). Every framework ref and learn-more source in
// this file was verified against the live site in the R3 verification
// round (2026-07-12): each URL fetched, ID and name confirmed against the
// page, and independently re-checked. Names follow the live pages
// verbatim. atlas.mitre.org note: its server returns HTTP 404 status for
// deep links to non-browser fetchers while serving the real page to
// browsers; those URLs are canonical and content-verified, and the
// battery link check carries a documented exception for that host.
// Real-world cases behind events 8 and 14 stay abstracted: institutional
// analysis is cited, no named individuals or companies.

import type { ThreatEvent } from '../engine/types'
import { ADVERSARY } from '../config'

export const THREATS: ThreatEvent[] = [
  // 1
  {
    id: 'pnt-jamming',
    name: 'PNT jamming (GNSS denial over the AO)',
    layers: ['AIR'],
    vector: 'rf',
    baseSeverity: 2,
    counters: ['antiJam'],
    chainsWith: ['blackout-chain'],
    effect: { meters: ['linkAvailability'], special: 'jamsGnss', repairCostPerSeverity: 2 },
    condition: { name: 'GNSS DENIED', turns: 2 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'EX-0016.03',
        name: 'Jamming: Position, Navigation, and Timing (PNT) Jamming',
        url: 'https://sparta.aerospace.org/technique/EX-0016/03/',
        status: 'verified',
      },
    ],
    blurb:
      'Broadband noise where GNSS signals should be. Drones lose position fixes and fall back to whatever sensor is left, which is exactly what the adversary wants. Denial is rarely the end goal; it is the setup.',
    learnMoreCards: [
      {
        title: 'Why GNSS denial matters',
        body:
          'Nearly every critical infrastructure sector depends on GNSS for position, navigation, or timing, and US government guidance warns that faking the signal has become relatively simple. The same guidance treats PNT disruption as a systemic risk and pushes operators toward detection, backup sources, and graceful degradation rather than blind trust in one signal.',
        sources: [
          {
            title: 'CISA: Positioning, Navigation, and Timing (PNT) risk management',
            url: 'https://www.cisa.gov/topics/risk-management/positioning-navigation-and-timing',
            type: 'advisory',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 2
  {
    id: 'uplink-jamming',
    name: 'Uplink jamming (command link denial)',
    layers: ['ORBIT'],
    vector: 'rf',
    baseSeverity: 2,
    counters: ['antiJam'],
    effect: { meters: ['linkAvailability'], repairCostPerSeverity: 2 },
    condition: { name: 'JAMMED', turns: 2 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'EX-0016.01',
        name: 'Jamming: Uplink Jamming',
        url: 'https://sparta.aerospace.org/technique/EX-0016/01/',
        status: 'verified',
      },
    ],
    blurb:
      'The constellation stops hearing you. Satellites keep flying their stored plans while new tasking backs up. Availability is a security property.',
    learnMoreCards: [
      {
        title: 'Satellite links under attack',
        body:
          'After real-world attacks on commercial satellite communications in 2022, US agencies issued joint guidance urging satcom providers and customers to harden links, monitor their networks, and plan for degraded operation. Attacks on satellite links are not hypothetical; they are documented, and the mitigations are published.',
        sources: [
          {
            title: 'CISA AA22-076A: Strengthening Cybersecurity of SATCOM Network Providers and Customers',
            url: 'https://www.cisa.gov/news-events/cybersecurity-advisories/aa22-076a',
            type: 'advisory',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 3
  {
    id: 'gnss-spoofing',
    name: 'GNSS spoofing (false position and velocity)',
    layers: ['AIR'],
    vector: 'rf',
    baseSeverity: 2,
    counters: ['pntAuth'],
    effect: { meters: ['sensorIntegrity'], repairCostPerSeverity: 3 },
    condition: { name: 'SPOOFED', turns: 2 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'EX-0014.04',
        name: 'Spoofing: Position, Navigation, and Timing (PNT) Spoofing',
        url: 'https://sparta.aerospace.org/technique/EX-0014/04/',
        status: 'verified',
      },
    ],
    blurb:
      'GNSS (GPS and its peers): counterfeit signals that look like truth. Jamming announces itself; spoofing lies quietly, and a drone that believes a false position flies a confident wrong course. Authentication makes many of those lies detectable.',
    learnMoreCards: [
      {
        title: 'Authenticated navigation exists today',
        body:
          'Broadcasting plausible fake GNSS signals has become inexpensive, and receivers historically had no way to tell authentic signals from forgeries. Galileo OSNMA, operational since 2025, adds cryptographic authentication to open navigation messages so receivers can verify the source, and US guidance recommends spoof detection and multi-source PNT for critical users.',
        sources: [
          {
            title: 'EUSPA: Galileo Open Service Navigation Message Authentication (OSNMA)',
            url: 'https://www.euspa.europa.eu/galileo-osnma',
            type: 'advisory',
            status: 'verified',
          },
          {
            title: 'CISA: Positioning, Navigation, and Timing (PNT) risk management',
            url: 'https://www.cisa.gov/topics/risk-management/positioning-navigation-and-timing',
            type: 'advisory',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 4
  {
    id: 'time-spoof',
    name: 'Time spoof (breaks anti-replay and scheduling)',
    layers: ['ORBIT', 'GROUND'],
    vector: 'rf',
    baseSeverity: 2,
    counters: ['pntAuth'],
    effect: { meters: ['dataIntegrity', 'linkAvailability'], repairCostPerSeverity: 2 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'EX-0014.01',
        name: 'Spoofing: Time Spoof',
        url: 'https://sparta.aerospace.org/technique/EX-0014/01/',
        status: 'verified',
      },
    ],
    blurb:
      'Feed a system the wrong clock and watch its assumptions unravel: stored commands fire at wrong epochs, anti-replay windows drift open, schedules desynchronize. Time is infrastructure, and it can be attacked like infrastructure.',
    learnMoreCards: [
      {
        title: 'Time is a trust anchor',
        body:
          'Sequencing, anti-replay protection, navigation filtering, and data labeling all assume the clock is honest. An attacker who biases the time a system consumes can reorder command execution and break validation without touching the commands themselves. Authenticated time sources and fault-tolerant time keeping are the published countermeasures.',
        sources: [
          {
            title: 'EUSPA: Galileo Open Service Navigation Message Authentication (OSNMA)',
            url: 'https://www.euspa.europa.eu/galileo-osnma',
            type: 'advisory',
            status: 'verified',
          },
          {
            title: 'CISA: Positioning, Navigation, and Timing (PNT) risk management',
            url: 'https://www.cisa.gov/topics/risk-management/positioning-navigation-and-timing',
            type: 'advisory',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 5
  {
    id: 'lidar-dazzle',
    name: 'Docking LiDAR dazzle on the RPO sat',
    layers: ['ORBIT'],
    vector: 'optical',
    baseSeverity: 2,
    // It strikes the RPO sat when one is held (G-028).
    prefersKinds: ['rpoSat'],
    counters: ['sensorFusion'],
    effect: { meters: ['sensorIntegrity'], repairCostPerSeverity: 3 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'EX-0014.03',
        name: 'Spoofing: Sensor Data',
        url: 'https://sparta.aerospace.org/technique/EX-0014/03/',
        status: 'verified',
        citation: 'Atlantic Council, Small Satellites: The Implications for National Security (2022)',
      },
    ],
    blurb:
      'Directed light saturates the docking sensor during rendezvous and proximity operations (RPO), and the docking aborts. Dazzle does not destroy the sensor; it destroys the moment the sensor was needed. SPARTA lists dazzling among the ways an attacker spoofs sensor data.',
    learnMoreCards: [
      {
        title: 'Directed energy against space sensors',
        body:
          'Institutional analysis of the small satellite era expects adversaries to turn to cyber attacks and directed energy as constellations grow. Sensors sized for faint returns are exactly the sensors easiest to saturate, and proximity operations concentrate the risk into short critical windows.',
        sources: [
          {
            title: 'Atlantic Council: Small Satellites, The Implications for National Security (2022)',
            url: 'https://www.atlanticcouncil.org/in-depth-research-reports/report/small-satellites-the-implications-for-national-security/',
            type: 'report',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 6a
  {
    id: 'lidar-injection',
    name: 'LiDAR point-cloud injection (phantom objects)',
    layers: ['AIR'],
    vector: 'optical',
    baseSeverity: 2,
    counters: ['sensorFusion'],
    chainsWith: ['pnt-jamming'],
    effect: { meters: ['sensorIntegrity'], special: 'chainExploit', repairCostPerSeverity: 3 },
    techniqueRefs: [
      {
        framework: 'ATLAS',
        id: 'AML.T0043',
        name: 'Craft Adversarial Data',
        url: 'https://atlas.mitre.org/techniques/AML.T0043',
        status: 'verified',
        citation: 'Cao et al. (ACM CCS 2019); Sun et al. (USENIX Security 2020)',
      },
    ],
    blurb:
      'Carefully timed laser pulses paint obstacles that do not exist into the point cloud. A drone that trusts a single sensor swerves around ghosts. Demonstrated in the lab against production LiDAR stacks.',
    learnMoreCards: [
      {
        title: 'Phantom objects, real research',
        body:
          'Peer-reviewed work has demonstrated spoofing attacks that inject fake obstacles into LiDAR point clouds and steer the perception models behind them. By its authors\' account, the first security study of LiDAR-based perception in self-driving appeared at ACM CCS in 2019, and follow-up work at USENIX Security 2020 generalized the attack in black-box settings and proposed countermeasures. This is a laboratory-demonstrated class of attack, not speculation.',
        sources: [
          {
            title: 'Cao et al., Adversarial Sensor Attack on LiDAR-based Perception in Autonomous Driving (CCS 2019)',
            url: 'https://arxiv.org/abs/1907.06826',
            type: 'paper',
            status: 'verified',
          },
          {
            title: 'Sun et al., Towards Robust LiDAR-based Perception in Autonomous Driving (USENIX Security 2020)',
            url: 'https://arxiv.org/abs/2006.16974',
            type: 'paper',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 6b
  {
    id: 'lidar-blinding',
    name: 'LiDAR perception blinding (object removal)',
    layers: ['AIR'],
    vector: 'optical',
    baseSeverity: 2,
    counters: ['sensorFusion'],
    chainsWith: ['pnt-jamming'],
    effect: { meters: ['sensorIntegrity'], special: 'chainExploit', repairCostPerSeverity: 3 },
    techniqueRefs: [
      {
        framework: 'ATLAS',
        id: 'AML.T0043',
        name: 'Craft Adversarial Data',
        url: 'https://atlas.mitre.org/techniques/AML.T0043',
        status: 'verified',
        citation: 'Sun et al. (USENIX Security 2020); Hallyburton et al. (USENIX Security 2022)',
      },
    ],
    blurb:
      'The inverse of injection: adversarial input that makes real obstacles vanish from perception. A drone that cannot see the terrain feature ahead of it does not know to be afraid. Removal attacks are documented in the same research lineage as phantom injection.',
    learnMoreCards: [
      {
        title: 'Making real objects disappear',
        body:
          'Adversarial attacks on LiDAR perception work in both directions: injecting objects that are not there and hiding objects that are. Published research shows laser spoofing can remove genuine obstacles from the point cloud, and that a spoof kept consistent with the camera fools camera-LiDAR fusion too. Fusion with independent modalities raises the cost of the attack substantially.',
        sources: [
          {
            title: 'Sun et al., Towards Robust LiDAR-based Perception in Autonomous Driving (USENIX Security 2020)',
            url: 'https://arxiv.org/abs/2006.16974',
            type: 'paper',
            status: 'verified',
          },
          {
            title: 'Hallyburton et al., Security Analysis of Camera-LiDAR Fusion Against Black-Box Attacks (USENIX Security 2022)',
            url: 'https://arxiv.org/abs/2106.07098',
            type: 'paper',
            status: 'verified',
          },
          {
            title: "Cao et al., You Can't See Me: Physical Removal Attacks on LiDAR-based Autonomous Vehicles Driving Frameworks (USENIX Security 2023)",
            url: 'https://arxiv.org/abs/2210.09482',
            type: 'paper',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 7
  {
    id: 'training-data-poisoning',
    name: 'Perception model training-data poisoning',
    layers: ['AIR', 'GROUND'],
    vector: 'cyber',
    baseSeverity: 2,
    counters: ['mlPipelineIntegrity'],
    effect: { meters: ['sensorIntegrity'], assetDamage: false, repairCostPerSeverity: 3 },
    techniqueRefs: [
      // ATLAS first (R6 question 1): the move is a backdoored perception
      // model, which AML.T0020 describes; DE-0003.12 poisons a security
      // monitor's model so an intrusion evades it. AML.T0020's name as ATLAS
      // has given it since its 2026.07 release.
      {
        framework: 'ATLAS',
        id: 'AML.T0020',
        name: 'Training Data Poisoning',
        url: 'https://atlas.mitre.org/techniques/AML.T0020',
        status: 'verified',
      },
      {
        framework: 'SPARTA',
        id: 'DE-0003.12',
        name: 'On-Board Values Obfuscation: Poison AI/ML Training for Evasion',
        url: 'https://sparta.aerospace.org/technique/DE-0003/12/',
        status: 'verified',
      },
    ],
    blurb:
      'The ground segment retrains perception models on data an adversary got to first. The model learns a hidden trigger along with the terrain, and the backdoor waits. Poisoning is an attack on the pipeline, not the drone.',
    learnMoreCards: [
      {
        title: 'Backdoors learned at training time',
        body:
          'Research demonstrated years ago that a model trained on manipulated data can perform normally while carrying a hidden trigger that flips its behavior on attacker-chosen inputs. Both space-focused and adversarial ML frameworks now track training-data poisoning as a distinct technique with its own defenses: dataset provenance, integrity checks, and gated retraining.',
        sources: [
          {
            title: 'Gu et al., BadNets: Identifying Vulnerabilities in the Machine Learning Model Supply Chain (2017)',
            url: 'https://arxiv.org/abs/1708.06733',
            type: 'paper',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 8
  {
    id: 'supply-chain-implant',
    name: 'Sensor supply-chain firmware implant',
    layers: ['AIR', 'ORBIT'],
    vector: 'supplyChain',
    baseSeverity: 3,
    counters: ['tierAAttestation'],
    effect: { meters: ['sensorIntegrity', 'dataIntegrity'], repairCostPerSeverity: 4 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'PER-0002.02',
        name: 'Backdoor: Software Backdoor',
        url: 'https://sparta.aerospace.org/technique/PER-0002/02/',
        status: 'verified',
        citation: 'Atlantic Council, Small Satellites: The Implications for National Security (2022)',
      },
      {
        framework: 'ATTACK',
        id: 'T1195',
        name: 'Supply Chain Compromise',
        url: 'https://attack.mitre.org/techniques/T1195/',
        status: 'verified',
      },
    ],
    blurb:
      'Firmware altered at manufacture or in transit, dormant until activation. The commodity sensor package saved 30 percent up front; the damage arrives later. Hardware without firmware attestation is the easy target.',
    learnMoreCards: [
      {
        title: 'The supply chain is the attack surface',
        body:
          'Institutional analysis of the small satellite industry warns that a global supply chain exposes satellites to cyber intrusion and physical sabotage, and that prime manufacturers often cannot see their third- and fourth-tier suppliers. The scenario in this game is fictional, which is why assured sourcing and firmware attestation are worth real budget.',
        sources: [
          {
            title: 'Atlantic Council: Small Satellites, The Implications for National Security (2022)',
            url: 'https://www.atlanticcouncil.org/in-depth-research-reports/report/small-satellites-the-implications-for-national-security/',
            type: 'report',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 9
  {
    id: 'rogue-ground-station',
    name: 'Rogue ground station and command-link intrusion',
    layers: ['GROUND', 'ORBIT'],
    vector: 'cyber',
    baseSeverity: 3,
    counters: ['linkAuth', 'groundZeroTrust'],
    effect: { meters: ['linkAvailability', 'dataIntegrity'], repairCostPerSeverity: 3 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'IA-0008.01',
        name: 'Rogue External Entity: Rogue Ground Station',
        url: 'https://sparta.aerospace.org/technique/IA-0008/01/',
        status: 'verified',
      },
    ],
    blurb:
      'An attacker does not need your ground station if they can build their own. A transmitter, a dish, and an unauthenticated command protocol are a full kill chain. Cryptographic command authentication is the difference between a rogue signal and a rogue operator. When they cannot build a station, they borrow a login to yours.',
    learnMoreCards: [
      {
        title: 'Anyone can point a dish at your satellite',
        body:
          'Space attack frameworks track rogue ground stations as an initial access technique: a spacecraft that accepts unauthenticated commands will accept them from anyone with the right radio. Joint government guidance after the 2022 satellite communications attacks pushed operators toward strong authentication, link encryption and monitored networks, the same habits that close this door.',
        sources: [
          {
            title: 'CISA AA22-076A: Strengthening Cybersecurity of SATCOM Network Providers and Customers',
            url: 'https://www.cisa.gov/news-events/cybersecurity-advisories/aa22-076a',
            type: 'advisory',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 10
  {
    id: 'telemetry-replay',
    name: 'Telemetry replay',
    layers: ['ORBIT'],
    vector: 'rf',
    baseSeverity: 1,
    counters: ['linkAuth'],
    effect: { meters: ['dataIntegrity'], assetDamage: false, repairCostPerSeverity: 1 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'EX-0001',
        name: 'Replay',
        url: 'https://sparta.aerospace.org/technique/EX-0001/',
        status: 'verified',
      },
    ],
    blurb:
      'Yesterday\'s telemetry, retransmitted today. Ground ops watches a healthy spacecraft that no longer exists while the real one drifts into trouble. Replay preserves valid syntax, which is why freshness has to be cryptographic, not assumed.',
    learnMoreCards: [
      {
        title: 'Old data, replayed as new',
        body:
          'Replay attacks retransmit previously captured traffic so a system processes it a second time as if it were fresh. Because replayed frames are authentic recordings, they pass syntax checks and blend into normal operations. Sequence counters, timestamps, and authenticated sessions exist precisely to make stale traffic detectable.',
        sources: [
          {
            title: 'NSA Cybersecurity Advisory: Protecting VSAT Communications (2022)',
            url: 'https://www.nsa.gov/Press-Room/Press-Releases-Statements/Press-Release-View/Article/2910409/nsa-issues-recommendations-to-protect-vsat-communications/',
            type: 'advisory',
            status: 'verified',
          },
          {
            title: 'CCSDS 350.0-G-3: The Application of Security to CCSDS Protocols (2019)',
            url: 'https://ccsds.org/Pubs/350x0g3.pdf',
            type: 'report',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 11a
  {
    id: 'downlink-eavesdropping',
    name: 'Downlink eavesdropping (passive collection)',
    layers: ['ORBIT', 'GROUND'],
    vector: 'rf',
    baseSeverity: 1,
    counters: ['encryptedBackhaul'],
    effect: { meters: ['dataIntegrity'], assetDamage: false, repairCostPerSeverity: 1 },
    condition: { name: 'TAPPED', turns: 2 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'EXF-0003.02',
        name: 'Signal Interception: Downlink Exfiltration',
        url: 'https://sparta.aerospace.org/technique/EXF-0003/02/',
        status: 'verified',
        citation: 'UCSD and UMD, Don\'t Look Up (ACM CCS 2025)',
      },
      {
        framework: 'NSA',
        id: 'U/OO/106122-22',
        name: 'Protecting VSAT Communications',
        url: 'https://www.nsa.gov/Press-Room/Press-Releases-Statements/Press-Release-View/Article/2910409/nsa-issues-recommendations-to-protect-vsat-communications/',
        status: 'verified',
        citation: 'NSA Cybersecurity Advisory, May 2022',
      },
    ],
    blurb:
      'Nobody transmits, nobody intrudes; a receiver on a roof just listens. Anything sent in the clear on a wide downlink beam belongs to everyone under the beam. Passive collection leaves no logs to find.',
    learnMoreCards: [
      {
        title: 'A few hundred dollars and links in the clear',
        body:
          'An academic study presented at ACM CCS 2025 used a few hundred dollars of consumer receiver hardware to survey geostationary satellite links and found that a large share of the signals surveyed carried unencrypted traffic, including telecom backhaul and critical infrastructure data. Passive interception at continental range is a documented reality, and link encryption is the countermeasure.',
        sources: [
          {
            title: 'UCSD and UMD, Don\'t Look Up: There Are Sensitive Internal Links in the Clear on GEO Satellites (CCS 2025)',
            url: 'https://satcom.sysnet.ucsd.edu/',
            type: 'paper',
            status: 'verified',
          },
          {
            title: 'NSA Cybersecurity Advisory: Protecting VSAT Communications (2022)',
            url: 'https://www.nsa.gov/Press-Room/Press-Releases-Statements/Press-Release-View/Article/2910409/nsa-issues-recommendations-to-protect-vsat-communications/',
            type: 'advisory',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 11b
  {
    id: 'backhaul-exfil',
    name: 'Data exfiltration via satellite backhaul',
    layers: ['ORBIT', 'GROUND'],
    vector: 'rf',
    baseSeverity: 2,
    counters: ['encryptedBackhaul'],
    effect: { meters: ['dataIntegrity'], assetDamage: false, repairCostPerSeverity: 2 },
    condition: { name: 'LEAKING', turns: 2 },
    techniqueRefs: [
      {
        framework: 'SPARTA',
        id: 'EXF-0003',
        name: 'Signal Interception',
        url: 'https://sparta.aerospace.org/technique/EXF-0003/',
        status: 'verified',
        citation: 'UCSD and UMD, Don\'t Look Up (ACM CCS 2025); NSA VSAT advisory (2022)',
      },
      {
        framework: 'NSA',
        id: 'U/OO/106122-22',
        name: 'Protecting VSAT Communications',
        url: 'https://www.nsa.gov/Press-Room/Press-Releases-Statements/Press-Release-View/Article/2910409/nsa-issues-recommendations-to-protect-vsat-communications/',
        status: 'verified',
        citation: 'NSA Cybersecurity Advisory, May 2022',
      },
    ],
    blurb:
      'Sensitive traffic rides a satellite backhaul link that nobody remembered to encrypt, and the mission\'s data leaves through the sky it came from. The study that documented this at scale read real backhaul traffic with commodity hardware.',
    learnMoreCards: [
      {
        title: 'Backhaul in the clear',
        body:
          'The same CCS 2025 study documented real unencrypted backhaul traffic recoverable from geostationary links with commodity equipment, and several operators told the researchers they had deployed a fix. Government advisories had urged satellite link encryption for years before the measurement study showed how much traffic was still exposed. Encrypting the backhaul is cheap next to what it protects.',
        sources: [
          {
            title: 'UCSD and UMD, Don\'t Look Up: There Are Sensitive Internal Links in the Clear on GEO Satellites (CCS 2025)',
            url: 'https://satcom.sysnet.ucsd.edu/',
            type: 'paper',
            status: 'verified',
          },
          {
            title: 'NSA Cybersecurity Advisory: Protecting VSAT Communications (2022)',
            url: 'https://www.nsa.gov/Press-Room/Press-Releases-Statements/Press-Release-View/Article/2910409/nsa-issues-recommendations-to-protect-vsat-communications/',
            type: 'advisory',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 12
  {
    id: 'ground-ransomware',
    name: 'Ground segment ransomware',
    layers: ['GROUND'],
    vector: 'cyber',
    baseSeverity: 3,
    counters: ['groundZeroTrust'],
    effect: { meters: ['dataIntegrity'], repairCostPerSeverity: 5 },
    condition: { name: 'RANSOMED', turns: 2 },
    techniqueRefs: [
      {
        framework: 'ATTACK',
        id: 'T1486',
        name: 'Data Encrypted for Impact',
        url: 'https://attack.mitre.org/techniques/T1486/',
        status: 'verified',
      },
    ],
    blurb:
      'Mission data encrypted, operations held hostage. The space segment is fine; the ground segment is the soft target that runs it. ICS-style segmentation gives backups the time they need.',
    learnMoreCards: [
      {
        title: 'Ransomware reaches for operations',
        body:
          'Ransomware against operational organizations follows a documented playbook: initial access through commodity vectors, lateral movement to the systems that hurt most, then encryption for impact. US government guidance consolidates prevention and response practices, and the consistent themes are segmentation, offline backups, and rehearsed recovery.',
        sources: [
          {
            title: 'CISA: Stop Ransomware, official US government guidance',
            url: 'https://www.cisa.gov/stopransomware',
            type: 'advisory',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 13
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
        status: 'verified',
      },
    ],
    blurb:
      `An operator clicks a convincing link and hands over credentials. Lateral movement follows. The oldest vector in the deck, and still the cheapest one ${ADVERSARY} runs.`,
    learnMoreCards: [
      {
        title: 'Phishing stays undefeated',
        body:
          'Phishing persists because it attacks the person, not the perimeter, and one harvested credential can open the door to everything that credential reaches. Joint government guidance walks through the attack cycle and the layered defenses that blunt it: phishing-resistant MFA, least privilege, and reporting culture.',
        sources: [
          {
            title: 'CISA: Phishing guidance, stopping the attack cycle at phase one',
            url: 'https://www.cisa.gov/resources-tools/resources/phishing-guidance-stopping-attack-cycle-phase-one',
            type: 'advisory',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 14
  {
    id: 'insider-exfil',
    name: 'Insider data mishandling and exfiltration',
    layers: ['GROUND'],
    vector: 'human',
    baseSeverity: 2,
    counters: ['insiderProgram'],
    effect: { meters: ['dataIntegrity'], assetDamage: false, repairCostPerSeverity: 2 },
    techniqueRefs: [
      {
        framework: 'ATTACK',
        id: 'T1537',
        name: 'Transfer Data to Cloud Account',
        url: 'https://attack.mitre.org/techniques/T1537/',
        status: 'verified',
        citation: 'CISA Insider Threat Mitigation Guide',
      },
    ],
    blurb:
      'A trusted account syncs the architecture documents to a cloud drive it controls. No exploit, no malware, just access that nobody was watching. The fiction here is invented; the pattern is the one CISA\'s insider threat guidance is written for.',
    learnMoreCards: [
      {
        title: 'The threat that already has a badge',
        body:
          'Insider incidents are distinct because the actor starts inside the trust boundary, so perimeter controls never fire. Public CISA guidance lays out the program-level answer: define the threat, detect and assess it, and manage it with privileged access management, access control, and monitored, audited systems.',
        sources: [
          {
            title: 'CISA: Insider Threat Mitigation Guide',
            url: 'https://www.cisa.gov/resources-tools/resources/insider-threat-mitigation-guide',
            type: 'advisory',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 15
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
        name: 'Camouflage, Concealment, and Decoys (CCD): Debris Field',
        url: 'https://sparta.aerospace.org/technique/DE-0009/01/',
        status: 'verified',
      },
    ],
    blurb:
      'Uncontrolled debris on a crossing orbit. Nobody attacked you; orbital mechanics does not care. SSA services and maneuver fuel compete with security for budget, and both are mission assurance.',
    learnMoreCards: [
      {
        title: 'Kessler syndrome, the real one',
        body:
          'The cascade scenario proposed by NASA scientist Donald Kessler in 1978 describes debris collisions breeding more debris until whole orbital regimes degrade. NASA\'s Orbital Debris Program Office leads measurement, modeling, and mitigation of the environment. Conjunction assessment and the fuel for avoidance burns are the operational face of that risk, and they draw on the same budget as security. Real operators maneuver at a collision chance of about 1 in 10,000; the game raises the odds so the call matters. SPARTA\'s techniques list debris only as cover an adversary can hide in (DE-0009.01); its threat list carries the collision itself as SV-MA-1, Space Debris, and that is this conjunction.',
        sources: [
          {
            title: 'NASA Orbital Debris Program Office',
            url: 'https://orbitaldebris.jsc.nasa.gov/',
            type: 'advisory',
            status: 'verified',
          },
        ],
      },
    ],
  },
  // 16
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
        name: 'Jamming: Position, Navigation, and Timing (PNT) Jamming',
        url: 'https://sparta.aerospace.org/technique/EX-0016/03/',
        status: 'verified',
      },
      {
        framework: 'ATLAS',
        id: 'AML.T0043',
        name: 'Craft Adversarial Data',
        url: 'https://atlas.mitre.org/techniques/AML.T0043',
        status: 'verified',
      },
    ],
    blurb:
      'The signature move: deny GNSS so the squadron leans on LiDAR odometry, then inject into the only sensor it has left. Single-sensor dependence is a vulnerability an adversary can manufacture on demand. Layered sensing blunts it.',
    learnMoreCards: [
      {
        title: 'Layered attacks need layered defense',
        body:
          'Each stage of the chain is individually documented: GNSS denial is a tracked space attack technique, and adversarial LiDAR injection is peer-reviewed research. The composition is the lesson. An adversary who can force a fallback chooses which sensor you depend on, so resilience means holding a second independent modality in reserve.',
        sources: [
          {
            title: 'CISA: Positioning, Navigation, and Timing (PNT) risk management',
            url: 'https://www.cisa.gov/topics/risk-management/positioning-navigation-and-timing',
            type: 'advisory',
            status: 'verified',
          },
          {
            title: 'Sun et al., Towards Robust LiDAR-based Perception in Autonomous Driving (USENIX Security 2020)',
            url: 'https://arxiv.org/abs/2006.16974',
            type: 'paper',
            status: 'verified',
          },
        ],
      },
    ],
  },
]
