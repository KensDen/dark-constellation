// Scenario: FIRST LIGHT. Six nights since v1.3 (brief D1 a and 6.2): all 18
// threats appear as candidates and a run meets 10 events, so the Dossier
// fills over two or three runs. Each drawn slot is the reacting
// adversary's pick among its candidates (src/engine/adversary.ts); a fixed
// slot is CONFIRMED. The economy is the 3D game's, set by the sweep gate
// (tests/sweep.spec.ts) in v2.0 R2 and ruled on by Ken on 15 November 2026:
// the numbers stay as R2 measured them.

import type { Scenario } from '../../engine/types'
import { ADVERSARY, CONSTELLATION, PLAYER_ORG, SQUADRON } from '../../config'
import { COUNTERMEASURES } from '../counters'
import { HOLDS } from '../holds'
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
  // THE BUDGET (v2.0 R2). The answers are a pool that costs no credits
  // (src/engine/rules.ts, answersOf), so credits buy defenses and assets
  // and pay the bills: 90 to start (80 through v2.0 R4; see the fleet,
  // below) and 7 a night (6 through v2.0 R3). The budget is not a smooth
  // dial: a credit a night either way moves Prepared by several points in
  // either direction, because what it changes is whether the last nights'
  // orders fit inside WORST CASE (src/engine/worstCase.ts). Through v1.7,
  // with a paid intel brief and answers bought a point at a time, it was
  // 100 and 20; the pixel board's numbers are in the history of main.
  startCredits: 90,
  incomePerTurn: 7,
  slaBonus: { coverageMin: 60, credits: 10 },
  winThreshold: 70,
  collapseThreshold: 35,
  maiWeights: { coverage: 0.3, linkAvailability: 0.25, dataIntegrity: 0.2, sensorIntegrity: 0.25 },
  // THE FLEET: A DRONE COSTS 25 (v2.0 R5, Ken's ruling of 17 November
  // 2026: drones cost more or cover less, so that Prepared plus a drone a
  // night no longer wins all 500). At 15 a drone was 2.7 points of score
  // for the price of a defense and a half, with no upkeep: under R4's
  // guard Prepared with a drone a night as well won every game on
  // STANDARD. At 25, with the opening budget raised by the same 10, the
  // first night is what it was (the drone FIRST ORDERS teaches leaves 65
  // CR as before, and still reaches the coverage bonus), so every line
  // that orders that one drone plays exactly as it did, and each drone
  // after it costs 10 more. MEASURED on STANDARD, 500 seeds a line, under
  // R5's guard: Prepared 86.2, Novice 39.4, the Expert 98.4; Prepared with
  // a drone a night as well 26.6 (it spends what its defenses need); the
  // same line keeping tomorrow's likely bills in hand 80.0, and 92.6 with
  // the Expert's answers. PRICES MEASURED BESIDE IT, each with the opening
  // budget moved by the same amount, the careful drone line and the same
  // with the Expert's answers: 15, 93.2 and 97.0; 20, 98.6 and 99.6, over
  // the Expert; 22, 91.6 and 98.8; 23, 87.2 and 96.0; 24 to 30, never
  // more than a point over Prepared and never over the Expert. 25 is in
  // the middle of that flat stretch. The price alone, with 80 to start,
  // took Prepared to 33.8 percent: the first drone is in every line.
  // Covering less was the other lever: at 7 coverage a drone (9 now) the
  // starting fleet reads 54, not 58, and Prepared won 56.4.
  // tests/sweep.spec.ts holds the drone lines under the Expert.
  prices: {
    sat: 30,
    rpoSat: 35,
    drone: 25,
    groundStation: 25,
  },
  upkeepPerDefense: 2,
  // RE-TUNED IN v2.0 R5 (Ken's rulings of 17 November 2026): the opening
  // budget 90 and a drone 25 (the fleet, above), and 4 points for a wrong
  // call (the watch, below). Meter damage, recovery and funding are R4's.
  // Prepared 86.2, Novice 39.4, the Expert 98.4 on STANDARD; 100.0, 79.2
  // and 100.0 on EASY.
  //
  // RE-TUNED IN v2.0 R4 (Ken's rulings of 15 November 2026: fix the
  // watch-post advice, loosen the WORST CASE guard, then bring the bands
  // back to where Round 2 put them). The two fixes made every line that
  // reads the board stronger: with R3's numbers under them, Prepared won
  // 94.6 percent on STANDARD and the Novice 50.2 (88.2 and 40.6 with the
  // advice alone). The numbers now: 15 meter damage a point, 7 recovery a
  // night (9 with the IR retainer), 7 funding a night, 3.5 points for a
  // wrong call. Prepared 87.2, Novice 41.2, the Expert 98.4 on STANDARD;
  // 100.0, 79.6 and 100.0 on EASY. Settings measured beside it, Prepared
  // and Novice on STANDARD: 14 damage, 5 recovery, 7 funding and 2 for a
  // wrong call, 86.8 and 39.0, but always overriding a hold then wins 83.8,
  // too near reading it (the tie-break must count for 5 points); the same
  // with 3 for a wrong call, 86.8 and 35.4; 15, 6, 7 and 3, 85.6 and 35.0;
  // 14.5, 6, 7 and 3, 86.4 and 37.2; 15, 7, 7 and 3, 87.2 and 43.4, with
  // letting every block stand at 82.4, a hair inside 5 points of reading
  // it, which is why a wrong call is 3.5 and not 3. This is the setting
  // nearest both bands with the tie-break still counting. (The settings
  // beside it were measured with tomorrow held at its worst; the guard
  // has since read tomorrow at its average, which moved Prepared not at
  // all and the Novice by under a point.)
  //
  // METER DAMAGE AND RECOVERY, SET TOGETHER BY THE SWEEP (v2.0 R2, 500
  // seeds a line): through R3, 13 meter damage a point of strength, and 5
  // recovery a night on every meter (7 with the IR retainer). Damage is up from v1.7's 9 because nothing is
  // bought off any more: an unanswered strength 3 move that hits 2 meters
  // can take 15 points of score or more, which is what makes 3 answers a
  // real budget. Measured under R2's guard on STANDARD, Prepared and Novice: at 12 and 4,
  // 89.8 and 41.4 percent; at 13 and 5, 85.8 and 40.2; at 12 and 3, 78.6
  // and 32.8; at 13 and 4, 75.8 and 32.0; at 14 and 4, 72.8 and 26.2. A
  // Prepared line that plays its orders well and a beginner are about 46
  // points of win rate apart at every setting; this is the one nearest both
  // bands.
  recovery: { base: 7, withIrRetainer: 9 },
  meterDamage: 15,
  // THE WATCH (v2.0 R2): 3 answers for the whole operation; 3 holds a
  // game, and 4 points of score for a wrong call on one (2 through R3,
  // 3.5 in R4). 4 SINCE v2.0 R5: under R5's guard the lines that call
  // every hold one way buy a little more freely, and at 3.5 always
  // overriding won 81.6 percent against Prepared's 86.2, inside the 5
  // points the tie-break ruling asks for. At 4, always overriding wins
  // 80.2 and never overriding 80.0, and the Novice, who calls 1 hold in 3
  // wrong, 39.4 (41.2 at 3.5); at 4.5, 79.0, 78.6 and 37.2.
  answers: 3,
  holdCount: 3,
  holdStake: 4,
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
      intro: "Final tasking. Analysts expect COLDVEIL’s signature chain and one more probe wherever you are thin.",
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
  briefIntro: `You are the mission assurance architect at ${PLAYER_ORG}, standing up ${CONSTELLATION} (nine planned smallsats, one with a docking LiDAR package) and ${SQUADRON} (an ISR drone squadron on LiDAR and GNSS navigation) for a disaster-response tasking. ${ADVERSARY}, a threat group with a taste for layered attacks, has taken an interest. Six nights. Keep the mission assurance score at 70 or above and stay solvent.`,
  events: [...THREATS, ...OPPORTUNITIES],
  countermeasures: COUNTERMEASURES,
  holds: HOLDS,
}
