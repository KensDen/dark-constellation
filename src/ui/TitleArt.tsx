// The title's decoration (v1.3 R1, brief 5.1), split from the title so it
// loads as its own chunk after the first paint (v1.3 R1 fixes): the key
// art behind the title, and the constellation frame under the READ row
// (Ken, 21 October 2026: keep it on the title). Nothing here is
// interactive or read; the title is whole without it.
//
// THE KEY ART (v1.5 R2, Ken's ruling of 24 October 2026: "key art behind
// the title, above the fold"). The split sphere the game's key art has
// always been, redrawn as pixel art in code in the house palette: a
// planet at night, broken along a hostile red breach, the friendly side
// lit blue and the other side red, debris spraying from the crack, three
// smallsats on an orbit around it, and the ripple band's dot field as the
// sky, blue on one side of the breach and red on the other. It replaces
// the ripple band and the painted key art below the fold, whose magenta
// the hostile red retired (brief 8.1). One canvas at about 15 frames a
// second; one still frame under reduced motion, and paused while the tab
// is hidden.

import { Suspense, lazy, useEffect, useRef } from 'react'
import { usePageVisible, useReducedMotion } from './cues/motion'
import { ASSET_SPRITES } from './sprites/assets'
import { spriteRects, type Sprite } from './sprites/sprite'
import frameUrl from './assets/constellation-frame.svg'

// The 3D frame is decoration; a failed chunk falls back to the still
// reference frame rather than taking the title down.
const FrameStill = () => <img src={frameUrl} alt="" aria-hidden="true" className="h-64 w-64 opacity-90" />
const Constellation = lazy(() =>
  import('./Constellation').catch(() => ({ default: FrameStill as unknown as (typeof import('./Constellation'))['default'] })),
)

type Ink = 'ground' | 'chrome' | 'shadow' | 'line' | 'ink' | 'friendly' | 'hostile' | 'warn' | 'go' | 'steel' | 'deep' | 'hull' | 'glass' | 'panel' | 'muted' | 'bright'
const FALLBACK: Record<Ink, string> = {
  ground: '#0B0F14',
  chrome: '#0E141C',
  shadow: '#05080C',
  line: '#243041',
  ink: '#E6EDF3',
  friendly: '#5AA9FF',
  hostile: '#FF5A4F',
  warn: '#FFB547',
  go: '#7CFF9B',
  steel: '#788696',
  deep: '#2E5F99',
  hull: '#C9D4E0',
  glass: '#AACEFA',
  panel: '#121821',
  muted: '#8B98A8',
  bright: '#F0F4F8',
}

const hash = (i: number) => {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}
// Smooth value noise, two octaves, for the continents.
const lattice = (x: number, y: number) => hash(x * 157.31 + y * 311.7)
function noise(x: number, y: number): number {
  let out = 0
  for (const [f, w] of [
    [1, 0.65],
    [2.3, 0.35],
  ]) {
    const X = x * f
    const Y = y * f
    const x0 = Math.floor(X)
    const y0 = Math.floor(Y)
    const sx = (X - x0) * (X - x0) * (3 - 2 * (X - x0))
    const sy = (Y - y0) * (Y - y0) * (3 - 2 * (Y - y0))
    const a = lattice(x0, y0) + (lattice(x0 + 1, y0) - lattice(x0, y0)) * sx
    const b = lattice(x0, y0 + 1) + (lattice(x0 + 1, y0 + 1) - lattice(x0, y0 + 1)) * sx
    out += (a + (b - a) * sy) * w
  }
  return out
}

