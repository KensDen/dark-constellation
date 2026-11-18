// THE 3D GAME'S OWN WORDS (v2.0 R1), in one module so a reader can see
// every line the round added. The threats, the defenses, the responses,
// the watch officer's reports and the Dossier cards keep the content's own
// text (src/content, src/ui/night/nightCopy.ts); what is here is the new
// presentation's: the opening, the guide, the scan, the pieces, the timed
// tap, the streak, the replay and the unlocks. Nothing here states a fact
// about a real threat or defense that the deck's cards do not already
// carry. House rules: numerals, no em or en dashes.

import { ADVERSARY, CONSTELLATION, SQUADRON } from '../../config'

// THE OPENING: the briefing as a camera move over the theater, the watch
// officer's four lines from the 3D title prototype (10 November 2026).
export const OPENING: readonly { clock: string; line: string; threat?: true }[] = [
  { clock: '21:00Z', line: `${CONSTELLATION} will be 9 smallsats. Tonight 2 are up, with 1 inspection bird.` },
  { clock: '21:04Z', line: `Under it, the ${SQUADRON} squadron flies flood relief over 3 counties. Every frame they shoot comes home through us.` },
  { clock: '21:09Z', line: `${ADVERSARY} is working the doors tonight: the uplink, the navigation signal, the people at the consoles.`, threat: true },
  { clock: '21:12Z', line: 'You are the mission assurance architect. 6 nights. Finish night 6 at 70 or above, and learn how they work.' },
]
export const OPENING_SPEAKER = 'WATCH OFFICER'
export const OPENING_NEXT = 'CONTINUE'
export const OPENING_GO = 'TAKE THE WATCH'
export const OPENING_SKIP = 'SKIP'
export const openingCount = (n: number, of: number) => `Briefing ${n} of ${of}`

// THE GUIDE: the first night teaches by doing. One short line a step.
export const GUIDE = {
  scan: 'SCAN: tap a signature below to identify it.',
  place: 'PLACE: 1 new defense a night. Tap one that answers it, or drag it onto an asset.',
  // The one rule the night turns on, said where it first matters (v2.0
  // R5: through R4 it was only in HOW TO PLAY on the title, and that
  // round's desktop player met "COLDVEIL switches" with no rule behind it).
  begin: `Ready. ${ADVERSARY} reads your defenses and takes the move you cover least. BEGIN when your orders are set.`,
  respond: 'ANSWER: you have 3 for all 6 nights. Spend 1 here, or let it ride.',
  tap: 'TAP as the ring closes on the target for a bonus.',
  done: 'That is the whole watch: scan, place, answer. The words on the cards are explained in the menu, under THE WORDS.',
  hold: 'YOUR CALL: read the 3 checks, then override the block or let it stand.',
} as const
export const GUIDE_SKIP = 'Skip guide'

// The phases and the top bar.
export const nightOf = (n: number, of: number) => `NIGHT ${n} OF ${of}`
export const PHASE = { plan: 'YOUR ORDERS', night: 'THE NIGHT', dawn: 'DAWN', debrief: 'DEBRIEF', replay: 'AFTER ACTION', opening: 'BRIEFING' } as const
export const dailyTag = (n: number) => `DAILY OP #${n}`
export const SCORE = 'SCORE'
export const BUDGET = 'BUDGET'
export const winLine = (n: number) => `Win line ${n}`

// THE SCAN.
export const SCAN = 'SCAN'
export const UNIDENTIFIED = 'UNIDENTIFIED'
export const CONFIRMED = 'CONFIRMED'
export const ALLIED_FEED = 'ALLIED FEED: every signature tonight is identified.'
export const pulsesLeft = (left: number, of: number) => `${left} of ${of} pulse${of === 1 ? '' : 's'} left`
// Short enough to share a row with NAME IT ON SIGHT on a 375 px screen.
export const scanButton = (left: number) => `SCAN IT · ${left} LEFT`
export const NO_PULSES = 'No pulses left tonight'
export const scanHint = (tracks: number, sigs: number) =>
  tracks === 1 ? `${ADVERSARY} makes 1 move tonight: 1 of the ${sigs} signature${sigs === 1 ? '' : 's'} over the fleet.` : `${ADVERSARY} makes ${tracks} moves tonight, 1 from each track: ${sigs} signatures over the fleet.`
