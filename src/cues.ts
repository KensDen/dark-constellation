// THE CUE REGISTRY (game-feel brief v0.5 section 6, principle 7; v1.3
// brief 8.4). What each moment of play looks, sounds and feels like, hand
// keyed by the night's moments and the deck's event and condition ids.
// The battery fails on a placeholder in any channel and on a missing entry.
//
// This map is deliberately written by hand rather than generated from the
// content data: generating it would make the coverage test vacuous. Adding
// an event to the deck must fail the battery until someone decides what
// that event looks and sounds like.
//
// Since v1.3 Round 3 the moments are the night's (brief 5.5), not the v1.1
// director's beats, which retired with the director: the strike, a block,
// the result tiles, COLLECT, FILE IT and the end of turn (brief 8.4: "map
// the existing voices", no new audio files). Moved here from
// src/director/cues.ts with it.
//
// Since v2.0 R3 the 3D game is the only game, and it plays this registry
// (src/ui/three/Game3D.tsx and rooms3d.tsx): the sound and the haptic of
// each moment are as they were, and SECTION_6_ROWS below says where each
// row lives now and which rows the 3D game does not play yet.
//
// Since v2.0 R3 (Ken's ruling of 15 November 2026: voices for the threats)
// each threat in the deck has a voice of its own, played as its strike
// leaves COLDVEIL: THREAT_VOICES below says which, by event id.

// The visual treatment each moment takes, by name. 'silent' is a real
// decision (the moment renders nothing of its own), not an absence. The
// pixel board drew each from a CSS class of its own; the classes and their
// durations (VISUAL_CLASS, VISUAL_MS) left with the board in v2.0 R3, and
// the 3D game draws these moments in its world and on its cards.
export type VisualCue =
  | 'placeholder'
  | 'silent'
  | 'transmission'
  | 'sweep'
  | 'strike'
  | 'shield'
  | 'tiles'
  | 'chip-in'
  | 'card-rise'
  | 'collect-glow'
  | 'intel-in'
  | 'rows-in'
  | 'meter-ease'
  | 'strobe'
  | 'tile-press'

// The synthesized voices the audio layer implements, one function per cue
// (brief section 7). 'silent' is a real decision exactly as it is on the
// visual side: the moment makes no sound. 'placeholder' is kept in the
// union, and kept failing the battery, so that reverting a slot to it is
// a mutation someone can actually write.
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
  | 'commendation-fanfare'
  | 'arrive-chime'
  | 'victory-fanfare'
  | 'defeat-sting'
  // The threats' own voices (v2.0 R3), named for the event each belongs
  // to. BLACKOUT CHAIN has none here: its voice is the set piece above.
  | 'threat-pnt-jamming'
  | 'threat-uplink-jamming'
  | 'threat-gnss-spoofing'
  | 'threat-time-spoof'
  | 'threat-lidar-dazzle'
  | 'threat-lidar-injection'
  | 'threat-lidar-blinding'
  | 'threat-training-data-poisoning'
  | 'threat-supply-chain-implant'
  | 'threat-rogue-ground-station'
  | 'threat-telemetry-replay'
  | 'threat-downlink-eavesdropping'
  | 'threat-backhaul-exfil'
  | 'threat-ground-ransomware'
  | 'threat-ops-phishing'
  | 'threat-insider-exfil'
  | 'threat-debris-conjunction'

export interface Cue {
  label: string
  visual: VisualCue
  sound: SoundCue
}

