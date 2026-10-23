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

export const OFFICER: Record<string, string> = {
  'uplink-jamming':
    '03:14Z. {t} dropped uplink lock on the pass over the area of operations. Two relief sorties are waiting on retasking we cannot send.',
  'ops-phishing':
    'An ops console accepted a login from a phished credential at 22:40 local. Every flood-map delivery to the county EOC since then is suspect.',
  'pnt-jamming': '{t} lost its GNSS fix over the river crossing and is flying on LiDAR odometry alone. The convoy route survey is late.',
  'gnss-spoofing':
    '{t} reported a confident position 400 m east of truth. The levee imagery it returned is geotagged wrong and has to be reflown.',
  'downlink-eavesdropping': 'A receiver 40 km off-axis is posting our survey frames. Nothing was transmitted at us. Everything was heard.',
  'telemetry-replay': 'Ground watched a healthy {t} for twenty minutes. {t} was drifting off its attitude the whole time.',
  'lidar-dazzle': '{t} aborted its inspection approach when the docking LiDAR saturated at 180 m. The stranded bird stays stranded another day.',
  'debris-conjunction': 'Conjunction alert on {t}: a defunct upper stage on a crossing orbit, closest approach in 14 hours.',
  'ground-ransomware': 'The mission data store is encrypted and a note is on the ops floor display. Shelter-mapping deliveries have stopped.',
  'rogue-ground-station': '{t} accepted a command we never sent. Someone else has a dish and our protocol.',
  'backhaul-exfil': 'Survey imagery left over the unencrypted backhaul and surfaced on a forum before it reached the EOC.',
  'blackout-chain': '{t} swerved around an obstacle that was not there and clipped a power line. Signature COLDVEIL.',
  'time-spoof':
    "{t}'s clock drifted three seconds overnight. Two stored commands fired early, and the anti-replay window is open until we resync.",
  'lidar-injection': '{t} braked hard for a wall that was not there. The point cloud shows a building on an empty street.',
  'lidar-blinding': "{t}'s LiDAR returned a clear path through a cell tower. Vision caught it at forty meters.",
  'training-data-poisoning':
    "Last night's perception retrain pulled survey frames from a share we do not control. The new model behaves until it sees one particular marking.",
  'supply-chain-implant': 'A sensor package on {t} woke up and started talking on a frequency nobody assigned it. It shipped that way.',
  'insider-exfil':
    'The architecture binder was synced to a personal cloud account overnight. The access logs say the access was valid. That is the problem.',
}