export const UNKNOWN_LEAD = 'Unidentified signature'
// On its own card the two words stand apart, the call sign between them,
// so the title is one line on a phone and the card's buttons are whole
// (v2.0 R4: on a 375 by 553 phone the two-line title pushed SCAN IT and
// NAME IT ON SIGHT under the card's edge).
export const UNKNOWN_EYEBROW = 'SIGNATURE'
export const UNKNOWN_TITLE = 'Unidentified'
export const unknownBody = (n: number) => (n > 1 ? `${ADVERSARY} is choosing between ${n} moves here, and plays 1 of them tonight. This is 1 of the ${n}.` : `${ADVERSARY} plays this move tonight.`)
export const KNOW_THE_LOOK = 'Know the look? Name it and spend no pulse. A wrong name ends naming for tonight.'
// THE NAME ON SIGHT (v2.0 R3): an unidentified signature named from its look.
export const SIGHT_BUTTON = 'NAME IT ON SIGHT'
export const SIGHT_ASK = 'Which is it?'
// One line on a phone: the card before the night keeps one height, and a
// longer line sat under the fade at its foot.
export const SIGHT_TERMS = 'Right saves a pulse. Wrong ends naming tonight.'
export const SIGHT_MISSED = 'A name was wrong, so naming is over for tonight. A scan pulse still identifies a signature.'
export const SIGHTED = 'NAMED ON SIGHT'
export const sightRight = (name: string) => `Named on sight: ${name}. No pulse spent.`
export const sightWrong = (name: string) => `Not ${name}. It stays unidentified, and naming is over for tonight. A scan can still name it.`
export const trackOf = (n: number, of: number) => `TRACK ${n} OF ${of}`
export const FAVOR = {
  confirmed: 'CONFIRMED: this move is coming.',
  likely: `${ADVERSARY} favors this move tonight.`,
  either: `${ADVERSARY} may play this or another on this track.`,
  unlikely: 'Your defenses take more off this one, so expect another move on this track.',
} as const
export const FAVOR_STOPPED = 'Your defenses stop this one. Expect another move on this track.'
export const DEBRIS_NOTE = 'Confirmed, and not an attack: debris on a crossing orbit. The call, burn or hold, is yours in the night.'
export const FAVOR_TAG = { confirmed: 'CONFIRMED', likely: 'LIKELY', either: 'POSSIBLE', unlikely: 'NOT FAVORED' } as const
export const aboutLoss = (d: number) => (d < -0.05 ? `About ${d.toFixed(1)} score if it lands.` : 'Your defenses stop it.')
export const scannedSay = (name: string) => `Identified: ${name}.`
export const LOOK = 'SIGNATURE'

// A threat's name on the world, where a chip has an asset's width: its
// own name cut short. The cards and the Dossier keep the full name.
export const TAG: Record<string, string> = {
  'pnt-jamming': 'PNT jamming',
  'uplink-jamming': 'Uplink jamming',
  'gnss-spoofing': 'GNSS spoofing',
  'time-spoof': 'Time spoof',
  'lidar-dazzle': 'LiDAR dazzle',
  'lidar-injection': 'LiDAR injection',
  'lidar-blinding': 'LiDAR blinding',
  'training-data-poisoning': 'Data poisoning',
  'supply-chain-implant': 'Firmware implant',
  'rogue-ground-station': 'Rogue station',
  'telemetry-replay': 'Replay',
  'downlink-eavesdropping': 'Eavesdropping',
  'backhaul-exfil': 'Exfiltration',
  'ground-ransomware': 'Ransomware',
  'ops-phishing': 'Phishing',
  'insider-exfil': 'Insider',
  'debris-conjunction': 'Debris',
  'blackout-chain': 'Blackout chain',
}