// THE SCENE, a pure function of its size and the time.
function scene(c: CanvasRenderingContext2D, W: number, H: number, t: number, INK: Record<Ink, string>) {
  const rgba = (k: Ink, a: number) => {
    const n = Number.parseInt(INK[k].slice(1), 16)
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`
  }
  const U = W >= 900 ? 4 : 3
  c.fillStyle = INK.shadow
  c.fillRect(0, 0, W, H)

  // The planet and the breach through it, at a 20 degree slant like the
  // wordmark's.
  const wide = W >= 900
  // On a phone the planet sits high and right, over the words' backing
  // rather than behind the words (v1.5 R2's review).
  const R = Math.round(Math.min(H * (wide ? 0.4 : 0.28), W * 0.3) / U) * U
  const cx = Math.round((W * (wide ? 0.68 : 0.72)) / U) * U
  const cy = Math.round((H * (wide ? 0.5 : 0.35)) / U) * U
  // The breach's direction (down and to the left) and its normal: which
  // side of it a point is on.
  const ang = (110 * Math.PI) / 180
  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  const side = (x: number, y: number) => (x - cx) * dy - (y - cy) * dx

  // The sky: the ripple band's dot field, blue on the friendly side of
  // the breach and red on the other.
  for (let y = 5; y < H; y += 10) {
    for (let x = 5; x < W; x += 10) {
      let k = 0.5 + 0.5 * Math.sin(x * 0.035 + t * 0.9) * Math.cos(y * 0.07 - t * 0.6 + Math.sin(x * 0.01 + t * 0.3))
      k = k * k * k
      const hostile = side(x, y) > 0
      c.fillStyle = rgba(hostile ? 'hostile' : 'friendly', (hostile ? 0.05 : 0.06) + (hostile ? 0.32 : 0.42) * k)
      const r = 0.5 + 1.6 * k
      c.fillRect(Math.round(x - r), Math.round(y - r), Math.max(1, Math.round(r * 2)), Math.max(1, Math.round(r * 2)))
    }
  }
  // A few bright stars.
  for (let i = 0; i < 40; i += 1) {
    const x = hash(i) * W
    const y = hash(i + 0.5) * H
    const a = 0.3 + 0.5 * Math.abs(Math.sin(t * 1.3 + i))
    c.fillStyle = rgba('ink', a)
    c.fillRect(Math.round(x), Math.round(y), hash(i + 0.2) < 0.2 ? 2 : 1, hash(i + 0.2) < 0.2 ? 2 : 1)
  }

  // The orbit: a tilted ellipse, its far half behind the planet.
  const rx = R * 1.62
  const ry = R * 0.42
  const tilt = (-14 * Math.PI) / 180
  const orbitAt = (a: number): [number, number] => {
    const ex = Math.cos(a) * rx
    const ey = Math.sin(a) * ry
    return [cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), cy + ex * Math.sin(tilt) + ey * Math.cos(tilt)]
  }
  const orbitDots = (front: boolean) => {
    for (let k = 0; k < 120; k += 1) {
      const a = (k / 120) * Math.PI * 2
      if (Math.sin(a) > 0 !== front) continue
      const [x, y] = orbitAt(a)
      c.fillStyle = rgba('friendly', front ? 0.55 : 0.25)
      c.fillRect(Math.round(x), Math.round(y), 2, 2)
    }
  }
  const sats = (front: boolean) => {
    for (let i = 0; i < 3; i += 1) {
      const a = t * 0.22 + (i * Math.PI * 2) / 3
      if (Math.sin(a) > 0 !== front) continue
      const [x, y] = orbitAt(a)
      const s = wide ? 3 : 2
      blit(c, ASSET_SPRITES.sat.intact, x - 8 * s, y - 6 * s, s, rgba, front ? 1 : 0.45)
    }
  }
  orbitDots(false)
  sats(false)

  // The planet, cell by cell: the night side, land, city lights, the two
  // lit limbs, and the half beyond the breach shifted along the crack.
  const shift = U * 2
  for (let y = cy - R - U; y <= cy + R + U; y += U) {
    for (let x = cx - R - U; x <= cx + R + U; x += U) {
      const hostile = side(x, y) > 0
      const px = hostile ? x - shift : x
      const py = hostile ? y - Math.round(shift / 2) : y
      const d = Math.hypot(px + U / 2 - cx, py + U / 2 - cy)
      if (d > R) continue
      const edge = R - d
      // The continents turn slowly under the night.
      const land = noise((px - cx) / (R * 0.42) + t * 0.03 + 7, (py - cy) / (R * 0.42) + 3)
      let ink: Ink = 'chrome'
      let a = 1
      if (land > 0.55) ink = 'line'
      c.fillStyle = rgba(ink, a)
      c.fillRect(x, y, U, U)
      if (land > 0.62 && hash(x * 7 + y) < 0.16) {
        a = 0.5 + 0.5 * Math.abs(Math.sin(t * 2 + x))
        c.fillStyle = rgba('warn', a * 0.8)
        c.fillRect(x + 1, y + 1, Math.max(1, U - 2), Math.max(1, U - 2))
      }
      // The lit limbs: blue on the friendly side, red beyond the breach.
      if (edge < U * 2.2) {
        c.fillStyle = rgba(hostile ? 'hostile' : 'friendly', edge < U ? 0.9 : 0.45)
        c.fillRect(x, y, U, U)
      }
    }
  }
  // The atmosphere's glow round the limb.
  for (let k = 1; k <= 3; k += 1) {
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      const x = cx + Math.cos(a) * (R + k * U)
      const y = cy + Math.sin(a) * (R + k * U)
      const hostile = side(x, y) > 0
      c.fillStyle = rgba(hostile ? 'hostile' : 'friendly', 0.16 / k)
      c.fillRect(Math.round(x / U) * U - (hostile ? shift : 0), Math.round(y / U) * U, U, U)
    }
  }
  // The breach: a red line through the planet and past it, its core
  // flickering, debris spraying from both flanks.
  // On a phone the breach stops short of the wordmark under the planet.
  const L = R * (wide ? 1.45 : 1.02)
  for (let s = -L; s <= L; s += U / 2) {
    const x = cx + dx * s
    const y = cy + dy * s
    const inside = Math.abs(s) < R
    const flick = 0.75 + 0.25 * Math.sin(t * 9 + s * 0.3)
    c.fillStyle = rgba('hostile', (inside ? 0.95 : 0.5) * flick)
    c.fillRect(Math.round(x) - 1, Math.round(y), inside ? 3 : 2, U)
    if (inside) {
      c.fillStyle = rgba('hostile', 0.18)
      c.fillRect(Math.round(x) - 4, Math.round(y), 8, U)
    }
  }
  for (let i = 0; i < 46; i += 1) {
    const along = (hash(i * 3.1) - 0.5) * 2 * R
    const hostile = i % 2 === 1
    const drift = ((t * (6 + hash(i) * 10) + hash(i + 9) * 40) % 46) * (hostile ? 1 : -1)
    const x = cx + dx * along + dy * drift * 1.2
    const y = cy + dy * along - dx * drift * 1.2
    c.fillStyle = rgba(hostile ? 'hostile' : 'glass', 0.85 - Math.abs(drift) / 60)
    const z = hash(i + 4) < 0.3 ? 2 : 1
    c.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, z * 2, z * 2)
  }

  orbitDots(true)
  sats(true)

  // The scrim the title's words sit on: dark at the foot and the left,
  // near solid under the words on a phone.
  for (let k = 0; k < 10; k += 1) {
    c.fillStyle = rgba('shadow', wide ? 0.075 : 0.11)
    c.fillRect(0, Math.round(H * ((wide ? 0.5 : 0.48) + k * 0.05)), W, H)
  }
  if (wide) {
    for (let k = 0; k < 10; k += 1) {
      c.fillStyle = rgba('shadow', 0.06)
      c.fillRect(0, 0, Math.round(W * (0.5 - k * 0.03)), H)
    }
  }
  // Scanlines, as the briefing's scenes have them.
  c.fillStyle = rgba('shadow', 0.18)
  for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1)
}

function blit(c: CanvasRenderingContext2D, spr: Sprite, x0: number, y0: number, s: number, rgba: (k: Ink, a: number) => string, alpha: number) {
  x0 = Math.round(x0)
  y0 = Math.round(y0)
  for (const g of spriteRects(spr)) {
    c.fillStyle = rgba(g.ink.token as Ink, (g.ink.alpha ?? 1) * alpha)
    for (const r of g.runs) c.fillRect(x0 + r.x * s, y0 + r.y * s, r.width * s, s)
  }
}

function KeyArt() {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const reduced = useReducedMotion()
  const visible = usePageVisible()
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
    const css = getComputedStyle(document.documentElement)
    const INK = { ...FALLBACK }
    for (const k of Object.keys(FALLBACK) as Ink[]) {
      const v = css.getPropertyValue(`--dc-${k}`).trim()
      if (/^#[0-9a-f]{6}$/i.test(v)) INK[k] = v
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const paint = (t: number) => {
      const w = cv.clientWidth || 340
      const h = cv.clientHeight || 200
      if (cv.width !== Math.round(w * dpr)) cv.width = Math.round(w * dpr)
      if (cv.height !== Math.round(h * dpr)) cv.height = Math.round(h * dpr)
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      scene(c, w, h, t, INK)
    }
    // A still frame under reduced motion, redrawn only when the box
    // changes size.
    if (reduced || !visible) {
      paint(4)
      const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => paint(4))
      ro?.observe(cv)
      return () => ro?.disconnect()
    }
    const t0 = performance.now()
    let last = 0
    let raf = 0
    const loop = (now: number) => {
      if (now - last >= 66) {
        paint(4 + (now - t0) / 1000)
        last = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reduced, visible])
  return <canvas ref={ref} aria-hidden="true" data-key-art-canvas className="absolute inset-0 block h-full w-full" />
}

function Frame() {
  const reduced = useReducedMotion()
  return (
    <div className="flex flex-col items-center">
      {reduced ? (
        <FrameStill />
      ) : (
        <Suspense fallback={<FrameStill />}>
          <Constellation size={256} />
        </Suspense>
      )}
    </div>
  )
}

export default function TitleArt({ part }: { part: 'key' | 'frame' }) {
  return part === 'key' ? <KeyArt /> : <Frame />
}