const cue = (label: string, visual: VisualCue, sound: SoundCue): Cue => ({ label, visual, sound })

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
  'commendation-fanfare': 400,
  'arrive-chime': 340,
  'victory-fanfare': 400,
  'defeat-sting': 1200,
  'threat-pnt-jamming': 620,
  'threat-uplink-jamming': 490,
  'threat-gnss-spoofing': 700,
  'threat-time-spoof': 640,
  'threat-lidar-dazzle': 460,
  'threat-lidar-injection': 540,
  'threat-lidar-blinding': 560,
  'threat-training-data-poisoning': 700,
  'threat-supply-chain-implant': 830,
  'threat-rogue-ground-station': 540,
  'threat-telemetry-replay': 660,
  'threat-downlink-eavesdropping': 590,
  'threat-backhaul-exfil': 450,
  'threat-ground-ransomware': 760,
  'threat-ops-phishing': 760,
  'threat-insider-exfil': 540,
  'threat-debris-conjunction': 790,
}

// The two voices allowed past the 400ms effect ceiling, and why. Both are
// sequences the brief writes as sequences rather than as single effects,
// so they are declared here and the battery holds everything else to the
// ceiling instead of taking the whole map on trust.
export const LONG_SOUNDS: Record<string, string> = {
  'blackout-chain': 'the brief writes this row as a drop-out tone, one beat of silence, then static',
  'defeat-sting': 'the brief writes this row as a fail sting followed by a hum',
}

// A threat's voice is a phrase, not an effect: a replay has to repeat, a
// heartbeat has to beat twice, an approach needs room to speed up. So the
// family has a ceiling of its own, the length the borrowed motifs it
// replaces ran to, and the battery holds every member to it. It is one
// rule for the family, not seventeen exemptions, so a voice that grows
// past it cannot hide among reasons written one at a time.
export const THREAT_VOICE_CEILING_MS = 900

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
  'commendation-fanfare': true,
  'arrive-chime': false,
  'victory-fanfare': true,
  'defeat-sting': true,
  // A threat's voice is a report on the move, not the moment itself: the
  // strike has not landed yet, and the bed under it is the night's own
  // tension. None of them ducks.
  'threat-pnt-jamming': false,
  'threat-uplink-jamming': false,
  'threat-gnss-spoofing': false,
  'threat-time-spoof': false,
  'threat-lidar-dazzle': false,
  'threat-lidar-injection': false,
  'threat-lidar-blinding': false,
  'threat-training-data-poisoning': false,
  'threat-supply-chain-implant': false,
  'threat-rogue-ground-station': false,
  'threat-telemetry-replay': false,
  'threat-downlink-eavesdropping': false,
  'threat-backhaul-exfil': false,
  'threat-ground-ransomware': false,
  'threat-ops-phishing': false,
  'threat-insider-exfil': false,
  'threat-debris-conjunction': false,
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
  // A block. Through v1.6 the hand stayed still, so a buzz never made a
  // block feel like a hit. Since v1.7 R1 (Ken's ruling of 9 November 2026:
  // a block gets its own moment) it is one light tick, the shortest
  // pattern there is, where a hit is a medium pulse.
  'all-clear': 'light',
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
  'commendation-fanfare': 'light',
  'arrive-chime': 'none',
  // The brief gives a won campaign no haptic and a lost one a long buzz.
  // That asymmetry is deliberate and the first version of this map undid
  // it: a win is a thing you read, a loss is a thing that happens to you.
  'victory-fanfare': 'none',
  'defeat-sting': 'long',
  // A threat's voice is heard as its strike LEAVES. The hand is kept for
  // what follows: the hit (medium) and the condition it leaves (short).
  // The borrowed motifs buzzed for some threats and not for others, by the
  // accident of which cues they borrowed (the two LiDAR attacks carried
  // the win line's long warning); none is the one word that is no stronger
  // than what any of them had.
  'threat-pnt-jamming': 'none',
  'threat-uplink-jamming': 'none',
  'threat-gnss-spoofing': 'none',
  'threat-time-spoof': 'none',
  'threat-lidar-dazzle': 'none',
  'threat-lidar-injection': 'none',
  'threat-lidar-blinding': 'none',
  'threat-training-data-poisoning': 'none',
  'threat-supply-chain-implant': 'none',
  'threat-rogue-ground-station': 'none',
  'threat-telemetry-replay': 'none',
  'threat-downlink-eavesdropping': 'none',
  'threat-backhaul-exfil': 'none',
  'threat-ground-ransomware': 'none',
  'threat-ops-phishing': 'none',
  'threat-insider-exfil': 'none',
  'threat-debris-conjunction': 'none',
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


