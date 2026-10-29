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

import { vectorLabels } from '../labels'
import type { Vector } from '../../engine/types'
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
  const held = step.ev.effectiveSeverity === 0 && !!HELD[id]
  const lines = held ? HELD[id] : OFFICER[id]
  if (!lines?.length) return null
  return { line: aimedAt(lines[met % lines.length], id, sign), held, clock: nightClock(step.before.seed, step.before.turn, step.index) }
}

// A threat's vector as its card's tag says it, upper case: RF ATTACK,
// SUPPLY CHAIN ATTACK. The debris is not an attack and says what it is.
export const vectorWord = (v: Vector) => vectorLabels[v].toUpperCase()
export const attackTag = (v: Vector) => (v === 'environmental' ? 'DEBRIS' : `${vectorWord(v)} ATTACK`)

// The overlay EXECUTE opens on, and the strike's banner.
export const MOVING = 'COLDVEIL IS MOVING'
// The strike's two ways on (v1.6 R3, Ken's playtest item 2): a tap ends a
// strike's hold, and SKIP NIGHT plays the rest without strikes.
export const NEXT_STRIKE = 'Next'
export const SKIP_NIGHT = 'SKIP NIGHT'
// The HUD's label for a fall more than one live condition caused.
export const CONDITIONS_WORD = 'CONDITIONS'
// The strike's banner says the result (v1.6 R3, the open F22: it read
// COLDVEIL MOVES on a hit and never HIT, and BLOCKED twice on a block, on
// the banner and on the card under it). A block is BLOCKED; HELD is the
// mission's (Ken, 22 October: question 5 of the R5 report).
export const STRIKE_WORD = { hit: 'HIT', reduced: 'PARTIAL', held: 'BLOCKED' } as const

// The hit card (brief 5.5 item 2).
export const hitHeader = (turn: number) => `COLDVEIL MOVES · TURN ${turn}`
export type Verdict = 'BLOCKED' | 'PARTIAL' | 'HIT'
export const blockedOf = (blocked: number, strength: number, chained: boolean) =>
  `${blocked} of ${strength} blocked${chained ? ' · chain added 1' : ''}`
export const streakLine = (n: number) => `×${n} DEFENSE STREAK`
export const NO_LOSS = 'NO LOSS'
export const STRENGTH = 'STRENGTH'
export const MORE = '▼ more below'
export const savedLabel = (saved: number) => `SAVED ${saved.toFixed(1)}`
export const SCORE_WORD = 'SCORE'
// The night so far, over the strike card's list (v1.6 R2).
export const moveOf = (n: number, of: number) => `TONIGHT · MOVE ${n} OF ${of}`
export const aimedTag = (landed: boolean, layer: string) => `${landed ? 'HIT' : 'AIMED AT'} ${layer}`
// The condition a hit leaves, in the one meaning of turns left (G-103,
// brief 6.5): the nights it will still press after this one, the count
// the night's chips and END OF TURN show beside it (R6b fresh eyes: the
// card said 2 TURNS beside a chip that said 1T).
export const conditionTag = (name: string, left: number) => `${name} · ${left === 0 ? 'TONIGHT ONLY' : `${left} TURN${left === 1 ? '' : 'S'} LEFT`}`
export const WATCH_OFFICER = 'WATCH OFFICER'
export const officerLabel = (clock: string) => `${WATCH_OFFICER} · ${clock}`
// The outcome's word in the display face and the defense's name beside
// it in the mono (brief 8.5: a long name wrapped the display face across
// two heavy lines at 375).
// What the block showed, said as it happened (R6 question 2): a defense
// that blocked a move tonight, not a claim that it always stops it.
export const canNowSay = (defense: string, threat: string) => ['You can now say it: ', defense, ' blocked ', threat, ' tonight.'] as const
// A block no one defense makes alone (the stops rule, R6 question 2; the
// rogue ground station with both its defenses): the partner is named too.
export const canNowSayWith = (defense: string, threat: string, partner: string) =>
  ['You can now say it: ', defense, ' blocked ', threat, ' tonight, with ', partner, '.'] as const
