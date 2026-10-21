// Playback view (Round 3). Each beat now lands as a visual cue from the
// registry rather than as plain text: the threat card flips in, the
// affected layer badges pulse, conditions attach and clear, commendations
// drop a ribbon, and the BLACKOUT CHAIN darkens the card. The engine's own
// prose moved behind DETAILS, so the beat reads as deltas and a headline
// (brief v0.5 section 5). Tap the card, press Space or Enter with nothing
// focused, or use NEXT to advance; SKIP or Escape ends playback. Nothing
// advances on its own since v1.3 Round 0 (brief 5.5): the dwell, the speed
// control and the hidden-page pause are gone, and every beat waits for the
// player.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GameState } from '../engine/types'
import { CARD_SAFE_VISUALS, VISUAL_CLASS, VISUAL_MS, resolveCue, soundFor, visualFor } from './cues'
import { Director, type DirectorSnapshot } from './director'
import { describePatch, type DeltaTone } from './patch'
import type { Beat } from './types'
import { useCueClass, useReducedMotion } from '../ui/cues/motion'
import { layerBadges, vectorIcons } from '../ui/cues/icons'
import Scene, { sceneFor } from '../ui/cues/Scene'
import { beatIntensity, useSilenceSound, useSound } from '../audio'
import { DEFAULT_SCENARIO } from '../content'
import RealWorld from '../ui/RealWorld'
import { realWorldFor } from '../ui/realWorldLine'
import * as wouldHaveHelped from '../ui/wouldHaveHelped'
import { LOCK_SHARE, STRIKE_MS } from '../ui/board/strike'
import { callSigns, withCallSigns } from '../ui/board/board'

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
const FRIENDLY_KINDS = new Set(['commendation', 'opportunity', 'deploy-arrived', 'condition-cleared'])

// The beats whose subject is a threat event: the event itself, landed or
// held, and the condition it leaves. The defense streak says what the
// player did, not what the adversary did.
const REAL_WORLD_KINDS: ReadonlySet<Beat['kind']> = new Set(['threat', 'condition-applied', 'condition-renewed', 'condition-pressure'])

export interface DirectorViewProps {
  before: GameState
  after: GameState
  beats: Beat[]
  // The beat on screen travels with the state it presents (v1.2 R3), so
  // the board can land a hit on the tile the beat names.
  onPresented: (state: GameState, chosenCredits: number, beat: Beat | null) => void
  onDone: () => void
  // A dialog is open over the board (v1.2 R5b): its keys are its own, so
  // the playback's Space and Escape stand down.
  held?: boolean
}

