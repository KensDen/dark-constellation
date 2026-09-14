// Director module (game-feel Round 2): the presentation adapter that
// derives beats from the engine log, the playback director, the cue
// registry, and the placeholder view. Presentation only; nothing here is
// imported by the engine or the content modules.

// METER_DAMAGE_PER_SEVERITY is the adapter's mirror of a private engine
// constant, pinned by the ledger sweep; it is not an engine export.
export { deriveBeats, METER_DAMAGE_PER_SEVERITY, ID_KEYED_KINDS } from './beats'
export {
  applyPatch,
  cloneModeled,
  residualPatch,
  describePatch,
  assetLabel,
  ASSET_KIND_LABEL,
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
export { BEAT_CUES, CONDITION_CUES, COUNTER_CUES, EVENT_CUES, resolveCue, type Cue } from './cues'
export { default as SpeedSelect } from './SpeedSelect'
export { BEAT_KINDS, METER_KEYS, type Beat, type BeatKind, type MeterKey, type Patch } from './types'
