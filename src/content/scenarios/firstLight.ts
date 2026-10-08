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
  recovery: { base: 2, withIrRetainer: 6 },
  starterAssets: [{ kind: 'sat' }, { kind: 'sat' }, { kind: 'rpoSat' }, { kind: 'drone' }, { kind: 'drone' }, { kind: 'groundStation' }],
  // Brief 6.2. Turn 1's two moves are both strength 2, on different layers
  // with different defenses, so a hit lands on turn 1 unless the player
  // blocks both (M2), and the first lesson is jamming against spoofing
  // (M26). The intros are the watch officer's, adapted from the
  // prototype's to these slots.
  campaign: [
    {
      turn: 1,
      intro: 'COLDVEIL is working two doors tonight. Which one they take depends on which one you leave open.',
      slots: [{ drawFrom: ['uplink-jamming', 'gnss-spoofing'] }],
    },
    {
      turn: 2,
      intro: 'The squadron flies the river crossing at dawn. Expect pressure on navigation, on timing, and on the people at the consoles.',
      slots: [{ drawFrom: ['ops-phishing', 'pnt-jamming', 'time-spoof'] }],
      opportunity: OPPORTUNITY_DRAW,
    },
    {
      turn: 3,
      intro: 'Two tracks tonight: RF pressure on a link, and a quiet one against the data itself.',
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
  briefIntro: `You are the mission assurance architect at ${PLAYER_ORG}, standing up ${CONSTELLATION} (nine planned smallsats, one with a docking LiDAR package) and ${SQUADRON} (an ISR drone squadron on LiDAR and GNSS navigation) for a disaster-response tasking. ${ADVERSARY}, a threat group with a taste for layered attacks, has taken an interest. Six turns. Keep mission assurance at 70 or above and stay solvent.`,
  events: [...THREATS, ...OPPORTUNITIES],
  countermeasures: COUNTERMEASURES,
}
