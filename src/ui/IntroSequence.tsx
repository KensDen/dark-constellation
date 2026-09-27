// The cold open (v1.2 R4, brief 6): four slides of hand-built pixel art,
// the watch officer's line typing on under each, pixel-dissolving from one
// to the next, with the music bed building under them.
//
// The seen-flag lives in ./introSeen: App reads it on startup and must not
// import this module to do so, or the cold open rejoins the initial chunk
// (v1.2 R0). Everything only this screen uses (the scenes, the officer,
// the disaster zone, the stylesheet) is imported from here and nowhere
// else, so it all arrives in this chunk.
//
// A tap finishes the line; the next tap moves on. SKIP and Escape leave
// at once, Enter and Space do what a tap does. Leaving by SKIP or by
// BEGIN on the last slide sets the seen-flag, except on a replay from the
// menu's BRIEFING, which leaves it exactly as it was.
//
// REDUCED MOTION is its own path, not the animated one with the timers
// shortened: every line is whole on the first paint, slides crossfade
// instead of dissolving, and no scene loops (the loops are CSS under the
// no-preference guard). tests/cold-open.dom.spec.tsx holds all three.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react'
import { MENU_MUSIC_STATE, coldOpenMusicState, getAudioEngine, useSound } from '../audio'
import ColdOpenScene from './ColdOpenScene'
import {
  CLICK_EVERY,
  CROSSFADE_MS,
  DISSOLVE_MS,
  MS_PER_CHAR,
  OPS_LABEL,
  OP_LABEL,
  SLIDES,
  SPEAKER,
} from './coldOpenSlides'
import { usePageVisible, useReducedMotion } from './cues/motion'
import { markIntroSeen } from './introSeen'
import './coldOpen.css'

// The dissolve's grid, and the order its cells go in: a fixed shuffle, so
// the dissolve is the same every time and a test can know it.
const GRID = 12
const ORDER = (() => {
  const cells = Array.from({ length: GRID * GRID }, (_, i) => i)
  let seed = 0x5eed
  for (let i = cells.length - 1; i > 0; i -= 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const j = seed % (i + 1)
    ;[cells[i], cells[j]] = [cells[j], cells[i]]
  }
  // rank[cell] = when that cell switches, in steps.
  const rank = new Array<number>(cells.length)
  cells.forEach((cell, step) => (rank[cell] = step))
  return rank
})()

const CELL_OVERLAP = 1.05