// THE KIT.
export const KIT = 'DEFENSES'
export const FLEET = 'FLEET'
export const ONE_A_NIGHT = '1 new defense a night'
export const TRAY_MORE = 'More defenses'
export const trayPage = (page: number, of: number) => `Page ${page} of ${of}`
export const TRAY_BACK = 'Back to the first defenses'
export const placeOn = (sign: string) => `PLACE ON ${sign}`
export const PLACED = 'PLACED'
export const TAKE_BACK = 'TAKE IT BACK'
export const OWNED = 'IN SERVICE'
export const PLACE_NOTE = 'It covers the whole fleet. Where it sits becomes the watch post: any strike on that asset is 1 weaker.'
// THE WATCH POST (v2.0 R2).
export const POST = 'POST'
export const POST_HERE = 'WATCH POST: strikes here are 1 weaker'
export const postLine = (sign: string) => `The watch post is on ${sign}: any strike there is 1 weaker.`
export const postMoves = (from: string, to: string) => `The watch post moves from ${from} to ${to}.`
export const BEST_SPOT = 'BEST SPOT'
// The piece cannot sit where the post is, and the post is holding down the
// night's costliest move: no spot is called best, and the card says what
// the piece gives up (v2.0 R4).
export const postCost = (sign: string, before: number, after: number) => `Placing it moves the watch post off ${sign}: AT STAKE goes from ${upTo(before)} to ${upTo(after)} tonight.`
export const postCostShort = (sign: string) => `moves the post off ${sign}: more at stake tonight`
export const fixCostsPost = (move: string, piece: string, sign: string) => `${move} got through. ${piece} answers it, but placing it tomorrow would cost the watch post on ${sign}. Keep an answer for it.`
export const wouldSwitch = (piece: string, price: number, verb: string, move: string, other: string, inPlaceOf?: string) =>
  `${piece}, ${price} CR, ${verb} ${move}. Tonight${inPlaceOf ? `, in place of ${inPlaceOf},` : ''} COLDVEIL would have switched to ${other}.`
export const spotWhy = (sign: string, n: number) => (n > 0 ? `Most is aimed at ${sign} tonight.` : `Nothing is aimed where it can sit: ${sign} is as good as any.`)
export const postTook = (n: number) => `Watch post -${n}`
export const cantAfford = (need: number) => `Needs ${need} CR more`
export const placedSay = (name: string, sign: string) => `${name} placed on ${sign}.`
export const removedSay = (name: string) => `${name} taken back.`
export const replaces = (name: string) => `Replaces ${name} tonight.`
export const dragHint = 'Drag it onto a lit asset, or tap one of the buttons.'
export const answersTonight = 'ANSWERS TONIGHT'
export const nothingKnown = 'Answers nothing you have identified tonight.'
export const upkeepNote = (n: number) => `${n} CR a night to keep.`
export const arrivesIn = (n: number) => `arrives in ${n} night${n === 1 ? '' : 's'}`
export const ORDERED = 'ORDERED'
// One line on a phone, so the card's first row of orders is whole.
export const fleetLead = 'More fleet, more coverage: 30% of the score.'
// THE COVERAGE BONUS, SAID WHERE IT IS MISSED (v2.0 R5). The starting fleet
// covers 58 and the bonus line is 60: a player who never orders an asset
// plays the whole operation 10 CR a dawn poorer, and through R4 nothing
// said so outside THE WORDS (the bot's two players who order no asset were
// its two weak games). The fleet's card leads with it while the fleet is
// under the line, and the dawn's budget line says what was missed.
const whole = (n: number) => String(Math.floor(n * 10) / 10)
export const fleetShort = (now: number, min: number, credits: number) => `Coverage ${whole(now)}: at ${min} it pays ${credits} CR every dawn.`
export const noBonus = (read: number, min: number) => `No coverage bonus (${whole(read)} of ${min})`
export const coverageOf = (n: number) => `+${n} coverage`

// THE STAKES.
export const AT_STAKE = 'AT STAKE'
export const upTo = (d: number) => (d < -0.05 ? d.toFixed(1) : '0')
export const WORST = 'WORST CASE'
export const WORST_OK = 'budget left'
export const WORST_BAD = 'budget breaks'
// THE ANSWERS (v2.0 R2): a pool for the whole operation.
export const ANSWERS = 'ANSWERS'
export const answersLeft = (n: number, of: number) => `${n} of ${of} answer${of === 1 ? '' : 's'} left for the operation`
export const answersNote = (n: number, nightsLeft: number) => (n === 0 ? 'No answers left: a defense is all that stops a move now.' : `${n} answer${n === 1 ? '' : 's'} left for ${nightsLeft === 0 ? 'tonight' : `tonight and ${nightsLeft} more night${nightsLeft === 1 ? '' : 's'}`}.`)
export const ONE_ANSWER = '1 ANSWER'
export const NO_ANSWERS = 'NO ANSWERS LEFT'
export const ALSO_TONIGHT = 'ALSO TONIGHT'
export const SIGNATURES = 'TONIGHT'
export const signaturesOver = (n: number) => `${n} signature${n === 1 ? '' : 's'} tonight. Tap one.`
// A chance under the mark's bar, in tenths: what "possible, not likely"
// comes to. Under 1 in 20 the worst case needs every call to go wrong.
export const fewInTen = (chance: number) => (chance < 0.05 ? 'under 1 in 10' : `about ${Math.min(5, Math.max(1, Math.round(chance * 10)))} in 10`)
// WORST CASE, for the tile's tooltip and a screen reader: the three things
// it can say (v2.0 R5).
export const worstNote = (n: number, risky: boolean, tonight = 0) =>
  n >= 0
    ? risky
      ? 'The budget survives tonight at its worst, but tomorrow night is likely to break it.'
      : 'The budget tomorrow morning if tonight goes as badly as it can, funding included.'
    : risky
      ? 'The budget is likely to break. A budget under 0 at dawn ends the operation.'
      : `Tonight at its very worst would break the budget, and that ends the operation. It is possible, not likely: ${fewInTen(tonight)}.`
