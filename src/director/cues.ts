// Cue registry (game-feel brief v0.5 section 6, principle 7). Hand-keyed
// by the deck's event, condition and countermeasure ids plus the
// director's beat kinds. Round 2 shipped placeholders; Round 3 fills every
// visual slot and Round 4d fills every sound slot, so the battery now fails
// on a placeholder in either channel as well as on a missing entry.
//
// This map is deliberately written by hand rather than generated from the
// content data: generating it would make the coverage test vacuous. Adding
// an event to the deck must fail the battery until someone decides what
// that event looks and sounds like.

import type { BeatKind } from './types'

// The visual treatments the presentation layer implements. Each maps to a
// CSS class or a component behaviour; 'silent' is a real decision (the
// beat carries a patch but renders nothing), not an absence.
export type VisualCue =
  | 'placeholder'
  | 'silent'
  | 'transmission'
  | 'all-clear'
  | 'card-hostile'
  | 'card-friendly'
  | 'badge-attach'
  | 'badge-tick'
  | 'badge-clear'
  | 'meter-ease'
  | 'strobe'
  | 'blackout'
  | 'token-burn'
  | 'ribbon'
  | 'asset-light'
  | 'outcome-sweep'
  | 'tile-press'
  | 'shake-flash'

// The synthesized voices the audio layer implements, one function per cue
// (brief section 7). 'silent' is a real decision exactly as it is on the
// visual side: the beat carries a patch and makes no sound. 'placeholder'
// is kept in the union, and kept failing the battery, so that reverting a
// slot to it is a mutation someone can actually write.
// The scenes Round 5 promoted from a baseline class to a structure the
// player can read. Named here rather than in the component so the section
// 6 table and the renderer cannot disagree about which rows have one.
export type SceneName = 'blackout' | 'commendation' | 'victory' | 'defeat'

export type SoundCue =
  | 'placeholder'
  | 'silent'
  | 'data-burst'
  | 'all-clear'
  | 'buy-click'
  | 'denied-buzz'
  | 'execute-sweep'
  | 'hit-stab'
  | 'alarm-gnss'
  | 'alarm-uplink'
  | 'alarm-spoof'
  | 'alarm-eavesdrop'
  | 'alarm-exfil'
  | 'alarm-ransom'
  | 'soft-tick'
  | 'resolve-chime'
  | 'tick-up'
  | 'tick-down'
  | 'warn-low'
  | 'relief-chime'
  | 'blackout-chain'
  | 'surge-burn'
  | 'commendation-fanfare'
  | 'arrive-chime'
  | 'victory-fanfare'
  | 'defeat-sting'

export interface Cue {
  label: string
  visual: VisualCue
  sound: SoundCue
}

const cue = (label: string, visual: VisualCue, sound: SoundCue): Cue => ({ label, visual, sound })

// The CSS class each visual applies to the element that carries it. A
// treatment with no class of its own (it is expressed by a component's
// own structure) maps to the empty string.
export const VISUAL_CLASS: Record<VisualCue, string> = {
  placeholder: '',
  silent: '',
  transmission: 'dc-transmission-in',
  'all-clear': 'dc-all-clear',
  'card-hostile': 'dc-card-in',
  'card-friendly': 'dc-card-in',
  'badge-attach': 'dc-badge-attach',
  'badge-tick': 'dc-badge-tick',
  'badge-clear': 'dc-badge-clear',
  'meter-ease': '',
  strobe: 'dc-strobe',
  blackout: 'dc-blackout',
  'token-burn': 'dc-token-burn',
  ribbon: 'dc-ribbon-in',
  'asset-light': 'dc-asset-light',
  'outcome-sweep': 'dc-card-in',
  'tile-press': '',
  'shake-flash': 'dc-shake',
}

// How long each treatment runs, matching the stylesheet. The cue helper
// removes its class when the animation is over, so a value shorter than
// the animation would cut it off mid-frame and snap the element back.
// tests/cues.spec.ts reads these out of index.css, so the two cannot drift.
export const VISUAL_MS: Record<VisualCue, number> = {
  placeholder: 0,
  silent: 0,
  transmission: 320,
  'all-clear': 520,
  'card-hostile': 260,
  'card-friendly': 260,
  'badge-attach': 420,
  'badge-tick': 700,
  'badge-clear': 520,
  'meter-ease': 0,
  strobe: 0,
  blackout: 900,
  'token-burn': 560,
  ribbon: 420,
  'asset-light': 900,
  'outcome-sweep': 260,
  'tile-press': 0,
  'shake-flash': 320,
}

