// The two audio toggles (Round 4d). Effects and music are separate,
// because they answer different questions: muting music is a taste, and
// muting effects is an accessibility path that principle 4 requires to
// leave a complete game behind.
//
// The labels come from brief.ts, where they were counted while the
// toggles sat on the board. They live in SYSTEM now, styled as its other
// buttons, and say ON or OFF as well as carrying it on aria-pressed (Ken,
// 21 October 2026).

import { SOUND_TOGGLE_LABELS } from '../systemControls'
import type { SoundPrefs } from '../../audio'
import { SHEET_TOGGLE } from '../board/Sheet'

export interface SoundTogglesProps {
  prefs: SoundPrefs
  // An updater rather than a value, so a flip is expressed as "invert this
  // one" against whatever the preferences are when it lands, rather than
  // against whatever they were when this render happened.
  onChange: (next: (prev: SoundPrefs) => SoundPrefs) => void
  className?: string
}


export default function SoundToggles({ prefs, onChange, className }: SoundTogglesProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <button
        type="button"
        aria-pressed={prefs.effects}
        className={SHEET_TOGGLE(prefs.effects)}
        onClick={() => onChange((prev) => ({ ...prev, effects: !prev.effects }))}
      >
        {SOUND_TOGGLE_LABELS.effects} {prefs.effects ? 'ON' : 'OFF'}
      </button>
      <button
        type="button"
        aria-pressed={prefs.music}
        className={SHEET_TOGGLE(prefs.music)}
        onClick={() => onChange((prev) => ({ ...prev, music: !prev.music }))}
      >
        {SOUND_TOGGLE_LABELS.music} {prefs.music ? 'ON' : 'OFF'}
      </button>
    </span>
  )
}
