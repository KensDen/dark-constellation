// THE PLAYFIELD (v1.5 R2, Ken's ruling of 24 October 2026: "a playfield on
// the board, so the night is seen on the board itself, not only read on
// cards"). The asset strip's three layers become places: ORBIT is space
// over the Earth's limb, AIR is the sky, GROUND is a ridge and the ground
// line. A live condition is hostile static over its layer. During the
// night each of COLDVEIL's moves plays out on the tile it was aimed at,
// drawn by how it travels: radio waves closing in, a laser beam, packets
// along the link, a ghost of the target for a spoof, a planted chip, a
// hook, debris across the orbit. A block stops it on a green shield; a
// hit bursts on the tile. The night's earlier moves stay on the board,
// dimmed, so END OF TURN shows the whole night where it happened.
//
// Pixel art drawn in code on two canvases in the strip: the scene behind
// the tiles and the night in front of them, both decoration (the tiles
// carry every name, and the night's cards say everything in words). The
// tiles stay the strip's own buttons; nothing here takes a tap.
//
// MOTION (brief 8.3): stars, clouds, static and the strike move only with
// motion allowed and the tab visible. Under reduced motion each canvas is
// drawn once per change of what it shows, and the night reads from still
// marks: the move's shape at its tile, the shield or the burst, and the
// earlier moves dimmed. On the desktop board the layers stack as bands
// (src/index.css), and the playfield adds the network's links from the
// ground station and COLDVEIL's eye, which every move starts from.
//
// Its own chunk: the board renders whole without it, and the strip's
// panels keep their plain fill until it arrives.

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { AssetKind, Layer } from '../../engine/types'
import { usePageVisible, useReducedMotion } from '../cues/motion'
import { ASSET_MAPS, assetSprite } from '../sprites/assets'
import { COLDVEIL_EMBLEM } from '../sprites/icons'
import { spriteRects, type Sprite } from '../sprites/sprite'
import { DEFAULT_SCENARIO } from '../../content'
import { shortName } from './boardModel'
import { shapeOf, type Shape } from './moveShape'
import { LOCK_SHARE, STRIKE_MS, type Strike, type Trace } from './strike'

export interface PlayfieldProps {
  // The strip: its [data-layer] panels and [data-asset-id] tiles are
  // measured, and the canvases fill it.
  strip: RefObject<HTMLElement | null>
  // The live conditions on each layer, by name.
  conditions: Partial<Record<Layer, readonly string[]>>
  strike: Strike | null
  traces: readonly Trace[]
  // The night is on: COLDVEIL's eye shows on the desktop board.
  night: boolean
  // While the player decides, tonight's moves: the layers each aims at and
  // its status on the board (an unnamed move reads as exposed).
  threats?: readonly { layers: readonly Layer[]; status: string }[]
  // In the night, the moves landed so far, the one whose card is up among
  // them: named at their tiles on the desktop's bands.
  labels?: readonly Trace[]
}