export default function DirectorView({ before, after, beats, onPresented, onDone, held = false }: DirectorViewProps) {
  const directorRef = useRef<Director | null>(null)
  const [snap, setSnap] = useState<DirectorSnapshot | null>(null)
  const reduced = useReducedMotion()
  const play = useSound()
  const silence = useSilenceSound()

  // Layout effects throughout, so the first beat, the HUD's presented state
  // and completion all land in the same paint as the change that caused
  // them: no frame where the card and the HUD disagree.

  // Leaving playback stops whatever it was saying. The longest cues in the
  // game are here (the BLACKOUT CHAIN at 1500ms, the defeat sting at
  // 1200ms), and a player who skips or backs out to the menu halfway
  // through one would otherwise hear the rest of it over the next screen.
  //
  // But ONLY when the player left. This view also unmounts when playback
  // simply finishes: the last beat is tapped past, the director reports
  // done, and Game swaps to the aftermath. A closing cue longer than the
  // player's look at its beat (the defeat sting runs 1200ms) should finish
  // over the aftermath, which is the screen it belongs to.
  const finishedRef = useRef(false)
  useEffect(
    () => () => {
      if (!finishedRef.current) silence()
    },
    [silence],
  )

  useLayoutEffect(() => {
    const d = new Director(before, after, beats)
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

  useLayoutEffect(() => {
    if (snap) onPresented(snap.presented, snap.chosenCredits, snap.beat)
  }, [snap, onPresented])

  const done = snap?.status === 'done'
  useLayoutEffect(() => {
    if (!done) return
    // Recorded before onDone, because onDone is what unmounts this view.
    finishedRef.current = true
    onDone()
  }, [done, onDone])

  const advance = useCallback(() => directorRef.current?.advance(), [])
  const skip = useCallback(() => {
    // SKIP means now, in all three channels. It silences here rather than
    // leaving it to the unmount, because skipping drives the director to
    // done and the unmount path deliberately lets a finished playback's
    // last cue ring out.
    silence()
    directorRef.current?.skip()
  }, [silence])

  // Escape skips from anywhere. Space and Enter advance only when nothing
  // is focused, so buttons, the HUD's disclosure summary and links keep
  // their own keyboard behaviour. A held key repeats at the OS rate, which
  // would tear through the whole turn, so only discrete presses count.
  // While a dialog holds the playback, its keys are the dialog's: focus can
  // fall back to the page inside one, and a Space meant for the dialog must
  // not step the turn behind it (v1.2 R5b).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || held) return
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
  }, [advance, skip, held])

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
  // finishes at opacity zero, so dropping the
  // class would snap the marker back to full strength as the cue ended.
  const markerCue = useCueClass(markerClass ? (beat?.id ?? null) : null, markerClass, reduced, 0)

  // The live region is mounted for the life of the view, empty at first, so
  // the opening beat's title is a change to an existing region and gets
  // announced like every later one.
  const cue = beat ? resolveCue(beat.cueKey) ?? resolveCue(`beat:${beat.kind}`) : undefined
  const deltas = beat && snap ? describePatch(beat.patch, snap.presented, beat.kind) : []
  const def = beat?.subjectId ? DEFAULT_SCENARIO.events.find((e) => e.id === beat.subjectId) : undefined
  const realWorld = beat && REAL_WORLD_KINDS.has(beat.kind) ? realWorldFor(def) : null
  // A threat that landed names what would have helped, under its severity
  // (critique row M3), read against the turn's end state as the ledger is.
  const landed = beat?.kind === 'threat' && (beat.severity?.effective ?? 0) > 0 ? after.history.at(-1)?.events.find((e) => e.eventId === beat.subjectId) : undefined
  const helped = landed ? wouldHaveHelped.short(landed, after, after.scenario) : ''
  // Call signs as the board shows them, before the turn and after it, so an
  // asset lost or arrived this turn still reads by its tile's name.
  const signs = new Map([...callSigns(before), ...callSigns(after)])
  // Finding 3.10: the beat says whether it is a loss. Derived from the
  // title until Round 5, which is the round that gives the outcomes their
  // scenes and would therefore be the round to edit those titles; the win
  // and the loss both begin with the word MISSION, so an edit inverted the
  // treatment silently and a lost campaign rendered friendly with a
  // victory fanfare.
  const lost = beat?.kind === 'outcome' && beat.lost === true

  // The beat's sound, fired once per beat. Keyed on the beat id rather than
  // on the beat object so a re-render that produces the same beat does not
  // re-trigger it, and so a repeat of the same kind later in the turn does.
  //
  // Placed here rather than inside the director because the director runs
  // in node in the suite and has no business knowing about audio; the view
  // is where a beat becomes something a player perceives. The engine's
  // decision about whether a sound is allowed at all lives one layer
  // further down, in src/audio/engine.ts, so nothing here has to ask.
  //
  // A hit's impact is heard and felt when it lands (v1.2 R3), after the
  // lock-on the board plays for LOCK_SHARE of the strike, not at the start
  // of the beat with the tile still untouched.
  useEffect(() => {
    if (!beat) return
    const sound = soundFor(beat.cueKey, beat.kind, lost)
    if (!sound) return
    const fire = () => play(sound, { intensity: beatIntensity(beat) })
    const lands = beat.kind === 'threat' && beat.targetAssetId !== undefined && (beat.severity?.effective ?? 0) > 0
    if (!lands) {
      fire()
      return
    }
    const id = window.setTimeout(fire, STRIKE_MS * LOCK_SHARE)
    return () => window.clearTimeout(id)
    // The beat object itself, which the director hands back unchanged for
    // as long as that beat is on screen: its identity is what makes "once
    // per beat" true, and a render that changes nothing else does not
    // re-fire it. Keyed on the id instead at first, with a lint
    // suppression to match; the id was redundant, since the object is
    // exactly as stable, and a mutation adding the object back to the
    // dependency list changed nothing at all, which is what said so.
  }, [beat, lost, play])
  const hostile = beat ? HOSTILE_KINDS.has(beat.kind) || lost : false
  const scene = sceneFor(beat)
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
            // Marked so a test can name THIS element rather than reaching
            // for it by class: the scenes carry a border of their own, so
            // closest('div.border') from inside a scene returns the scene
            // and a guard on the card's colour silently read the scene's.
            data-beat-card=""
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

            {/* The cinematic scenes (Round 5). Four beats are promoted from
                a one-shot class to a structure the player can read; every
                other beat keeps the baseline treatment and renders
                nothing here. */}
            {scene && snap && (
              // KEYED ON THE BEAT, and this is load-bearing rather than
              // tidiness. Scene holds the arriving value that makes its
              // readouts count, so an unkeyed Scene carries that number
              // across a beat change: two adjacent commendations had the
              // second counting from the first award, and a win on a turn
              // that earned one painted the credit bonus under the label
              // Final MAI. Keying the child readout could not fix it,
              // because a key cannot reset state it does not own.
              <Scene
                key={beat.id}
                kind={scene}
                beat={beat}
                presented={snap.presented}
                final={after}
                reduced={reduced}
              />
            )}

            {/* The REAL WORLD line (v1.2 R3, brief 4.8) on every card whose
                subject is a threat, landed, held or pressing as a condition:
                the technique and its first source, one tap from the
                learn-more card. It carries the first technique's link, so
                the line below lists only the rest when there is one. */}
            {realWorld && <RealWorld line={realWorld} />}
            {beat.techniques && beat.techniques.length > (realWorld ? 1 : 0) && (
              <p className="mt-2 font-mono text-xs text-ink">
                Technique{beat.techniques.length - (realWorld ? 1 : 0) > 1 ? 's' : ''}:{' '}
                {beat.techniques.slice(realWorld ? 1 : 0).map((t, i) => (
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
                Strength {beat.severity.base}{beat.severity.chain > 0 ? ` + ${beat.severity.chain} chain` : ''}
                {beat.severity.mitigation > 0 ? ` - ${beat.severity.mitigation} blocked` : ''}
                {beat.severity.avoided ? `, ${beat.severity.avoided}` : ''} ={' '}
                {beat.severity.effective} landed
              </p>
            )}
            {helped && (
              <p data-would-have-helped className="font-mono text-xs font-bold text-alert-amber">
                {helped}
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
                    {withCallSigns(line, signs)}
                  </p>
                ))}
              </details>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button className={btn} onClick={advance}>
              Next
            </button>
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
