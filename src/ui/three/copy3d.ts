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
  scan: 'SCAN: tap a signature over the fleet to identify it.',
  place: 'PLACE: drag a defense onto an asset, or tap one to place it.',
  begin: 'Ready. BEGIN THE NIGHT when your orders are set.',
  respond: 'RESPOND: drag an answer onto the target, or let it ride.',
  tap: 'TAP as the ring closes on the target for a bonus.',
  done: 'That is the whole watch: scan, place, respond.',
} as const
export const GUIDE_SKIP = 'Skip guide'

// The phases and the top bar.
export const nightOf = (n: number, of: number) => `NIGHT ${n} OF ${of}`
export const PHASE = { plan: 'BEFORE THE NIGHT', night: 'THE NIGHT', dawn: 'DAWN', debrief: 'DEBRIEF', replay: 'AFTER ACTION', opening: 'BRIEFING' } as const
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
export const scanButton = (left: number) => `SCAN IT · 1 PULSE (${left} LEFT)`
export const NO_PULSES = 'No pulses left tonight'
export const scanHint = (tracks: number, sigs: number) =>
  `${sigs} signature${sigs === 1 ? '' : 's'} on ${tracks} track${tracks === 1 ? '' : 's'} tonight. ${ADVERSARY} plays 1 move a track.`
export const UNKNOWN_LEAD = 'Unidentified signature'
export const unknownBody = (n: number) => (n > 1 ? `1 of ${n} moves this track could play tonight.` : 'The move this track plays tonight.')
export const KNOW_THE_LOOK = 'Know the look? Every card you file in the Dossier shows its signature.'
export const trackOf = (n: number, of: number) => `TRACK ${n} OF ${of}`
export const FAVOR = {
  confirmed: 'CONFIRMED: this move is coming.',
  likely: `${ADVERSARY} favors this move tonight.`,
  either: `${ADVERSARY} may play this or another on this track.`,
  unlikely: 'Your defenses cover this one. Expect another move on this track.',
} as const
export const FAVOR_TAG = { confirmed: 'CONFIRMED', likely: 'LIKELY', either: 'POSSIBLE', unlikely: 'COVERED' } as const
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
export const placeOn = (sign: string) => `PLACE ON ${sign}`
export const PLACED = 'PLACED'
export const TAKE_BACK = 'TAKE IT BACK'
export const OWNED = 'IN PLACE'
export const cantAfford = (need: number) => `Needs ${need} CR more`
export const placedSay = (name: string, sign: string) => `${name} placed on ${sign}.`
export const removedSay = (name: string) => `${name} taken back.`
export const replaces = (name: string) => `Replaces ${name} tonight.`
export const dragHint = 'Drag it onto a lit asset, or tap a button below.'
export const answersTonight = 'ANSWERS TONIGHT'
export const nothingKnown = 'Answers nothing you have identified tonight.'
export const upkeepNote = (n: number) => `${n} CR a night to keep.`
export const arrivesIn = (n: number) => `arrives in ${n} night${n === 1 ? '' : 's'}`
export const ORDERED = 'ORDERED'
export const fleetLead = 'More assets cover more ground. Coverage is 30% of the score.'
export const coverageOf = (n: number) => `+${n} coverage`

// THE STAKES.
export const AT_STAKE = 'AT STAKE TONIGHT'
export const upTo = (d: number) => (d < -0.05 ? `up to ${d.toFixed(1)}` : 'nothing')
export const WORST = 'WORST CASE'
export const worstNote = (n: number) => (n < 0 ? 'A bad night would break the budget.' : 'The budget survives a bad night.')
export const BEGIN = 'BEGIN THE NIGHT'
export const orderLine = (defense: string | null, assets: number, scans: number) =>
  [defense ? `${defense} placed` : 'No defense placed', assets ? `${assets} asset${assets === 1 ? '' : 's'} ordered` : '', `${scans} scanned`].filter(Boolean).join(' · ')

// THE NIGHT.
export const NIGHT_FALLS = 'Night falls over the area of operations.'
export const pressed = (names: string, d: number) => `${names} ${d.toFixed(1)}`
export const strikeOf = (n: number, of: number) => `STRIKE ${n} OF ${of}`
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
export const NEXT_STRIKE = 'NEXT STRIKE'
export const SEE_DAWN = 'SEE THE DAWN'
export const GOOD_NEWS = 'GOOD NEWS'
export const alliedLine = (n: number) => `An allied tracking feed identifies every signature for the next ${n} nights.`
export const CHAIN = 'BLACKOUT CHAIN'
export const CHAIN_LINE = `${ADVERSARY}'s signature move: jam GNSS, then fool the only sensor left.`

// THE DEBRIS CALL.
export const YOUR_CALL = 'YOUR CALL'
export const BURN_DRAG = 'Drag the satellite along its orbit to burn, or choose below.'

// DAWN.
export const dawnOf = (n: number) => `DAWN · NIGHT ${n}`
export const CLEAN = 'A CLEAN NIGHT'
export const stoppedOf = (n: number, of: number) => `${n} OF ${of} STOPPED`
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
export const ghostLead = { change: 'The ghost run is this game with that 1 change.', coach: 'The ghost run is a careful watch on the same nights.' } as const

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
export const NOT_MET = 'Not met in the 3D game on this device yet.'
export const SOURCES = 'SOURCES'
export const LEARN_MORE = 'LEARN MORE'
export const READINGS = 'OPEN THE READING LIST'

// SYSTEM AND UNLOCKS.
export const SYSTEM = 'SYSTEM'
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
export const CLASSIC = 'Open the classic pixel board'
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