// THE NIGHT'S MOMENTS (v1.3 brief 5.5 and 8.4), each with what it looks
// and sounds like. The strike and the cards play them; the deck's own
// entries below say which voice a particular event strikes with. Three
// are the pixel night's and have no place in the 3D game yet (turn-start,
// result-tiles and collect): SECTION_6_ROWS marks their rows deferred.
export type Moment =
  | 'turn-start'
  | 'moving'
  | 'strike-hit'
  | 'strike-block'
  | 'result-tiles'
  | 'streak'
  | 'condition'
  | 'collect'
  | 'file'
  | 'opportunity'
  | 'debris-call'
  | 'debris-result'
  | 'end-of-turn'
  | 'outcome'
  | 'grade'

export const MOMENTS: Moment[] = [
  'turn-start',
  'moving',
  'strike-hit',
  'strike-block',
  'result-tiles',
  'streak',
  'condition',
  'collect',
  'file',
  'opportunity',
  'debris-call',
  'debris-result',
  'end-of-turn',
  'outcome',
  'grade',
]

export const MOMENT_CUES: Record<Moment, Cue> = {
  // The next night's word arrives as a transmission.
  'turn-start': cue('Turn start: a transmission arrives', 'transmission', 'data-burst'),
  // The night falls. Its sound is BEGIN's own sweep, played by the press
  // that began it.
  moving: cue('COLDVEIL is moving', 'sweep', 'silent'),
  'strike-hit': cue('A move lands', 'strike', 'hit-stab'),
  // A block is a win at a glance and to the ear (brief 5.5, section 12).
  'strike-block': cue('A defense blocks a move', 'shield', 'all-clear'),
  // One tick per tile as it lands: up for a blocked point, down for one
  // that got through.
  'result-tiles': cue('Result tiles', 'tiles', 'tick-up'),
  'streak': cue('Defense streak', 'chip-in', 'commendation-fanfare'),
  // The family's stand-in: a hit plays the deck's own alarm for the
  // condition it leaves (CONDITION_CUES).
  condition: cue('Condition applied', 'chip-in', 'alarm-gnss'),
  // FILE TO DOSSIER, and the FILED stamp on the Dossier card (v1.6 R3,
  // Ken's playtest item 4: COLLECT INTEL CARD and FILE IT).
  collect: cue('FILE TO DOSSIER', 'collect-glow', 'data-burst'),
  file: cue('FILED stamp', 'intel-in', 'arrive-chime'),
  opportunity: cue('Opportunity', 'card-rise', 'resolve-chime'),
  // A decision, not an event: the call arrives quietly.
  'debris-call': cue('Your call', 'card-rise', 'silent'),
  // The call's result: the satellite safe sounds like a block; a lost one
  // lands like a hit (the deck's own voice for the conjunction).
  'debris-result': cue('The call played out', 'card-rise', 'all-clear'),
  'end-of-turn': cue('End of turn', 'rows-in', 'resolve-chime'),
  // The registry entry is the win; a lost operation plays the sting
  // (outcomeSound), the one place the two endings differ.
  outcome: cue('Operation over', 'card-rise', 'victory-fanfare'),
  // The debrief's grade landing (brief 8.4, v1.3 R4). The registry entry
  // is a win's; a loss lands on a tick down (gradeSound).
  grade: cue('Grade', 'card-rise', 'commendation-fanfare'),
}

