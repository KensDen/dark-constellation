// THE BRIEFING (v1.2 R4 as the cold open; rebuilt in v1.3 R1, brief 5.2):
// four beats, each an animated pixel scene on one canvas with a caption at
// each top corner, the watch officer's line typing on under it at forty
// characters a second, a four-segment progress bar, and the button pinned
// at the bottom: CONTINUE, then BEGIN TURN 1, or BACK TO TITLE when the
// title's BRIEFING replays it. SKIP top right.
//
// Tapping the text finishes the line. Tapping the picture finishes the
// line, and a second tap moves on. CONTINUE always moves on. Escape is
// SKIP; Enter and Space do what a tap on the picture does.
//
// It fits one phone screen with the safe areas subtracted: the picture
// takes what the line, the bar and the button leave, so CONTINUE never
// needs a scroll (Ken, 6 October). The line's block is as tall as the
// longest beat's, so nothing moves as a line types or the beat changes.
//
// The seen-flag lives in ./introSeen: App reads it on startup and must not
// import this module to do so, or the briefing rejoins the initial chunk.
// Leaving a first viewing by SKIP or by BEGIN TURN 1 sets it; a replay
// leaves it exactly as it was.
//
// REDUCED MOTION is its own path: one still frame per scene, no dissolve,
// no drift, no blink, and every line whole on the first paint.
//
// The v1.3 R1 fixes (Ken, 21 October 2026, item 13): the line sits in a
// game-style dialogue box, mono type, with a small pixel portrait of the
// watch officer and a blinking cursor while it types; every scene has a
// faint horizon glow, two star layers drifting at different speeds and
// light scanlines (./briefingScenes.ts).

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react'
import { MENU_MUSIC_STATE, coldOpenMusicState, getAudioEngine, useSound } from '../audio'
import { BEATS, CLICK_EVERY, DISSOLVE_S, MS_PER_CHAR, SPEAKER } from './coldOpenSlides'
import { OFFICER_PORTRAIT, SCENES, STILL_T, dissolve, readTokens, scanlines } from './briefingScenes'
import PixelSprite from './sprites/PixelSprite'
import type { SceneName } from './coldOpenSlides'
import { usePageVisible, useReducedMotion } from './cues/motion'
import { markIntroSeen } from './introSeen'

export interface IntroSequenceProps {
  // How the briefing ended: BEGIN TURN 1 or SKIP on a first viewing goes
  // to turn 1; a replay goes back to the title.
  onDone: () => void
  // A replay from the title's BRIEFING: the seen-flag is left alone.
  replay?: boolean
}

