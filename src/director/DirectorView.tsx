// Playback view (Round 3). Each beat now lands as a visual cue from the
// registry rather than as plain text: the threat card flips in, the
// affected layer badges pulse, conditions attach and clear, commendations
// drop a ribbon, and the BLACKOUT CHAIN darkens the card. The engine's own
// prose moved behind DETAILS, so the beat reads as deltas and a headline
// (brief v0.5 section 5). Tap the card, press Space or Enter with nothing
// focused, or use NEXT to advance; SKIP or Escape ends playback.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GameState } from '../engine/types'
import { CARD_SAFE_VISUALS, VISUAL_CLASS, VISUAL_MS, resolveCue, visualFor } from './cues'
import { Director, beatCueMs, type DirectorSnapshot, type Speed } from './director'
import { describePatch, type DeltaTone } from './patch'
import SpeedSelect from './SpeedSelect'
import type { Beat } from './types'
import { useCueClass, useReducedMotion } from '../ui/cues/motion'
import { onVisibilityChange, pageVisible, playbackPaused } from '../ui/cues/visibility'
import { layerBadges, vectorIcons } from '../ui/cues/icons'
import { DEFAULT_SCENARIO } from '../content'

// 44px minimum hit boxes (brief principle 5: designed for a thumb at 375px).
const btn =
  'font-mono border border-phosphor/60 text-phosphor px-3 py-1 min-h-11 hover:bg-phosphor/10 disabled:opacity-40 disabled:cursor-not-allowed'
const h2cls = 'font-mono font-bold text-phosphor uppercase tracking-widest text-sm'
const toneClass: Record<DeltaTone, string> = {
  good: 'text-hero-blue',
  bad: 'text-hero-magenta',
  neutral: 'text-ink',
}

const HOSTILE_KINDS = new Set(['threat', 'condition-applied', 'condition-renewed', 'condition-pressure', 'chain-armed'])
const FRIENDLY_KINDS = new Set(['commendation', 'opportunity', 'deploy-arrived', 'condition-cleared', 'surge-spent'])

export interface DirectorViewProps {
  before: GameState
  after: GameState
  beats: Beat[]
  speed: Speed
  onSpeedChange: (speed: Speed) => void
  onPresented: (state: GameState, chosenCredits: number) => void
  onDone: () => void
}

