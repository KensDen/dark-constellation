// THE NIGHT'S WORDS (v1.3 brief 5.5 and Appendix B). The watch officer's
// line for each threat (M29), the one-line hook its intel card and its
// dossier row carry, and the line a defense that held it says. Twelve of
// each come from the loop prototype (files/*_LoopPrototype_v0.5.html,
// THREATS, HOOKS and heldLine), the other six from the brief's Appendix
// B; the debris conjunction has its own outcome text and no held line.
// The R6 gauntlet checks the hooks against each threat's sources.
//
// A line that names the asset the move was aimed at says {t}, which the
// card fills with that tile's call sign (fresh-eyes review, v1.3 R3: a
// line naming KESTREL-2 over a card that shows KESTREL-1 hit left the
// player unsure what was hit). With no tile on the move's layers, the
// line keeps the asset the prototype named.
//
// Kept here, beside the cards, rather than in the content deck: the deck
// rides inside every saved state, and the night's copy is presentation.
// tests/night-model.spec.ts holds every threat in the deck to a line in
// each map, so a threat added to the deck fails until someone writes its.
//
// Section 4 applies to every string here: no retired word (MAI, credits,
// buy, mitigated, severity), numerals, no em or en dashes.
//
// The 3D game's cards print these (src/ui/three/cards3d.tsx). The pixel
// night's own words left with it in v2.0 R3.

import type { NightStep } from './nightModel'

// A MOVE MET AGAIN SAYS IT ANOTHER WAY (v1.6 R3, Ken's playtest item 5:
// uplink jamming on turn 1 and on turn 3 read the same line, word for
// word, under the same 03:14Z). Each move that can come twice in a run,
// under either campaign, has a line for each time (uplink jamming can
// come 3 times: turns 1, 3 and 6 as written, 2, 3 and 6 in the other
// campaign; GNSS spoofing, PNT jamming, phishing and ransomware twice);
// officerFor picks by how many times the run has met it. The clock left
// the lines for the officer's label, where each night keeps its own.
// tests/night-model.spec.ts holds every move to a line per meeting, and
// no run over 500 seeds to the same line twice.
export const OFFICER: Record<string, readonly string[]> = {
  'uplink-jamming': [
    '{t} dropped uplink lock on the pass over the area of operations. 2 relief sorties are waiting on retasking we cannot send.',
    'Commands to {t} are going up and nothing is coming back. The jammer sits under the beam, and the morning tasking is stuck in the queue.',
    'The uplink to {t} is noise from horizon to horizon. Flood imagery for the county is a pass late and counting.',
  ],
  'ops-phishing': [
    'An ops console accepted a login from a phished credential. Every flood-map delivery to the county EOC since then is suspect.',
    'Another phishing wave reached the ops inbox, and a second console opened for a stranger. Deliveries are paused while we find what it touched.',
  ],
  'pnt-jamming': [
    '{t} lost its GNSS fix over the river crossing and is flying on LiDAR odometry alone. The convoy route survey is late.',
    'GNSS went dark over the staging area again. {t} is navigating on dead reckoning, and the survey grid is drifting.',
  ],
  'gnss-spoofing': [
    '{t} reported a confident position 400 m east of truth. The levee imagery it returned is geotagged wrong and has to be reflown.',
    '{t} flew a clean track on a counterfeit signal and logged a survey line 300 m off the real one. That sortie flies again tomorrow.',
  ],
  'downlink-eavesdropping': ['A receiver 40 km off-axis is posting our survey frames. Nothing was transmitted at us. Everything was heard.'],
  'telemetry-replay': ['Ground watched a healthy {t} for 20 minutes. {t} was drifting off its attitude the whole time.'],
  'lidar-dazzle': ['{t} aborted its inspection approach when the docking LiDAR saturated at 180 m. The stranded bird stays stranded another day.'],
  'debris-conjunction': ['Conjunction alert on {t}: a defunct upper stage on a crossing orbit, closest approach in 14 hours.'],
  'ground-ransomware': [
    'The mission data store is encrypted and a note is on the ops floor display. Shelter-mapping deliveries have stopped.',
    "Ransomware is back on the ground segment, and this time it reached the scheduling server. Tonight’s passes are flown by hand.",
  ],
  'rogue-ground-station': ['{t} accepted a command we never sent. Someone else has a dish and our protocol.'],
  'backhaul-exfil': ['Survey imagery left over the unencrypted backhaul and surfaced on a forum before it reached the EOC.'],
  'blackout-chain': ['{t} swerved around an obstacle that was not there and clipped a power line. Signature COLDVEIL.'],
  'time-spoof': ["{t}’s clock drifted 3 seconds overnight. 2 stored commands fired early, and the anti-replay window is open until we resync."],
  'lidar-injection': ['{t} braked hard for a wall that was not there. The point cloud shows a building on an empty street.'],
  'lidar-blinding': ["{t}’s LiDAR returned a clear path through a cell tower. {t} clipped the tower at 40 m."],
  'training-data-poisoning': [
    "Last night’s perception retrain pulled survey frames from a share we do not control. The new model behaves until it sees one particular marking.",
  ],
  'supply-chain-implant': ['A sensor package on {t} woke up and started talking on a frequency nobody assigned it. It shipped that way.'],
  'insider-exfil': ['The architecture binder was synced to a personal cloud account overnight. The access logs say the access was valid. That is the problem.'],
}

