// Audio module (game-feel Round 4d): synthesized effects, the engine that
// owns the context and the gesture unlock, and the two persisted toggles.
// Presentation only; nothing here is imported by the engine or the content
// modules, and nothing here is fetched, bundled or licensed, because every
// sound is generated in code.

export {
  AudioEngine,
  EFFECTS_LEVEL,
  MUSIC_LEVEL,
  SILENCE_FADE_S,
  getAudioEngine,
  installGestureUnlock,
  resetAudioEngineForTests,
  shouldSchedule,
  type AudioEngineOptions,
  type ScheduleState,
} from './engine'
export {
  DEFAULT_SOUND_PREFS,
  EFFECTS_PREF_KEY,
  MUSIC_PREF_KEY,
  loadSoundPrefs,
  parseSoundPref,
  saveSoundPrefs,
  serializeSoundPref,
  type SoundPrefs,
} from './prefs'
export { VOICES, type Voice, type VoiceOptions } from './voices'
export { MAX_EFFECTIVE_SEVERITY, NEUTRAL_INTENSITY, beatIntensity } from './intensity'
export { useGestureUnlock, useSilenceSound, useSound, useSoundPrefs, type PlayCue, type SoundPrefsUpdate } from './useSound'
export type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadLike,
  BufferSourceLike,
  GainLike,
  OscillatorLike,
} from './graph'