// Threat and opportunity events, keyed by ThreatEvent.id: the voice each
// strikes with when it lands.
export const EVENT_CUES: Record<string, Cue> = {
  'pnt-jamming': cue('PNT jamming', 'strike', 'hit-stab'),
  'uplink-jamming': cue('Uplink jamming', 'strike', 'hit-stab'),
  'gnss-spoofing': cue('GNSS spoofing', 'strike', 'hit-stab'),
  'time-spoof': cue('Time spoof', 'strike', 'hit-stab'),
  'lidar-dazzle': cue('Docking LiDAR dazzle', 'strike', 'hit-stab'),
  'lidar-injection': cue('LiDAR point-cloud injection', 'strike', 'hit-stab'),
  'lidar-blinding': cue('LiDAR perception blinding', 'strike', 'hit-stab'),
  'training-data-poisoning': cue('Training-data poisoning', 'strike', 'hit-stab'),
  'supply-chain-implant': cue('Supply-chain firmware implant', 'strike', 'hit-stab'),
  'rogue-ground-station': cue('Rogue ground station', 'strike', 'hit-stab'),
  'telemetry-replay': cue('Telemetry replay', 'strike', 'hit-stab'),
  'downlink-eavesdropping': cue('Downlink eavesdropping', 'strike', 'hit-stab'),
  'backhaul-exfil': cue('Backhaul exfiltration', 'strike', 'hit-stab'),
  'ground-ransomware': cue('Ground segment ransomware', 'strike', 'hit-stab'),
  'ops-phishing': cue('Ops credential phishing', 'strike', 'hit-stab'),
  'insider-exfil': cue('Insider exfiltration', 'strike', 'hit-stab'),
  // The call's result: a lost satellite lands like a hit.
  'debris-conjunction': cue('Debris conjunction', 'card-rise', 'hit-stab'),
  // The signature move has a sequence of its own.
  'blackout-chain': cue('BLACKOUT CHAIN', 'strike', 'blackout-chain'),
  'appropriations-rider': cue('Appropriations rider', 'card-rise', 'resolve-chime'),
  'allied-ssa-datashare': cue('Allied SSA data share', 'card-rise', 'resolve-chime'),
  'rideshare-slot': cue('Rideshare slot', 'card-rise', 'resolve-chime'),
}

// Conditions, keyed by the eventId of the event that leaves them (every
// event with a duration): one alarm each, so a player hears which.
export const CONDITION_CUES: Record<string, Cue> = {
  'pnt-jamming': cue('GNSS denial condition', 'chip-in', 'alarm-gnss'),
  'uplink-jamming': cue('Uplink denial condition', 'chip-in', 'alarm-uplink'),
  'gnss-spoofing': cue('Spoofed navigation condition', 'chip-in', 'alarm-spoof'),
  'downlink-eavesdropping': cue('Eavesdropping condition', 'chip-in', 'alarm-eavesdrop'),
  'backhaul-exfil': cue('Exfiltration condition', 'chip-in', 'alarm-exfil'),
  'ground-ransomware': cue('Ransomware condition', 'chip-in', 'alarm-ransom'),
}

// THE THREATS' OWN VOICES (v2.0 R3, Ken's ruling of 15 November 2026:
// voices for the threats), keyed by ThreatEvent.id: the voice a threat is
// heard by as its strike leaves COLDVEIL, so the ear learns the threat
// with the eye (src/ui/three/sounds3d.ts plays it). One voice a threat and
// no voice twice, which the battery holds. Hand keyed like the rest of
// this file: a threat added to the deck fails the battery until someone
// decides what it sounds like. BLACKOUT CHAIN keeps the set piece it has
// had since Round 4d.
export const THREAT_VOICES: Record<string, SoundCue> = {
  'pnt-jamming': 'threat-pnt-jamming',
  'uplink-jamming': 'threat-uplink-jamming',
  'gnss-spoofing': 'threat-gnss-spoofing',
  'time-spoof': 'threat-time-spoof',
  'lidar-dazzle': 'threat-lidar-dazzle',
  'lidar-injection': 'threat-lidar-injection',
  'lidar-blinding': 'threat-lidar-blinding',
  'training-data-poisoning': 'threat-training-data-poisoning',
  'supply-chain-implant': 'threat-supply-chain-implant',
  'rogue-ground-station': 'threat-rogue-ground-station',
  'telemetry-replay': 'threat-telemetry-replay',
  'downlink-eavesdropping': 'threat-downlink-eavesdropping',
  'backhaul-exfil': 'threat-backhaul-exfil',
  'ground-ransomware': 'threat-ground-ransomware',
  'ops-phishing': 'threat-ops-phishing',
  'insider-exfil': 'threat-insider-exfil',
  'debris-conjunction': 'threat-debris-conjunction',
  'blackout-chain': 'blackout-chain',
}