// How long each voice runs, in milliseconds. The audio layer schedules
// against these, and the battery reads them back against the brief's own
// constraint: effects are 400ms or shorter, and the exceptions are named
// rather than discovered. A voice longer than its declaration would keep
// scheduling past the beat that asked for it.
export const SOUND_MS: Record<SoundCue, number> = {
  placeholder: 0,
  silent: 0,
  'data-burst': 260,
  'all-clear': 300,
  'buy-click': 220,
  'denied-buzz': 240,
  'execute-sweep': 400,
  'hit-stab': 300,
  'alarm-gnss': 280,
  'alarm-uplink': 280,
  'alarm-spoof': 300,
  'alarm-eavesdrop': 300,
  'alarm-exfil': 280,
  'alarm-ransom': 320,
  'soft-tick': 120,
  'resolve-chime': 360,
  'tick-up': 90,
  'tick-down': 90,
  'warn-low': 380,
  'relief-chime': 360,
  'blackout-chain': 1500,
  'surge-burn': 400,
  'commendation-fanfare': 400,
  'arrive-chime': 340,
  'victory-fanfare': 400,
  'defeat-sting': 1200,
}

// The two voices allowed past the 400ms effect ceiling, and why. Both are
// sequences the brief writes as sequences rather than as single effects,
// so they are declared here and the battery holds everything else to the
// ceiling instead of taking the whole map on trust.
export const LONG_SOUNDS: Record<string, string> = {
  'blackout-chain': 'the brief writes this row as a drop-out tone, one beat of silence, then static',
  'defeat-sting': 'the brief writes this row as a fail sting followed by a hum',
}

// Which cues the music bed steps back under (Round 6b, brief section 7:
// "Ducks under fanfares and the BLACKOUT CHAIN sequence, then returns").
//
// A TOTAL map over SoundCue rather than a list of the four that duck.
// Principle 17: a list is a set someone declared, and it drifts from the
// union the moment a cue is added, silently and in the direction of doing
// nothing. A Record over the union cannot: adding a voice fails the
// typecheck until whoever added it says whether the bed gets out of its
// way. The music module walks this map and names no cue of its own, and so
// does its test, so there is no third copy to disagree with either.
//
// The rule behind the four trues: a cue ducks if it is the moment itself
// rather than a report on the moment. The fanfares and the sting are the
// game's verdict on a whole campaign, and BLACKOUT CHAIN is the one
// sequence written as a silence with something on either side of it, which
// a pad playing through would fill in.
export const DUCKS_MUSIC: Record<SoundCue, boolean> = {
  placeholder: false,
  silent: false,
  'data-burst': false,
  'all-clear': false,
  'buy-click': false,
  'denied-buzz': false,
  'execute-sweep': false,
  'hit-stab': false,
  'alarm-gnss': false,
  'alarm-uplink': false,
  'alarm-spoof': false,
  'alarm-eavesdrop': false,
  'alarm-exfil': false,
  'alarm-ransom': false,
  'soft-tick': false,
  'resolve-chime': false,
  'tick-up': false,
  'tick-down': false,
  'warn-low': false,
  'relief-chime': false,
  'blackout-chain': true,
  'surge-burn': false,
  'commendation-fanfare': true,
  'arrive-chime': false,
  'victory-fanfare': true,
  'defeat-sting': true,
}

// The haptic each cue fires (Round 6c, brief section 6).
//
// THE STRENGTH IS THE BRIEF'S WORD, NOT A NUMBER I CHOSE. The section 6
// table has carried a Haptic column since v0.4, spelling each row as none,
// light, short, double, medium or long. The first version of this map did
// not use it: it went straight to milliseconds out of my own judgement and
// contradicted the table on four rows, giving conditions and the MAI
// crossing no haptic at all and giving a won campaign a five step
// celebration the brief deliberately leaves silent. That is principle 17
// in its purest form, and no mutation could catch it, because every
// coverage test derives its expectations from THIS map: change the map and
// the expectations move with it. Deriving a set protects against drift
// between two structures and does nothing when there is only one.
//
// So there are two structures now and they must agree. Each Section6Row
// declares the brief's word, exactly as it declares its visual and its
// sound; this map says which word each cue carries; and the battery joins
// them. Drift in either direction fails.
export type HapticStrength = 'none' | 'light' | 'short' | 'double' | 'medium' | 'long'