// What blunted a partial, the panel above giving the count (v1.6 R3's
// fresh eyes, H8: "Strength 2 came in; 1 got through." said the tiles
// again).
export const reducedLine = (defense: string) => `${defense} blunted it.`
export const CHAIN_REDUCED = 'GNSS was still denied, so the chain added a point before your defenses saw it.'
export const finishedIt = (defense: string, price: number) => ['Would have finished it: ', defense, `, ${price} CR.`] as const
export const UNDEFENDED = 'UNDEFENDED'
// The strike's card on a phone (v1.6 R1): what answers the move, or that
// nothing owned does.
export const DEFENSE_WORD = 'DEFENSE'
export const NO_DEFENSE_OWNED = 'No defense owned'
export const CHAIN_OPEN = 'GNSS was still denied, so the squadron was flying on one sensor and the chain added a point.'
export const wouldHaveHelped = (defense: string, price: number) => ['What would have helped: ', defense, `, ${price} CR.`] as const
// What the missing defense stops alone and what it only blunts (the stops
// rule, src/ui/board/boardModel.ts), this move's group first and this move
// first in it. Past two names the line keeps this move and counts the rest
// as answered, so it stays a line on a defense that answers many threats
// the player has met.
export const itStops = (groups: readonly (readonly [verb: 'stops' | 'blunts', threats: string[]])[]) => {
  const said = groups.filter(([, threats]) => threats.length)
  const total = said.reduce((n, [, threats]) => n + threats.length, 0)
  if (total > 2) return `It ${said[0][0]} ${said[0][1][0]} and answers ${total - 1} more threats you have met.`
  return `It ${said.map(([verb, threats]) => `${verb} ${threats.join(' and ')}`).join(' and ')}.`
}
export const IN_PROCURE = 'It is in PROCURE next turn.'
// A hit to the data, not the hardware, still costs the night's response;
// it is a cleanup, not a repair (fresh-eyes review: "Not damaged" beside a
// repair bill).
// The same bill on the hit card's result panel (v1.6 R3, Ken's playtest
// item 3), under the score's change; END OF TURN's ledger says when.
export const repairTag = (n: number, hardware: boolean) => `${hardware ? 'REPAIR' : 'CLEANUP'} -${n} CR`
export const cleanupOf = (move: string) => `${move} cleanup`
export const IN_DOSSIER = 'IN YOUR DOSSIER'
// FILE TO DOSSIER (v1.6 R3, Ken's playtest item 4; it read COLLECT INTEL
// CARD, and "intel" is the intel brief's word): files the move's card at
// once, and the card arrives stamped FILED.
export const FILE_TO_DOSSIER = 'FILE TO DOSSIER'
export const CONTINUE = 'CONTINUE'

// The Dossier card (brief 5.5 item 3; the intel card until v1.6 R3).
export const NEW_CARD = 'NEW DOSSIER CARD'
export const FILED = 'FILED'
export const DOSSIER_COUNT = 'COLDVEIL DOSSIER'
export const TECHNIQUE = 'TECHNIQUE'
export const SOURCE = 'SOURCE'

// Opportunities (brief 5.5 item 4): the setup, then what it did, in the
// game's words from the engine's record rather than its log line.
export const opportunityHeader = (turn: number) => `OPPORTUNITY · TURN ${turn}`
export const windfallLine = (n: number) => `+${n} CR to the program.`
export const briefFreeLine = (n: number) => `The intel brief is free for the next ${n} turns.`
export const expeditedLine = (sign: string) => `${sign} rides along: it arrives a turn sooner.`
export const resoldLine = (n: number) => `Nothing in transit to speed up, so the rideshare seat was resold: +${n} CR.`

// THE DEBRIS CALL (brief 5.5 item 5). The odds are said once, here, and
// the odds line and HOLD both say them in these words: the prototype's
// HOLD said "Roughly one chance in three" beside an odds line of 20 to 60
// percent, and v1.3 uses the odds line's wording in both places.
// tests/night-r3.dom.spec.tsx holds the two to the same phrase.
export const callHeader = (turn: number) => `YOUR CALL · TURN ${turn}`
export const DEBRIS_CHIP = 'DEBRIS'
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
export const burnFace = (fuel: number) => `${BURN} · ${fuel} CR`
export const HOLD_FACE = `${HOLD} · FREE`
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
export const debrisChip = (lost: boolean, choice: 'burn' | 'hold') => (lost ? 'SATELLITE LOST' : choice === 'burn' ? 'AVOIDED' : 'MISSED YOU')
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

// END OF TURN (brief 5.5 item 6): every line that made the budget.
export const endHeader = (turn: number) => `END OF TURN ${turn}`
export const LEFT_AFTER = "Left after tonight’s orders"
export const REPAIRS = 'Repairs'
// The night's own budget lines (R6 question 12): the burn's fuel and an
// opportunity's windfall, each a row of its own.
export const BURN_FUEL = 'Burn fuel'
export const RESOLD = 'Rideshare seat resold'
export const KEEPING = 'Keeping your defenses'
export const keepingDetail = (n: number, upkeep: number) => `${n} × ${upkeep} CR`
export const FUNDING = 'Mission funding'
export const FROZEN = 'frozen'
export const COVERAGE_BONUS = 'Coverage bonus'
export const MISSED = 'missed'
// What reaches the bonus line when it was missed: the cheapest asset whose
// coverage covers the gap, or more than one.
export const reachWith = (asset: string | null) => (asset ? `${asset} gets you there.` : 'More than one asset gets you there.')
export const coverageDetail = (arrived: string[], coverage: number, needs: number, reach: string | null) =>
  `${arrived.length ? `${arrived.join(', ')} arrived: ` : ''}coverage ${coverage}, needs ${needs}${reach ? `. ${reach}` : ''}`
