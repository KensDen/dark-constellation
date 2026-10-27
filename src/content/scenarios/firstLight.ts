// Scenario: FIRST LIGHT. Six turns since v1.3 (brief D1 a and 6.2): all 18
// threats appear as candidates and a run meets 10 events, so the Dossier
// fills over two or three runs. Each drawn slot is the reacting
// adversary's pick among its candidates (src/engine/adversary.ts); a fixed
// slot is CONFIRMED. The economy is brief 6.1's, a starting tuning from
// the loop prototype that the sweep gate (brief 7) holds to its targets.

import type { Scenario } from '../../engine/types'
import { ADVERSARY, CONSTELLATION, PLAYER_ORG, SQUADRON } from '../../config'
import { COUNTERMEASURES } from '../counters'
import { OPPORTUNITIES } from '../opportunities'
import { THREATS } from '../threats'

// Rare beneficial draw on turns 2 to 5 (brief 6.2), from the deck stream
// after the threat slots. One roll per listed turn; the ids come from the
// opportunity deck.
const OPPORTUNITY_DRAW = { chance: 0.2, drawFrom: OPPORTUNITIES.map((o) => o.id) }

export const FIRST_LIGHT: Scenario = {
  id: 'first-light',
  name: 'FIRST LIGHT',
  totalTurns: 6,
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
    intelBrief: 8,
  },
  upkeepPerDefense: 2,
  // THE RETAINER'S RECOVERY IS 4, TUNED IN v1.5 R1 (Ken, 24 October 2026)
  // from the prototype's 6, the one number the round moved. With one new
  // defense a night, ordering the priciest defense each night was one fixed
  // order (sensor fusion, firmware attestation, ground zero trust, the
  // retainer on night 4, anti-jam, PNT authentication) that won 99.6
  // percent on STANDARD against Prepared's 79.6: it trailed Prepared on
  // turns 1 to 5 and passed it at the close, on the retainer's 6 a turn on
  // every meter. Measured over 500 seeds a policy (tests/sweep.spec.ts) at
  // 4: Buy everything 53.2 (EASY 100), Prepared 79.6 (100), Novice 42.0
  // (85.2), Random legal 5.0 (10.2), Nothing 0.0 (3.0), the flag-follower
  // 79.6 with no S. At 5 Buy everything still won 81.8; at 3, 25.2, with
  // Novice down to 37.0.
  recovery: { base: 2, withIrRetainer: 4 },
  starterAssets: [{ kind: 'sat' }, { kind: 'sat' }, { kind: 'rpoSat' }, { kind: 'drone' }, { kind: 'drone' }, { kind: 'groundStation' }],
  // Brief 6.2. Turn 1's two moves are both strength 2, on different layers
  // with different defenses, so a hit lands on turn 1 unless the player
  // blocks both (M2), and the first lesson is jamming against spoofing
  // (M26). The intros are the watch officer's, adapted from the
  // prototype's to these slots.
  campaign: [
    {
      turn: 1,
      // One sentence since v1.6 R1: its second ("Which one they take
      // depends on which one you leave open.") said what TONIGHT's rule line
      // and FIRST ORDERS say beneath it, and the line it took was the one
      // the other opening's two-layer move needs at 375x667.
      intro: 'COLDVEIL is working 2 doors tonight.',
      slots: [{ drawFrom: ['uplink-jamming', 'gnss-spoofing'] }],
    },
    {
      turn: 2,
      intro: 'The squadron flies the river crossing at dawn. Expect pressure on navigation, on timing, and on the people at the consoles.',
      introTraded: 'The squadron flies the river crossing at dawn. Expect pressure on the uplink, on navigation, and on the people at the consoles.',
      slots: [{ drawFrom: ['ops-phishing', 'pnt-jamming', 'time-spoof'] }],
      opportunity: OPPORTUNITY_DRAW,
    },
    {
      turn: 3,
      intro: '2 tracks tonight: RF pressure on a link, and a quiet one against the data itself.',
      slots: [{ drawFrom: ['uplink-jamming', 'pnt-jamming'] }, { drawFrom: ['downlink-eavesdropping', 'telemetry-replay', 'backhaul-exfil'] }],
      opportunity: OPPORTUNITY_DRAW,
    },
    {
      turn: 4,
      intro: 'Space tracking has flagged a conjunction. COLDVEIL is also working the sensors.',
      slots: [{ fixed: 'debris-conjunction' }, { drawFrom: ['gnss-spoofing', 'lidar-dazzle', 'supply-chain-implant'] }],
      opportunity: OPPORTUNITY_DRAW,
    },
    {
      turn: 5,
      intro: 'The ground segment is the soft target tonight, and someone is working on what the squadron sees.',
      slots: [
        { drawFrom: ['ground-ransomware', 'rogue-ground-station', 'insider-exfil'] },
        { drawFrom: ['training-data-poisoning', 'lidar-injection', 'lidar-blinding'] },
      ],
      opportunity: OPPORTUNITY_DRAW,
    },
    {
      turn: 6,
      intro: "Final tasking. Analysts expect COLDVEIL's signature chain and one more probe wherever you are thin.",
      slots: [{ fixed: 'blackout-chain' }, { drawFrom: ['ops-phishing', 'ground-ransomware', 'uplink-jamming'] }],
    },
  ],
  // THE SEED'S ORDER (v1.6 R1, Ken's ruling of 26 October 2026: vary
  // COLDVEIL per seed, so one scripted order of defenses can no longer
  // answer every night). Each seed plays one of two campaigns, drawn from
  // its deck stream (campaignFor, src/engine/campaign.ts): as written above,
  // or with COLDVEIL opening on the other layers and working the ground
  // before the conjunction. The other opening trades turn 1's doors for
  // turn 2's jam and spoof: PNT jamming in the AIR against a time spoof on
  // ORBIT and GROUND, still a jam against a spoof, both strength 2, on
  // different layers with different defenses (M2, M26); turn 2 then draws
  // phishing, uplink jamming and GNSS spoofing. Turns 4 and 5 trade
  // places whole. Every move keeps its strength and its counters.
  //
  // Measured over 500 seeds a policy (tests/sweep.spec.ts), STANDARD and
  // EASY: Buy everything 74.8 and 100, Prepared 83.0 (never insolvent) and
  // 100, Novice 42.2 and 85.8, Random legal 4.4 and 10.4, Nothing 0.0 and
  // 2.6, and the prepared script (tests/scripts.ts WIN_SCRIPT), which won
  // all 500 in v1.5, 78.2 and 100. Other designs measured and left: all
  // 24 orders of turns 2 to 5 lift Prepared to 91.4 (above its band of 65
  // to 85); the six orders of turns 3 to 5, played one at a time, average
  // Buy everything 88.2 against Prepared's 82.5; the other opening on its
  // own lifts Prepared
  // to 88.6, since a time spoof leaves no condition; every design with
  // three or more variants that varied the opening put A above 23 percent
  // of wins (the grade's calibration band, tests/grade.spec.ts).
  order: {
    variants: [
      {},
      {
        trade: { ids: { 'uplink-jamming': 'pnt-jamming', 'pnt-jamming': 'uplink-jamming', 'gnss-spoofing': 'time-spoof', 'time-spoof': 'gnss-spoofing' }, turns: [1, 2] },
        turns: [1, 2, 3, 5, 4, 6],
      },
    ],
  },
  briefIntro: `You are the mission assurance architect at ${PLAYER_ORG}, standing up ${CONSTELLATION} (nine planned smallsats, one with a docking LiDAR package) and ${SQUADRON} (an ISR drone squadron on LiDAR and GNSS navigation) for a disaster-response tasking. ${ADVERSARY}, a threat group with a taste for layered attacks, has taken an interest. Six turns. Keep the Mission Assurance Index at 70 or above and stay solvent.`,
  events: [...THREATS, ...OPPORTUNITIES],
  countermeasures: COUNTERMEASURES,
}