export type HapticPattern = number | readonly number[]

// The vocabulary, in milliseconds. A number is one buzz; an array
// alternates buzz and pause. This is the only place a duration is chosen,
// so retuning the whole game's feel in Round 7 is six numbers rather than
// twenty five.
// 'none' is the only word that may resolve to nothing, and the type says
// so. Typed as Record<HapticStrength, HapticPattern | null>, every word was
// allowed to be null: setting `light: null` typechecked, and because every
// coverage test filters on "has a pattern", three rows would silently leave
// the set while its own emptiness control still passed. The round's closing
// condition would have been false for three of sixteen rows with the whole
// suite green. Found by the re-review; the fix is the type, not a test,
// because a test can be filtered around and a type cannot.
export const HAPTIC_STRENGTH: { none: null } & Record<Exclude<HapticStrength, 'none'>, HapticPattern> = {
  // A real decision, exactly as 'silent' is on the other two channels, and
  // the right answer for most rows: a haptic on everything is a phone
  // buzzing continuously through a twelve turn campaign.
  none: null,
  light: 12,
  short: 18,
  // The one the brief writes as two, for the one moment the game says no.
  double: [18, 40, 18],
  medium: 28,
  long: [40, 60, 40, 60, 90],
}

// A TOTAL map over SoundCue, for the reason DUCKS_MUSIC is one: a list is
// a set someone declared and it drifts from the union the moment a cue is
// added. Adding a voice fails the typecheck until whoever added it says
// what the hand should feel.
export const HAPTIC_PATTERNS: Record<SoundCue, HapticStrength> = {
  placeholder: 'none',
  silent: 'none',
  'data-burst': 'none',
  // A turn where nothing attacked. The hand stays still, for the same
  // reason the turn start does: this is the absence of an event, and a
  // buzz would make the quietest moment in the game feel like a hit.
  'all-clear': 'none',
  'buy-click': 'light',
  'denied-buzz': 'double',
  'execute-sweep': 'medium',
  'hit-stab': 'medium',
  // The condition family. The table has ONE row for "condition applied"
  // and the registry carries one alarm per condition, so every member of
  // the family takes the row's word.
  'alarm-gnss': 'short',
  'alarm-uplink': 'short',
  'alarm-spoof': 'short',
  'alarm-eavesdrop': 'short',
  'alarm-exfil': 'short',
  'alarm-ransom': 'short',
  'soft-tick': 'none',
  'resolve-chime': 'light',
  'tick-up': 'none',
  'tick-down': 'none',
  // One row, two sounds: the crossing buzzes and the recovery does not,
  // because the row's haptic is for the warning.
  'warn-low': 'long',
  'relief-chime': 'none',
  'blackout-chain': 'long',
  'surge-burn': 'medium',
  'commendation-fanfare': 'light',
  'arrive-chime': 'none',
  // The brief gives a won campaign no haptic and a lost one a long buzz.
  // That asymmetry is deliberate and the first version of this map undid
  // it: a win is a thing you read, a loss is a thing that happens to you.
  'victory-fanfare': 'none',
  'defeat-sting': 'long',
}

export function hapticPatternFor(cue: SoundCue): HapticPattern | null {
  return HAPTIC_STRENGTH[HAPTIC_PATTERNS[cue]]
}

// The longest a single cue may keep the motor running, summed across a
// pattern's buzzes. The brief holds effects to 400ms and names its two
// exceptions; this is the same discipline one channel over, and the
// battery checks it rather than taking the vocabulary on trust.
export const HAPTIC_MS_CEILING = 400

export function hapticMs(pattern: HapticPattern): number {
  if (typeof pattern === 'number') return pattern
  // Even indices buzz, odd indices pause. Only the buzzes cost the motor,
  // so a long gap between two short taps is cheap and a ceiling counting
  // it would push authors toward patterns that feel worse.
  return pattern.reduce((sum, ms, i) => (i % 2 === 0 ? sum + ms : sum), 0)
}