export const budgetFor = (turn: number, last: boolean) => (last ? 'Final budget' : `Budget for turn ${turn + 1}`)
// What recovers overnight and what the IR retainer speeds, read off the
// scenario and the rules (R6b fresh eyes: "3 times faster" was said of
// all repair, while the retainer raises only the link, data and sensor
// recovery and assets heal the same either way, src/engine/reducer.ts).
// In turns, the game's one unit since v1.5 R1 (v1.4's fresh eyes, finding 11).
export const recoverySlow = (heal: number, base: number, retained: number) =>
  `Damaged assets recover ${heal} integrity a turn either way. Link, data and sensor health recover ${base} a turn; an incident response retainer makes it ${retained}.`
export const recoveryFast = (heal: number, base: number, retained: number) =>
  `Damaged assets recover ${heal} integrity a turn. Your incident response retainer recovers link, data and sensor health ${retained} a turn instead of ${base}.`
// The score's own lines (fresh-eyes review, section 4 rule 5: every total
// is checkable): what the live conditions took as the night opened, what
// tonight's moves took and what the defenses saved, and the overnight
// recovery, from the score the turn opened on to the one it closed on.
export const SCORE_LINES = 'MISSION ASSURANCE SCORE'
// THE TURN SUMMARY'S WORDS (v1.6 R4): the two panels' heads and their
// short row names, numbers in one column; the long names stay for the
// screen reader's labels and the night's other cards.
export const SCORE_PANEL = 'SCORE'
export const NO_CHANGE = 'HELD'
// A missed coverage bonus's detail as the summary's one hint line, said
// with the panel's word for it.
export const bonusHint = (detail: string) => `Bonus missed: ${detail}`
export const budgetPanel = (turn: number, last: boolean) => (last ? 'FINAL BUDGET' : `BUDGET · TURN ${turn + 1}`)
export const SCORE_SHORT: Record<'from' | 'conditions' | 'moves' | 'recovery' | 'to', string> = { from: 'Start', conditions: 'Conditions', moves: 'Moves', recovery: 'Recovery', to: 'End' }
export const LEDGER_SHORT: Record<'left' | 'fuel' | 'windfall' | 'repairs' | 'keeping' | 'funding' | 'bonus' | 'total', string> = {
  total: 'Next turn',
  left: 'Orders',
  fuel: 'Burn fuel',
  windfall: 'Windfall',
  repairs: 'Repairs',
  keeping: 'Upkeep',
  funding: 'Funding',
  bonus: 'Bonus',
}
export const TONIGHT_ROWS = 'TONIGHT'
export const END_HELP = 'How recovery works'
export const BUDGET_LINES = 'BUDGET'
export const SCORE_FROM = 'Start of turn'
export const SCORE_CONDITIONS = 'Ongoing conditions'
export const SCORE_MOVES = 'Tonight’s moves'
export const savedNote = (n: number) => `saved ${n}`
export const SCORE_RECOVERY = 'Overnight recovery'
export const SCORE_RECOVERY_ARRIVALS = 'Overnight recovery and arrivals'
export const SCORE_TO = 'End of turn'
export const INSOLVENT = 'INSOLVENT'
export const INSOLVENT_LINE =
  'Repairs and defense upkeep come out of the budget before funding arrives, and the budget could not cover them. The operation ends here.'
export const beginTurn = (n: number) => `BEGIN TURN ${n}`
export const DEBRIEF = 'DEBRIEF'
// What ended the operation, said on the last END OF TURN (QC gauntlet Q19:
// the collapse beat speaks of mission assurance, never MAI).
export const ENDING: Record<'won' | 'insolvency' | 'maiCollapse' | 'belowThreshold', { head: string; line: (n: number) => string }> = {
  won: { head: 'MISSION HELD', line: (n) => `The architecture held through turn ${n}.` },
  insolvency: { head: 'MISSION LOST', line: () => 'The budget ran out before COLDVEIL did.' },
  maiCollapse: { head: 'MISSION LOST', line: (n) => `Mission assurance collapsed below ${n}. The architecture came apart under the campaign.` },
  belowThreshold: { head: 'MISSION LOST', line: (n) => `The operation ended below the win line of ${n}.` },
}
