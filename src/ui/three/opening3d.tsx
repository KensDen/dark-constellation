// THE OPENING (v2.0 R1): the briefing, in the world. The camera flies the
// theater in four shots while the watch officer says who is who, as the 3D
// title prototype did; the last line hands over the watch. Skippable at
// any point, and under Reduce Motion each line shows whole and the camera
// simply stands at each shot.

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { SoundCue } from '../../cues'
import * as c3 from './copy3d'
import type { Shot, World } from './world'

const SHOTS: Shot[] = [
  { az: 0.55, el: 0.35, dist: 1.02, lookY: 0 },
  { az: 0.14, el: 0.42, dist: 0.64, lookY: 0.02 },
  { az: -0.72, el: 0.26, dist: 0.94, lookY: 0.22 },
  { az: 0.24, el: 0.5, dist: 1.06, lookY: 0 },
]
// The unlocked opening comes in over the pole.
const POLAR: Shot[] = [{ az: 0.2, el: 1.08, dist: 1.12, lookY: 0 }, { az: 0, el: 0.74, dist: 0.64, lookY: 0.02 }, SHOTS[2], SHOTS[3]]
const CHARS_PER_S = 38

export function Opening({ world, reduced, polar, play, onDone }: { world: RefObject<World | null>; reduced: boolean; polar: boolean; play: (cue: SoundCue) => void; onDone: () => void }) {
  const [beat, setBeat] = useState(0)
  const [typed, setTyped] = useState(0)
  const go = useRef<HTMLButtonElement | null>(null)
  const line = c3.OPENING[beat]
  const whole = reduced || typed >= line.line.length

  useEffect(() => {
    const t = world.current
    if (!t) return
    t.setShot((polar ? POLAR : SHOTS)[beat])
    t.setBeat(c3.OPENING[beat].threat ? 'night' : 'wide')
    return undefined
  }, [beat, polar, world])

  useEffect(() => {
    setTyped(0)
    if (reduced) return
    const started = performance.now()
    const id = window.setInterval(() => {
      const n = Math.floor(((performance.now() - started) / 1000) * CHARS_PER_S)
      setTyped(n)
      if (n >= c3.OPENING[beat].line.length) window.clearInterval(id)
    }, 40)
    return () => window.clearInterval(id)
  }, [beat, reduced])

  useEffect(() => go.current?.focus({ preventScroll: true }), [beat])

  const last = beat === c3.OPENING.length - 1
  const next = () => {
    if (!whole) return setTyped(line.line.length)
    play('soft-tick')
    if (last) {
      world.current?.setBeat('wide')
      onDone()
    } else setBeat(beat + 1)
  }

  return (
    <div className="t3-card t3-opening" data-t3-card="opening" data-t3-beat={beat}>
      <p className="t3-eyebrow">
        {c3.OPENING_SPEAKER} · {line.clock}
        <span className="t3-right">{c3.openingCount(beat + 1, c3.OPENING.length)}</span>
      </p>
      {/* The whole line is always there for a screen reader; the eye gets it typed. */}
      <p className={`t3-lead t3-typed${line.threat ? ' t3-threatline' : ''}`} aria-label={line.line}>
        <span aria-hidden="true">{reduced ? line.line : line.line.slice(0, typed)}</span>
        <span className="t3-rest" aria-hidden="true">
          {reduced ? '' : line.line.slice(typed)}
        </span>
      </p>
      <div className="t3-bars" aria-hidden="true">
        {c3.OPENING.map((b, i) => (
          <i key={b.clock} className={i <= beat ? 'is-on' : ''} />
        ))}
      </div>
      <div className="t3-row">
        <button ref={go} type="button" data-t3-opening-next className={`t3-btn${last && whole ? ' t3-primary' : ''}`} onClick={next}>
          {last && whole ? c3.OPENING_GO : c3.OPENING_NEXT}
        </button>
        <button
          type="button"
          data-t3-opening-skip
          className="t3-btn t3-quietbtn"
          onClick={() => {
            world.current?.setBeat('wide')
            onDone()
          }}
        >
          {c3.OPENING_SKIP}
        </button>
      </div>
    </div>
  )
}