export const BEGIN = 'BEGIN'
export const BEGIN_LONG = 'Begin the night'
export const BEGIN_AT_RISK = 'BEGIN AT RISK'
// THE MARK (v2.0 R5, Ken's ruling of 17 November 2026: a mark must be
// right more often than not). It is raised only when a broken budget is
// more likely than not by tomorrow night's close, and it says how likely.
// Said without "tomorrow" where there is none.
export const RISKY = 'Risky: likely to break the budget'
// How likely, in tenths. The mark is raised above 5 in 10, so it never
// reads less than 6; past 19 in 20 it is said as what it is.
const SURE = 0.95
export const inTen = (odds: number) => `about ${Math.min(9, Math.max(6, Math.round(odds * 10)))} in 10`
// On a piece or a fleet order: what placing it would do. `soon` is whether
// tonight alone is the likely break.
export const riskyBy = (odds: number, soon: boolean) => {
  const when = soon ? 'tonight' : 'by tomorrow night'
  return odds > SURE ? `Risky: with it the budget is all but certain to break ${when}` : `Risky: with it the budget is likely to break ${when}, ${inTen(odds)}`
}
// A piece that would leave the tile short with no mark (v2.0 R5): no mark
// on the tray and no second BEGIN, because 2 times in 3 nothing comes of
// it, but it is said, with its odds, wherever the piece is chosen: on its
// card, on the signature's card, and by the watch officer once it is set
// down. (The bot's careful Daily Op player ended an operation on such a
// night, 10 CR short on the tile in amber, before these lines were there.)
export const tightBy = (worst: number, tonight: number) => `With it WORST CASE reads ${worstFace(worst)}: possible, not likely (${fewInTen(tonight)}).`
export const tightSay = (worst: number, tonight: number) => `WORST CASE now reads ${worstFace(worst)}: possible, not likely (${fewInTen(tonight)}).`
// BEGIN on a night that is likely to break the budget, said with what the
// player can do about it. It opens on the tile's own figure, so one screen
// never shows two. `worst` is that figure (under 0 when tonight's worst
// alone breaks the budget); `ordered` is whether tonight's orders cost
// anything, so "take an order back" is never said to a player with
// nothing to take back.
export const riskLine = (worst: number, odds: number, soon: boolean, ordered: boolean) => {
  const fix = ordered ? 'Take an order back, or tap BEGIN again.' : 'Nothing is ordered: a move you answer leaves no repair bill. Tap BEGIN again.'
  const lead = `WORST CASE: ${worstFace(worst)}`
  const sure = odds > SURE
  if (soon) return `${lead}, and it is ${sure ? 'all but certain' : `the likely case (${inTen(odds)})`}: tonight's repairs and upkeep would take the budget under 0 at dawn, and that ends the operation. ${fix}`
  return `${lead}, and tomorrow night is ${sure ? 'all but certain' : 'likely'} to need more${sure ? '' : ` (${inTen(odds)})`}: a budget under 0 at dawn ends the operation. ${fix}`
}
// A night begun with no new defense, asked about once (v2.0 R3).
export const BARE_LINE = 'No defense placed tonight, and you have 1 to place. Tap BEGIN again to go without.'
export const cannotSit = (piece: string, sign: string) => `${piece} cannot sit on ${sign}. Its card lists where it can.`
// WORST CASE on the plan card, said as what the budget would read at dawn
// or how far short it would be: a bare "1 CR" read as "I lose 1 credit"
// (the R3 phone review), and "left" was the budget before the night's
// funding, up to 17 CR under what dawn then showed (the R4 reviews).
export const worstFace = (n: number) => (n < 0 ? `${-n} CR short` : `${n} CR at dawn`)
// On the tile itself, where a phone has room for 11 characters: the unit
// is the BUDGET tile's, straight above it.
export const worstTile = (n: number) => (n < 0 ? `${-n} CR short` : `${n} at dawn`)
export const orderLine = (defense: string | null, assets: number, scans: number) =>
  [defense ? `${defense} placed` : 'No new defense yet', assets ? `${assets} asset${assets === 1 ? '' : 's'} ordered` : '', `${scans} scanned`].filter(Boolean).join(' · ')