// Treatments that are safe to run on a whole card. The badge and token
// families were authored for a small element and end hidden or dimmed
// (badge-clear finishes at opacity 0, token-burn at 0.25), so handing one
// to the card would fade the card itself out. Those play on a marker
// inside the card instead, and the card keeps its own entrance.
export const CARD_SAFE_VISUALS = new Set<VisualCue>([
  'transmission',
  // Round 7b. Added after the DOM drive caught that it was missing: the
  // treatment was in the union, in VISUAL_CLASS, in VISUAL_MS, in the
  // stylesheet and on a section 6 row, it passed every cue-coverage test,
  // and the card still fell back to `dc-card-in` because this set is
  // hand-declared and nothing joins it to the registry. The new cue was
  // real everywhere except on the screen. `dc-all-clear` ends at full
  // opacity and scale 1, so it is safe to run on the whole card.
  'all-clear',
  'card-hostile',
  'card-friendly',
  'blackout',
  'ribbon',
  'outcome-sweep',
  'asset-light',
])

export const BEAT_CUES: Record<BeatKind, Cue> = {
  'turn-start': cue('Turn start: income and recovery', 'transmission', 'data-burst'),
  'deploy-arrived': cue('Deployment arrives', 'asset-light', 'arrive-chime'),
  procurement: cue('Procurement confirmed', 'silent', 'silent'),
  'surge-spent': cue('Surge authority spent', 'token-burn', 'surge-burn'),
  'condition-pressure': cue('Condition persists', 'badge-tick', 'soft-tick'),
  'chain-armed': cue('BLACKOUT CHAIN armed', 'blackout', 'blackout-chain'),
  // Round 7b. This borrowed the transmission bar until the opening was
  // measured: `turn-start` and `quiet` both resolved to
  // transmission/data-burst, so the whole adversary phase of turn 1 was
  // the identical blip the turn had opened with 1,200ms earlier, in 120 of
  // 120 runs. A turn where nothing attacked is its own event and now says
  // so in both channels.
  quiet: cue('No adversary activity', 'all-clear', 'all-clear'),
  threat: cue('Adversary event', 'card-hostile', 'hit-stab'),
  opportunity: cue('Opportunity', 'card-friendly', 'resolve-chime'),
  // These two carry the deck's alarm for the condition in question, never
  // this entry: beats.ts always gives them a `condition:<eventId>` cue key
  // and the coverage test forbids a condition-bearing event without a
  // condition cue, so the subject always resolves. The entry names a real
  // member of the family rather than a generic of its own, because a
  // dedicated voice that nothing can reach is dead code, and Round 4b's
  // rule is that dead code is removed rather than tested.
  'condition-applied': cue('Condition applied', 'badge-attach', 'alarm-gnss'),
  'condition-renewed': cue('Condition renewed', 'badge-attach', 'alarm-gnss'),
  'end-of-turn-tick': cue('End of turn', 'silent', 'silent'),
  'condition-cleared': cue('Condition cleared', 'badge-clear', 'resolve-chime'),
  commendation: cue('Commendation earned', 'ribbon', 'commendation-fanfare'),
  settle: cue('State reconciled', 'silent', 'silent'),
  // The registry entry is the win; a lost campaign is resolved through
  // soundFor, which is the only place the two outcomes differ.
  outcome: cue('Campaign outcome', 'outcome-sweep', 'victory-fanfare'),
}

// Threat and opportunity events, keyed by ThreatEvent.id.
export const EVENT_CUES: Record<string, Cue> = {
  'pnt-jamming': cue('PNT jamming', 'card-hostile', 'hit-stab'),
  'uplink-jamming': cue('Uplink jamming', 'card-hostile', 'hit-stab'),
  'gnss-spoofing': cue('GNSS spoofing', 'card-hostile', 'hit-stab'),
  'time-spoof': cue('Time spoof', 'card-hostile', 'hit-stab'),
  'lidar-dazzle': cue('Docking LiDAR dazzle', 'card-hostile', 'hit-stab'),
  'lidar-injection': cue('LiDAR point-cloud injection', 'card-hostile', 'hit-stab'),
  'lidar-blinding': cue('LiDAR perception blinding', 'card-hostile', 'hit-stab'),
  'training-data-poisoning': cue('Training-data poisoning', 'card-hostile', 'hit-stab'),
  'supply-chain-implant': cue('Supply-chain firmware implant', 'card-hostile', 'hit-stab'),
  'rogue-ground-station': cue('Rogue ground station', 'card-hostile', 'hit-stab'),
  'telemetry-replay': cue('Telemetry replay', 'card-hostile', 'hit-stab'),
  'downlink-eavesdropping': cue('Downlink eavesdropping', 'card-hostile', 'hit-stab'),
  'backhaul-exfil': cue('Backhaul exfiltration', 'card-hostile', 'hit-stab'),
  'ground-ransomware': cue('Ground segment ransomware', 'card-hostile', 'hit-stab'),
  'ops-phishing': cue('Ops credential phishing', 'card-hostile', 'hit-stab'),
  'insider-exfil': cue('Insider exfiltration', 'card-hostile', 'hit-stab'),
  'debris-conjunction': cue('Debris conjunction', 'card-hostile', 'hit-stab'),
  // The signature move gets the screen, not just a card.
  'blackout-chain': cue('BLACKOUT CHAIN', 'blackout', 'blackout-chain'),
  'appropriations-rider': cue('Appropriations rider', 'card-friendly', 'resolve-chime'),
  'allied-ssa-datashare': cue('Allied SSA data share', 'card-friendly', 'resolve-chime'),
  'rideshare-slot': cue('Rideshare slot', 'card-friendly', 'resolve-chime'),
}

