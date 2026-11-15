// Dev-only sound board (Round 4d, brief section 7: "a dev-only sound board
// screen lists every cue with a play button, so tuning is a tap, not a
// code edit").
//
// Excluded from the production build: App.tsx reaches this module through
// a dynamic import behind import.meta.env.DEV, which folds to false in a
// production build, so Rollup drops the import and emits no chunk for it.
// The battery checks the built output for this file's marker rather than
// trusting that sentence.
//
// The list is derived from the registry, not typed out here. A cue added
// to the game appears on the board without anyone remembering to add it,
// which is the same reason the coverage test walks the registry.
//
// Since v2.0 R3 (Ken's ruling of 15 November 2026: voices for the threats)
// the board opens with the threats' own voices, one button a threat in the
// registry's order (THREAT_VOICES), so all of them can be heard one after
// another and told apart by ear, which is the one check on them that no
// measurement makes. Each is in the full list below as well.

import { useState } from 'react'
import {
  CONDITION_CUES,
  EVENT_CUES,
  MOMENT_CUES,
  LONG_SOUNDS,
  SECTION_6_ROWS,
  SOUND_MS,
  THREAT_VOICES,
  type Cue,
  type SoundCue,
} from '../cues'
import { getAudioEngine } from './engine'
import { VOICES } from './voices'

export const SOUND_BOARD_MARKER = 'DC_DEV_SOUND_BOARD'

// Which registry entries and which brief rows each voice answers for, so a
// voice can be judged against what it is meant to be doing rather than in
// isolation. Built from the data every time the board renders; it is a dev
// screen and the maps are small.
function usersOf(sound: SoundCue): string[] {
  const out: string[] = []
  const maps: [string, Record<string, Cue>][] = [
    ['moment', MOMENT_CUES as unknown as Record<string, Cue>],
    ['event', EVENT_CUES],
    ['condition', CONDITION_CUES],
  ]
  for (const [ns, map] of maps) {
    for (const [id, entry] of Object.entries(map)) {
      if (entry.sound === sound) out.push(`${ns}:${id}`)
    }
  }
  for (const [id, voice] of Object.entries(THREAT_VOICES)) {
    if (voice === sound) out.push(`threat:${id}`)
  }
  for (const row of SECTION_6_ROWS) {
    if (row.sound === sound) out.push(`section 6: ${row.beat}`)
  }
  return out
}

const CUES = (Object.keys(VOICES) as SoundCue[]).filter((c) => c !== 'placeholder' && c !== 'silent').sort()

export default function SoundBoard({ onBack }: { onBack?: () => void }) {
  const [last, setLast] = useState<string>('')
  const [intensity, setIntensity] = useState(0.5)
  const engine = getAudioEngine()

  const play = (cue: SoundCue) => {
    const scheduled = engine.play(cue, { intensity })
    setLast(scheduled ? `played ${cue}` : `${cue} was not scheduled (locked, muted or hidden)`)
  }

  return (
    <div className="p-4 font-mono text-ink" data-testid={SOUND_BOARD_MARKER}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-phosphor uppercase tracking-widest text-sm">Sound board (dev)</h2>
        {onBack && (
          <button onClick={onBack} className="border border-phosphor/60 text-phosphor px-3 min-h-11">
            Back
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-ink-dim">
        {CUES.length} voices. Effects {engine.preferences.effects ? 'on' : 'off'}, music{' '}
        {engine.preferences.music ? 'on' : 'off'}, context {engine.context ? engine.context.state : 'locked'}.
      </p>

      <label className="mt-3 flex items-center gap-2 text-xs text-ink-dim">
        Severity
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={intensity}
          onChange={(e) => setIntensity(Number(e.target.value))}
        />
        {intensity.toFixed(1)}
      </label>

      <h3 className="mt-4 text-xs text-phosphor uppercase tracking-widest">
        Threat voices ({Object.keys(THREAT_VOICES).length}), as each strike leaves
      </h3>
      <ul className="mt-2 flex flex-wrap gap-2" data-testid="threat-voices">
        {Object.entries(THREAT_VOICES).map(([id, cue]) => (
          <li key={id}>
            <button onClick={() => play(cue)} className="border border-phosphor/60 text-phosphor px-3 min-h-11 text-xs">
              {id} <span className="text-ink-dim">{SOUND_MS[cue]}ms</span>
            </button>
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-xs text-phosphor uppercase tracking-widest">Every voice</h3>
      <ul className="mt-3 grid gap-2">
        {CUES.map((cue) => (
          <li key={cue} className="border border-phosphor/20 bg-panel p-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => play(cue)}
                className="border border-phosphor/60 text-phosphor px-3 min-h-11 min-w-11"
              >
                Play
              </button>
              <span className="text-phosphor">{cue}</span>
              <span className="text-ink-dim text-xs">
                {SOUND_MS[cue]}ms{LONG_SOUNDS[cue] ? ' (sequence)' : ''}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-dim break-words">{usersOf(cue).join(', ') || 'no registry user'}</p>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-ink-dim" aria-live="polite">
        {last}
      </p>
    </div>
  )
}