export const HOOK: Record<string, string> = {
  'uplink-jamming': 'Why a ground transmitter can stop a satellite hearing you',
  'ops-phishing': 'One click, one stolen login, and the door is open',
  'pnt-jamming': 'Why drones lose their way when GPS goes quiet',
  'gnss-spoofing': 'How a fake GPS signal flies a drone off course',
  'downlink-eavesdropping': 'Anyone under the beam can listen in',
  'telemetry-replay': 'Old data, replayed, can hide a dying satellite',
  'lidar-dazzle': 'How a laser can dazzle a docking sensor',
  'debris-conjunction': "Space junk doesn't need a motive",
  'ground-ransomware': 'Why attackers hit the ground, not the satellite',
  'rogue-ground-station': 'Build your own dish, send your own commands',
  'backhaul-exfil': "Unencrypted satellite links leak more than you'd think",
  'blackout-chain': 'Knock out GPS, then fool the only sensor left',
  'time-spoof': 'Lie about the time and the whole schedule breaks',
  'lidar-injection': 'Laser pulses that paint obstacles that are not there',
  'lidar-blinding': "Make a real obstacle vanish from the drone's view",
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
export const HELD: Record<string, string> = {
  'uplink-jamming': 'The jam hit the filters and the nulling antennas kept the link. {t} never left the pass.',
  'pnt-jamming': 'The squadron kept its GNSS fix through the noise. No fallback, no setup for anything else.',
  'ops-phishing': 'The credential was phished and used. It opened one segment and nothing beyond it. Ops rotated it within the hour.',
  'gnss-spoofing': 'The counterfeit fix failed authentication and disagreed with the second constellation. Logged as a fault, flown as truth by nobody.',
  'downlink-eavesdropping': 'The receiver heard the beam. Everything on it was encrypted and keyed this week.',
  'telemetry-replay': 'Stale frames failed the freshness check. Ground saw the real {t} the whole time.',
  'lidar-dazzle': 'The LiDAR saturated; radar and vision outvoted it and the approach continued.',
  'ground-ransomware': 'The payload detonated inside one segment and the segment boundary held. Backups restored it by morning.',
  'rogue-ground-station': 'The forged command failed authentication and {t} ignored it. The dish is now a known location.',
  'backhaul-exfil': 'The backhaul carried only ciphertext. Whoever was listening got traffic patterns, not the data.',
  'blackout-chain': 'The injected point cloud lost the vote two to one. The chain broke at its second link.',
  'time-spoof': 'The drift failed the cross-check against the second timing source. Stored commands held for the resync.',
  'lidar-injection': 'Radar and vision outvoted the LiDAR. The squadron flew the real street.',
  'lidar-blinding': 'The obstacle vanished from the LiDAR and stayed on radar and vision. The drone went around it.',
  'training-data-poisoning': 'The retrain set failed its provenance check. The old model stayed in service.',
  'supply-chain-implant': 'Attested firmware refused the altered image at boot. The package never woke up.',
  'insider-exfil': 'Least privilege kept the binder out of reach, and the access alert fired on the attempt.',
}

// A threat's vector as its card's tag says it, upper case: RF ATTACK,
// SUPPLY CHAIN ATTACK. The debris is not an attack and says what it is.
export const vectorWord = (v: Vector) => vectorLabels[v].toUpperCase()
export const attackTag = (v: Vector) => (v === 'environmental' ? 'DEBRIS' : `${vectorWord(v)} ATTACK`)

// The overlay EXECUTE opens on, and the strike's banner.
export const MOVING = 'COLDVEIL IS MOVING'
// The HUD's label for a fall more than one live condition caused.
export const CONDITIONS_WORD = 'CONDITIONS'
export const STRIKE_HIT = 'COLDVEIL MOVES'
// A block is BLOCKED on the banner and the lesson head; HELD is the
// mission's (Ken, 22 October: question 5 of the R5 report).
export const STRIKE_HELD = 'BLOCKED'

// The hit card (brief 5.5 item 2).
export const hitHeader = (turn: number) => `COLDVEIL MOVES · TURN ${turn}`
export type Verdict = 'BLOCKED' | 'PARTIAL' | 'HIT'
export const blockedOf = (blocked: number, strength: number, chained: boolean) =>
  `${blocked} of ${strength} blocked${chained ? ' · chain added 1' : ''}`
export const streakLine = (n: number) => `×${n} DEFENSE STREAK`
export const NO_LOSS = 'NO LOSS'
export const NO_LOSS_SAVED = 'NO LOSS · SAVED'
export const STRENGTH = 'STRENGTH'
export const MORE = '▼ more below'
export const savedLabel = (saved: number) => `SAVED ${saved.toFixed(1)}`
export const SCORE_WORD = 'SCORE'
export const aimedTag = (landed: boolean, layer: string) => `${landed ? 'HIT' : 'AIMED AT'} ${layer}`
export const conditionTag = (name: string, turns: number) => `${name} · ${turns} TURNS`
export const WATCH_OFFICER = 'WATCH OFFICER'
export const integrityLine = (before: number, after: number) => `integrity ${before} → ${after}${after === 0 ? ' · LOST' : ''}`
export const NOT_DAMAGED = 'Not damaged. The hit was to the data, not the hardware.'
export const UNTOUCHED = 'Untouched. The defense held.'
// The outcome's word in the display face and the defense's name beside
// it in the mono (brief 8.5: a long name wrapped the display face across
// two heavy lines at 375).
export const HELD_WORD = 'BLOCKED'
export const REDUCED_WORD = 'REDUCED'
export const headName = (defense: string) => ` · ${defense.toUpperCase()}`
// What the block showed, said as it happened (R6 question 2): a defense
// that blocked a move tonight, not a claim that it always stops it.
export const canNowSay = (defense: string, threat: string) => ['You can now say it: ', defense, ' blocked ', threat, ' tonight.'] as const
export const reducedLine = (strength: number, through: number, defense: string) =>
  `Strength ${strength} came in; ${through} got through. ${defense} took the rest.`
export const CHAIN_REDUCED = 'GNSS was still denied, so the chain added a point before your defenses saw it.'
export const finishedIt = (defense: string, price: number) => ['Would have finished it: ', defense, `, ${price} CR.`] as const
export const UNDEFENDED = 'UNDEFENDED'
export const NOTHING_ANSWERS = 'Nothing you own answers this.'
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
export const repairQueued = (n: number) => `Repair bill queued for end of turn: -${n} CR`
// A hit to the data, not the hardware, still costs the night's response;
// it is a cleanup, not a repair (fresh-eyes review: "Not damaged" beside a
// repair bill).
export const cleanupQueued = (n: number) => `Incident cleanup queued for end of turn: -${n} CR`
export const cleanupOf = (move: string) => `${move} cleanup`
export const IN_DOSSIER = 'IN YOUR DOSSIER'
export const COLLECT = 'COLLECT INTEL CARD'
export const CONTINUE = 'CONTINUE'

// The intel card (brief 5.5 item 3).
export const NEW_INTEL = 'NEW INTEL'
export const DOSSIER_COUNT = 'COLDVEIL DOSSIER'
export const TECHNIQUE = 'TECHNIQUE'
export const SOURCE = 'SOURCE'
export const FILE_IT = 'FILE IT'

// Opportunities (brief 5.5 item 4): the setup, then what it did, in the
// game's words from the engine's record rather than its log line.
export const opportunityHeader = (turn: number) => `OPPORTUNITY · TURN ${turn}`
export const windfallLine = (n: number) => `+${n} CR to the program.`
export const briefFreeLine = (n: number) => `The intel brief is free for the next ${n} turns.`
export const expeditedLine = (sign: string) => `${sign} rides along: it arrives a turn sooner.`
export const resoldLine = (n: number) => `Nothing in transit to speed up, so the rideshare seat was sold: +${n} CR.`

// THE DEBRIS CALL (brief 5.5 item 5). The odds are said once, here, and
// the odds line and HOLD both say them in these words: the prototype's
// HOLD said "Roughly one chance in three" beside an odds line of 20 to 60
// percent, and v1.3 uses the odds line's wording in both places.
// tests/night-r3.dom.spec.tsx holds the two to the same phrase.
export const callHeader = (turn: number) => `YOUR CALL · TURN ${turn}`
export const DEBRIS_CHIP = 'DEBRIS'
export const odds = (ssa: boolean, chance: number) => (ssa ? `${Math.round(chance * 100)} percent` : 'somewhere between 20 and 60 percent')
export const oddsLine = (ssa: boolean, chance: number) =>
  [
    'Collision chance ',
    odds(ssa, chance),
    ssa ? '. Your space tracking service has three fixes on the debris.' : '. Without a space tracking service the track is coarse.',
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
    bonus === null ? '' : ` Off station tonight, it can cost the ${bonus} CR coverage bonus.`
  }`
export const holdLine = (ssa: boolean, chance: number, sat: string, review: number) =>
  `No fuel. ${sat} takes a collision chance of ${odds(ssa, chance)}; losing it costs a ${review} CR review.`
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
export const fuelNow = (n: number) => `Fuel charged now: -${n} CR`
export const reviewQueued = (n: number) => `Loss review queued for end of turn: -${n} CR`

// END OF TURN (brief 5.5 item 6): every line that made the budget.
export const endHeader = (turn: number) => `END OF TURN ${turn}`
export const LEFT_AFTER = "Left after tonight's orders"
export const REPAIRS = 'Repairs'
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
// How much faster the IR retainer recovers, read off the scenario: a
// whole number of times as a word, otherwise just "faster", and nothing
// claimed when it is no faster at all.
const TIMES = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
export const pace = (base: number, retained: number) => {
  const times = retained / base
  return Number.isInteger(times) && TIMES[times] ? `${TIMES[times]} times faster` : 'faster'
}
export const recoverySlow = (faster: string) => `Damaged systems repair slowly overnight. An incident response retainer makes it ${faster}.`
export const recoveryFast = (faster: string) => `Your incident response retainer repairs damaged systems ${faster} overnight.`
// The score's own lines (fresh-eyes review, section 4 rule 5: every total
// is checkable): what the live conditions took as the night opened, what
// tonight's moves took and what the defenses saved, and the overnight
// recovery, from the score the turn opened on to the one it closed on.
export const SCORE_LINES = 'MISSION ASSURANCE SCORE'
export const BUDGET_LINES = 'BUDGET'
export const SCORE_FROM = 'Start of turn'
export const SCORE_CONDITIONS = 'Ongoing conditions'
export const SCORE_MOVES = 'Tonight\'s moves'
export const savedNote = (n: number) => `saved ${n}`
export const SCORE_RECOVERY = 'Overnight recovery'
export const SCORE_RECOVERY_ARRIVALS = 'Overnight recovery and arrivals'
export const SCORE_TO = 'End of turn'
export const INSOLVENT = 'INSOLVENT'
export const INSOLVENT_LINE =
  'Repairs and defense costs are paid before funding arrives, and the budget could not cover them. The operation ends here.'
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
