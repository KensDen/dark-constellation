// What SYSTEM holds (v1.3 R1, brief 5.8), on the title and on the board:
// difficulty, sound and motion, the save code both ways, Replay a seed,
// the scoreboard, credits and license, and on the board BACK TO TITLE.
// The named slots left with M21: a game is the autosave plus one code.
//
// The list of controls, with the names the tests find them by, is
// SYSTEM_CONTROLS in ./systemControls.ts; this file renders it.

import { useEffect, useRef, useState } from 'react'
import type { SoundPrefs } from '../audio'
import type { Difficulty } from '../engine/types'
import { DIFFICULTIES } from '../engine/rules'
import { SHEET_BUTTON, SHEET_PRIMARY, SHEET_TOGGLE } from './board/Sheet'
import { MOTION_TOGGLE_LABEL, SYSTEM_CONTROLS, type SystemControl } from './systemControls'
import SoundToggles from './cues/SoundToggles'
import { useMotionSettingOff, setMotionSettingOff } from './cues/motion'
import { parseSeed } from './session'

export interface SystemPanelProps {
  difficulty: Difficulty
  // On the board a change restarts the operation, so it asks first; on
  // the title it sets the next operation's difficulty.
  onDifficulty: (d: Difficulty) => void
  restartsOperation: boolean
  soundPrefs: SoundPrefs
  onSoundPrefs: (next: (prev: SoundPrefs) => SoundPrefs) => void
  // Absent when there is no operation to copy.
  onExport?: () => void
  onImport: (code: string) => void
  onReplaySeed: (seed: number) => void
  onScoreboard: () => void
  onCredits: () => void
  // The board only.
  onTitle?: () => void
  // Leaving a game in progress asks first (Ken, 21 October).
  confirmLeave?: boolean
  // What the deck holds, as one line (QC G-065).
  deckLine: string
  notice: string
}

const LABEL = 'font-display text-[10px] text-dc-muted'
const name = (id: SystemControl['id']) => SYSTEM_CONTROLS.find((c) => c.id === id)!.name

export default function SystemPanel(p: SystemPanelProps) {
  const motionOff = useMotionSettingOff()
  const [pending, setPending] = useState<Difficulty | null>(null)
  const [leaving, setLeaving] = useState(false)
  // The confirm scrolls into view as it opens, rather than opening half
  // under the board's dock (R6 question 14).
  const confirmRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (leaving) confirmRef.current?.scrollIntoView?.({ block: 'center' })
  }, [leaving])
  const [code, setCode] = useState('')
  const [seedText, setSeedText] = useState('')
  const seed = parseSeed(seedText)
  const pick = (d: Difficulty) => {
    if (d === p.difficulty) return
    if (p.restartsOperation) setPending(d)
    else p.onDifficulty(d)
  }
  return (
    <div className="space-y-4 py-3 px-3 text-dc-ink">
      <section data-system-control="difficulty" aria-label={name('difficulty')}>
        <p className={LABEL}>DIFFICULTY</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
            <button key={d} type="button" aria-pressed={p.difficulty === d} data-selected={p.difficulty === d || undefined} className={SHEET_TOGGLE(p.difficulty === d)} onClick={() => pick(d)}>
              {DIFFICULTIES[d].label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-dc-muted">{p.restartsOperation ? 'Changing it restarts the operation.' : 'For your next operation.'}</p>
        {pending && (
          <div role="group" aria-label="Restart the operation" className="mt-2 border-2 border-dc-warn/60 p-2">
            <p className="text-sm text-dc-warn">Restart the operation on {DIFFICULTIES[pending].label}?</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className={SHEET_PRIMARY} onClick={() => { p.onDifficulty(pending); setPending(null) }}>
                RESTART
              </button>
              <button type="button" className={SHEET_BUTTON} onClick={() => setPending(null)}>
                KEEP PLAYING
              </button>
            </div>
          </div>
        )}
      </section>

      <section data-system-control="sound" aria-label="Sound and motion">
        <p className={LABEL}>SOUND AND MOTION</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <SoundToggles prefs={p.soundPrefs} onChange={p.onSoundPrefs} />
          <button
            type="button"
            data-system-control="motion"
            aria-pressed={!motionOff}
            className={SHEET_TOGGLE(!motionOff)}
            onClick={() => setMotionSettingOff(!motionOff)}
          >
            {MOTION_TOGGLE_LABEL} {motionOff ? 'OFF' : 'ON'}
          </button>
        </div>
      </section>

      <section aria-label="Save code">
        <p className={LABEL}>SAVE CODE</p>
        <div className="mt-1 flex flex-wrap gap-2" data-system-control="export">
          {p.onExport && (
            <button type="button" className={SHEET_BUTTON} onClick={p.onExport}>
              {name('export')}
            </button>
          )}
        </div>
        <label className="mt-2 block text-xs text-dc-muted" data-system-control="import">
          Paste a code to load that operation.
          <textarea
            className="mt-1 h-14 w-full border-2 border-dc-line bg-dc-ground px-2 py-1 font-mono text-[16px] text-dc-ink"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="DC1-..."
            aria-label="save code"
          />
        </label>
        <button type="button" className={`${SHEET_BUTTON} mt-1`} disabled={!code.trim()} onClick={() => p.onImport(code)}>
          {name('import')}
        </button>
      </section>

      <section data-system-control="replay" aria-label={name('replay')}>
        <p className={LABEL}>REPLAY A SEED</p>
        <p className="mt-1 text-xs text-dc-muted">Same seed, same game.</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            inputMode="numeric"
            className="w-36 border-2 border-dc-line bg-dc-ground px-2 py-1 font-mono text-[16px] text-dc-ink min-h-11"
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            aria-label="seed"
            placeholder="20260711"
          />
          <button type="button" className={SHEET_BUTTON} disabled={seed === null} onClick={() => seed !== null && p.onReplaySeed(seed)}>
            PLAY THIS SEED
          </button>
        </div>
      </section>

      <section aria-label="Records">
        <div className="flex flex-wrap gap-2">
          <button type="button" data-system-control="scoreboard" className={SHEET_BUTTON} onClick={p.onScoreboard}>
            {name('scoreboard')}
          </button>
          <button type="button" data-system-control="credits" className={SHEET_BUTTON} onClick={p.onCredits}>
            {name('credits')}
          </button>
          {p.onTitle && (
            <button type="button" data-system-control="title" className={SHEET_BUTTON} onClick={p.confirmLeave ? () => setLeaving(true) : p.onTitle}>
              {name('title')}
            </button>
          )}
        </div>
        {leaving && p.onTitle && (
          <div ref={confirmRef} role="group" aria-label="Leave this operation" data-confirm-leave className="mt-2 border-2 border-dc-warn/60 p-2">
            <p className="text-sm text-dc-warn">Leave this operation? It is saved; CONTINUE picks it up.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className={SHEET_PRIMARY} onClick={p.onTitle}>
                LEAVE
              </button>
              <button type="button" className={SHEET_BUTTON} onClick={() => setLeaving(false)}>
                STAY
              </button>
            </div>
          </div>
        )}
        <p data-deck-line className="mt-3 font-mono text-[10px] text-dc-muted">
          {p.deckLine}
        </p>
      </section>

      {p.notice && <p className="font-mono text-xs text-alert-amber">{p.notice}</p>}
    </div>
  )
}