// THE NIGHT.
export const NIGHT_FALLS = 'Night falls over the area of operations.'
export const pressed = (names: string, d: number) => `${names} ${d.toFixed(1)}`
export const strikeOf = (n: number, of: number) => `MOVE ${n} OF ${of}`
// Why an answer cannot be taken, in the figures the rule reads: its price
// and the repair it leaves must both fit in what is free.
export const needs = (need: number, room: number, repair: boolean, last: boolean) => `Needs ${need} CR${repair ? ' with its repair' : ''}; ${Math.max(0, room)} CR is free after tonight's bills${last ? '' : ' and the nights ahead'}`
export const freeForAnswer = (room: number, budget: number, last: boolean) => `${Math.max(0, room)} CR free for an answer: the budget of ${budget} CR, less tonight's bills${last ? '' : ' and what the nights ahead need'}.`
export const moreToCome = (n: number) => (n > 0 ? `${n} more move${n === 1 ? '' : 's'} to come tonight, and 1 answer between them.` : '')
export const LAST_MOVE = 'The last move tonight.'
export const NO_BLOCK = 'Nothing blocks this one outright: its answer takes half.'
export const ANSWER_USED = 'ANSWER ALREADY USED'
// A signature that moved when an order changed: COLDVEIL reads the fleet.
export const REAIMED = 'COLDVEIL re-aims as your orders change: a signature moved.'
export const RISK_MARK = 'Likely to break the budget'
export const CHOOSE_UNLOCK = 'Change the look in SYSTEM, the menu at the top left.'
export const WHAT_HAPPENED = 'WHAT HAPPENED'
export const CONDITION_NOTE = 'It presses the score each night it stays.'
export const DRAG_ANSWER = 'Drag an answer onto the target, or tap it.'
export const GESTURE = {
  reroute: 'Drag the target’s link to another asset',
  isolate: 'Tap the target to isolate it',
  shield: 'Drag this onto the target',
} as const
export const GESTURE_TAG = { reroute: 'REROUTE', isolate: 'ISOLATE', shield: 'SHIELD' } as const
export const TAP = 'TAP'
export const TAP_HINT = 'Tap as the ring closes'
export const ASSIST_ON = 'ASSIST: braced for you'
export const WHY_HELD = 'WHY IT HELD'
export const WHY_RESPONSE = 'WHAT YOU DID'
export const NEXT_STRIKE = 'NEXT MOVE'
export const SEE_DAWN = 'SEE THE DAWN'
export const GOOD_NEWS = 'GOOD NEWS'
export const alliedLine = (n: number) => (n <= 0 ? 'An allied tracking feed comes on line as the operation ends.' : n === 1 ? 'An allied tracking feed identifies every signature tomorrow night.' : `An allied tracking feed identifies every signature for the next ${n} nights.`)
export const CHAIN = 'BLACKOUT CHAIN'
export const CHAIN_LINE = `${ADVERSARY}'s signature move: jam GNSS, then fool the only sensor left.`

// THE DEBRIS CALL.
export const YOUR_CALL = 'YOUR CALL'
export const BURN_DRAG = 'Or drag the satellite off its orbit to burn.'

// DAWN.
export const dawnOf = (n: number) => `DAWN · NIGHT ${n}`
export const CLEAN = 'A CLEAN NIGHT'
export const stoppedOf = (n: number, of: number, halved = 0, partial = 0) => `${n} OF ${of} STOPPED${halved ? ` · ${halved} HALVED` : ''}${partial ? ` · ${partial} PARTIAL` : ''}`
// What the next grade takes, said under the grade (v2.0 R3): the round's
// reviewers finished with nothing telling them what an A needs.
export const nextGradeLine = (next: { grade: string; from: number } | null, easyTop: boolean) =>
  next ? `${next.grade} is graded from ${next.from.toFixed(1)}.` : easyTop ? 'A is the top grade on EASY: S is earned on STANDARD.' : ''