// One scene on one canvas, at about 15 frames a second, with the pixel
// dissolve on entry; one still frame under reduced motion; paused while
// the tab is hidden.
function SceneCanvas({ scene, reduced, visible }: { scene: SceneName; reduced: boolean; visible: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const started = useRef(0)
  useEffect(() => {
    started.current = 0
  }, [scene])
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = cv.getContext('2d')
    } catch {
      ctx = null
    }
    if (!ctx) return
    const c = ctx
    readTokens()
    const draw = SCENES[scene]
    let W = 0
    let H = 0
    let dpr = 1
    const fit = () => {
      const r = cv.getBoundingClientRect()
      dpr = Math.min(3, window.devicePixelRatio || 1)
      W = Math.max(1, Math.round(r.width))
      H = Math.max(1, Math.round(r.height))
      cv.width = Math.round(W * dpr)
      cv.height = Math.round(H * dpr)
    }
    const frame = (t: number) => {
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.imageSmoothingEnabled = false
      draw(c, W, H, t)
      if (!reduced && t < DISSOLVE_S) dissolve(c, W, H, t / DISSOLVE_S)
      scanlines(c, W, H)
    }
    fit()
    if (reduced) {
      frame(STILL_T[scene])
      return
    }
    if (!visible) {
      frame(Math.max(DISSOLVE_S, started.current ? (performance.now() - started.current) / 1000 : DISSOLVE_S))
      return
    }
    if (!started.current) started.current = performance.now()
    let last = -1e9
    let raf = 0
    const loop = (now: number) => {
      const t = (now - started.current) / 1000
      if (now - last >= 66 || t < DISSOLVE_S) {
        const r = cv.getBoundingClientRect()
        if (Math.round(r.width) !== W || Math.round(r.height) !== H) fit()
        frame(t)
        last = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [scene, reduced, visible])
  return <canvas ref={ref} aria-hidden="true" data-briefing-canvas className="absolute inset-0 block h-full w-full [image-rendering:pixelated]" />
}

export default function IntroSequence({ onDone, replay = false }: IntroSequenceProps) {
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  const play = useSound()
  const [index, setIndex] = useState(0)
  // How much of which beat's line has typed. Keyed by beat, so a new beat
  // starts from nothing without an effect having to reset it first.
  const [typed, setTyped] = useState({ beat: 0, chars: 0 })

  const beat = BEATS[index]
  const text = beat.text
  const last = index === BEATS.length - 1
  // Reduced motion shows the whole line from the first paint.
  const chars = reduced ? text.length : typed.beat === index ? typed.chars : 0
  const complete = chars >= text.length

  // The typing, forty characters a second, with the soft click on every
  // CLICK_EVERYth character that is not a space; paused while hidden.
  useEffect(() => {
    if (reduced || complete || !visible) return
    const id = window.setTimeout(() => {
      const next = chars + 1
      if (text[chars] !== ' ' && next % CLICK_EVERY === 0) play('soft-tick')
      setTyped({ beat: index, chars: next })
    }, MS_PER_CHAR)
    return () => window.clearTimeout(id)
  }, [reduced, complete, visible, chars, text, index, play])

  // The cursor blinks while the line types; never under reduced motion,
  // where the line is whole from the first paint.
  const [blinkOn, setBlinkOn] = useState(true)
  useEffect(() => {
    if (reduced || complete || !visible) return
    const id = window.setInterval(() => setBlinkOn((b) => !b), 400)
    return () => window.clearInterval(id)
  }, [reduced, complete, visible])

  // The music builds beat by beat, and hands back to the title's bed on
  // the way out. Before the first gesture this sets where it will start.
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

  // CONTINUE: always moves on, finished line or not.
  const advance = useCallback(() => {
    if (last) leave()
    else setIndex((i) => i + 1)
  }, [last, leave])

  const finish = useCallback(() => {
    if (complete) return false
    setTyped({ beat: index, chars: text.length })
    return true
  }, [complete, index, text.length])

  // The picture: finish the line, or move on once it is finished.
  const tapPicture = useCallback(() => {
    if (!finish()) advance()
  }, [finish, advance])

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
      tapPicture()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leave, tapPicture])

  const onButton = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation()
    fn()
  }
  // A held Enter on a focused button would click it on every repeat and
  // race the player through the whole briefing.
  const noRepeat = (e: ReactKeyboardEvent) => {
    if (e.repeat) e.preventDefault()
  }
  const lastLabel = replay ? 'BACK TO TITLE' : 'BEGIN TURN 1'

  return (
    <main
      aria-label="Briefing"
      data-briefing={index}
      className={`fixed inset-0 z-40 mx-auto flex max-w-[560px] flex-col gap-3 overflow-hidden bg-dc-ground px-4 pt-safe pb-safe text-dc-ink ${visible ? '' : 'dc-board-hidden'}`}
    >
      <div className="flex flex-none items-center justify-between pt-2">
        <p className="font-mono text-[11px] tracking-widest text-dc-muted">
          BRIEFING · {index + 1} OF {BEATS.length}
        </p>
        <button type="button" onClick={onButton(leave)} onKeyDown={noRepeat} className="min-h-11 border-2 border-dc-line px-3 font-mono text-[11px] tracking-widest text-dc-muted">
          SKIP
        </button>
      </div>

      <div data-briefing-scene={beat.scene} className="relative -mx-4 min-h-[120px] max-h-[420px] flex-1 cursor-pointer overflow-hidden border-y-2 border-dc-line bg-dc-ground" onClick={tapPicture}>
        <SceneCanvas key={index} scene={beat.scene} reduced={reduced} visible={visible} />
        <span className="pointer-events-none absolute left-2 top-2 bg-dc-ground/70 px-1 font-mono text-[10px] tracking-widest text-dc-friendly">{beat.caption[0]}</span>
        <span className={`pointer-events-none absolute right-2 top-2 bg-dc-ground/70 px-1 font-mono text-[10px] tracking-widest ${beat.hostile ? 'text-dc-hostile' : 'text-dc-muted'}`}>
          {beat.caption[1]}
        </span>
      </div>

      <div data-briefing-text className="flex flex-none cursor-pointer gap-2 border-2 border-dc-line bg-dc-panel p-2 shadow-hard" onClick={() => finish()}>
        <div data-briefing-portrait className="flex-none self-start border-2 border-dc-line bg-dc-ground">
          <PixelSprite sprite={OFFICER_PORTRAIT} scale={2} name="watch-officer-portrait" className="block" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tracking-widest text-dc-go">
            {SPEAKER} · {beat.time}
          </p>
          {/* Every beat's line laid out, unseen, in the same cell: the block
              is as tall as the longest on every beat. The whole line is
              always in the accessibility tree. */}
          <div className="mt-1 grid font-mono text-sm leading-snug">
            {BEATS.map((b, i) => (
              <p key={i} className="invisible col-start-1 row-start-1" aria-hidden="true">
                {b.text}
              </p>
            ))}
            <p className="sr-only" aria-live="polite">
              {text}
            </p>
            <p data-briefing-line className="col-start-1 row-start-1" aria-hidden="true">
              {text.slice(0, chars)}
              {!complete && (
                <span data-cursor className="text-dc-go" style={{ visibility: blinkOn ? 'visible' : 'hidden' }}>
                  _
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div data-briefing-bar className="flex flex-none gap-1.5" aria-hidden="true">
        {BEATS.map((_, k) => (
          <i key={k} className={`h-[3px] flex-1 ${k <= index ? 'bg-dc-go' : 'bg-dc-line'}`} />
        ))}
      </div>

      <button
        type="button"
        data-briefing-next
        onClick={onButton(advance)}
        onKeyDown={noRepeat}
        className="sticky bottom-0 mt-auto mb-3 min-h-12 w-full flex-none border-2 border-dc-go bg-dc-go/10 font-display text-xs text-dc-go shadow-press active:translate-y-[3px] active:shadow-none"
      >
        {last ? lastLabel : 'CONTINUE'}
      </button>
    </main>
  )
}
