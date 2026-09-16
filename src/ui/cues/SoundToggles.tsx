// The two audio toggles (Round 4d). Effects and music are separate,
// because they answer different questions: muting music is a taste, and
// muting effects is an accessibility path that principle 4 requires to
// leave a complete game behind.
//
// One word each. The labels come from brief.ts, where the chrome word
// budget is counted, so the count and the screen cannot disagree; the on
// and off state rides aria-pressed rather than a second word, which is how
// two controls fit in the two words chrome had to spend.

import { SOUND_TOGGLE_LABELS } from '../brief'
import type { SoundPrefs } from '../../audio'

export interface SoundTogglesProps {
  prefs: SoundPrefs
  // An updater rather than a value, so a flip is expressed as "invert this
  // one" against whatever the preferences are when it lands, rather than
  // against whatever they were when this render happened.
  onChange: (next: (prev: SoundPrefs) => SoundPrefs) => void
  className?: string
}

const toggleClass = (on: boolean) =>
  `font-mono text-xs border px-3 min-h-11 ${
    on ? 'border-phosphor bg-phosphor/15 text-phosphor' : 'border-phosphor/40 text-ink-dim hover:bg-phosphor/10'
  }`

export default function SoundToggles({ prefs, onChange, className }: SoundTogglesProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <button
        type="button"
        aria-pressed={prefs.effects}
        className={toggleClass(prefs.effects)}
        onClick={() => onChange((prev) => ({ ...prev, effects: !prev.effects }))}
      >
        {SOUND_TOGGLE_LABELS.effects}
      </button>
      <button
        type="button"
        aria-pressed={prefs.music}
        className={toggleClass(prefs.music)}
        onClick={() => onChange((prev) => ({ ...prev, music: !prev.music }))}
      >
        {SOUND_TOGGLE_LABELS.music}
      </button>
    </span>
  )
}
