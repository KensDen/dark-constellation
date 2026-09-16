// The React surface over the audio engine (Round 4d). Two hooks and
// nothing else: one to play a cue, one to own the two toggles.
//
// The engine is a module singleton rather than a React context because the
// gesture unlock has to live outside the tree: the first gesture can land
// on any control, including one that unmounts a moment later, and a second
// engine would mean a second AudioContext and a second unlock.

import { useCallback, useEffect, useState } from 'react'
import type { SoundCue } from '../director/cues'
import { getAudioEngine, installGestureUnlock } from './engine'
import { loadSoundPrefs, type SoundPrefs } from './prefs'
import type { VoiceOptions } from './voices'

export type PlayCue = (cue: SoundCue, opts?: VoiceOptions) => void

// Stable across renders, so a component can hand it straight to an effect
// dependency list without re-running the effect every render.
export function useSound(): PlayCue {
  return useCallback((cue: SoundCue, opts?: VoiceOptions) => {
    getAudioEngine().play(cue, opts)
  }, [])
}

// Arms the first-gesture unlock for the life of the app. Mounted once, at
// the shell; calling it twice would install a second set of listeners, so
// it is deliberately not a per-screen concern.
// Stop every cue in flight. Handed to the playback view, which is the one
// place a player can walk out from under a sound that is still playing.
export function useSilenceSound(): () => void {
  return useCallback(() => getAudioEngine().silenceAll(), [])
}

export function useGestureUnlock(): void {
  useEffect(() => installGestureUnlock(), [])
}

export type SoundPrefsUpdate = SoundPrefs | ((prev: SoundPrefs) => SoundPrefs)

// The setter takes an updater as well as a value, and the toggles use the
// updater form. Building the next preferences from a prop means building
// them from the last render, which a storage event from another tab, or
// two changes inside one React batch, can already have moved past: the
// second change would then carry the first one back to what it was.
export function useSoundPrefs(): [SoundPrefs, (next: SoundPrefsUpdate) => void] {
  const [prefs, setPrefsState] = useState<SoundPrefs>(() => {
    // The engine already loaded them; read through it so the two cannot
    // start out disagreeing, which is the bug a second load would cause on
    // a storage write that failed.
    const engine = getAudioEngine()
    return engine.preferences
  })
  // A storage write from another tab is the one way these can drift after
  // mount. Cheap to answer, and it keeps the toggle honest.
  useEffect(() => {
    const onStorage = () => {
      const next = loadSoundPrefs()
      getAudioEngine().setPreferences(next, false)
      setPrefsState(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // The updater resolves against the ENGINE's preferences rather than
  // against React's previous state, and the engine call happens outside
  // setPrefsState rather than inside it.
  //
  // Both halves matter. The engine is the single owner of this value, and
  // it is updated synchronously below, so reading it is never stale in the
  // way a render's closure can be. And running the engine call inside a
  // state updater would be the Round 4b defect again: React is free to
  // double-invoke or discard an updater, and an updater with a side effect
  // in it silently broke the keyboard path once already.
  const setPrefs = useCallback((next: SoundPrefsUpdate) => {
    const engine = getAudioEngine()
    const resolved = typeof next === 'function' ? next(engine.preferences) : next
    engine.setPreferences(resolved)
    setPrefsState(resolved)
  }, [])

  return [prefs, setPrefs]
}