// The sound a landed or blocked move strikes with (brief 8.4: strike, hit
// or block). A move that got through takes the deck's voice for it; a
// block is the same win whatever was blocked.
export function strikeSound(eventId: string, landed: boolean): SoundCue {
  if (!landed) return MOMENT_CUES['strike-block'].sound
  return EVENT_CUES[eventId]?.sound ?? MOMENT_CUES['strike-hit'].sound
}

export const outcomeSound = (won: boolean): SoundCue => (won ? MOMENT_CUES.outcome.sound : 'defeat-sting')

// The grade landing on the debrief: the fanfare for a win, a tick down
// for a loss, which the last dawn has already stung.
export const gradeSound = (won: boolean): SoundCue => (won ? MOMENT_CUES.grade.sound : 'tick-down')

// Every row of the brief's section 6 table, with the visual that now
// carries it and where it lives. The battery walks this so "every row has
// its visual, its sound and its haptic" is checked against the code
// rather than asserted in a report.
//
// Since v2.0 R3 `where` and `soundWhere` name the 3D game's files (the
// pixel board's are gone). A row the 3D game does not show, or does not
// sound, says 'none' there and says what it owes in `deferred`.
export interface Section6Row {
  beat: string
  visual: VisualCue
  // The file that shows the row, from src, with a note; or 'none'.
  where: string
  // The sound column, and the file that plays it, from src; or 'none'.
  sound: SoundCue
  soundWhere: string
  // Rows whose sound is chosen per subject: one alarm per condition
  // (CONDITION_CUES), one voice per threat (THREAT_VOICES).
  soundPerSubject?: 'condition' | 'threat'
  // The night's moments that carry this row.
  moments?: Moment[]
  // The brief's Haptic column, transcribed. Required, so a row added later
  // cannot quietly carry no answer; 'none' is a decision.
  haptic: HapticStrength
  // The OTHER sounds this row owns ("Tick-down or tick-up", "Low tone;
  // relief chime on recovery"), so every cue in the union belongs to a row.
  soundPartners?: SoundCue[]
  // What the brief's row asks for that the game does not do yet, so the
  // battery does not report an unfinished row as done.
  deferred?: string
}