// Persistent conditions, keyed by the eventId of the event that spawns
// them (every event with a duration).
export const CONDITION_CUES: Record<string, Cue> = {
  'pnt-jamming': cue('GNSS denial condition', 'badge-attach', 'alarm-gnss'),
  'uplink-jamming': cue('Uplink denial condition', 'badge-attach', 'alarm-uplink'),
  'gnss-spoofing': cue('Spoofed navigation condition', 'badge-attach', 'alarm-spoof'),
  'downlink-eavesdropping': cue('Eavesdropping condition', 'badge-attach', 'alarm-eavesdrop'),
  'backhaul-exfil': cue('Exfiltration condition', 'badge-attach', 'alarm-exfil'),
  'ground-ransomware': cue('Ransomware condition', 'badge-attach', 'alarm-ransom'),
}

// Countermeasures, keyed by CountermeasureId.
//
// Only ONE of these can currently reach the screen, and for three different
// reasons, which is why this is written out rather than summarised.
// beats.ts derives a `counter:` cue key from state.pendingCounters and from
// nowhere else, so a countermeasure has to retrofit to be announced:
//
//   - sensorFusion is the only one that does. It is the only id the buy
//     loop puts into pendingCounters (reducer.ts), so 'counter:sensorFusion'
//     is the only counter cue key the game can emit.
//   - nine others go straight into state.counters in that same loop and are
//     active the moment they are bought, so there is no arrival to announce.
//   - irRetainer takes its own branch and also lands in state.counters,
//     while intelInvestment never reaches state.counters at all: the buy
//     loop skips it and the engine models intel as a level rather than as a
//     counter, so it is unreachable here for a different reason again.
//
// The buy itself plays its own tile sound from Game.tsx and never consults
// this map. Eleven entries are therefore answers to a question the game
// does not ask yet; they are kept because the deck decides which
// countermeasures retrofit, and one missing when a deck adds a retrofit
// would fail the coverage test with no obvious cause. The comment here used
// to claim these fire on a retrofit AND on a buy, and neither half was true
// for those eleven; the replacement then said every id but sensorFusion
// lands in state.counters, which is untrue of intelInvestment.
export const COUNTER_CUES: Record<string, Cue> = {
  linkAuth: cue('Link-layer auth', 'asset-light', 'arrive-chime'),
  antiJam: cue('Anti-jam antennas', 'asset-light', 'arrive-chime'),
  pntAuth: cue('PNT authentication', 'asset-light', 'arrive-chime'),
  sensorFusion: cue('Sensor fusion', 'asset-light', 'arrive-chime'),
  tierAAttestation: cue('Tier A attestation', 'asset-light', 'arrive-chime'),
  mlPipelineIntegrity: cue('ML pipeline integrity', 'asset-light', 'arrive-chime'),
  groundZeroTrust: cue('Ground zero trust', 'asset-light', 'arrive-chime'),
  insiderProgram: cue('Insider program', 'asset-light', 'arrive-chime'),
  ssaManeuver: cue('SSA maneuver budget', 'asset-light', 'arrive-chime'),
  encryptedBackhaul: cue('Encrypted backhaul', 'asset-light', 'arrive-chime'),
  intelInvestment: cue('Intel investment', 'asset-light', 'arrive-chime'),
  irRetainer: cue('Incident response retainer', 'asset-light', 'arrive-chime'),
}

