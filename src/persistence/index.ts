// Persistence layer (R4): local save storage, a scoreboard sink, and the
// portable save codec. All local; the remote seams (SaveStore, ScoreSink)
// are interfaces a v2 backend can implement with no engine or UI change.

export {
  OLDEST_RESUMABLE,
  SAVE_VERSION,
  STALE_SAVE_MESSAGE,
  SaveError,
  StaleSaveError,
  captureGame,
  restoreGame,
  encodeSaveCode,
  decodeSaveCode,
  type DailyOp,
  type PersistedGame,
  type SavePhase,
} from './codec'
export { LocalStorageStore, type SaveStore, type SaveMeta, type RestoredGame } from './SaveStore'
export { LocalScoreSink, type ScoreSink, type ScoreEntry } from './ScoreSink'
export { LocalDailyLedger, type DailyLedger, type DailyResult, type DailyStanding } from './DailyLedger'
export { knownThreats, metEvents, namedEvents, recordMet, recordNamed } from './metEvents'
export { dossier, fileCard } from './dossier'
export { addRunTime, beginRun, readRun, runKey, type RunRecord } from './runRecord'