export const HOOK: Record<string, string> = {
  'uplink-jamming': 'Why a ground transmitter can stop a satellite hearing you',
  'ops-phishing': 'One click, one stolen login, and the door is open',
  'pnt-jamming': 'Why drones lose their way when GPS goes quiet',
  'gnss-spoofing': 'How a fake GPS signal flies a drone off course',
  'downlink-eavesdropping': 'Anyone under the beam can listen in',
  'telemetry-replay': 'Old data, replayed, can hide a dying satellite',
  'lidar-dazzle': 'How a laser can dazzle a docking sensor',
  'debris-conjunction': "Space junk doesn’t need a motive",
  'ground-ransomware': 'Why attackers hit the ground, not the satellite',
  'rogue-ground-station': 'Build your own dish, send your own commands',
  'backhaul-exfil': "Unencrypted satellite links leak more than you’d think",
  'blackout-chain': 'Knock out GPS, then fool the only sensor left',
  'time-spoof': 'Lie about the time and the whole schedule breaks',
  'lidar-injection': 'Laser pulses that paint obstacles that are not there',
  'lidar-blinding': "Make a real obstacle vanish from the drone’s view",
  'training-data-poisoning': 'Poison the training data and the model learns a backdoor',
  'supply-chain-implant': 'Firmware tampered with before it ever flew',
  'insider-exfil': 'No exploit needed when someone already has the badge',
}

// The call sign a line names when the move had no tile to aim at.
const NAMED: Record<string, string> = {
  'uplink-jamming': 'SG-1',
  'pnt-jamming': 'KESTREL-1',
  'gnss-spoofing': 'KESTREL-2',
  'telemetry-replay': 'SG-2',
  'lidar-dazzle': 'SG-R1',
  'rogue-ground-station': 'SG-2',
  'blackout-chain': 'KESTREL-1',
  'time-spoof': 'GS-1',
  'lidar-injection': 'KESTREL-2',
  'lidar-blinding': 'KESTREL-1',
  'supply-chain-implant': 'SG-R1',
  'debris-conjunction': 'SG-2',
}
export const aimedAt = (line: string, id: string, sign?: string) => line.split('{t}').join(sign ?? NAMED[id] ?? 'the asset')

// What the defense that held a threat says on its HELD block, and on a
// block what the watch officer reports in place of the attack's line.
export const HELD: Record<string, readonly string[]> = {
  'uplink-jamming': [
    'The jam hit the filters and the nulling antennas. {t} held lock through the pass.',
    'The jammer came up on schedule and the nulling antennas steered around it. Every command to {t} got through.',
    'The jammer swept the uplink band all pass. The filters rejected it, and {t} never lost lock.',
  ],
  'pnt-jamming': [
    'The squadron kept its GNSS fix through the noise. No fallback, no setup for anything else.',
    'The jammer lit up the GNSS band again. The anti-jam receivers held {t} on its fix the whole sortie.',
  ],
  'ops-phishing': [
    'The credential was phished and used. It opened one segment and nothing beyond it. Ops rotated it within the hour.',
    'Another phished login tried the ops consoles. It reached one segment, met the boundary, and the credential was dead within the hour.',
  ],
  'gnss-spoofing': [
    'The counterfeit fix failed authentication and disagreed with the second constellation. Logged as a fault, flown as truth by nobody.',
    'A spoofed signal reached {t} and failed authentication. The squadron flagged it and stayed on the real constellation.',
  ],
  'downlink-eavesdropping': ['The receiver heard the beam. Everything on it was encrypted and keyed this week.'],
  'telemetry-replay': ['Stale frames failed the freshness check. Ground saw the real {t} the whole time.'],
  'lidar-dazzle': ['The LiDAR saturated; radar and vision outvoted it and the approach continued.'],
  'ground-ransomware': [
    'The payload detonated inside one segment and the segment boundary held. Backups restored it by morning.',
    'Ransomware went off on the ground network again. One segment went dark, the rest kept working, and backups had it back by dawn.',
  ],
  'rogue-ground-station': ['The forged command failed authentication and {t} ignored it. The dish is now a known location.'],
  'backhaul-exfil': ['The backhaul carried only ciphertext. Whoever was listening got traffic patterns, not the data.'],
  'blackout-chain': ['The injected point cloud lost the vote two to one. The chain broke at its second link.'],
  'time-spoof': ['The drift failed the cross-check against the second timing source. Stored commands held for the resync.'],
  'lidar-injection': ['Radar and vision outvoted the LiDAR. The squadron flew the real street.'],
  'lidar-blinding': ['The obstacle vanished from the LiDAR and stayed on radar and vision. The drone went around it.'],
  'training-data-poisoning': ['The retrain set failed its provenance check. The old model stayed in service.'],
  'supply-chain-implant': ['Attested firmware refused the altered image at boot. The package never woke up.'],
  'insider-exfil': ['Least privilege kept the binder out of reach, and the access alert fired on the attempt.'],
}