export default function DirectorView({ before, after, beats, speed, onSpeedChange, onPresented, onDone }: DirectorViewProps) {
  const directorRef = useRef<Director | null>(null)
  const [snap, setSnap] = useState<DirectorSnapshot | null>(null)
  const reduced = useReducedMotion()
  // Always the current speed, readable from the construction effect without
  // making it a dependency; later changes go through setSpeed so playback
  // position is kept.
  const speedRef = useRef(speed)
  speedRef.current = speed

  // Layout effects throughout, so the first beat, the HUD's presented state
  // and completion all land in the same paint as the change that caused
  // them: no frame where the card and the HUD disagree.
  // Read through a ref so a preference change takes effect on the next
  // beat without rebuilding the director and losing playback position.
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced

  useLayoutEffect(() => {
    const d = new Director(before, after, beats, {
      speed: speedRef.current,
      // Under reduced motion there is no animation to protect, so the
      // dwell floor would only slow the turn down.
      cueMs: (beat) => (reducedRef.current ? 0 : beatCueMs(beat)),
    })
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

  // Hidden means paused, for every channel (src/ui/cues/visibility.ts).
  useEffect(() => {
    directorRef.current?.setPaused(playbackPaused(pageVisible()))
    return onVisibilityChange((visible) => directorRef.current?.setPaused(playbackPaused(visible)))
  }, [before, after, beats])

  useLayoutEffect(() => {
    if (snap) onPresented(snap.presented, snap.chosenCredits)
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

  const beat = snap && snap.status !== 'done' ? snap.beat : null
  const cueKey = beat?.cueKey ?? ''
  // The beat's treatment either belongs on the card or on a marker inside
  // it: the badge and token families end hidden, so running one on the
  // card would fade the card away (see CARD_SAFE_VISUALS).
  const visual = beat ? visualFor(cueKey, beat.kind) : undefined
  const onCard = !!visual && CARD_SAFE_VISUALS.has(visual)
  const cardClass = (onCard && VISUAL_CLASS[visual]) || 'dc-card-in'
  const cardCue = useCueClass(beat?.id ?? null, cardClass, reduced, onCard && visual ? VISUAL_MS[visual] : 260)
  const markerClass = !onCard && visual ? VISUAL_CLASS[visual] : ''
  // The marker holds its end state rather than clearing: badge-clear
  // finishes at opacity zero and token-burn at a quarter, so dropping the
  // class would snap the marker back to full strength as the cue ended.
  const markerCue = useCueClass(markerClass ? (beat?.id ?? null) : null, markerClass, reduced, 0)

  // The live region is mounted for the life of the view, empty at first, so
  // the opening beat's title is a change to an existing region and gets
  // announced like every later one.
  const cue = beat ? resolveCue(beat.cueKey) ?? resolveCue(`beat:${beat.kind}`) : undefined
  const deltas = beat && snap ? describePatch(beat.patch, snap.presented, beat.kind) : []
  const def = beat?.subjectId ? DEFAULT_SCENARIO.events.find((e) => e.id === beat.subjectId) : undefined
  const lost = beat?.kind === 'outcome' && beat.title.startsWith('MISSION FAILED')
  const hostile = beat ? HOSTILE_KINDS.has(beat.kind) || lost : false
  const border = beat
    ? hostile
      ? 'border-hero-magenta/50'
      : FRIENDLY_KINDS.has(beat.kind) || beat.kind === 'outcome'
        ? 'border-hero-blue/50'
        : 'border-phosphor/30'
    : 'border-phosphor/30'

  return (
    <section className={beat ? 'mt-4' : undefined}>
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
              if ((e.target as HTMLElement).closest('a, button, summary')) return
              advance()
            }}
            className={`mt-2 border ${border} bg-panel p-3 cursor-pointer select-none ${cardCue}`}
          >
            <div className="flex items-start gap-2">
              {def && (
                <img
                  src={vectorIcons[def.vector]}
                  alt=""
                  aria-hidden="true"
                  className="w-6 h-6 shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-ink-dim uppercase tracking-widest">
                  {/* The marker carries treatments that were authored for a
                      badge, so the card itself is never animated out. */}
                  {markerClass && (
                    <span
                      aria-hidden="true"
                      className={`inline-block w-2 h-2 mr-1.5 align-middle ${
                        hostile ? 'bg-hero-magenta' : 'bg-phosphor'
                      } ${markerCue}`}
                    />
                  )}
                  {cue?.label ?? 'Turn event'}
                </p>
                <p className={`mt-0.5 font-mono font-bold ${hostile ? 'text-hero-magenta' : 'text-phosphor'}`}>
                  {beat.title}
                </p>
              </div>
              {/* The affected layers pulse as the hit lands. */}
              {beat.layers && beat.layers.length > 0 && (
                <span className="flex shrink-0 gap-1.5">
                  {/* Keyed by beat as well as layer: two consecutive beats on
                      the same layer at the same tone render a byte-identical
                      class on the same node, and a finished animation does
                      not restart until the element is new. */}
                  {beat.layers.map((layer) => (
                    <span key={`${beat.id}-${layer}`} className="flex flex-col items-center">
                      <img
                        src={layerBadges[layer]}
                        alt=""
                        aria-hidden="true"
                        className={`h-7 w-auto ${
                          reduced ? '' : hostile ? 'dc-pulse-hostile' : 'dc-pulse-friendly'
                        }`}
                      />
                      <span className="font-mono text-[9px] text-ink-dim leading-none mt-0.5">{layer}</span>
                    </span>
                  ))}
                </span>
              )}
            </div>

            {beat.techniques && beat.techniques.length > 0 && (
              <p className="mt-2 font-mono text-xs text-ink">
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
            {/* The engine's prose is the ledger, not the report; it stays
                one tap away (brief v0.5 section 5). */}
            {beat.lines.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer font-mono text-xs text-phosphor">Details</summary>
                {beat.lines.map((line, i) => (
                  <p key={i} className="mt-1 text-sm">
                    {line}
                  </p>
                ))}
              </details>
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