export const SECTION_6_ROWS: Section6Row[] = [
  {
    beat: 'Turn start, a transmission arrives',
    moments: ['turn-start'],
    visual: 'transmission',
    where: 'none',
    sound: 'data-burst',
    haptic: 'none',
    soundWhere: 'none',
    deferred:
      'a start of its own for a night in the 3D game: the plan opens with no transmission and no sound, and the burst is heard there as the scan pulse instead (ui/three/Game3D.tsx)',
  },
  {
    beat: 'Buy fleet or countermeasure',
    visual: 'tile-press',
    where: 'ui/three/Game3D.tsx (a defense set down on an asset, and an asset ordered, on the plan)',
    sound: 'buy-click',
    haptic: 'light',
    soundWhere: 'ui/three/Game3D.tsx',
  },
  {
    beat: 'Cannot afford',
    visual: 'tile-press',
    where: 'ui/three/Game3D.tsx (an order the plan refuses: a defense or an asset the budget cannot take, a night that could break the budget)',
    sound: 'denied-buzz',
    haptic: 'double',
    soundWhere: 'ui/three/Game3D.tsx',
  },
  {
    beat: 'EXECUTE TURN',
    moments: ['moving'],
    visual: 'sweep',
    where: 'ui/three/Game3D.tsx (BEGIN: the night falls under COLDVEIL IS MOVING)',
    sound: 'execute-sweep',
    haptic: 'medium',
    soundWhere: 'ui/three/Game3D.tsx',
  },
  {
    // v2.0 R3 (Ken's ruling of 15 November 2026: voices for the threats).
    // Not a row of the brief's table: the 3D game's own moment, a strike
    // leaving COLDVEIL under its name and its signature. The row names the
    // family's stand-in, as the condition row does; the member played is
    // the threat's own (THREAT_VOICES), and BLACKOUT CHAIN's is the set
    // piece, which has a row of its own below.
    beat: 'A strike leaves COLDVEIL',
    visual: 'strike',
    where: 'ui/three/Game3D.tsx (the strike leaves under a banner with its name and its signature, and a line for a screen reader)',
    sound: 'threat-pnt-jamming',
    haptic: 'none',
    soundWhere: 'ui/three/sounds3d.ts',
    soundPerSubject: 'threat',
  },
  {
    beat: 'Adversary event lands',
    moments: ['strike-hit'],
    visual: 'strike',
    where: 'ui/three/Game3D.tsx (the strike reaches its asset, with the verdict over it)',
    sound: 'hit-stab',
    haptic: 'medium',
    soundWhere: 'ui/three/Game3D.tsx',
  },
  {
    // v1.3 R3: a block is its own moment, and a win (brief 5.5 and the
    // section 12 playtest bar). Until then this voice was the quiet turn's.
    beat: 'A defense blocks a move',
    moments: ['strike-block'],
    visual: 'shield',
    where: 'ui/three/Game3D.tsx (the shield on the asset it was aimed at, and BLOCKED over it)',
    sound: 'all-clear',
    haptic: 'light',
    soundWhere: 'ui/three/Game3D.tsx',
  },
  {
    beat: 'Result tiles',
    moments: ['result-tiles'],
    visual: 'tiles',
    where: 'none',
    sound: 'tick-up',
    soundPartners: ['tick-down'],
    haptic: 'none',
    soundWhere: 'none',
    deferred: 'result tiles in the 3D game: a move ends on one word over its asset and a card, with no tile a point to tick',
  },
  {
    beat: 'Opportunity lands',
    moments: ['opportunity'],
    visual: 'card-rise',
    where: 'ui/three/cards3d.tsx (the opportunity and what it did, on its card)',
    sound: 'resolve-chime',
    haptic: 'light',
    soundWhere: 'ui/three/Game3D.tsx',
  },
  {
    // v1.3 R3 (brief 5.5 item 5): the call arrives quietly, and its result
    // sounds like a block when the satellite is safe and like a hit when
    // it is lost. The safe result ticks as a block does since v1.7 R1:
    // it is the block's own voice (all-clear), which now carries 'light'
    // in HAPTIC_PATTERNS, and one cue has one haptic.
    beat: 'The debris call and its result',
    moments: ['debris-call', 'debris-result'],
    visual: 'card-rise',
    where: 'ui/three/cards3d.tsx (the call and its result, each on a card)',
    sound: 'all-clear',
    soundPartners: ['hit-stab'],
    haptic: 'light',
    soundWhere: 'ui/three/Game3D.tsx',
  },
  {
    beat: 'Condition applied',
    moments: ['condition'],
    visual: 'chip-in',
    where: 'ui/three/cards3d.tsx (the condition a hit leaves, on its card)',
    sound: 'alarm-gnss',
    haptic: 'short',
    soundWhere: 'ui/three/Game3D.tsx',
    soundPerSubject: 'condition',
  },
  {
    beat: 'Condition persists into a new turn',
    visual: 'silent',
    where: 'none',
    sound: 'soft-tick',
    haptic: 'none',
    soundWhere: 'none',
    deferred: 'a cue of its own: a live condition presses as the night opens, said in a line and with no sound or moment of its own',
  },
  {
    beat: 'Meter delta',
    visual: 'meter-ease',
    where: 'ui/three/Game3D.tsx (the score and the budget count to their new values)',
    sound: 'tick-down',
    haptic: 'none',
    soundPartners: ['tick-up'],
    soundWhere: 'none',
    deferred: 'its tick in the 3D game: the score and the budget count up and down in silence',
  },
  {
    beat: 'Mission assurance crosses below the win line',
    visual: 'strobe',
    where: 'ui/three/Game3D.tsx (the score reads as under the win line while it is)',
    sound: 'warn-low',
    haptic: 'long',
    soundPartners: ['relief-chime'],
    soundWhere: 'none',
    deferred: 'the crossing itself in the 3D game: the score shows that it is under the line, with no low tone on the way down and no relief chime on the way back',
  },
  {
    beat: 'BLACKOUT CHAIN fires',
    moments: ['strike-hit'],
    visual: 'strike',
    where: 'ui/three/Game3D.tsx (the lights over the area of operations go out)',
    sound: 'blackout-chain',
    haptic: 'long',
    soundWhere: 'ui/three/Game3D.tsx',
  },
  {
    // The commendation's successor (v1.3 brief 6.8).
    beat: 'Defense streak',
    moments: ['streak'],
    visual: 'chip-in',
    where: 'ui/three/cards3d.tsx (the streak line on a blocked move)',
    sound: 'commendation-fanfare',
    haptic: 'light',
    soundWhere: 'ui/three/Game3D.tsx',
  },
  {
    beat: 'FILE TO DOSSIER',
    moments: ['collect'],
    visual: 'collect-glow',
    where: 'ui/three/cards3d.tsx (the FILE TO DOSSIER button on a first meeting)',
    sound: 'data-burst',
    haptic: 'none',
    soundWhere: 'none',
    deferred: 'its own sound in the 3D game: the tap files the card and goes straight to the FILED chime, with no burst before it',
  },
  {
    beat: 'FILED stamp',
    moments: ['file'],
    visual: 'intel-in',
    where: 'ui/three/cards3d.tsx (FILED and the Dossier count, on the card as it is filed)',
    sound: 'arrive-chime',
    haptic: 'none',
    soundWhere: 'ui/three/Game3D.tsx',
  },
  {
    beat: 'End of turn',
    moments: ['end-of-turn'],
    visual: 'rows-in',
    where: 'ui/three/cards3d.tsx (dawn: the night counted on its card)',
    sound: 'resolve-chime',
    haptic: 'light',
    soundWhere: 'ui/three/Game3D.tsx',
  },
  {
    beat: 'Campaign won',
    moments: ['outcome'],
    visual: 'card-rise',
    where: 'ui/three/cards3d.tsx (the ending on the last dawn)',
    sound: 'victory-fanfare',
    haptic: 'none',
    soundWhere: 'ui/three/Game3D.tsx',
  },
  {
    beat: 'Campaign lost',
    moments: ['outcome'],
    visual: 'card-rise',
    where: 'ui/three/cards3d.tsx (the ending on the last dawn)',
    sound: 'defeat-sting',
    haptic: 'long',
    soundWhere: 'ui/three/Game3D.tsx',
  },
]

// Resolve a cue key: `moment:<moment>`, `event:<id>` or `condition:<id>`.
// Undefined for an unknown key, which the coverage test treats as a failure.
export function resolveCue(cueKey: string): Cue | undefined {
  const sep = cueKey.indexOf(':')
  if (sep < 0) return undefined
  const ns = cueKey.slice(0, sep)
  const id = cueKey.slice(sep + 1)
  if (ns === 'moment') return (MOMENT_CUES as Record<string, Cue>)[id]
  if (ns === 'event') return EVENT_CUES[id]
  if (ns === 'condition') return CONDITION_CUES[id]
  return undefined
}