// EACH NIGHT ITS OWN CLOCK (v1.6 R3, Ken's playtest item 5): the time on
// the watch officer's label, from the seed and the turn, so two nights of
// a run never share one, and later in the night for each move after the
// first. Between about 01:30Z and 04:30Z: night 1 opens between 01:33Z and
// 01:52Z, each night after it 23 minutes on, and each move 12 to 20
// minutes after the one before.
export function nightClock(seed: number, turn: number, index: number): string {
  let h = Math.imul((seed >>> 0) ^ Math.imul(turn, 0x9e3779b1), 0x85ebca6b) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  const start = 70 + turn * 23 + (h % 20)
  const t = start + index * (12 + ((h >>> 8) % 9))
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}Z`
}

// The watch officer's line for a move's card: on a block the defense's
// line, else the attack's, the one for this meeting of the run, with the
// tile it was aimed at named, and the night's clock.
export function officerFor(step: Pick<NightStep, 'ev' | 'before' | 'index'>, sign?: string): { line: string; held: boolean; clock: string } | null {
  const id = step.ev.eventId
  const met = step.before.history.reduce((n, r) => n + r.events.filter((e) => e.eventId === id).length, 0)
  // A move a response blocked has no line: HELD's are the defenses' own,
  // and the attack's reports a loss that did not happen.
  if (step.ev.response?.effect === 'block') return null
  const held = step.ev.effectiveSeverity === 0 && !!HELD[id]
  const lines = held ? HELD[id] : OFFICER[id]
  if (!lines?.length) return null
  return { line: aimedAt(lines[met % lines.length], id, sign), held, clock: nightClock(step.before.seed, step.before.turn, step.index) }
}

// What the night opens on, and the strike's banner.
export const MOVING = 'COLDVEIL IS MOVING'

// THE RESPONSE (v1.7 R1): the night stops on a move that would land and
// asks. Each option says what it does, in numbers; the option's own words
// are content (src/content/responseText.ts).
export const YOUR_RESPONSE = 'YOUR RESPONSE'
export const RIDE_IT_OUT = 'Ride it out'
export const FREE = 'FREE'
export const crFace = (n: number) => `${n} CR`
export const scoreChange = (d: number) => (d < -0.05 ? `score ${d.toFixed(1)}` : 'no loss')
export const EFFECT_WORD = { block: 'Blocks it', halve: 'Half damage', ride: 'Full hit' } as const
// The repair bill the answer leaves is part of what it costs, so it is on
// the button with the score (v1.7 R1's fresh eyes: FREE hid a 12 CR bill).
export const effectLine = (effect: keyof typeof EFFECT_WORD, d: number, repair = 0) => `${EFFECT_WORD[effect]}: ${scoreChange(d)}${repair > 0 ? `, repair ${repair} CR` : ''}`
export const exposedLine = (strength: number, through: number, defense?: string) =>
  through === strength ? `Strength ${strength}. Nothing you own stops it.` : `Strength ${strength}. ${defense ?? 'Your defenses'} takes ${strength - through} off; ${through} gets through.`
// The chain's extra point, on the response card, in a line.
export const CHAIN_ADDS = 'GNSS DENIED · CHAIN +1'
export const RODE_OUT = 'RODE IT OUT'
// A response covers one night; the defense is the lasting answer.
export const TONIGHT_ONLY = 'Your response covered tonight only.'
export const lastingAnswer = (defense: string, price: number) => ['The lasting answer: ', defense, `, ${price} CR.`] as const
export const NEW_DOSSIER = 'NEW DOSSIER CARD'
export const READ_CARD = 'READ THE CARD'
export const filedCount = (n: number, total: number) => `FILED · ${n} / ${total}`
// The block moment's line for a screen reader.
export const blockedSay = (move: string, streak: number) => `Blocked: ${move}.${streak >= 2 ? ` Defense streak ${streak}.` : ''}`
// What made the score's change, in a line under it, so a night's net is
// not a number no screen explains: "Moves -0.7 · Recovery +0.5".
export const scoreParts = (rows: readonly { key: keyof typeof SCORE_SHORT; value: number }[]) =>
  rows.map((r) => `${SCORE_SHORT[r.key]} ${r.value > 0 ? '+' : ''}${r.value.toFixed(1)}`).join(' · ')
export const FIX_LABEL = 'FIX NEXT'
export const fixDefense = (defense: string, price: number, move: string, verb: 'stops' | 'blunts') => ['', defense, `, ${price} CR, ${verb} `, move, '.'] as const
export const NOTHING_THROUGH = 'Nothing got through tonight.'

export const streakLine = (n: number) => `×${n} DEFENSE STREAK`
// The condition a hit leaves, in the one meaning of turns left (G-103,
// brief 6.5): the nights it will still press after this one, the count
// the night's chips and END OF TURN show beside it (R6b fresh eyes: the
// card said 2 TURNS beside a chip that said 1T).
export const conditionTag = (name: string, left: number) => `${name} · ${left === 0 ? 'TONIGHT ONLY' : `${left} TURN${left === 1 ? '' : 'S'} LEFT`}`
// What the block showed, said as it happened (R6 question 2): a defense
// that blocked a move tonight, not a claim that it always stops it.
export const canNowSay = (defense: string, threat: string) => ['You can now say it: ', defense, ' blocked ', threat, ' tonight.'] as const
// A block no one defense makes alone (the stops rule, R6 question 2; the
// rogue ground station with both its defenses): the partner is named too.
export const canNowSayWith = (defense: string, threat: string, partner: string) =>
  ['You can now say it: ', defense, ' blocked ', threat, ' tonight, with ', partner, '.'] as const
export const finishedIt = (defense: string, price: number) => ['Would have finished it: ', defense, `, ${price} CR.`] as const
export const wouldHaveHelped = (defense: string, price: number) => ['What would have helped: ', defense, `, ${price} CR.`] as const
// A hit to the data, not the hardware, still costs the night's response;
// it is a cleanup, not a repair (fresh-eyes review: "Not damaged" beside a
// repair bill).
export const repairTag = (n: number, hardware: boolean) => `${hardware ? 'REPAIR' : 'CLEANUP'} -${n} CR`
export const IN_DOSSIER = 'IN YOUR DOSSIER'
// FILE TO DOSSIER (v1.6 R3, Ken's playtest item 4; it read COLLECT INTEL
// CARD, and "intel" is the intel brief's word): files the move's card at
// once, and the card arrives stamped FILED.
export const FILE_TO_DOSSIER = 'FILE TO DOSSIER'
export const CONTINUE = 'CONTINUE'

export const TECHNIQUE = 'TECHNIQUE'
export const SOURCE = 'SOURCE'

export const windfallLine = (n: number) => `+${n} CR to the program.`
export const briefFreeLine = (n: number) => `The intel brief is free for the next ${n} turns.`
export const expeditedLine = (sign: string) => `${sign} rides along: it arrives a turn sooner.`
export const resoldLine = (n: number) => `Nothing in transit to speed up, so the rideshare seat was resold: +${n} CR.`

// THE DEBRIS CALL (brief 5.5 item 5). The odds are said once, here, and
// the odds line and HOLD both say them in these words: the prototype's
// HOLD said "Roughly one chance in three" beside an odds line of 20 to 60
// percent, and v1.3 uses the odds line's wording in both places.
export const callHeader = (turn: number) => `YOUR CALL · TURN ${turn}`
// "20 to 60 percent", not "somewhere between 20 and 60 percent": the card
// says it three times, and the long form ran its odds line under the card's
// more cue at 375 (R7 fresh eyes).
export const odds = (ssa: boolean, chance: number) => (ssa ? `${Math.round(chance * 100)} percent` : '20 to 60 percent')
export const oddsLine = (ssa: boolean, chance: number) =>
  [
    'Collision chance ',
    odds(ssa, chance),
    ssa ? '. Your space tracking service has 3 fixes on the debris.' : '. Without a space tracking service the track is coarse.',
  ] as const
export const CHOOSE = 'Choose one:'
export const BURN = 'BURN'
export const HOLD = 'HOLD'
// BURN says what being off station tonight costs only when it costs
// something: the coverage bonus, when the satellite is what keeps the
// fleet at the bonus line.
export const burnLine = (ssa: boolean, chance: number, sat: string, bonus: number | null) =>
  `${ssa ? 'Fuel already budgeted.' : 'Unbudgeted fuel.'} ${sat} dodges a collision chance of ${odds(ssa, chance)}.${
    bonus === null ? '' : ` Off station tonight, it can lose you the ${bonus} CR coverage bonus.`
  }`
// What HOLD risks, all of it (R7 fresh eyes: the loss review alone read
// as the price, while a lost satellite never heals and never counts
// toward coverage again).
export const holdLine = (ssa: boolean, chance: number, sat: string, review: number) =>
  `No fuel. ${sat} takes a collision chance of ${odds(ssa, chance)}; lost, it is gone for good, and a ${review} CR loss review follows.`
export const conjunctionHeader = (turn: number) => `CONJUNCTION · TURN ${turn}`
export const youChose = (choice: 'burn' | 'hold') => `YOU CHOSE ${choice.toUpperCase()}`
// The result's own word: never HELD, which is a defense's (fresh-eyes
// review: HELD meant a block, debris luck and a won operation).
export const debrisHead = (lost: boolean, choice: 'burn' | 'hold') => (lost ? 'LOST' : choice === 'burn' ? 'AVOIDED' : 'MISSED YOU')
export const debrisTitle = (lost: boolean, choice: 'burn' | 'hold') => (choice === 'burn' ? 'Burn complete' : lost ? 'Debris strike' : 'Close approach')
export const debrisText = (d: { choice: 'burn' | 'hold'; lost: boolean; sat?: string }) =>
  !d.sat
    ? 'No satellite was on the crossing orbit. The debris passed through empty sky.'
    : d.choice === 'burn'
      ? `${d.sat} burned out of the corridor. It is off station for the rest of tonight, so it does not count toward the coverage bonus at turn close.`
      : d.lost
        ? `The debris took ${d.sat}. A satellite does not come back, and a replacement takes 2 turns to arrive.`
        : `Closest approach was a miss. ${d.sat} held its orbit. The odds were real; this time they fell your way.`
export const debrisHelp = (lost: boolean, defense: string, price: number) =>
  [lost ? 'What would have helped: ' : 'Would have made this an easy call: ', defense, `, ${price} CR, for exact odds and free fuel.`] as const
export const fuelNow = (n: number) => `Fuel used now: -${n} CR`
export const reviewQueued = (n: number) => `Loss review queued for end of turn: -${n} CR`

export const SCORE_SHORT: Record<'from' | 'conditions' | 'hold' | 'moves' | 'recovery' | 'to', string> = { from: 'Start', conditions: 'Conditions', hold: 'Hold', moves: 'Moves', recovery: 'Recovery', to: 'End' }
export const SCORE_FROM = 'Start of turn'
export const SCORE_CONDITIONS = 'Ongoing conditions'
export const SCORE_MOVES = 'Tonight’s moves'
export const SCORE_HOLD = 'The hold'
export const savedNote = (n: number) => `saved ${n}`
export const SCORE_RECOVERY = 'Overnight recovery'
export const SCORE_RECOVERY_ARRIVALS = 'Overnight recovery and arrivals'
export const SCORE_TO = 'End of turn'
export const INSOLVENT_LINE =
  'Repairs and defense upkeep come out of the budget before funding arrives, and the budget could not cover them. The operation ends here.'
// What ended the operation, said on the last END OF TURN (QC gauntlet Q19:
// the collapse beat speaks of mission assurance, never MAI).
export const ENDING: Record<'won' | 'insolvency' | 'maiCollapse' | 'belowThreshold', { head: string; line: (n: number) => string }> = {
  won: { head: 'MISSION HELD', line: (n) => `The architecture held through turn ${n}.` },
  insolvency: { head: 'MISSION LOST', line: () => 'The budget ran out before COLDVEIL did.' },
  maiCollapse: { head: 'MISSION LOST', line: (n) => `Mission assurance collapsed below ${n}. The architecture came apart under the campaign.` },
  belowThreshold: { head: 'MISSION LOST', line: (n) => `The operation ended below the win line of ${n}.` },
}