export const STRIP_LEGEND = 'A night a square: green held, amber slipped, red fell 3 or more or lost an asset.'
export const SAVE_CODE_NOTE = 'A save code is this operation as text. Paste it into SYSTEM on the title, on any device, to read this debrief again.'
export const CHART = { you: 'you', ghost: 'ghost', line: 'win line' } as const
export const tonight = (d: number) => (Math.abs(d) < 0.05 ? 'held through the night' : `${d > 0 ? '+' : ''}${d.toFixed(1)} tonight`)
export const toLine = (score: number, line: number) => (score >= line ? `${(score - line).toFixed(1)} above the win line` : `${(line - score).toFixed(1)} under the win line`)
export const arrived = (signs: string) => `${signs} on station.`
export const nextNight = (n: number) => `NIGHT ${n}`
export const STREAK = 'WATCH RING'
export const streakSay = (n: number) => (n >= 6 ? 'The watch ring is complete.' : n >= 3 ? `Block streak ${n}: the watch ring is holding.` : n > 0 ? `Block streak ${n}.` : 'The watch ring is dark.')
export const TO_DEBRIEF = 'DEBRIEF'

// THE DEBRIEF.
export const GRADE = 'GRADE'
export const FINAL = 'FINAL SCORE'
export const NEXT_TIME = 'NEXT TIME'
export const REPLAY = 'REPLAY THE NIGHTS'
export const DOSSIER = 'DOSSIER'
export const SHARE = 'SHARE RESULT'
export const SHARED = 'Result copied.'
export const AGAIN = 'PLAY AGAIN'
export const TITLE = 'BACK TO TITLE'
export const SAVE_CODE = 'SAVE CODE'
export const COPY_CODE = 'COPY SAVE CODE'
export const TIME = 'TIME'
export const PRACTICE_DAILY = 'A practice run: today already has its official result.'
export const OFFICIAL_DAILY = 'This is today’s official result.'
export const UNLOCKED = 'EARNED'
export const ghostLead = { change: 'The ghost is this game played again with what NEXT TIME says.', coach: 'The ghost is a careful watch on the same nights.' } as const

// THE AFTER-ACTION REPLAY.
export const YOU = 'YOU'
export const GHOST = 'GHOST'
export const PLAY_NIGHT = 'PLAY THIS NIGHT'
export const BACK_TO_DEBRIEF = 'BACK TO DEBRIEF'
export const ghostPlaced = (name: string) => `Ghost placed ${name}.`
export const youPlaced = (name: string) => `You placed ${name}.`
export const NOTHING_PLACED = 'No defense placed.'
export const endsAt = (who: string, score: number) => `${who} ${score.toFixed(1)}`
export const REPLAY_NONE = 'This record cannot be replayed on this device.'

// THE DOSSIER.
export const DOSSIER_HEAD = `${ADVERSARY} DOSSIER`
export const filedOf = (n: number, of: number) => `${n} of ${of} filed`
export const UNFILED = 'UNFILED'
export const UNFILED_LINE = 'Face this move in play to file it. Its signature is shown so you know it when you see it.'
export const hitYou = (n: number, sign: string) => `Hit you ${n} time${n === 1 ? '' : 's'}${sign ? `, last on ${sign}` : ''}.`
export const blockedIt = (n: number) => `Blocked ${n} time${n === 1 ? '' : 's'}.`
export const passedYou = (n: number) => `Passed without a loss ${n} time${n === 1 ? '' : 's'}.`
export const NOT_MET = 'No hit or block on this device’s record yet.'
export const SOURCES = 'SOURCES'
export const LEARN_MORE = 'LEARN MORE'
export const READINGS = 'OPEN THE READING LIST'

