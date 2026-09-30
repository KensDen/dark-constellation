// THE FIELD LIBRARY, AS DRAFTED (v1.2 R5b, brief 4.8 and 7.3). The
// reading list from files/20260927_DarkConstellation_FieldLibrary_Draft_v0.3.md,
// approved by Ken as drafted on 29 September 2026: 36 entries on 11
// shelves, in the draft's order. Nothing from its "Left out" section is here.
//
// Data only, and not validated here: ./fieldLibrary.ts validates it
// against the scenario (by ./librarySchema.ts) and is what the game
// reads. Kept apart so a test can hand this list, or a broken copy of
// it, to the validator.
//
// Each field is the draft's own words. The why line is verbatim. The
// draft's byline is split into source, year and type; where a year sits
// inside a venue ("IEEE S&P 2020") it is split out, and a byline with no
// year has none. One byline is trimmed of a note to the draft's reader:
// "r0r0x (Romel Marín, per his DEF CON 34 listing below)" reads
// "r0r0x (Romel Marín)" here. A link's bracketed note (an open copy, a
// DOI) is urlNote. `checked` is the date the entry's Checked note names,
// the first where it names two, otherwise 26 September 2026, the day the
// list was checked.
//
// PAIRINGS. on(id) names an event as the draft writes it; a bracketed
// layer note such as (AIR) is display text, carried as the note and never
// part of the id. GENERAL entries are FILED once the player has finished
// any campaign. EVERY_SPARTA stands for "every event with a SPARTA tag",
// which is derived from the events' own technique references, never
// listed here.

import type { Pairing, Shelf } from './librarySchema'

const GENERAL: Pairing = { kind: 'general' }
const EVERY_SPARTA: Pairing = { kind: 'sparta' }
const on = (event: string, note?: string): Pairing => (note ? { kind: 'event', event, note } : { kind: 'event', event })