// Every row of the brief's section 6 table, with the visual that now
// carries it and where it lives. The battery walks this so the round's
// closing condition ("every row of section 6 has its visual") is checked
// against the code rather than asserted in a report. Rounds 4 to 6 add the
// sound and haptic columns; Round 5 upgrades the four cinematic rows.
export interface Section6Row {
  beat: string
  visual: VisualCue
  where: string
  // The sound column, and where it is played. It needs a `where` of its
  // own because several rows split across two files: the badge component
  // owns the condition visual while the director plays the beat's sound,
  // and the hold control owns its own press sound.
  sound: SoundCue
  soundWhere: string
  // Rows whose sound is chosen per subject rather than fixed. The brief
  // asks for an alarm unique per condition, so the row names the family's
  // stand-in and the registry carries one member per condition; the
  // battery holds those members distinct rather than taking the word
  // "unique" on trust.
  soundPerSubject?: 'condition'
  // The beat kinds that carry this row, for rows the director plays. The
  // coverage test used to accept "some beat somewhere plays this sound",
  // which a row repointed at an unrelated voice satisfied as long as some
  // other row's beat happened to play it; naming the kinds makes the
  // check about THIS row.
  kinds?: BeatKind[]
  // The cinematic scene this row plays, for the four rows that have one.
  // Rendered by ui/cues/Scene.tsx; every other row keeps its baseline
  // one-shot treatment and renders no scene at all.
  scene?: SceneName
  // True where Round 5 owns the full cinematic treatment and Round 3
  // shipped the baseline visual. Round 5 fills `scene` for each of them,
  // and the battery holds the two fields together, so the round's closing
  // condition is checked against the code rather than asserted.
  cinematicInRound5?: boolean
  // The brief's Haptic column, transcribed. Required, not optional, so a
  // row added later cannot quietly carry no answer; 'none' is the answer
  // for nine of the sixteen and is a decision rather than an absence.
  haptic: HapticStrength
  // The OTHER sounds this row owns. Several brief rows describe two
  // voices: "Tick-down or tick-up", "Low tone; relief chime on recovery".
  // The row names one in `sound` and the other here, so every cue in the
  // union belongs to some row and none is accounted for by nothing. Four
  // were unjoined before this and three of them are fired by the running
  // game, which the re-review found by counting rather than by reading.
  soundPartners?: SoundCue[]
  // What the brief's row asks for that this round does not yet ship, so
  // the battery does not report an unfinished row as done.
  deferred?: string
}

// Which rows can sound at instant speed, derived from the table rather
// than listed. Instant derives no beats at all (src/ui/Game.tsx resolve),
// because instant IS the v1.0 path: results only. So every row the
// director plays is silent there, and only the rows played by a component
// the player is touching still sound.
//
// This used to be the reduced-motion player's normal experience, because
// reduced motion selected instant, which left eleven of these sixteen rows
// silent for someone who had asked for nothing to move rather than for
// nothing to be told. Brief v1.2 separated the two: reduced motion keeps
// the sequence and takes the static form of every cue, and instant is an
// explicit choice only. So this function now describes what a player who
// TAPS instant is choosing, which is a real and reasonable trade, rather
// than something happening to them on the strength of an OS setting.
export function soundsAtInstantSpeed(row: Section6Row): boolean {
  return !row.soundWhere.startsWith('director/')
}

