// The two audio preferences, persisted alongside the playback speed
// (Round 4d). Same shape as director/director.ts's speed preference on
// purpose: a stored value wins, an unreadable store is not an error, and
// the parse is a pure function the battery can drive without a browser.
//
// Effects and music are separate toggles because they answer different
// questions. Muting music is a taste; muting effects is an accessibility
// path, and principle 4 says the game has to stay complete with either off.

export const EFFECTS_PREF_KEY = 'dc-sound-effects'
export const MUSIC_PREF_KEY = 'dc-sound-music'

export interface SoundPrefs {
  effects: boolean
  music: boolean
}

// Both default on. Nothing is audible before the first gesture anyway, so
// a default of off would mean a player who never opens the menu never
// learns the game has sound at all.
export const DEFAULT_SOUND_PREFS: SoundPrefs = { effects: true, music: true }

// 'on' and 'off' rather than JSON booleans, so a hand-edited value reads
// as what it is and anything unrecognised falls back rather than throwing.
export function parseSoundPref(raw: unknown, fallback: boolean): boolean {
  if (raw === 'on') return true
  if (raw === 'off') return false
  return fallback
}

export const serializeSoundPref = (on: boolean): string => (on ? 'on' : 'off')

export function loadSoundPrefs(): SoundPrefs {
  try {
    return {
      effects: parseSoundPref(localStorage.getItem(EFFECTS_PREF_KEY), DEFAULT_SOUND_PREFS.effects),
      music: parseSoundPref(localStorage.getItem(MUSIC_PREF_KEY), DEFAULT_SOUND_PREFS.music),
    }
  } catch {
    return { ...DEFAULT_SOUND_PREFS }
  }
}

export function saveSoundPrefs(prefs: SoundPrefs): void {
  try {
    localStorage.setItem(EFFECTS_PREF_KEY, serializeSoundPref(prefs.effects))
    localStorage.setItem(MUSIC_PREF_KEY, serializeSoundPref(prefs.music))
  } catch {
    // no storage: the preference lasts the session only, exactly as the
    // playback speed does
  }
}
