// Director module (game-feel Round 2): the presentation adapter that
// derives beats from the engine log, the playback director, the cue
// registry, and the placeholder view. Presentation only; nothing here is
// imported by the engine or the content modules.

export { deriveBeats, ID_KEYED_KINDS } from './beats'
export {
  applyPatch,
  cloneModeled,
  residualPatch,
  describePatch,
  MODELED_FIELDS,
  type DeltaLine,
  type DeltaTone,
} from './patch'
export {
  Director,
  BEAT_DWELL_MS,
  PLAYBACK_SPEED_KEY,
  SPEEDS,
  SPEED_LABEL,
  defaultSpeed,
  isSpeed,
  loadSpeedPreference,
  saveSpeedPreference,
  type DirectorOptions,
  type DirectorSnapshot,
  type Scheduler,
  type Speed,
} from './director'
export {
  BEAT_CUES,
  CONDITION_CUES,
  COUNTER_CUES,
  EVENT_CUES,
  SECTION_6_ROWS,
  CARD_SAFE_VISUALS,
  VISUAL_CLASS,
  VISUAL_MS,
  resolveCue,
  visualClass,
  visualFor,
  type Cue,
  type Section6Row,
  type VisualCue,
} from './cues'
export { default as SpeedSelect } from './SpeedSelect'
export { BEAT_KINDS, METER_KEYS, type Beat, type BeatKind, type MeterKey, type Patch } from './types'
