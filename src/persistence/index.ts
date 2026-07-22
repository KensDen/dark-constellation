// Persistence layer (R4): local save storage, a scoreboard sink, and the
// portable save codec. All local; the remote seams (SaveStore, ScoreSink)
// are interfaces a v2 backend can implement with no engine or UI change.

export {
  SAVE_VERSION,
  SaveError,
  captureGame,
  restoreGame,
  encodeSaveCode,
  decodeSaveCode,
  type PersistedGame,
  type SavePhase,
} from './codec'
export { LocalStorageStore, type SaveStore, type SaveMeta, type RestoredGame } from './SaveStore'
export { LocalScoreSink, type ScoreSink, type ScoreEntry } from './ScoreSink'
