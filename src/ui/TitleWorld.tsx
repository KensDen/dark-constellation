// THE TITLE'S WORLD (v2.0 R3, Ken's ruling of 15 November 2026: the title
// in 3D). Behind the wordmark stands the game's own theater: the globe,
// the starter fleet over it and the camera drifting slowly, built by the
// same World the game plays in (./three/world.ts), so the title and the
// game cannot drift apart. It replaces the pixel key art and the
// wireframe ring (./TitleArt.tsx and ./Constellation.tsx, both gone).
//
// It is decoration: hidden from assistive tech, deaf to the pointer, with
// no labels. The title's words and menu are whole without it, and the
// hero's box is the title's own, so nothing moves when this arrives.
//
// What it costs is capped: a chunk of its own, fetched after the title's
// first paint; the World's pixel ratio cap, and the player's Low power
// setting from the game; nothing drawn while the page is hidden, the hero
// is scrolled away or SYSTEM covers it; one still frame under Reduce
// Motion. Its WebGL context is given back as it unmounts, because the game
// builds its own renderer right after PLAY and iOS allows few contexts.
//
// With no WebGL, or if the world cannot be built, it renders nothing and
// the hero keeps the still gradient the stylesheet gives it.

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SCENARIO } from '../content'
import { usePageVisible, useReducedMotion } from './cues/motion'
import { prefs } from './three/store3d'
import { clamp, lerp } from './three/theater'
import { World } from './three/world'

// The mark a bundle budget can find this chunk by, as the game's has one.
const CHUNK_MARK = 'dc-title-world-chunk'

// THE TITLE'S FRAMING: the globe low in the hero with the fleet over it
// and COLDVEIL standing off its shoulder, closer than the game's own
// framing, which stands back to show the whole theater to play on. A wide
// hero (the desktop's) is filled by its height, so the camera goes closer
// and looks higher there, and the globe rises from the foot of the hero,
// to the right of the words; a phone's hero is filled by its width. The
// camera swings a little way round and back, about once in two minutes,
// and nods less than it swings.
class Backdrop extends World {
  private view = { az: 0, el: 0, dist: 0, lookY: 0 }

  private aim(): void {
    const t = this.time
    const wide = clamp((this.w / this.h - 1.6) / 0.8, 0, 1)
    this.view.az = 0.2 + Math.sin(t * 0.055) * 0.3
    this.view.el = 0.32 + Math.sin(t * 0.041 + 1.3) * 0.05
    this.view.dist = lerp(0.86, 0.72, wide)
    this.view.lookY = lerp(0.33, 0.6, wide)
    this.setShot(this.view)
    // On a wide hero the words stand at the left, so the globe stands
    // right; on a phone a nudge that way keeps COLDVEIL off the edge.
    // (0.75 through R3 on a wide hero: a satellite stood on the wordmark's
    // last letters.)
    this.want.look.x -= lerp(0.12, 1.05, wide)
  }

  protected step(dt: number, real: number): void {
    this.aim()
    super.step(dt, real)
  }

  // One frame with the camera already where the framing wants it: the
  // whole of the picture under Reduce Motion, where nothing flies in.
  hold(): void {
    this.aim()
    this.cam.az = this.want.az
    this.cam.el = this.want.el
    this.cam.dist = this.want.dist
    this.cam.look.copy(this.want.look)
    this.renderOnce()
  }
}

export default function TitleWorld({ paused = false }: { paused?: boolean }) {
  const host = useRef<HTMLDivElement | null>(null)
  const world = useRef<Backdrop | null>(null)
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  const [inView, setInView] = useState(true)
  const [on, setOn] = useState(false)
  const [failed, setFailed] = useState(false)
  const still = useRef(reduced)
  still.current = reduced

  useEffect(() => {
    const el = host.current
    // No WebGL 2, no world (three.js draws with nothing less): a test DOM,
    // a hardened browser.
    if (!el || typeof WebGL2RenderingContext === 'undefined') return setFailed(true)
    // A canvas of its own, made here and gone with the effect: the context
    // is lost for good as this unmounts, so the canvas cannot be one that
    // React would hand to the next mount.
    const canvas = document.createElement('canvas')
    el.appendChild(canvas)
    let t: Backdrop
    try {
      t = new Backdrop(canvas, () => {}, still.current)
    } catch {
      canvas.remove()
      return setFailed(true)
    }
    world.current = t
    t.setLowPower(prefs().lowPower)
    // The hero is all the theater's: the page keeps none of it clear.
    t.setClear(0, 1)
    t.syncAssets(DEFAULT_SCENARIO.starterAssets.map((a, i) => ({ id: `t${i}`, kind: a.kind })))
    const size = () => {
      t.resize()
      if (still.current) t.hold()
    }
    size()
    // The camera starts where the title frames it (v2.0 R4). It used to
    // start at the game's own distance and close in over the first second,
    // so the theater arrived as a small globe beside the still one the
    // stylesheet draws in its place, and grew: two globes for a moment, on
    // a desktop most of all.
    t.hold()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(size)
    ro?.observe(canvas)
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((e) => setInView(e[e.length - 1].isIntersecting))
    io?.observe(el)
    // The first frames compile the shaders; the world shows once 2 have run.
    const shown = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)))
    return () => {
      cancelAnimationFrame(shown)
      ro?.disconnect()
      io?.disconnect()
      world.current = null
      t.dispose(true)
      canvas.remove()
    }
  }, [])

  // Drawn only while there is someone to see it move.
  useEffect(() => {
    const t = world.current
    if (!t) return
    t.setReduced(reduced)
    t.setRunning(visible && inView && !paused && !reduced)
    if (reduced && visible) t.hold()
  }, [reduced, visible, inView, paused, failed])

  if (failed) return null
  return <div ref={host} className="tt-world" data-title-world={CHUNK_MARK} data-on={on || undefined} aria-hidden="true" />
}