export const SECTION_6_ROWS: Section6Row[] = [
  {
    beat: 'Turn start, intel incoming',
    // `quiet` left this row in Round 7b. It was never a turn start: it is
    // the adversary phase resolving to nothing, and filing it here is what
    // made it borrow this row's treatment. A vocabulary item hidden inside
    // a row that describes something else is the same defect as the
    // `opportunity` beat that belonged to no row at all, and the opening
    // measurement found one of them by finding the other.
    kinds: ['turn-start'],
    visual: 'transmission',
    where: 'ui/cues/Teletype.tsx',
    sound: 'data-burst',
    haptic: 'none',
    soundWhere: 'director/DirectorView.tsx',
  },
  {
    // Brief v2.3 does not carry this row yet; it is owed, in the form the
    // opportunity row was owed until v2.3 added it. Recorded here rather
    // than left implicit so the next conformance audit finds a claim to
    // check rather than a silence.
    beat: 'Nothing attacked this turn',
    kinds: ['quiet'],
    visual: 'all-clear',
    where: 'director/DirectorView.tsx',
    sound: 'all-clear',
    haptic: 'none',
    soundWhere: 'director/DirectorView.tsx',
  },
  {
    // Added in brief v2.3. A visible beat kind that belonged to no row at
    // all, resolving to card-friendly and resolve-chime and firing in 18
    // of 120 passive runs of the opening, which is to say inside the exact
    // window Round 7b is about. tests/cues.spec.ts could not catch it: it
    // asserts every declared visual is used by at least ONE cue, which a
    // treatment owned by no row still satisfies.
    beat: 'Opportunity lands',
    kinds: ['opportunity'],
    visual: 'card-friendly',
    where: 'director/DirectorView.tsx',
    sound: 'resolve-chime',
    haptic: 'light',
    soundWhere: 'director/DirectorView.tsx',
  },
  {
    beat: 'Buy fleet or countermeasure',
    visual: 'tile-press',
    // A fleet buy slides into the manifest; a countermeasure has no
    // manifest entry to slide into and carries its selected state on the
    // tile instead. Recorded so the row is not read as promising a
    // manifest entrance the countermeasure half never had.
    where: 'ui/Game.tsx procurement tiles (fleet buys slide into the manifest; countermeasure tiles hold their state in place)',
    sound: 'buy-click',
    haptic: 'light',
    soundWhere: 'ui/Game.tsx',
  },
  {
    beat: 'Cannot afford',
    visual: 'shake-flash',
    where: 'ui/Game.tsx procurement tiles',
    sound: 'denied-buzz',
    haptic: 'double',
    soundWhere: 'ui/Game.tsx',
  },
  {
    beat: 'EXECUTE TURN',
    visual: 'tile-press',
    where: 'ui/Game.tsx resolve control',
    sound: 'execute-sweep',
    haptic: 'medium',
    soundWhere: 'ui/cues/HoldButton.tsx',
  },
  {
    beat: 'Adversary event lands',
    kinds: ['threat'],
    visual: 'card-hostile',
    where: 'director/DirectorView.tsx',
    sound: 'hit-stab',
    haptic: 'medium',
    soundWhere: 'director/DirectorView.tsx',
  },
  {
    beat: 'Condition applied',
    kinds: ['condition-applied', 'condition-renewed'],
    visual: 'badge-attach',
    where: 'ui/cues/ConditionBadge.tsx',
    // One member of the family, named so the row points at a sound a real
    // beat actually plays; the registry carries one per condition and the
    // battery holds them distinct.
    sound: 'alarm-gnss',
    haptic: 'short',
    soundWhere: 'director/DirectorView.tsx',
    soundPerSubject: 'condition',
  },
  {
    beat: 'Condition persists into a new turn',
    kinds: ['condition-pressure'],
    visual: 'badge-tick',
    where: 'ui/cues/ConditionBadge.tsx',
    sound: 'soft-tick',
    haptic: 'none',
    soundWhere: 'director/DirectorView.tsx',
  },
  {
    beat: 'Condition cleared',
    kinds: ['condition-cleared'],
    visual: 'badge-clear',
    where: 'ui/cues/ConditionBadge.tsx',
    sound: 'resolve-chime',
    haptic: 'light',
    soundWhere: 'director/DirectorView.tsx',
  },
  {
    beat: 'Meter delta',
    visual: 'meter-ease',
    where: 'ui/cues/Meter.tsx',
    // The valence is decided at record time by the meter itself, so the
    // meter is also what picks between the two tick voices.
    sound: 'tick-down',
    haptic: 'none',
    soundPartners: ['tick-up'],
    soundWhere: 'ui/cues/Meter.tsx',
  },
  {
    beat: 'MAI crosses below the win line',
    visual: 'strobe',
    where: 'ui/cues/Meter.tsx',
    sound: 'warn-low',
    haptic: 'long',
    // The recovery half of the same row. It carries 'none' rather than
    // 'long': the row's haptic is for the warning, and buzzing on relief
    // would make recovery feel like another hit.
    soundPartners: ['relief-chime'],
    soundWhere: 'ui/cues/Meter.tsx',
  },
  {
    beat: 'BLACKOUT CHAIN fires',
    scene: 'blackout',
    kinds: ['chain-armed', 'threat'],
    visual: 'blackout',
    where: 'director/DirectorView.tsx',
    sound: 'blackout-chain',
    haptic: 'long',
    soundWhere: 'director/DirectorView.tsx',
    cinematicInRound5: true,
  },
  {
    beat: 'Surge token spent',
    kinds: ['surge-spent'],
    visual: 'token-burn',
    where: 'director/DirectorView.tsx',
    sound: 'surge-burn',
    haptic: 'medium',
    soundWhere: 'director/DirectorView.tsx',
  },
  {
    beat: 'Commendation earned',
    scene: 'commendation',
    kinds: ['commendation'],
    visual: 'ribbon',
    where: 'director/DirectorView.tsx',
    sound: 'commendation-fanfare',
    haptic: 'light',
    soundWhere: 'director/DirectorView.tsx',
    cinematicInRound5: true,
  },
  {
    beat: 'Deployment arrives',
    kinds: ['deploy-arrived'],
    visual: 'asset-light',
    where: 'director/DirectorView.tsx',
    sound: 'arrive-chime',
    haptic: 'none',
    soundWhere: 'director/DirectorView.tsx',
    deferred:
      'lighting the matching satellite on the constellation frame, which needs the frame to be on screen during playback; it renders only on the start screen today',
  },
  {
    beat: 'Campaign won',
    scene: 'victory',
    kinds: ['outcome'],
    visual: 'outcome-sweep',
    where: 'director/DirectorView.tsx',
    sound: 'victory-fanfare',
    haptic: 'none',
    soundWhere: 'director/DirectorView.tsx',
    cinematicInRound5: true,
  },
  {
    beat: 'Campaign lost',
    scene: 'defeat',
    kinds: ['outcome'],
    visual: 'outcome-sweep',
    where: 'director/DirectorView.tsx',
    sound: 'defeat-sting',
    haptic: 'long',
    soundWhere: 'director/DirectorView.tsx',
    cinematicInRound5: true,
  },
]

