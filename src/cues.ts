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

// The visual treatments the presentation layer implements. Each maps to a
// CSS class in src/index.css or in the night's own src/ui/night/night.css;
// 'silent' is a real decision (the moment renders nothing of its own), not
// an absence.
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
  sweep: 'dc-moving-in',
  strike: 'dc-banner-in',
  shield: 'dc-shield-tile',
  tiles: 'dc-tile-in',
  'chip-in': 'dc-chip-in',
  'card-rise': 'dc-card-rise',
  'collect-glow': 'dc-collect-glow',
  'intel-in': 'dc-intel-in',
  'rows-in': 'dc-row-in',
  'meter-ease': '',
  strobe: 'dc-strobe',
  'tile-press': '',
}

// How long each treatment runs, matching the stylesheets (a strike's
// treatments take the strike's length, STRIKE_MS). tests/cues.spec.ts
// reads these out of the CSS, so the two cannot drift.
export const VISUAL_MS: Record<VisualCue, number> = {
  placeholder: 0,
  silent: 0,
  transmission: 320,
  sweep: 200,
  strike: 210,
  shield: 1125,
  tiles: 350,
  'chip-in': 500,
  'card-rise': 250,
  'collect-glow': 0,
  'intel-in': 500,
  'rows-in': 280,
  'meter-ease': 0,
  strobe: 0,
  'tile-press': 0,
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
  // A block (v1.3 R3). The win is on the screen and in the chime; the hand
  // stays still, so a buzz never makes a block feel like a hit.
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


// THE NIGHT'S MOMENTS (v1.3 brief 5.5 and 8.4), each with what it looks
// and sounds like. The strike and the cards play them; the deck's own
// entries below say which voice a particular event strikes with.
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
  // BEGIN TURN n: the next night's word arrives, and the TONIGHT card's
  // intro comes in as a transmission.
  'turn-start': cue('Turn start: a transmission arrives', 'transmission', 'data-burst'),
  // The 750ms overlay. Its sound is EXECUTE's own sweep, played by the
  // press that opened it.
  moving: cue('COLDVEIL is moving', 'sweep', 'silent'),
  'strike-hit': cue('A move lands', 'strike', 'hit-stab'),
  // A block is a win at a glance and to the ear (brief 5.5, section 12).
  'strike-block': cue('A defense blocks a move', 'shield', 'all-clear'),
  // One tick per tile as it lands: up for a blocked point, down for one
  // that got through.
  'result-tiles': cue('Result tiles', 'tiles', 'tick-up'),
  'streak': cue('Defense streak', 'chip-in', 'commendation-fanfare'),
  // The family's stand-in: the hit card plays the deck's own alarm for
  // the condition (CONDITION_CUES).
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

// The sound a landed or blocked move strikes with (brief 8.4: strike, hit
// or block). A move that got through takes the deck's voice for it; a
// block is the same win whatever was blocked.
export function strikeSound(eventId: string, landed: boolean): SoundCue {
  if (!landed) return MOMENT_CUES['strike-block'].sound
  return EVENT_CUES[eventId]?.sound ?? MOMENT_CUES['strike-hit'].sound
}

export const outcomeSound = (won: boolean): SoundCue => (won ? MOMENT_CUES.outcome.sound : 'defeat-sting')

// The grade landing on the debrief: the fanfare for a win, a tick down
// for a loss, which the last END OF TURN has already stung.
export const gradeSound = (won: boolean): SoundCue => (won ? MOMENT_CUES.grade.sound : 'tick-down')

// Every row of the brief's section 6 table, with the visual that now
// carries it and where it lives. The battery walks this so "every row has
// its visual, its sound and its haptic" is checked against the code
// rather than asserted in a report.
export interface Section6Row {
  beat: string
  visual: VisualCue
  where: string
  // The sound column, and where it is played: several rows split across
  // two files.
  sound: SoundCue
  soundWhere: string
  // Rows whose sound is chosen per subject: one alarm per condition.
  soundPerSubject?: 'condition'
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
    where: 'ui/board/Tonight.tsx (the turn intro arrives as a transmission)',
    sound: 'data-burst',
    haptic: 'none',
    soundWhere: 'ui/night/Night.tsx (BEGIN TURN n)',
  },
  {
    beat: 'Buy fleet or countermeasure',
    visual: 'tile-press',
    where: 'ui/Game.tsx procurement controls (fleet orders slide into the strip as ORDERED tiles; defenses hold their state on their PROCURE line)',
    sound: 'buy-click',
    haptic: 'light',
    soundWhere: 'ui/Game.tsx',
  },
  {
    beat: 'Cannot afford',
    visual: 'tile-press',
    where: 'ui/board/Procure.tsx (an order it cannot afford is disabled; ui/Game.tsx buzzes a refused toggle)',
    sound: 'denied-buzz',
    haptic: 'double',
    soundWhere: 'ui/Game.tsx',
    deferred:
      'a refusal the player can reach: since v1.3 R2 PROCURE disables an order the budget cannot take, and the TONIGHT brief toggle never refuses (it turns EXECUTE off instead), so the buzz waits for a control that can refuse',
  },
  {
    beat: 'EXECUTE TURN',
    moments: ['moving'],
    visual: 'sweep',
    where: 'ui/night/Night.tsx (COLDVEIL IS MOVING, 750ms)',
    sound: 'execute-sweep',
    haptic: 'medium',
    soundWhere: 'ui/Game.tsx',
  },
  {
    beat: 'Adversary event lands',
    moments: ['strike-hit'],
    visual: 'strike',
    where: 'ui/night/Night.tsx (the banner) and ui/board/AssetStrip.tsx (the lock-on and the scorch)',
    sound: 'hit-stab',
    haptic: 'medium',
    soundWhere: 'ui/night/Night.tsx',
  },
  {
    // v1.3 R3: a block is its own moment, and a win (brief 5.5 and the
    // section 12 playtest bar). Until then this voice was the quiet turn's.
    beat: 'A defense blocks a move',
    moments: ['strike-block'],
    visual: 'shield',
    where: 'ui/board/AssetStrip.tsx (the shield on the tile it was aimed at) and ui/night/Night.tsx (BLOCKED)',
    sound: 'all-clear',
    haptic: 'none',
    soundWhere: 'ui/night/Night.tsx',
  },
  {
    beat: 'Result tiles',
    moments: ['result-tiles'],
    visual: 'tiles',
    where: 'ui/night/cards.tsx (the result panel)',
    sound: 'tick-up',
    soundPartners: ['tick-down'],
    haptic: 'none',
    soundWhere: 'ui/night/cards.tsx',
  },
  {
    beat: 'Opportunity lands',
    moments: ['opportunity'],
    visual: 'card-rise',
    where: 'ui/night/cards.tsx',
    sound: 'resolve-chime',
    haptic: 'light',
    soundWhere: 'ui/night/closeCards.tsx',
  },
  {
    // v1.3 R3 (brief 5.5 item 5): the call arrives quietly, and its result
    // sounds like a block when the satellite is safe and like a hit when
    // it is lost.
    beat: 'The debris call and its result',
    moments: ['debris-call', 'debris-result'],
    visual: 'card-rise',
    where: 'ui/night/cards.tsx (the call and its result rise as cards)',
    sound: 'all-clear',
    soundPartners: ['hit-stab'],
    haptic: 'none',
    soundWhere: 'ui/night/closeCards.tsx',
  },
  {
    beat: 'Condition applied',
    moments: ['condition'],
    visual: 'chip-in',
    where: 'ui/night/cards.tsx (the new condition chip on the hit card)',
    sound: 'alarm-gnss',
    haptic: 'short',
    soundWhere: 'ui/night/cards.tsx',
    soundPerSubject: 'condition',
  },
  {
    beat: 'Condition persists into a new turn',
    visual: 'silent',
    where: 'ui/board/AssetStrip.tsx (the chip keeps its turns left)',
    sound: 'soft-tick',
    haptic: 'none',
    soundWhere: 'none',
    deferred: 'a cue of its own: since v1.3 R3 a live condition presses during the night with no card, and its chip counts down on the strip',
  },
  {
    beat: 'Meter delta',
    visual: 'meter-ease',
    where: 'ui/cues/Meter.tsx',
    sound: 'tick-down',
    haptic: 'none',
    soundPartners: ['tick-up'],
    soundWhere: 'ui/cues/Meter.tsx',
  },
  {
    beat: 'Mission assurance crosses below the win line',
    visual: 'strobe',
    where: 'ui/cues/Meter.tsx',
    sound: 'warn-low',
    haptic: 'long',
    soundPartners: ['relief-chime'],
    soundWhere: 'ui/cues/Meter.tsx',
  },
  {
    beat: 'BLACKOUT CHAIN fires',
    moments: ['strike-hit'],
    visual: 'strike',
    where: 'ui/night/Night.tsx',
    sound: 'blackout-chain',
    haptic: 'long',
    soundWhere: 'ui/night/Night.tsx',
  },
  {
    // The commendation's successor (v1.3 brief 6.8).
    beat: 'Defense streak',
    moments: ['streak'],
    visual: 'chip-in',
    where: 'ui/night/cards.tsx (the streak line on a BLOCKED card)',
    sound: 'commendation-fanfare',
    haptic: 'light',
    soundWhere: 'ui/night/cards.tsx',
  },
  {
    beat: 'FILE TO DOSSIER',
    moments: ['collect'],
    visual: 'collect-glow',
    where: 'ui/night/cards.tsx',
    sound: 'data-burst',
    haptic: 'none',
    soundWhere: 'ui/night/Night.tsx',
  },
  {
    beat: 'FILED stamp',
    moments: ['file'],
    visual: 'intel-in',
    where: 'ui/night/cards.tsx (the Dossier card)',
    sound: 'arrive-chime',
    haptic: 'none',
    soundWhere: 'ui/night/Night.tsx',
  },
  {
    beat: 'End of turn',
    moments: ['end-of-turn'],
    visual: 'rows-in',
    where: 'ui/night/closeCards.tsx (END OF TURN, its ledger rows stepping in)',
    sound: 'resolve-chime',
    haptic: 'light',
    soundWhere: 'ui/night/closeCards.tsx',
  },
  {
    beat: 'Campaign won',
    moments: ['outcome'],
    visual: 'card-rise',
    where: 'ui/night/cards.tsx (the last END OF TURN)',
    sound: 'victory-fanfare',
    haptic: 'none',
    soundWhere: 'ui/night/closeCards.tsx',
  },
  {
    beat: 'Campaign lost',
    moments: ['outcome'],
    visual: 'card-rise',
    where: 'ui/night/cards.tsx (the last END OF TURN)',
    sound: 'defeat-sting',
    haptic: 'long',
    soundWhere: 'ui/night/closeCards.tsx',
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
