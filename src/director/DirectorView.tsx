// Placeholder playback view (Round 2). Renders the current beat as plain
// text: its cue label, title, technique tags, layers, severity, deltas and
// the engine's own lines. Tap the card, press Space or Enter with nothing
// focused, or use NEXT to advance; speed is 1x, 2x or instant; SKIP (Esc)
// ends playback at any point. Rounds 3 and 4 replace the text with visual
// and sound cues; the director underneath does not change.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GameState } from '../engine/types'
import { resolveCue } from './cues'
import { Director, type DirectorSnapshot, type Speed } from './director'
import { describePatch, type DeltaTone } from './patch'
import SpeedSelect from './SpeedSelect'
import type { Beat } from './types'

// 44px minimum hit boxes (brief principle 5: designed for a thumb at 375px).
const btn =
  'font-mono border border-phosphor/60 text-phosphor px-3 py-1 min-h-11 hover:bg-phosphor/10 disabled:opacity-40 disabled:cursor-not-allowed'
const h2cls = 'font-mono font-bold text-phosphor uppercase tracking-widest text-sm'
const toneClass: Record<DeltaTone, string> = {
  good: 'text-hero-blue',
  bad: 'text-hero-magenta',
  neutral: 'text-ink',
}

export interface DirectorViewProps {
  before: GameState
  after: GameState
  beats: Beat[]
  speed: Speed
  onSpeedChange: (speed: Speed) => void
  onPresented: (state: GameState) => void
  onDone: () => void
}

export default function DirectorView({ before, after, beats, speed, onSpeedChange, onPresented, onDone }: DirectorViewProps) {
  const directorRef = useRef<Director | null>(null)
  const [snap, setSnap] = useState<DirectorSnapshot | null>(null)
  // Always the current speed, readable from the construction effect without
  // making it a dependency; later changes go through setSpeed so playback
  // position is kept.
  const speedRef = useRef(speed)
  speedRef.current = speed

  // Layout effects throughout, so the first beat, the HUD's presented state
  // and completion all land in the same paint as the change that caused
  // them: no frame where the card and the HUD disagree.
  useLayoutEffect(() => {
    const d = new Director(before, after, beats, { speed: speedRef.current })
    directorRef.current = d
    const publish = () => setSnap(d.snapshot())
    const unsubscribe = d.subscribe(publish)
    publish()
    return () => {
      unsubscribe()
      d.dispose()
      directorRef.current = null
    }
  }, [before, after, beats])

  useEffect(() => {
    directorRef.current?.setSpeed(speed)
  }, [speed])

  useLayoutEffect(() => {
    if (snap) onPresented(snap.presented)
  }, [snap, onPresented])

  const done = snap?.status === 'done'
  useLayoutEffect(() => {
    if (done) onDone()
  }, [done, onDone])

  const advance = useCallback(() => directorRef.current?.advance(), [])
  const skip = useCallback(() => directorRef.current?.skip(), [])

  // Escape skips from anywhere. Space and Enter advance only when nothing
  // is focused, so buttons, the HUD's disclosure summary and links keep
  // their own keyboard behaviour. A held key repeats at the OS rate, which
  // would tear through the whole turn, so only discrete presses count.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'Escape') {
        e.preventDefault()
        skip()
        return
      }
      if (e.target !== document.body) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, skip])

  // The live region is mounted for the life of the view, empty at first, so
  // the opening beat's title is a change to an existing region and gets
  // announced like every later one.
  const beat = snap && snap.status !== 'done' ? snap.beat : null
  const cue = beat ? resolveCue(beat.cueKey) ?? resolveCue(`beat:${beat.kind}`) : undefined
  const deltas = beat ? describePatch(beat.patch, before.scenario, beat.kind) : []

  return (
    <section className={beat ? 'mt-4' : undefined}>
      {/* Assistive tech hears the beat title only; the card itself is a
          plain click region so its text and links stay exposed. */}
      <p className="sr-only" aria-live="polite">
        {beat?.title ?? ''}
      </p>
      {beat && snap && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={h2cls}>4. Adversary phase, turn {before.turn}</h2>
            <span className="font-mono text-xs text-ink-dim">
              beat {snap.visiblePosition} of {snap.visibleTotal}
            </span>
          </div>
          <div
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a, button')) return
              advance()
            }}
            className="mt-2 border border-hero-magenta/40 bg-panel p-3 cursor-pointer select-none"
          >
            <p className="font-mono text-xs text-ink-dim uppercase tracking-widest">{cue?.label ?? beat.kind}</p>
            <p className="mt-1 font-mono font-bold text-phosphor">{beat.title}</p>
            {beat.techniques && beat.techniques.length > 0 && (
              <p className="mt-1 font-mono text-xs text-ink">
                Technique{beat.techniques.length > 1 ? 's' : ''}:{' '}
                {beat.techniques.map((t, i) => (
                  <span key={t.tag}>
                    {i > 0 ? '; ' : ''}
                    <a className="underline" href={t.url} target="_blank" rel="noreferrer">
                      {t.tag}
                    </a>
                  </span>
                ))}
              </p>
            )}
            {beat.layers && beat.layers.length > 0 && (
              <p className="font-mono text-xs text-ink-dim">Layers: {beat.layers.join(', ')}</p>
            )}
            {beat.severity && (
              <p className="font-mono text-xs text-ink-dim">
                Severity {beat.severity.base} base{beat.severity.chain > 0 ? ` + ${beat.severity.chain} chain` : ''}
                {beat.severity.mitigation > 0 ? ` - ${beat.severity.mitigation} mitigated` : ''} ={' '}
                {beat.severity.effective} effective
              </p>
            )}
            {deltas.length > 0 && (
              <ul className="mt-2 font-mono text-sm">
                {deltas.map((d, i) => (
                  <li key={i} className={toneClass[d.tone]}>
                    {d.text}
                  </li>
                ))}
              </ul>
            )}
            {beat.lines.map((line, i) => (
              <p key={i} className="mt-1 text-sm">
                {line}
              </p>
            ))}
            {import.meta.env.DEV && (
              <p className="mt-2 font-mono text-xs text-ink-dim" aria-hidden="true">
                cue: {beat.cueKey} (visual {cue?.visual ?? 'none'}, sound {cue?.sound ?? 'none'})
              </p>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button className={btn} onClick={advance}>
              Next
            </button>
            <SpeedSelect speed={speed} onChange={onSpeedChange} label="Speed:" />
            <button className={`${btn} ml-auto`} onClick={skip}>
              Skip<span className="hidden sm:inline"> [Esc]</span>
            </button>
          </div>
          <p className="mt-1 font-mono text-xs text-ink-dim">
            <span className="hidden sm:inline">Tap the card, or press Space or Enter, to advance.</span>
            <span className="sm:hidden">Tap the card to advance.</span>
          </p>
        </>
      )}
    </section>
  )
}