// TONIGHT ON THE BOARD (v1.5 R2's review: the planning board showed
// nothing of tonight). Each layer one of tonight's moves aims at carries
// corner brackets and an arrow in, in its status's colour, the worst of
// them when two aim at one layer: red exposed, amber partly blocked or the
// debris call, blue answered, green blocked.
const RANK = ['blocked', 'answered', 'call', 'partial', 'exposed']
const MARK: Record<string, Token> = { blocked: 'go', answered: 'friendly', call: 'warn', partial: 'warn', exposed: 'hostile' }
const ARROW = ['..x..', '..x..', 'x.x.x', '.xxx.', '..x..']
function markLane(c: CanvasRenderingContext2D, b: Box, token: Token, a: number, U: number) {
  const L = U * 12
  const T = U * 2 + 1
  c.fillStyle = rgba(token, a)
  for (const [sx, sy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const x = sx ? b.x + b.w - L : b.x
    const y = sy ? b.y + b.h - T : b.y
    c.fillRect(Math.round(x), Math.round(y), L, T)
    c.fillRect(Math.round(sx ? b.x + b.w - T : b.x), Math.round(sy ? b.y + b.h - L : b.y), T, L)
  }
  pattern(c, ARROW, b.x + b.w - U * 3 * 5 - U * 3, b.y + U * 3, U * 3, rgba(token, a))
}

// Every token a sprite may paint (../sprites/sprite.ts), the asset maps'
// five inks among them.
type Token = 'ground' | 'chrome' | 'panel' | 'line' | 'ink' | 'muted' | 'go' | 'friendly' | 'hostile' | 'warn' | 'shadow' | 'hull' | 'glass' | 'deep' | 'bright' | 'steel'
const FALLBACK: Record<Token, string> = {
  ground: '#0B0F14',
  chrome: '#0E141C',
  panel: '#121821',
  line: '#243041',
  ink: '#E6EDF3',
  muted: '#8B98A8',
  go: '#7CFF9B',
  friendly: '#5AA9FF',
  hostile: '#FF5A4F',
  warn: '#FFB547',
  shadow: '#05080C',
  hull: '#C9D4E0',
  glass: '#AACEFA',
  deep: '#2E5F99',
  bright: '#F0F4F8',
  steel: '#788696',
}
let INK = FALLBACK
let MONO = 'ui-monospace, Menlo, monospace'
function readTokens() {
  const css = getComputedStyle(document.documentElement)
  MONO = css.getPropertyValue('--font-mono').trim() || MONO
  const next = { ...FALLBACK }
  for (const t of Object.keys(FALLBACK) as Token[]) {
    const v = css.getPropertyValue(`--dc-${t}`).trim()
    if (/^#[0-9a-f]{6}$/i.test(v)) next[t] = v
  }
  INK = next
}
const rgba = (t: Token, a: number) => {
  const n = Number.parseInt(INK[t].slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`
}

const hash = (i: number) => {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}
interface Tile extends Box {
  kind?: AssetKind
}
interface Field {
  w: number
  h: number
  bands: boolean
  panels: Partial<Record<Layer, Box>>
  // Each tile's sprite, by asset id, with its kind.
  tiles: Map<string, Tile>
  // The ground station's sprites, for the links.
  stations: Box[]
}

function measure(strip: HTMLElement): Field {
  const r = strip.getBoundingClientRect()
  const rel = (e: Element): Box => {
    const q = e.getBoundingClientRect()
    return { x: q.left - r.left, y: q.top - r.top, w: q.width, h: q.height }
  }
  const panels: Partial<Record<Layer, Box>> = {}
  for (const p of strip.querySelectorAll<HTMLElement>('[data-layer]')) panels[p.dataset.layer as Layer] = rel(p)
  const tiles = new Map<string, Tile>()
  const stations: Box[] = []
  for (const t of strip.querySelectorAll<HTMLElement>('[data-asset-id]')) {
    const art = t.querySelector('[data-art]') ?? t
    const kind = art.querySelector('[data-sprite]')?.getAttribute('data-sprite')?.split('.')[0] as AssetKind | undefined
    const box = { ...rel(art), kind: kind && kind in ASSET_MAPS ? kind : undefined }
    tiles.set(t.dataset.assetId!, box)
    if (kind === 'groundStation' && t.dataset.state !== 'transit' && t.dataset.state !== 'lost') stations.push(box)
  }
  const o = panels.ORBIT
  const a = panels.AIR
  return { w: r.width, h: r.height, bands: !!o && !!a && o.y + o.h <= a.y + 1, panels, tiles, stations }
}

function blit(c: CanvasRenderingContext2D, spr: Sprite, x0: number, y0: number, s: number, alpha = 1) {
  x0 = Math.round(x0)
  y0 = Math.round(y0)
  for (const g of spriteRects(spr)) {
    c.fillStyle = rgba(g.ink.token as Token, (g.ink.alpha ?? 1) * alpha)
    for (const r of g.runs) c.fillRect(x0 + r.x * s, y0 + r.y * s, r.width * s, s)
  }
}

// ---------------------------------------------------------------------
// THE SCENES, one per layer, each a pure function of its box and time.
// ---------------------------------------------------------------------

function stars(c: CanvasRenderingContext2D, b: Box, t: number, seed: number, density: number, top: number, U: number) {
  const n = Math.round((b.w * b.h * top) / density)
  for (let i = 0; i < n; i += 1) {
    const x = b.x + hash(seed + i) * b.w
    const y = b.y + hash(seed + i + 0.37) * b.h * top
    let a = 0.14 + hash(seed + i + 0.71) * 0.36
    if (hash(seed + i + 0.13) < 0.18) a *= 0.45 + 0.55 * Math.abs(Math.sin(t * 1.7 + i))
    c.fillStyle = rgba('ink', a)
    c.fillRect(Math.round(x), Math.round(y), hash(seed + i + 0.5) < 0.12 ? U * 2 : U, hash(seed + i + 0.5) < 0.12 ? U * 2 : U)
  }
}

function orbit(c: CanvasRenderingContext2D, b: Box, t: number, U: number) {
  stars(c, b, t, 11, 90, 0.85, U)
  // The Earth's limb, a wide arc low in the panel, stepped.
  const R = Math.max(b.w * 1.5, 240)
  // Low in the panel, under the tiles' pips on a phone's short strip.
  const crown = Math.min(Math.max(b.h * 0.1, 6), 90)
  const cx = b.x + b.w * 0.58
  const cy = b.y + b.h - crown + R
  const S = U * 2
  for (let x = b.x; x < b.x + b.w; x += S) {
    const d = x + S / 2 - cx
    const top = Math.round((cy - Math.sqrt(Math.max(0, R * R - d * d))) / S) * S
    if (top >= b.y + b.h) continue
    ;[0.09, 0.055, 0.03].forEach((a, k) => {
      c.fillStyle = rgba('friendly', a)
      c.fillRect(x, top - (k + 1) * S * 2, S, S * 2)
    })
    c.fillStyle = rgba('friendly', 0.7)
    c.fillRect(x, top, S, S)
    c.fillStyle = rgba('friendly', 0.32)
    c.fillRect(x, top + S, S, S)
    c.fillStyle = rgba('friendly', 0.2)
    c.fillRect(x, top + 2 * S, S, b.y + b.h - top - 2 * S)
    // Land and cloud under the limb, drifting on the desktop's tall band.
    if (b.h > 120) {
      for (let y = top + S * 2; y < b.y + b.h; y += S) {
        const u = x + t * 4
        const land = Math.sin(u * 0.021) + Math.sin(u * 0.047 + y * 0.033) + Math.sin(y * 0.05 - u * 0.013)
        if (land > 1.2) {
          c.fillStyle = rgba('go', land > 1.9 ? 0.2 : 0.11)
          c.fillRect(x, y, S, S)
        }
      }
    }
  }
}

function cloud(c: CanvasRenderingContext2D, x: number, y: number, s: number, a: number) {
  // A flat-bottomed pixel cloud, 16 by 4 cells.
  const rows = ['....wwww........', '..wwwwwwww.ww...', '.wwwwwwwwwwwwww.', 'qqqqqqqqqqqqqqqq']
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i += 1) {
      if (row[i] === '.') continue
      c.fillStyle = row[i] === 'w' ? rgba('ink', 0.3 * a) : rgba('muted', 0.2 * a)
      c.fillRect(Math.round(x + i * s), Math.round(y + j * s), s, s)
    }
  })
}

function air(c: CanvasRenderingContext2D, b: Box, t: number, U: number) {
  ;[0.03, 0.055, 0.085, 0.12].forEach((a, i) => {
    c.fillStyle = rgba('friendly', a)
    c.fillRect(b.x, Math.round(b.y + (b.h * i) / 4), b.w, Math.ceil(b.h / 4) + 1)
  })
  c.fillStyle = rgba('friendly', 0.3)
  c.fillRect(b.x, b.y + b.h - U, b.w, U)
  stars(c, b, t, 29, 160, 0.35, U)
  const s = b.h > 120 ? 3 : U
  const span = b.w + 16 * s
  // The clouds keep to a band clear of the tiles' call signs and pips (v1.5
  // R2's review): high on a phone's short strip, spread on the bands.
  const tall = b.h > 180
  for (const [k, yy, v] of [
    [0.1, tall ? 0.16 : 0.2, 3],
    [0.6, tall ? 0.5 : 0.3, 2],
    [0.35, tall ? 0.78 : 0.4, 4],
  ] as const) {
    const x = b.x - 16 * s + ((k * span + t * v) % span)
    cloud(c, x, b.y + b.h * yy, s, 1)
  }
}

const RIDGE = [4, 4, 5, 5, 6, 6, 6, 5, 5, 4, 4, 4, 5, 6, 7, 7, 7, 6, 5, 5, 4, 4, 4, 4, 5, 5, 6, 6, 5, 5, 4, 4]

function ground(c: CanvasRenderingContext2D, b: Box, t: number, U: number) {
  stars(c, b, t, 47, 120, 0.4, U)
  const S = b.h > 120 ? U * 3 : U * 2
  const base = b.y + b.h - Math.round(Math.min(Math.max(b.h * 0.1, 4), 26))
  // A faint hostile glow along the horizon: COLDVEIL is out there.
  for (let k = 0; k < 3; k += 1) {
    c.fillStyle = rgba('hostile', [0.06, 0.035, 0.018][k])
    c.fillRect(b.x, base - 4 * S - (k + 1) * S * 2, b.w, S * 2)
  }
  for (let i = 0; i * S < b.w; i += 1) {
    const x = b.x + i * S
    const ridge = RIDGE[i % RIDGE.length] * (S / 2)
    c.fillStyle = rgba('line', 0.9)
    c.fillRect(x, base - ridge, S, ridge)
    c.fillStyle = rgba('go', 0.28)
    c.fillRect(x, base, S, U)
    c.fillStyle = rgba('muted', 0.1)
    c.fillRect(x, base + U, S, b.y + b.h - base - U)
  }
}

// Hostile interference over a layer a condition holds: a faint wash and
// broken scanlines drifting down it, a new frame eight times a second with
// motion, one still frame without (v1.5 R2's re-review: a speckle read as
// dead pixels).
function haze(c: CanvasRenderingContext2D, b: Box, t: number, seed: number, U: number, strength: number) {
  const frame = Math.floor(t * 8)
  c.fillStyle = rgba('hostile', 0.05 * strength)
  c.fillRect(b.x, b.y, b.w, b.h)
  const lines = Math.max(3, Math.round((b.h / 14) * strength))
  for (let i = 0; i < lines; i += 1) {
    const k = seed * 53 + i
    const y = b.y + ((hash(k) * b.h + frame * U * 2) % b.h)
    // Each line broken into runs, as a jammed signal tears.
    for (let x = b.x; x < b.x + b.w; ) {
      const run = (4 + hash(k + x * 0.37) * 18) * U
      if (hash(k + x * 0.11 + frame) > 0.35) {
        c.fillStyle = rgba('hostile', 0.16 + hash(k + x) * 0.2)
        c.fillRect(Math.round(x), Math.round(y), Math.round(Math.min(run, b.x + b.w - x)), U)
      }
      x += run + 3 * U
    }
  }
}

// A dotted line, stopping short at upTo, with a gap wherever it would
// cross a box in mask: a move's line passes under the tiles it is not
// aimed at, not through them (v1.5 R2's review).
function dots(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, step: number, size: number, color: string, offset = 0, upTo = 1, mask: readonly Box[] = []) {
  const d = Math.hypot(x2 - x1, y2 - y1)
  const n = Math.floor((d * upTo) / step)
  c.fillStyle = color
  for (let k = 0; k <= n; k += 1) {
    const f = Math.min(upTo, (k * step + (offset % step)) / Math.max(1, d))
    const x = x1 + (x2 - x1) * f
    const y = y1 + (y2 - y1) * f
    if (mask.some((b) => x > b.x - 3 && x < b.x + b.w + 3 && y > b.y - 3 && y < b.y + b.h + 3)) continue
    c.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size)
  }
}

// A ring of pixels, whole or an arc (from a0 to a1, radians).
function ring(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, size: number, color: string, a0 = 0, a1 = Math.PI * 2, gap = 1) {
  const n = Math.max(8, Math.round(((a1 - a0) * r) / (size * (1 + gap))))
  c.fillStyle = color
  for (let k = 0; k <= n; k += 1) {
    const a = a0 + ((a1 - a0) * k) / n
    c.fillRect(Math.round(cx + Math.cos(a) * r - size / 2), Math.round(cy + Math.sin(a) * r - size / 2), size, size)
  }
}

// ---------------------------------------------------------------------
// THE NIGHT: one move at its tile.
// ---------------------------------------------------------------------

interface Move {
  shape: Shape
  // The sprite it was aimed at, or the layer's panel when it had none.
  at: Tile
  // The target's own layer, where a hook drops and a chip rises.
  band: Box
  // The other tiles, which its lines pass under.
  mask: readonly Box[]
  // What it is drawn inside: the target's panel on the phone's columns,
  // the whole field on the desktop's bands.
  clip: Box
  hit: boolean
  // Where it comes from: COLDVEIL's eye on the desktop board, above and
  // to the right of the tile on the phone's.
  from: [number, number]
  // The approach from the eye, drawn on the desktop's bands.
  eye: boolean
}

// The impact star a hit leaves at the sprite's corner, and a chip's body.
const STAR = ['x.x.x', '.xxx.', 'xxxxx', '.xxx.', 'x.x.x']
const CHIP = ['.x.x.', 'xxxxx', 'xx.xx', 'xxxxx', '.x.x.']
function pattern(c: CanvasRenderingContext2D, rows: readonly string[], x: number, y: number, s: number, color: string) {
  c.fillStyle = color
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i += 1) if (row[i] !== '.') c.fillRect(Math.round(x + i * s), Math.round(y + j * s), s, s)
  })
}

// in: 0 to 1 as the move closes on its tile (the strike's lock-on); out: 0
// to 1 after it lands. A still mark is in 1, out 1. alpha dims the
// night's earlier moves.
function drawMove(c: CanvasRenderingContext2D, m: Move, inP: number, outP: number, alpha: number, U: number, t: number) {
  const { at } = m
  const cx = at.x + at.w / 2
  const cy = at.y + at.h / 2
  const r = Math.max(at.w, at.h) / 2 + 2 * U
  const D = U * 2
  const red = (a: number) => rgba('hostile', a * alpha)
  const green = (a: number) => rgba('go', a * alpha)
  const [fx, fy] = m.from
  const reach = Math.hypot(cx - fx, cy - fy)
  // Where it stops: the shield's edge on a block, the tile on a hit.
  const stop = m.hit ? 1 : Math.max(0, 1 - (r + D) / Math.max(1, reach))
  const along = (f: number): [number, number] => [fx + (cx - fx) * f, fy + (cy - fy) * f]
  const done = inP >= 1
  c.save()
  c.beginPath()
  c.rect(m.clip.x, m.clip.y, m.clip.w, m.clip.h)
  c.clip()
  const { band, mask } = m
  // On the desktop's bands every move starts at COLDVEIL's eye: its line
  // in, then its shape where it arrives.
  // (The debris is not COLDVEIL's: it crosses the orbit from the side.)
  if (m.eye && m.shape !== 'beam' && m.shape !== 'packets' && m.shape !== 'debris') dots(c, fx, fy, cx, cy, 4 * U, U, red(0.55), 0, Math.min(stop, inP), mask)
  switch (m.shape) {
    case 'waves':
      // Radio waves coming down on the tile from above, arc after arc; on
      // a hit they close on it and its static stays over it.
      for (let k = 0; k < 3; k += 1) {
        const f = Math.max(0, Math.min(1, inP * 1.5 - k * 0.25))
        if (f <= 0) continue
        const rest = m.hit ? r - U * 2 + k * 2 * D : r + D * 3 + k * 2 * D
        ring(c, cx, cy, rest + (1 - f) * r * 2.2, D, red((0.9 - k * 0.24) * (done ? 1 : f)), Math.PI * 1.12, Math.PI * 1.88, 1.3)
      }
      if (m.hit && done) haze(c, { x: at.x, y: at.y, w: at.w, h: at.h }, t, 7, U, 1.2 * alpha)
      break
    case 'ghost': {
      // A red echo of the target where it is not, tied to it.
      const f = Math.min(1, inP * 1.3)
      const map = at.kind ? ASSET_MAPS[at.kind] : null
      const ox = at.w * 0.36 * f
      const oy = -at.h * 0.08 * f
      if (map) {
        const ps = at.w / map[0].length
        c.fillStyle = red((m.hit ? 0.62 : 0.32) * f)
        map.forEach((row, j) => {
          for (let i = 0; i < row.length; i += 1) if (row[i] !== '.') c.fillRect(Math.round(at.x + ox + i * ps), Math.round(at.y + oy + j * ps), Math.ceil(ps), Math.ceil(ps))
        })
      } else {
        c.strokeStyle = red(0.7 * f)
        c.lineWidth = U
        c.strokeRect(Math.round(at.x + ox) + 0.5, Math.round(at.y + oy) + 0.5, Math.round(at.w), Math.round(at.h))
      }
      break
    }
    case 'beam': {
      const f = Math.min(1, inP * 1.25) * stop
      const [tx, ty] = along(f)
      dots(c, fx, fy, tx, ty, U, D, red(0.95), 0, 1, mask)
      if (f >= stop) {
        c.fillStyle = rgba('ink', 0.9 * alpha)
        c.fillRect(Math.round(tx - D), Math.round(ty - D), D * 2, D * 2)
      }
      break
    }
    case 'packets': {
      // Square packets on the link, closing on the tile.
      dots(c, fx, fy, cx, cy, 4 * U, U, red(0.4), 0, stop, mask)
      for (let k = 0; k < 4; k += 1) {
        const f = Math.min(1, Math.max(0, inP * 1.3 - k * 0.12)) * stop - k * (done ? (D * 2.2) / Math.max(1, reach) : 0)
        if (f <= 0) continue
        const [px, py] = along(f)
        c.fillStyle = red(0.95 - k * 0.17)
        c.fillRect(Math.round(px - D), Math.round(py - D), D * 2, D * 2)
      }
      break
    }
    case 'chip': {
      // A planted chip, rising from below into the sprite; on the bands it
      // rides COLDVEIL's line in.
      if (m.eye) {
        const [x, y] = along(Math.min(stop, inP))
        pattern(c, CHIP, x - 2.5 * D, y - 2.5 * D, D, red(0.95))
        break
      }
      const by = band.y + band.h
      const end = m.hit ? at.y + at.h * 0.45 : cy + r + D
      const y = by + (end - by) * Math.min(1, inP)
      pattern(c, CHIP, cx - 2.5 * D, y - 2.5 * D, D, red(0.95))
      break
    }
    case 'hook': {
      // A line let down from above with a hook on its end.
      // On the bands it rides COLDVEIL's line in, with no line of its own.
      const end = m.hit ? at.y + at.h * 0.3 : cy - r - D * 3
      let hx = cx
      let ty = band.y + (end - band.y) * Math.min(1, inP)
      if (m.eye) [hx, ty] = along(Math.min(stop, inP) * (m.hit ? 0.9 : 1))
      // Let down from under the layer's name, not through it.
      else dots(c, cx, band.y + 13, cx, Math.max(ty, band.y + 13), 2 * U, U, red(0.7), 0, 1, mask)
      c.fillStyle = red(0.95)
      c.fillRect(Math.round(hx - U), Math.round(ty), D, 3 * D)
      c.fillRect(Math.round(hx - 3 * D + U), Math.round(ty + 3 * D), 3 * D, D)
      c.fillRect(Math.round(hx - 3 * D + U), Math.round(ty + D), D, 2 * D)
      break
    }
    case 'debris': {
      // Fragments crossing the orbit from the left.
      for (let k = 0; k < 6; k += 1) {
        const f = Math.max(0, Math.min(1, inP * 1.3 - k * 0.06))
        const x = band.x + (cx - band.x) * f - k * 5 * U
        const y = (m.hit ? cy : cy + r * 0.9) + (hash(k + 3) - 0.5) * r
        c.fillStyle = rgba('muted', 0.9 * alpha)
        c.fillRect(Math.round(x), Math.round(y), k % 2 ? D : D + U, D)
        c.fillStyle = rgba('muted', 0.35 * alpha)
        c.fillRect(Math.round(x - 4 * D), Math.round(y), 3 * D, U)
      }
      break
    }
  }
  // The result, once it lands.
  if (done) {
    if (m.hit) {
      // Rays out of the tile as it lands, and the impact star at its corner.
      if (outP < 1) {
        const spread = r * (0.6 + outP * 1.1)
        for (let k = 0; k < 8; k += 1) {
          const a = (k / 8) * Math.PI * 2 + 0.3
          dots(c, cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, cx + Math.cos(a) * spread, cy + Math.sin(a) * spread, 2 * U, D, red(1 - outP))
        }
      }
      pattern(c, STAR, at.x + at.w - 2.5 * U * 2, at.y - 2.5 * U * 2, U * 2, red(0.95))
    } else {
      // The shield: a dome over the tile, flashing as it takes the move.
      const flash = outP < 1 ? 0.55 + 0.45 * Math.abs(Math.cos(outP * Math.PI * 3)) : 0.9
      ring(c, cx, cy, r + D, D, green(flash), Math.PI * 0.92, Math.PI * 2.08, 0.25)
      ring(c, cx, cy, r + D * 2.5, U, green(flash * 0.4), Math.PI * 1.05, Math.PI * 1.95, 1)
      if (outP < 1) {
        for (let k = 0; k < 7; k += 1) {
          const a = Math.PI * (1.08 + k * 0.14)
          const d = r + D * 2 + outP * r
          c.fillStyle = green(1 - outP)
          c.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), D, D)
        }
      }
    }
  }
  c.restore()
}

// ---------------------------------------------------------------------

const LOCK_MS = STRIKE_MS * LOCK_SHARE
const LAND_MS = STRIKE_MS - LOCK_MS

const NO_THREATS: NonNullable<PlayfieldProps['threats']> = []
const NO_LABELS: readonly Trace[] = []

// A landed move named at its tile on the desktop's bands (v1.5 R2's
// re-review: the board never said which move landed where, or what it
// cost): its name and the score's change, or BLOCKED, in its result's
// colour, on a dark backing, stacked when two land on one tile.
const LABEL_TONE: Record<Trace['result'], Token> = { blocked: 'go', partial: 'warn', hit: 'hostile', clear: 'friendly', lost: 'hostile' }
function label(c: CanvasRenderingContext2D, t: Trace, at: Box, row: number, clip: Box) {
  const def = DEFAULT_SCENARIO.events.find((e) => e.id === t.eventId)
  if (!def) return
  const text = `${shortName(def)} ${t.result === 'blocked' ? 'BLOCKED' : t.result === 'clear' ? 'CLEAR' : t.delta < 0 ? t.delta.toFixed(1) : ''}`.trim()
  c.font = `11px ${MONO}`
  const w = Math.ceil(c.measureText(text).width) + 8
  const x = Math.round(Math.max(clip.x + 2, Math.min(clip.x + clip.w - w - 2, at.x + at.w / 2 - w / 2)))
  const y = Math.round(Math.max(clip.y + 2, at.y - 22 - row * 18))
  c.fillStyle = rgba('shadow', 0.85)
  c.fillRect(x, y, w, 16)
  c.fillStyle = rgba(LABEL_TONE[t.result], 1)
  c.fillText(text, x + 4, y + 12)
}

export default function Playfield({ strip, conditions, strike, traces, night, threats = NO_THREATS, labels = NO_LABELS }: PlayfieldProps) {
  const back = useRef<HTMLCanvasElement | null>(null)
  const front = useRef<HTMLCanvasElement | null>(null)
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  // What the canvases show, read by the loop, and when the strike's phase
  // began.
  const props = useRef({ conditions, strike, traces, night, threats, labels })
  props.current = { conditions, strike, traces, night, threats, labels }
  const phase = useRef({ key: '', at: 0 })
  const key = strike && !strike.rest ? `${strike.id}:${strike.landed ? 'land' : 'lock'}` : ''
  if (phase.current.key !== key) phase.current = { key, at: performance.now() }

  // The two contexts, asked for once a mount: a browser without canvas
  // (and the test DOM, which says so on every ask) gets no drawing at all.
  const ctx = useRef<{ bc: CanvasRenderingContext2D; fc: CanvasRenderingContext2D } | null | undefined>(undefined)
  const paint = useRef<(now: number) => boolean>(() => false)
  paint.current = (now: number) => {
    const el = strip.current
    if (ctx.current === undefined && back.current && front.current) {
      let bc: CanvasRenderingContext2D | null = null
      let fc: CanvasRenderingContext2D | null = null
      try {
        bc = back.current.getContext('2d')
        fc = bc ? front.current.getContext('2d') : null
      } catch {
        bc = null
      }
      ctx.current = bc && fc ? { bc, fc } : null
    }
    if (!el || !ctx.current || !back.current || !front.current) return false
    const { bc, fc } = ctx.current
    const f = measure(el)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    for (const cv of [back.current, front.current]) {
      const w = Math.round(f.w * dpr)
      const h = Math.round(f.h * dpr)
      if (cv.width !== w) cv.width = w
      if (cv.height !== h) cv.height = h
    }
    const U = f.bands ? 2 : 1
    const t = reduced ? 3 : now / 1000
    const { conditions: live, strike: s, traces: past, night: on, threats: aimed, labels: named } = props.current

    // The scene.
    bc.setTransform(dpr, 0, 0, dpr, 0, 0)
    bc.clearRect(0, 0, f.w, f.h)
    for (const [layer, b] of Object.entries(f.panels) as [Layer, Box][]) {
      bc.save()
      bc.beginPath()
      bc.rect(b.x, b.y, b.w, b.h)
      bc.clip()
      bc.fillStyle = INK.panel
      bc.fillRect(b.x, b.y, b.w, b.h)
      if (layer === 'ORBIT') orbit(bc, b, t, U)
      else if (layer === 'AIR') air(bc, b, t, U)
      else ground(bc, b, t, U)
      const held = live[layer]?.length ?? 0
      if (held) haze(bc, b, t, layer.length, U, Math.min(2, held))
      bc.restore()
    }
    // The links, on the desktop's bands: the ground station to every live
    // tile above it, broken and red through a layer a condition holds.
    if (f.bands && f.stations.length) {
      const st = f.stations[0]
      const sx = st.x + st.w * 0.4
      const sy = st.y + st.h * 0.2
      for (const [layer, b] of Object.entries(f.panels) as [Layer, Box][]) {
        if (layer === 'GROUND') continue
        const jammed = (live[layer]?.length ?? 0) > 0
        for (const [, tile] of f.tiles) {
          const tx = tile.x + tile.w / 2
          const ty = tile.y + tile.h * 0.85
          if (ty < b.y || ty > b.y + b.h) continue
          dots(bc, sx, sy, tx, ty, jammed ? 9 : 6, U, jammed ? rgba('hostile', 0.4) : rgba('friendly', 0.3), reduced ? 0 : (now / 40) % 6)
        }
      }
    }

    // The night.
    fc.setTransform(dpr, 0, 0, dpr, 0, 0)
    fc.clearRect(0, 0, f.w, f.h)
    // Tonight's lanes, while the player decides.
    if (!on) {
      for (const [layer, b] of Object.entries(f.panels) as [Layer, Box][]) {
        const worst = aimed.filter((x) => x.layers.includes(layer)).reduce((w, x) => Math.max(w, RANK.indexOf(x.status)), -1)
        if (worst >= 0) markLane(fc, b, MARK[RANK[worst]], reduced ? 1 : 0.8 + 0.2 * Math.sin(t * 3.2), U)
      }
    }
    const eye: [number, number] = [f.w - 22 * U, 6 * U]
    if (f.bands && on) blit(fc, COLDVEIL_EMBLEM, eye[0] - 8 * U, eye[1], U, 0.95)
    const place = (eventId: string | undefined, assetId: string | undefined, layers: readonly Layer[], hit: boolean): Move | null => {
      const tile = assetId ? f.tiles.get(assetId) : undefined
      const inside = (b: Box) => !!tile && tile.x + tile.w / 2 >= b.x && tile.x + tile.w / 2 <= b.x + b.w && tile.y + tile.h / 2 >= b.y && tile.y + tile.h / 2 <= b.y + b.h
      const layer = (Object.entries(f.panels) as [Layer, Box][]).find(([, b]) => inside(b))?.[0] ?? layers[0]
      const panel = f.panels[layer]
      if (!panel) return null
      const at: Tile = tile ?? { x: panel.x + panel.w / 2 - 8 * U, y: panel.y + panel.h / 2 - 6 * U, w: 16 * U, h: 12 * U }
      const from: [number, number] = f.bands ? [eye[0], eye[1] + 8 * U] : [Math.min(panel.x + panel.w - 2, at.x + at.w / 2 + panel.h * 0.8), panel.y + 1]
      const mask = [...f.tiles.values()].filter((t) => t !== tile)
      // Drawn inside the target's own layer, so no line crosses another
      // layer's tiles (v1.5 R2's re-review): on the bands it enters along
      // the line from COLDVEIL's eye.
      return { shape: shapeOf(eventId), at, band: panel, mask, clip: panel, hit, from, eye: f.bands }
    }
    for (const tr of past) {
      const m = place(tr.eventId, tr.assetId, tr.layers, tr.hit)
      if (m) drawMove(fc, m, 1, 1, 0.42, U, t)
    }
    // The landed moves' names, on the desktop's bands.
    if (f.bands) {
      const rows = new Map<string, number>()
      for (const t of named) {
        const tile = t.assetId ? f.tiles.get(t.assetId) : undefined
        if (!tile) continue
        const panel = (Object.values(f.panels) as Box[]).find((b) => tile.x + tile.w / 2 >= b.x && tile.x + tile.w / 2 <= b.x + b.w && tile.y + tile.h / 2 >= b.y && tile.y + tile.h / 2 <= b.y + b.h)
        const row = rows.get(t.assetId!) ?? 0
        rows.set(t.assetId!, row + 1)
        if (panel) label(fc, t, tile, row, panel)
      }
    }
    let busy = false
    if (s) {
      const m = place(s.eventId, s.assetId, s.kind === 'hit' ? [s.layer] : s.layers, s.kind === 'hit')
      if (m) {
        if (s.rest || reduced) drawMove(fc, m, 1, 1, 1, U, t)
        else {
          const dt = now - phase.current.at
          if (!s.landed) drawMove(fc, m, Math.min(0.999, dt / LOCK_MS), 0, 1, U, t)
          else drawMove(fc, m, 1, Math.min(1, dt / LAND_MS), 1, U, t)
          busy = true
        }
      }
    }
    return busy
  }

  // The panels give their fill to the scene while it is here.
  useLayoutEffect(() => {
    const el = strip.current
    if (!el) return
    readTokens()
    el.dataset.field = 'on'
    return () => {
      delete el.dataset.field
    }
  }, [strip])

  // Drawn on every change of what it shows, the tiles' places among it,
  // and on every resize; never on a render that changed none of them, so
  // under reduced motion a board that sits still draws nothing.
  const drawn = useRef('')
  useLayoutEffect(() => {
    const el = strip.current
    if (!el) return
    const f = measure(el)
    const sig = JSON.stringify([conditions, strike && [strike.id, strike.landed, strike.rest], traces.map((x) => x.id), labels.map((x) => x.id), night, threats, f.w, f.h, [...f.tiles].map(([id, b]) => [id, Math.round(b.x), Math.round(b.y)])])
    if (sig === drawn.current) return
    drawn.current = sig
    paint.current(performance.now())
  })
  useEffect(() => {
    const el = strip.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => paint.current(performance.now()))
    ro.observe(el)
    return () => ro.disconnect()
  }, [strip])

  // The loop, with motion allowed and the tab visible: about twelve frames
  // a second at rest, every frame while a move is on its way.
  useEffect(() => {
    if (reduced || !visible) return
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      const busy = props.current.strike && !props.current.strike.rest
      if (busy || now - last >= 83) {
        paint.current(now)
        last = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reduced, visible])

  return (
    <>
      <canvas ref={back} aria-hidden="true" data-playfield="scene" className="pointer-events-none absolute inset-0 z-0 block h-full w-full" />
      <canvas ref={front} aria-hidden="true" data-playfield="night" className="pointer-events-none absolute inset-0 z-20 block h-full w-full" />
    </>
  )
}

// THE STRIKE, CLOSE UP (v1.5 R2's review: on a phone the night played in a
// thumbnail strip with the screen under it empty). While a move strikes,
// its banner shows the target large in its layer's scene, COLDVEIL's eye in
// the corner, the move arriving in its shape, then the shield or the burst
// and the scorch. Motion only: under reduced motion there is no strike, and
// the strip's still marks and the card carry the night.
export interface CloseUpProps {
  eventId?: string
  layer: Layer
  // The target, when the move had one: its kind and its integrity before
  // and after.
  kind?: AssetKind
  integrity?: readonly [number, number]
  hit: boolean
  landed: boolean
}

export function CloseUp({ eventId, layer, kind, integrity, hit, landed }: CloseUpProps) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const visible = usePageVisible()
  const now = performance.now()
  const clock = useRef({ start: now, land: 0 })
  if (landed && !clock.current.land) clock.current.land = now
  const live = useRef({ landed, hit })
  live.current = { landed, hit }
  const before = integrity?.[0]
  const after = integrity?.[1]
  useEffect(() => {
    const cv = ref.current
    if (!cv || !visible) return
    let c: CanvasRenderingContext2D | null = null
    try {
      c = cv.getContext('2d')
    } catch {
      c = null
    }
    if (!c) return
    const ctx = c
    readTokens()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const shape = shapeOf(eventId)
    let raf = 0
    const loop = (t: number) => {
      const w = cv.clientWidth || 320
      const h = cv.clientHeight || 140
      if (cv.width !== Math.round(w * dpr)) cv.width = Math.round(w * dpr)
      if (cv.height !== Math.round(h * dpr)) cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const U = 2
      const box: Box = { x: 0, y: 0, w, h }
      ctx.fillStyle = INK.panel
      ctx.fillRect(0, 0, w, h)
      if (layer === 'ORBIT') orbit(ctx, box, t / 1000, U)
      else if (layer === 'AIR') air(ctx, box, t / 1000, U)
      else ground(ctx, box, t / 1000, U)
      const { landed: down, hit: struck } = live.current
      const inP = down ? 1 : Math.min(0.999, (t - clock.current.start) / LOCK_MS)
      const outP = down ? Math.min(1, (t - clock.current.land) / LAND_MS) : 0
      // The target, large, standing on the ground in GROUND.
      const s = Math.max(3, Math.floor((h * 0.4) / 12))
      const sw = 16 * s
      const sh = 12 * s
      const base = layer === 'GROUND' ? h - Math.round(Math.min(Math.max(h * 0.1, 4), 26)) : h * 0.62 + sh / 2
      const at: Tile = { x: Math.round(w * 0.42 - sw / 2), y: Math.round(base - sh), w: sw, h: sh, kind }
      if (kind) blit(ctx, assetSprite(kind, (down && struck ? after : before) ?? 100), at.x, at.y, s)
      const eye: [number, number] = [w - 14 - 16 * U, 8]
      blit(ctx, COLDVEIL_EMBLEM, eye[0], eye[1], U)
      drawMove(ctx, { shape, at, band: box, mask: [], clip: box, hit: struck, from: [eye[0] + 8 * U, eye[1] + 16 * U], eye: true }, inP, outP, 1, U, t / 1000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [visible, eventId, layer, kind, before, after])
  return <canvas ref={ref} aria-hidden="true" data-close-up className="block h-[140px] w-full max-w-[360px] border-2 border-dc-line desk:h-[220px] desk:max-w-[480px]" />
}