export const SHELVES_AS_DRAFTED: Shelf[] = [
  {
    name: 'Start here',
    entries: [
      {
        title: 'SoK: Building a Launchpad for Impactful Satellite Cyber-Security Research',
        source: 'James Pavur and Ivan Martinovic',
        year: '2020',
        type: 'paper (preprint)',
        why: 'maps sixty years of satellite hacking incidents into one threat framework and shows where research should go next.',
        url: 'https://arxiv.org/abs/2010.10872',
        pairs: [GENERAL],
        checked: '2026-09-26',
      },
      {
        title: 'Introduction to Cybersecurity for Commercial Satellite Operations (NIST IR 8270)',
        source: 'NIST (Scholl, Suloway)',
        year: 'July 2023',
        type: 'standard',
        why: 'the plain-language on-ramp for applying risk management to a commercial satellite mission.',
        url: 'https://csrc.nist.gov/pubs/ir/8270/final',
        pairs: [GENERAL],
        checked: '2026-09-26',
      },
      {
        title: 'Recommendations to Space System Operators for Improving Cybersecurity',
        source: 'Space Systems Critical Infrastructure Working Group, via CISA',
        year: '2024 (page updated Sept 2026)',
        type: 'advisory',
        why: 'the common cyber risks to space systems, each with a mitigation tied to NIST guidance.',
        url: 'https://www.cisa.gov/resources-tools/resources/recommendations-space-system-operators-improving-cybersecurity',
        pairs: [GENERAL],
        checked: '2026-09-26',
      },
      {
        title: 'AeroSpace-Cybersecurity (primer)',
        source: 'r0r0x (Romel Marín), GitHub',
        year: 'ongoing',
        type: 'community primer',
        why: 'a readable walk through satellites, orbits and links before the attacks, then each attack surface in turn.',
        url: 'https://github.com/r0r0x-xx/AeroSpace-Cybersecurity',
        pairs: [GENERAL],
        checked: '2026-09-26',
      },
    ],
  },
  {
    name: 'Frameworks',
    entries: [
      {
        title: 'SPARTA (Space Attack Research and Tactic Analysis)',
        source: 'The Aerospace Corporation',
        year: 'ongoing',
        type: 'framework',
        why: 'the ATT&CK-style matrix for spacecraft, and the framework behind most of the game\'s technique tags.',
        url: 'https://sparta.aerospace.org/',
        pairs: [EVERY_SPARTA],
        checked: '2026-09-26',
      },
      {
        title: 'MITRE ATT&CK',
        source: 'MITRE',
        year: 'ongoing',
        type: 'framework',
        why: 'the shared vocabulary for how intrusions unfold on ordinary IT, which is where most space attacks start.',
        url: 'https://attack.mitre.org/',
        pairs: [on('ops-phishing'), on('ground-ransomware'), on('supply-chain-implant'), on('backhaul-exfil')],
        checked: '2026-09-26',
      },
      {
        title: 'MITRE ATLAS',
        source: 'MITRE',
        year: 'ongoing',
        type: 'framework',
        why: 'ATT&CK\'s counterpart for attacks on machine learning systems.',
        url: 'https://atlas.mitre.org/',
        pairs: [on('training-data-poisoning'), on('lidar-injection')],
        checked: '2026-09-26',
      },
    ],
  },
  {
    name: 'Links and signals',
    entries: [
      {
        title: 'Don\'t Look Up: There Are Sensitive Internal Links in the Clear on GEO Satellites',
        source: 'UC San Diego and University of Maryland, ACM CCS',
        year: '2025 (Distinguished Paper)',
        type: 'paper',
        why: 'about $800 of consumer gear was enough to read unencrypted traffic off geostationary satellites.',
        url: 'https://satcom.sysnet.ucsd.edu/',
        pairs: [on('downlink-eavesdropping'), on('backhaul-exfil')],
        checked: '2026-09-26',
      },
      {
        title: 'Satellites Are Leaking the World\'s Secrets: Calls, Texts, Military and Corporate Data',
        source: 'Andy Greenberg and Matt Burgess, WIRED',
        year: 'October 2025',
        type: 'news explainer',
        why: 'the plain-language version of the Don\'t Look Up study, with diagrams of how a rooftop dish overhears cell backhaul thousands of miles away.',
        url: 'https://www.wired.com/story/satellites-are-leaking-the-worlds-secrets-calls-texts-military-and-corporate-data/',
        pairs: [on('downlink-eavesdropping'), on('backhaul-exfil')],
        checked: '2026-09-27',
      },
      {
        title: 'A Tale of Sea and Sky: On the Security of Maritime VSAT Communications',
        source: 'Pavur, Moser, Strohmeier, Lenders, Martinovic, IEEE S&P',
        year: '2020',
        type: 'paper',
        why: 'ships at sea were broadcasting sensitive traffic over satellite links anyone in the footprint could record.',
        url: 'https://ora.ox.ac.uk/objects/uuid:92566006-9d2d-4696-b678-7125c802e36c',
        urlNote: 'open copy; DOI 10.1109/SP40000.2020.00056',
        pairs: [on('downlink-eavesdropping')],
        checked: '2026-09-26',
      },
      {
        title: 'Strengthening Cybersecurity of SATCOM Network Providers and Customers (AA22-076A)',
        source: 'CISA and FBI',
        year: '2022',
        type: 'advisory',
        why: 'joint guidance issued after the 2022 attacks on commercial satellite communications.',
        url: 'https://www.cisa.gov/news-events/cybersecurity-advisories/aa22-076a',
        pairs: [on('uplink-jamming'), on('blackout-chain')],
        checked: '2026-09-26',
      },
      {
        title: 'NSA Issues Recommendations to Protect VSAT Communications',
        source: 'NSA',
        year: 'May 2022',
        type: 'advisory',
        why: 'practical hardening for satellite terminals, including encryption before transmission and no default credentials.',
        url: 'https://www.nsa.gov/Press-Room/Press-Releases-Statements/Press-Release-View/Article/2910409/nsa-issues-recommendations-to-protect-vsat-communications/',
        pairs: [on('telemetry-replay'), on('downlink-eavesdropping')],
        checked: '2026-09-26',
      },
      {
        title: 'Interception and Eavesdropping of Satellite Communications',
        source: 'PWNSAT',
        year: 'January 2026',
        type: 'community article',
        why: 'a hands-on walkthrough of finding and demodulating a satellite\'s telemetry with a software-defined radio.',
        url: 'https://medium.com/@pwnsat/interception-and-eavesdropping-of-satellite-communications-b7be24d91ff8',
        pairs: [on('downlink-eavesdropping')],
        checked: '2026-09-26',
      },
    ],
  },
  {
    name: 'Navigation and timing',
    entries: [
      {
        title: 'Positioning, Navigation, and Timing',
        source: 'CISA',
        year: 'ongoing',
        type: 'advisory',
        why: 'why nearly every critical infrastructure sector leans on GNSS, and how to plan for losing it.',
        url: 'https://www.cisa.gov/topics/risk-management/positioning-navigation-and-timing',
        pairs: [on('pnt-jamming'), on('time-spoof')],
        checked: '2026-09-26',
      },
      {
        title: 'Galileo Open Service Navigation Message Authentication (OSNMA)',
        source: 'EUSPA',
        year: 'service operational July 2025',
        type: 'standard',
        why: 'receivers can now cryptographically check that Galileo navigation messages are genuine.',
        url: 'https://www.euspa.europa.eu/galileo-osnma',
        pairs: [on('gnss-spoofing')],
        checked: '2026-09-26',
      },
      {
        title: 'Unmanned Aircraft Capture and Control via GPS Spoofing',
        source: 'Kerns, Shepard, Bhatti, Humphreys, Journal of Field Robotics',
        year: '2014',
        type: 'paper (publisher copy paywalled)',
        why: 'the classic demonstration that spoofed GPS can take control of a drone in flight.',
        url: 'https://radionavlab.ae.utexas.edu/images/stories/files/papers/unmannedCapture.pdf',
        urlNote: 'authors\' copy; DOI 10.1002/rob.21513',
        pairs: [on('gnss-spoofing')],
        checked: '2026-09-26',
      },
    ],
  },
  {
    name: 'Onboard and ground segment',
    entries: [
      {
        title: 'Space Odyssey: An Experimental Software Security Analysis of Satellites',
        source: 'Willbold, Schloegel, Vögele, Gerhardt, Holz, Abbasi, IEEE S&P',
        year: '2023',
        type: 'paper',
        why: 'a rare hands-on look inside real satellite firmware, and it found serious, exploitable vulnerabilities.',
        url: 'https://publications.cispa.de/articles/conference_contribution/Space_Odyssey_An_Experimental_Software_Security_Analysis_of_Satellites/24614691',
        pairs: [on('rogue-ground-station'), on('supply-chain-implant')],
        checked: '2026-09-26',
      },
      {
        title: 'Satellite Ground Segment: Applying the Cybersecurity Framework to Satellite Command and Control (NIST IR 8401)',
        source: 'NIST (Lightman, Suloway, Brule)',
        year: 'December 2022',
        type: 'standard',
        why: 'a Cybersecurity Framework profile for the ground systems that command a satellite.',
        url: 'https://csrc.nist.gov/pubs/ir/8401/final',
        pairs: [on('rogue-ground-station'), on('ground-ransomware')],
        checked: '2026-09-26',
      },
      {
        title: 'The Application of Security to CCSDS Protocols (CCSDS 350.0-G-3)',
        source: 'CCSDS',
        year: 'March 2019',
        type: 'standard (informational report)',
        why: 'where encryption and authentication can live in the standard space data protocols, layer by layer.',
        url: 'https://ccsds.org/Pubs/350x0g3.pdf',
        pairs: [on('telemetry-replay'), on('rogue-ground-station')],
        checked: '2026-09-26',
      },
      {
        title: 'From MITRE ATT&CK to SPARTA: A Unified Attack Flow for Space Systems',
        source: 'PWNSAT',
        year: 'September 2025',
        type: 'community article',
        why: 'shows one intrusion traced from ordinary IT into the spacecraft, across both frameworks.',
        url: 'https://medium.com/@pwnsat/from-mitre-att-ck-to-sparta-a-unified-attack-flow-for-space-systems-00dd7ef26618',
        pairs: [GENERAL],
        checked: '2026-09-26',
      },
    ],
  },
  {
    name: 'Sensors and AI',
    entries: [
      {
        title: 'Adversarial Sensor Attack on LiDAR-based Perception in Autonomous Driving',
        source: 'Cao, Xiao, Cyr, Zhou, Park, Rampazzi, Chen, Fu, Mao, ACM CCS',
        year: '2019',
        type: 'paper',
        why: 'the first systematic study of spoofing fake obstacles into a LiDAR\'s view.',
        url: 'https://arxiv.org/abs/1907.06826',
        pairs: [on('lidar-injection')],
        checked: '2026-09-26',
      },
      {
        title: 'Towards Robust LiDAR-based Perception in Autonomous Driving',
        source: 'Sun, Cao, Chen, Mao, USENIX Security',
        year: '2020',
        type: 'paper',
        why: 'generalizes LiDAR spoofing to black-box settings and proposes defenses that cut it sharply.',
        url: 'https://arxiv.org/abs/2006.16974',
        pairs: [on('lidar-injection'), on('lidar-blinding')],
        checked: '2026-09-26',
      },
      {
        title: 'Security Analysis of Camera-LiDAR Fusion Against Black-Box Attacks on Autonomous Vehicles',
        source: 'Hallyburton, Liu, Cao, Mao, Pajic, USENIX Security',
        year: '2022',
        type: 'paper',
        why: 'fusing camera and LiDAR doesn\'t make the system safe; a smarter attack fools both at once.',
        url: 'https://arxiv.org/abs/2106.07098',
        pairs: [on('lidar-injection')],
        checked: '2026-09-26',
      },
      {
        title: 'BadNets: Identifying Vulnerabilities in the Machine Learning Model Supply Chain',
        source: 'Gu, Dolan-Gavitt, Garg',
        year: '2017',
        type: 'paper (preprint)',
        why: 'a model trained on tampered data can pass every test and still carry a hidden trigger.',
        url: 'https://arxiv.org/abs/1708.06733',
        pairs: [on('training-data-poisoning')],
        checked: '2026-09-26',
      },
    ],
  },
  {
    name: 'People and supply chain',
    entries: [
      {
        title: 'Insider Threat Mitigation Guide',
        source: 'CISA',
        year: 'page updated January 2026',
        type: 'advisory',
        why: 'how to define, detect and manage the threat that already has a badge.',
        url: 'https://www.cisa.gov/resources-tools/resources/insider-threat-mitigation-guide',
        pairs: [on('insider-exfil')],
        checked: '2026-09-26',
      },
      {
        title: 'Phishing Guidance: Stopping the Attack Cycle at Phase One',
        source: 'CISA and partners',
        year: 'October 2023',
        type: 'advisory',
        why: 'the layered defenses that stop one harvested password from becoming a breach.',
        url: 'https://www.cisa.gov/resources-tools/resources/phishing-guidance-stopping-attack-cycle-phase-one',
        pairs: [on('ops-phishing')],
        checked: '2026-09-26',
      },
      {
        title: 'Cybersecurity Supply Chain Risk Management Practices for Systems and Organizations (SP 800-161 Rev. 1, Update 1)',
        source: 'NIST (Boyens and others)',
        year: 'November 2024',
        type: 'standard',
        why: 'the federal playbook for trusting what you buy, from vendor vetting to component provenance.',
        url: 'https://csrc.nist.gov/pubs/sp/800/161/r1/upd1/final',
        pairs: [on('supply-chain-implant')],
        checked: '2026-09-26',
      },
      {
        title: 'StopRansomware',
        source: 'CISA',
        year: 'ongoing',
        type: 'advisory',
        why: 'the government\'s one-stop ransomware prevention and response guidance.',
        url: 'https://www.cisa.gov/stopransomware',
        pairs: [on('ground-ransomware')],
        checked: '2026-09-26',
      },
    ],
  },
  {
    name: 'Space environment',
    entries: [
      {
        title: 'NASA Orbital Debris Program Office',
        source: 'NASA',
        year: 'ongoing',
        type: 'program site',
        why: 'where the measurement and modeling of space debris, and the Kessler cascade risk, actually happen.',
        url: 'https://orbitaldebris.jsc.nasa.gov/',
        pairs: [on('debris-conjunction')],
        checked: '2026-09-26',
      },
    ],
  },
  {
    name: 'Case file',
    entries: [
      {
        title: 'KA-SAT Network Cyber Attack Overview',
        source: 'Viasat',
        year: 'March 2022',
        type: 'incident report',
        why: 'the operator\'s own account of the 2022 attack that knocked out thousands of satellite modems across Europe.',
        url: 'https://www.viasat.com/perspectives/corporate/2022/ka-sat-network-cyber-attack-overview/',
        pairs: [on('blackout-chain')],
        checked: '2026-09-26',
      },
    ],
  },
  {
    name: 'Policy',
    entries: [
      {
        title: 'Space Policy Directive-5: Cybersecurity Principles for Space Systems',
        source: 'Executive Office of the President',
        year: 'September 2020',
        type: 'policy',
        why: 'the first US policy that set cybersecurity principles for space systems.',
        url: 'https://www.federalregister.gov/documents/2020/09/10/2020-20150/cybersecurity-principles-for-space-systems',
        pairs: [GENERAL],
        checked: '2026-09-26',
      },
      {
        title: 'Cybersecurity Guidance: Chinese-Manufactured UAS',
        source: 'CISA and FBI',
        year: 'January 2024',
        type: 'advisory',
        why: 'what critical infrastructure operators should weigh before flying drones from certain foreign manufacturers.',
        url: 'https://www.cisa.gov/resources-tools/resources/cybersecurity-guidance-chinese-manufactured-uas',
        pairs: [on('supply-chain-implant', 'AIR')],
        checked: '2026-09-26',
      },
      {
        title: 'Small Satellites: The Implications for National Security',
        source: 'Nicholas Eftimiades, Atlantic Council',
        year: 'May 2022',
        type: 'report (think tank)',
        why: 'an institutional look at how cheap small satellites change national security and the counterspace picture.',
        url: 'https://www.atlanticcouncil.org/in-depth-research-reports/report/small-satellites-the-implications-for-national-security/',
        pairs: [on('lidar-dazzle')],
        checked: '2026-09-26',
      },
    ],
  },
  {
    name: 'Hands-on',
    entries: [
      {
        title: 'Lowering the Orbit: Exploiting Satellite Protocols and Communications via Software-Defined Radio and Ground Stations',
        source: 'Romel Marín (r0r0x), DEF CON 34',
        year: 'August 2026',
        type: 'talk (slides)',
        why: 'a hands-on tour of the Space Packet Protocol and a deliberately vulnerable FlatSat, with a catalogue of 34 findings from eavesdropping and replay to spoofed ground-station logins.',
        url: 'https://media.defcon.org/DEF%20CON%2034/DEF%20CON%2034%20presentations/DEF%20CON%2034%20-%20Romel%20Marin%20-%20Lowering%20the%20Orbit%20Exploiting%20Satellite%20Protocols%20and%20communications%20via%20Software-Defined-Radio%20and%20GS%20-%20v2%20Pro.pdf',
        pairs: [on('downlink-eavesdropping'), on('telemetry-replay'), on('gnss-spoofing'), on('rogue-ground-station')],
        checked: '2026-09-26',
      },
      {
        title: 'Flatsat',
        source: 'Alex Lynd, Romel Marín, Kevin León',
        type: 'open-source learning platform',
        why: 'an open hardware bench for learning space cybersecurity by attacking and defending a real board.',
        url: 'https://flatsat.org/',
        pairs: [GENERAL],
        checked: '2026-09-26',
      },
      {
        title: 'FlatSat (hardware repository)',
        source: 'Pwnsat, GitHub',
        type: 'open hardware (CERN OHL v1.2)',
        why: 'the board\'s designs, firmware and wiki.',
        url: 'https://github.com/Pwnsat/FlatSat',
        pairs: [GENERAL],
        checked: '2026-09-26',
      },
    ],
  },
]