function Dissolve({ mode }: { mode: 'in' | 'out' }) {
  const step = DISSOLVE_MS / ORDER.length
  return (
    <svg
      aria-hidden="true"
      data-dissolve={mode}
      className={`dc-dissolve dc-dissolve-${mode} pointer-events-none absolute inset-0 h-full w-full`}
      viewBox={`0 0 ${GRID} ${GRID}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
    >
      {ORDER.map((rank, cell) => (
        // A shade over one cell each way: the grid is stretched to the
        // stage, so cell edges fall between device pixels, and cells that
        // only met would leave hairlines of the scene showing through.
        <rect
          key={cell}
          x={cell % GRID}
          y={Math.floor(cell / GRID)}
          width={CELL_OVERLAP}
          height={CELL_OVERLAP}
          style={{ animationDelay: `${Math.round(rank * step)}ms` }}
        />
      ))}
    </svg>
  )
}

// in: the slide is dissolving in. show: it is up, and its line types.
// out: it is dissolving out, toward the next slide or the menu.
type Phase = 'in' | 'show' | 'out'

export interface IntroSequenceProps {
  onDone: () => void
  // A replay from the menu's BRIEFING: the seen-flag is left alone.
  replay?: boolean
}

export default function IntroSequence({ onDone, replay = false }: IntroSequenceProps) {
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  const play = useSound()
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>(reduced ? 'show' : 'in')
  // How much of which slide's line has typed. Keyed by slide, so a new
  // slide starts from nothing without an effect having to reset it first.
  const [typed, setTyped] = useState({ slide: 0, chars: 0 })
  // Under reduced motion, the slide being crossfaded away.
  const [leaving, setLeaving] = useState<number | null>(null)
  const timer = useRef(0)

  const slide = SLIDES[index]
  const text = slide.lines.join(' ')
  const last = index === SLIDES.length - 1
  // Reduced motion shows the whole line from the first paint: derived
  // here rather than set by an effect, which would paint once empty.
  const chars = reduced ? text.length : typed.slide === index ? typed.chars : 0
  const complete = chars >= text.length

  const later = useCallback((fn: () => void, ms: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(fn, ms)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // The dissolve in, then the line.
  useEffect(() => {
    if (reduced || phase !== 'in') return
    later(() => setPhase('show'), DISSOLVE_MS)
  }, [reduced, phase, index, later])

  // A reduced-motion player who turns the preference on mid-dissolve is
  // not left looking at half a grid.
  useEffect(() => {
    if (reduced && phase === 'in') setPhase('show')
  }, [reduced, phase])

  // The typing, about forty characters a second, with the soft click on
  // every CLICK_EVERYth character that is not a space.
  useEffect(() => {
    if (reduced || phase !== 'show' || complete) return
    const id = window.setTimeout(() => {
      const next = chars + 1
      if (text[chars] !== ' ' && next % CLICK_EVERY === 0) play('soft-tick')
      setTyped({ slide: index, chars: next })
    }, MS_PER_CHAR)
    return () => window.clearTimeout(id)
  }, [reduced, phase, complete, chars, text, index, play])

  // The crossfade's outgoing picture goes once it has faded.
  useEffect(() => {
    if (leaving === null) return
    const id = window.setTimeout(() => setLeaving(null), CROSSFADE_MS)
    return () => window.clearTimeout(id)
  }, [leaving])

  // The music builds slide by slide, and hands back to the menu's bed on
  // the way out. The bed itself only starts after the first gesture, as
  // it always has: before that, this sets where it will start from.
  useEffect(() => {
    getAudioEngine().setMusicState(coldOpenMusicState(index))
  }, [index])
  useEffect(
    () => () => {
      getAudioEngine().setMusicState(MENU_MUSIC_STATE)
    },
    [],
  )

  const leave = useCallback(() => {
    if (!replay) markIntroSeen()
    onDone()
  }, [replay, onDone])

  const advance = useCallback(() => {
    if (last) {
      if (!replay) markIntroSeen()
      // Out to the menu the way every slide went out: dissolving, or
      // under reduced motion fading.
      setPhase('out')
      later(onDone, reduced ? CROSSFADE_MS : DISSOLVE_MS)
      return
    }
    if (reduced) {
      setLeaving(index)
      setIndex(index + 1)
      return
    }
    setPhase('out')
    later(() => {
      setIndex(index + 1)
      setPhase('in')
    }, DISSOLVE_MS)
  }, [last, replay, reduced, onDone, later, index])

  // A tap: finish the line, or move on once it is finished. Nothing while
  // a dissolve out is already moving on, and no moving on while the slide
  // is still dissolving in: starting the dissolve out from there would
  // uncover, in one frame, the half of the picture still under the grid.
  const tap = useCallback(() => {
    if (phase === 'out') return
    if (!complete) {
      setTyped({ slide: index, chars: text.length })
      return
    }
    if (phase === 'in') return
    advance()
  }, [phase, complete, index, text.length, advance])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'Escape') {
        e.preventDefault()
        leave()
        return
      }
      if (e.key !== 'Enter' && e.key !== ' ') return
      // A focused button answers its own Enter and Space.
      if (e.target instanceof Element && e.target.closest('button')) return
      e.preventDefault()
      tap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leave, tap])

  // Under reduced motion, the picture on the stage fades in on the first
  // slide and fades out after the last.
  const fade = !reduced ? '' : phase === 'out' ? 'dc-crossfade-out' : index === 0 ? 'dc-crossfade-in' : ''

  const onButton = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation()
    fn()
  }
  // A held Enter on a focused button would click it again on every
  // repeat, and race the player through the whole cold open.
  const noRepeat = (e: ReactKeyboardEvent) => {
    if (e.repeat) e.preventDefault()
  }

  return (
    <main
      aria-label="Briefing"
      className={`fixed inset-0 z-40 flex flex-col bg-dc-ground pt-safe pb-safe px-safe font-mono text-dc-ink ${visible ? '' : 'dc-board-hidden'}`}
    >
      <header className="flex flex-none items-center justify-between border-b-2 border-dc-line bg-dc-chrome px-4 py-1">
        <p className="font-display text-[10px] leading-none text-dc-go">{OPS_LABEL}</p>
        <button type="button" onClick={onButton(leave)} onKeyDown={noRepeat} className="min-h-11 px-2 font-display text-[10px] text-dc-muted">
          SKIP
        </button>
      </header>

      <div data-cold-open-slide={index} className="flex min-h-0 flex-1 flex-col" onClick={tap}>
        <div data-cold-open-stage className="relative min-h-0 flex-1 overflow-hidden">
          <ColdOpenScene key={index} scene={slide.scene} className={fade} />
          {/* Keyed by the slide it shows, so a second NEXT inside the
              fade starts a fade of its own rather than inheriting what
              is left of this one. */}
          {leaving !== null && <ColdOpenScene key={`leaving${leaving}`} scene={SLIDES[leaving].scene} leaving className="dc-crossfade-out" />}
          {!reduced && phase !== 'show' && <Dissolve key={`${index}${phase}`} mode={phase} />}
        </div>

        <section data-cold-open-text className="flex-none border-t-2 border-dc-line bg-dc-chrome px-4 pt-3 pb-3">
          <div className="flex items-baseline justify-between">
            <p className="font-display text-[10px] leading-none text-dc-go">{OP_LABEL}</p>
            <p className="text-xs text-dc-muted">
              {index + 1} / {SLIDES.length}
            </p>
          </div>
          <p className="mt-3 font-display text-[9px] leading-none text-dc-muted">{SPEAKER}</p>
          {/* The whole line is always in the accessibility tree. Every
              slide's line is laid out, unseen, in the same cell, so the
              block is as tall as the longest of them on every slide: the
              scene above never changes size, and nothing moves as a line
              types into the space it will fill. */}
          <div className="mt-2 grid text-sm leading-relaxed">
            {SLIDES.map((s, i) => (
              <p key={i} className="invisible col-start-1 row-start-1" aria-hidden="true">
                {s.lines.join(' ')}
              </p>
            ))}
            <p className="sr-only" aria-live="polite">
              {text}
            </p>
            <p data-cold-open-line className="col-start-1 row-start-1" aria-hidden="true">
              {text.slice(0, chars)}
              {!complete && (
                <span data-cursor className="text-dc-go">
                  _
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onButton(tap)}
            onKeyDown={noRepeat}
            className="mt-3 min-h-12 w-full border-2 border-dc-line bg-dc-panel font-display text-xs text-dc-go shadow-press active:translate-y-[3px] active:shadow-none"
          >
            {last ? 'BEGIN' : 'NEXT'}
          </button>
        </section>
      </div>
    </main>
  )
}