// SYSTEM AND UNLOCKS.
export const SYSTEM = 'SYSTEM'
// THE WORDS (v2.0 R3). Round 2's first-time reviewer finished a game
// without working out PNT, GNSS, RPO, SSA, the frameworks' names, what
// blunts means beside stops, or what WORST CASE is in CR. Each in a line,
// in SYSTEM, where a player who is stuck looks. The numbers are passed in.
export const WORDS = 'THE WORDS'
export const wordsFor = (n: { coverageMin: number; coverageBonus: number; harden: number; collapse: number; answers: number; pulses: number }): readonly (readonly [string, string])[] => [
  ['SIGNATURE, TRACK', `A signature is a move ${ADVERSARY} could make tonight, shown over the asset it would strike. A track is a set of them: ${ADVERSARY} plays 1 from each track.`],
  ['STRENGTH', 'The red dots on a move, 1 to 3. Each point that gets through costs score.'],
  ['SCAN, NAME ON SIGHT', `A scan pulse identifies 1 signature, and you have ${n.pulses} a night. Naming one from its look costs no pulse, but the first wrong name ends naming for the night.`],
  ['DEFENSES', 'You place 1 new defense a night, and keep it. It covers the whole fleet against the moves it answers, every night.'],
  ['ANSWERS', `What you do in the night when a move would land: block it, halve it, or ride it out. You have ${n.answers} for the whole operation.`],
  ['HOLD', 'Your own policy engine stopped one of your assets. Read the 3 checks: override the block if all are clean, let it stand if any is not.'],
  ['CONDITIONS', 'Some hits linger (jammed, spoofed, ransomed). A condition takes a little score at the start of each night until it lifts.'],
  ['STREAK, DEFENSE BONUS', 'Moves stopped in a row. Your best streak and the points your defenses saved add a few points to the score your grade is read from.'],
  ['GNSS', 'Satellite navigation, GPS among it. The drones steer by it.'],
  ['PNT', 'Position, navigation and timing: what GNSS gives the fleet.'],
  ['LiDAR', 'A laser range sensor. The drones and the inspection satellite see with it.'],
  ['RPO', 'Rendezvous and proximity operations: one satellite working close to another.'],
  ['SSA', 'Space situational awareness: tracking what else is in orbit, debris included.'],
  ['SPARTA, ATT&CK, ATLAS', 'Public catalogs of attack techniques: for space systems, for networks, and for AI. Every threat here cites one.'],
  ['STOPS, BLUNTS', 'A defense that stops a move takes all of its strength. One that blunts it takes some, and the rest lands.'],
  ['LIKELY, POSSIBLE, NOT FAVORED', `What ${ADVERSARY} does with a move on a track: it plays the one your defenses take the least off.`],
  ['WATCH POST', `The asset your newest defense sits on. Any strike there lands ${n.harden} point weaker.`],
  ['AT STAKE', 'The most score tonight could take, if the worst move on each track landed as things stand.'],
  ['WORST CASE', 'The budget tomorrow morning if tonight goes as badly as it can, with funding and the coverage bonus in. If it reads short, that night would end the operation: a budget under 0 at dawn does.'],
  ['RISKY', 'Marked on an order, and asked about at BEGIN, only when a broken budget is more likely than not by tomorrow night.'],
  ['UPKEEP, RECOVERY', 'Upkeep is what each defense costs every night. Recovery is what each meter gets back at dawn.'],
  ['COVERAGE', `The fleet's share of the score. At ${n.coverageMin} or more it also pays ${n.coverageBonus} CR at dawn.`],
  ['SCORE', `Mission assurance, 0 to 100: coverage, links, data and sensors together. Under ${n.collapse} ends the operation.`],
]
export const ASSIST = 'Assist'
export const ASSIST_NOTE = 'The timed tap is granted at a steady, modest rate. No timing needed.'
export const LOW_POWER = 'Low power'
export const LOW_POWER_NOTE = 'Lower resolution, fewer particles, half the frame rate.'
export const MOTION = 'Reduce motion'
export const SOUND = 'Sound effects'
export const MUSIC = 'Music'
export const SKIN = 'FLEET FINISH'
export const POSTURE = `${ADVERSARY} POSTURE`
export const OPENING_PICK = 'OPENING'
// The world could not be drawn (no WebGL): the game is the 3D game, and
// the reading still opens.
export const NO_3D = 'This device could not start the 3D view, and the game needs it. The Dossier and the Library still open from the title.'
export const REPLAY_GUIDE = 'Replay the guide'
export const REPLAY_BRIEFING = 'Replay the briefing'
export const SKINS = {
  standard: { name: 'Standard', how: '' },
  foil: { name: 'Gold foil', how: 'Finish 1 operation.' },
  nightwatch: { name: 'Night watch', how: 'Win 1 operation.' },
  signal: { name: 'Signal white', how: 'File 9 Dossier cards.' },
} as const
export const POSTURES = {
  standard: { name: 'As briefed', how: '', note: '2 scan pulses a night.' },
  dark: { name: 'Running dark', how: 'Win on STANDARD.', note: `${ADVERSARY} emits less: 1 scan pulse a night. Applies to your next operation.` },
} as const
export const OPENINGS = {
  standard: { name: 'From the day side', how: '' },
  polar: { name: 'Over the pole', how: 'Finish 2 operations.' },
} as const
export const LOCKED = 'LOCKED'