// Resolve a beat's cue key. Returns undefined for an unknown key, which the
// coverage test treats as a failure; the view falls back to the kind cue.
export function resolveCue(cueKey: string): Cue | undefined {
  const sep = cueKey.indexOf(':')
  if (sep < 0) return undefined
  const ns = cueKey.slice(0, sep)
  const id = cueKey.slice(sep + 1)
  if (ns === 'beat') return (BEAT_CUES as Record<string, Cue>)[id]
  if (ns === 'event') return EVENT_CUES[id]
  if (ns === 'condition') return CONDITION_CUES[id]
  if (ns === 'counter') return COUNTER_CUES[id]
  return undefined
}

// Beat kinds whose own treatment must win over the deck-keyed cue. The
// cue key names the subject (which condition, which event) so the label
// stays specific, but the treatment belongs to what is happening: surge
// burns a token, a clear sweeps green, persistence ticks. Without this the
// deck cue's attach glow would play, which is both the wrong motion and
// the wrong colour for a friendly beat.
//
// Round 4d: the same three kinds own their sound for the same reason. A
// clear that played the subject's alarm would announce the problem at the
// moment it went away. The condition-applied kinds are deliberately not
// here, because there the subject IS the point: the brief asks for an
// alarm unique per condition.
const KIND_OWNS_TREATMENT = new Set<BeatKind>(['surge-spent', 'condition-cleared', 'condition-pressure'])

// The class a beat contributes, or '' when the treatment is structural
// rather than a one-shot animation.
export function visualClass(cueKey: string, kind?: BeatKind): string {
  const found = kind && KIND_OWNS_TREATMENT.has(kind) ? BEAT_CUES[kind] : resolveCue(cueKey)
  return found ? VISUAL_CLASS[found.visual] : ''
}

// The visual a beat actually plays, for the battery to check against the
// section 6 table.
export function visualFor(cueKey: string, kind?: BeatKind): VisualCue | undefined {
  const found = kind && KIND_OWNS_TREATMENT.has(kind) ? BEAT_CUES[kind] : resolveCue(cueKey)
  return found?.visual
}

// The sound a beat actually plays, for the battery to check against the
// section 6 table the same way the visual is checked.
//
// The outcome beat is the one place the registry cannot answer alone: one
// kind covers both endings and they must not sound alike. The caller
// passes what it already knows. Round 5 replaces the view's string match
// on the outcome title with a `lost` field on the beat (finding 3.10); the
// argument here is what that field will feed, so only the caller changes.
export function soundFor(cueKey: string, kind?: BeatKind, lost = false): SoundCue | undefined {
  // The win comes from the registry entry, which is what its comment
  // claims. Returning the literal here for both endings made that entry
  // decoration: it could be changed to anything and a won campaign would
  // still play the fanfare.
  if (kind === 'outcome') return lost ? 'defeat-sting' : BEAT_CUES.outcome.sound
  const found = kind && KIND_OWNS_TREATMENT.has(kind) ? BEAT_CUES[kind] : resolveCue(cueKey)
  return found?.sound
}
