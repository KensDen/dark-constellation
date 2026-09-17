// The React surface over the audio engine (Round 4d). Two hooks and
// nothing else: one to play a cue, one to own the two toggles.
//
// The engine is a module singleton rather than a React context because the
// gesture unlock has to live outside the tree: the first gesture can land
// on any control, including one that unmounts a moment later, and a second
// engine would mean a second AudioContext and a second unlock.

import { useCallback, useEffect, useState } from 'react'
import type { SoundCue } from '../director/cues'
import type { GameState } from '../engine/types'
import { getHaptics } from '../haptics/haptics'
import { getAudioEngine, installGestureUnlock } from './engine'
import { MENU_MUSIC_STATE, musicStateFrom } from './music'
import { loadSoundPrefs, type SoundPrefs } from './prefs'
import type { VoiceOptions } from './voices'

export type PlayCue = (cue: SoundCue, opts?: VoiceOptions) => void

// FIRE A CUE ON EVERY CHANNEL THAT OWNS ONE.
//
// This is the funnel. Every section 6 row the player can reach goes
// through useSound below, and useSound returns this function rather than a
// copy of it, so a test driving this drives exactly what a component
// drives. That is what makes haptic coverage derive: there is no second
// place a cue can be played from, so there is no set of "rows that also
// vibrate" for anyone to declare and get wrong (principle 17). The only
// other caller of engine.play is the dev sound board, which is excluded
// from the production build.
//
// Haptics fires FIRST and on its own gate, not behind the effects one.
// Muting sound is not the same as refusing touch feedback: a player in a
// library has asked for quiet, not for a dead phone. They stay separate
// for the same reason the music and effects toggles are separate.
export function fireCue(cue: SoundCue, opts?: VoiceOptions): void {
  getHaptics().fire(cue)
  getAudioEngine().play(cue, opts)
}

// Stable across renders, so a component can hand it straight to an effect
// dependency list without re-running the effect every render.
export function useSound(): PlayCue {
  return useCallback(fireCue, [])
}

// Arms the first-gesture unlock for the life of the app. Mounted once, at
// the shell; calling it twice would install a second set of listeners, so
// it is deliberately not a per-screen concern.
// Stop every cue in flight. Handed to the playback view, which is the one
// place a player can walk out from under a sound that is still playing.
// Stop every channel that can be left running. The non-React half, for
// the reason fireCue is one: useSilenceSound returns THIS function rather
// than a copy, so a test driving it drives what a component drives. The
// first version built the pair inside the hook, where nothing could reach
// it, and dropping the haptic half left the suite green.
export function silenceCues(): void {
  // Both channels, because both can be left running by a player walking
  // out from under them. A pattern outliving the screen that started it is
  // the same defect as the BLACKOUT CHAIN's static burst arriving 570ms
  // after SKIP, one sense over.
  getHaptics().silence()
  getAudioEngine().silenceAll()
}

export function useSilenceSound(): () => void {
  return useCallback(silenceCues, [])
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

// Tell the music bed where the player is (Round 6b).
//
// Takes the state the player is being SHOWN, not the engine's after-state.
// During playback that is the director's presented state, so the threat
// layer rises on the beat that arms the chain rather than at the top of
// the turn that will eventually arm it: the bed is part of the telling,
// and getting ahead of the telling is the same defect as a meter that
// jumps to its final value before the beat that moves it.
//
// Null means no campaign, which is the start screen and every menu behind
// it: base layer only, by MENU_MUSIC_STATE's construction rather than by a
// branch here.
export function useMusicState(shown: GameState | null | undefined): void {
  useEffect(() => {
    getAudioEngine().setMusicState(shown ? musicStateFrom(shown) : MENU_MUSIC_STATE)
  }, [shown])
  // Leaving the campaign returns the bed to the menu.
  //
  // A SEPARATE effect with no dependencies, not a cleanup on the one
  // above. That effect re-runs on every beat, so resetting in its cleanup
  // would drop the bed to base between every pair of beats and the
  // crossfades would spend the whole turn chasing themselves. This one
  // runs its cleanup once, when Game unmounts, which is the only moment
  // the campaign is actually over. Without it, quitting to the menu left
  // the bed playing the abandoned campaign's threat layer under the title
  // screen and every reference screen behind it, until a new campaign
  // happened to overwrite it.
  useEffect(
    () => () => {
      getAudioEngine().setMusicState(MENU_MUSIC_STATE)
    },
    [],
  )
}