// THE TIE-BREAK (v2.0 R2, Ken's mechanic of 14 November 2026). The hold's
// own words (the action, the rule, the checks) are content
// (src/content/holds.ts); these are the frame around them.
export const HOLD_HEAD = 'POLICY ENGINE · HOLD'
export const holdLead = (sign: string) => `The fleet's own defense has stopped ${sign}.`
export const RULE_TRIPPED = 'RULE TRIPPED'
export const EVIDENCE = 'EVIDENCE'
export const OVERRIDE = 'OVERRIDE'
export const OVERRIDE_SUB = 'Let it go ahead'
export const STAND = 'LET IT STAND'
export const STAND_SUB = 'Keep the block'
export const holdClock = (s: number) => `${s} s: no call, and the block stands`
export const HOLD_NO_CLOCK = 'No clock on this one. Take your time.'
export const HOLD_VERDICT = { right: 'RIGHT CALL', wrong: 'WRONG CALL', none: 'NO CALL' } as const
export const HOLD_TRUTH = { compromised: 'It was compromised', clean: 'A false positive' } as const
export const youCalled = { override: 'You overrode the block.', stand: 'You let the block stand.', none: 'The clock ran out and the block stood.' } as const
export const holdTell = (labels: readonly string[]) => (labels.length ? `The tell: ${labels.join(', and ')}.` : 'Every check was clean: the rule tripped on something unusual, and nothing else was wrong.')
export const holdCost = (d: number) => `Cost ${d.toFixed(1)} score`
// Under a right call: said so that it cannot read as a penalty paid.
export const holdSaved = (d: number) => `Nothing lost. A wrong call would have cost ${d.toFixed(1)}.`
export const HOLD_NO_COST = 'nothing lost'
export const holdStakes = (d: number) => `A wrong call costs about ${d} points of score, either way.`
export const POST_STOPPED = 'The watch post stopped it: your newest defense sits on the asset it was aimed at, and a strike there is 1 weaker.'
export const LOGGED = 'Logged'
export const loggedAs = (n: number) => `Entry ${n} in the override log.`
export const HOLD_LOG = 'THE TIE-BREAKS'
export const holdLogLead = (right: number, of: number, none = 0) => `${of} hold${of === 1 ? '' : 's'}, ${right} called right${none ? `, ${none} left to the clock` : ''}.`
export const MACHINE_RIGHT = 'The machine was right this time.'
export const MACHINE_WRONG = 'The machine was wrong, and nobody said so.'
export const HIC_LINE = 'People write the policy. Machines enforce it. A person owns the tie-break.'
export const HIC_TERM = 'HUMAN IN COMMAND'
export const holdRow = (night: number, sign: string) => `Night ${night} · ${sign}`
export const CALLED = { override: 'OVERRODE', stand: 'LET IT STAND', none: 'NO CALL' } as const
export const NO_HOLDS = 'The policy engine raised no hold this operation.'
export const LOADING = 'Bringing the theater up'
// A room whose chunk never arrived (the debrief, the Dossier, SYSTEM).
export const ROOM_UNAVAILABLE = 'This screen could not load. Check the connection and try again.'
export const ROOM_BACK = 'BACK'

// NAME THAT SIGNATURE (v2.0 R2): a round in the Dossier on the cards filed.
export const QUIZ = 'NAME THAT SIGNATURE'
export const QUIZ_LOCKED = (n: number) => `File ${n} more card${n === 1 ? '' : 's'} to play.`
export const QUIZ_LEAD = 'Know it on sight and you need no scan pulse to name it.'
export const quizRound = (n: number, of: number) => `${n} OF ${of}`
export const QUIZ_RIGHT = 'RIGHT'
export const quizWrong = (name: string) => `It was ${name}.`
export const quizEnd = (n: number, of: number, best: number) => `${n} of ${of} named. Best on this device: ${best} of ${of}.`
export const QUIZ_AGAIN = 'ANOTHER ROUND'
export const QUIZ_NEXT = 'NEXT'
export const QUIZ_DONE = 'BACK TO THE CARDS'
