// The backdrops as data (v1.2 R2): the pixel size, every ink the scenery
// paints, the two small sprites it flies, the fill panel text sits on and
// the band each layer leaves at its foot. Kept apart from the components
// in ./backdrops.tsx so the suite can read the inks without rendering,
// and so that file exports components only.

import type { Layer } from '../../engine/types'
import { sprite, type Ink } from './sprite'

// The fill every piece of panel text sits on. Tailwind reads the class
// from this literal; the suite reads the alpha from it.
export const PANEL_FILL = 'bg-dc-panel/90'

// Two CSS pixels to a pixel, the same as a sprite drawn at 2x.
export const PX = 2

export const STAR: Ink = { token: 'ink', alpha: 0.45 }
export const TWINKLE: Ink = { token: 'ink', alpha: 0.8 }
export const LIMB_BODY: Ink = { token: 'friendly', alpha: 0.26 }
export const LIMB_GLOW: Ink = { token: 'friendly', alpha: 0.4 }
export const LIMB_AIR: Ink = { token: 'friendly', alpha: 0.75 }
export const SKY = [0.04, 0.08, 0.12, 0.16].map((alpha): Ink => ({ token: 'friendly', alpha }))
export const RIDGE: Ink = { token: 'line' }
export const EARTH: Ink = { token: 'muted', alpha: 0.18 }
export const GRASS: Ink = { token: 'go', alpha: 0.3 }

export const CLOUD = sprite(
  { w: { token: 'ink', alpha: 0.3 }, q: { token: 'muted', alpha: 0.2 } },
  `....wwww........ ..wwwwwwww.ww... .wwwwwwwwwwwwww. qqqqqqqqqqqqqqqq`,
)

// A satellite in silhouette: panels, body, panels.
export const SILHOUETTE = sprite({ q: { token: 'muted', alpha: 0.7 }, w: { token: 'ink', alpha: 0.85 } }, `qq.w.qq qqqwqqq qq.w.qq`)

export const BACKDROP_INKS: Record<Layer, readonly Ink[]> = {
  ORBIT: [STAR, TWINKLE, LIMB_BODY, LIMB_GLOW, LIMB_AIR, ...Object.values(SILHOUETTE.palette)],
  AIR: [...SKY, ...Object.values(CLOUD.palette)],
  GROUND: [STAR, RIDGE, EARTH, GRASS],
}

// THE LIMB. A circle much wider than any panel, so only its crown shows:
// its radius and its height at the centre, in pixels. The satellites fly
// on circles about the same centre, so they follow the curve down as they
// cross.
export const LIMB = { cols: 300, radius: 500, crown: 10 }

// The two satellites. Altitude is above the limb's crown, in CSS pixels;
// `rest` is the angle each stands at when nothing moves.
export const ORBITS = [
  { altitude: 6, seconds: 50, delay: -14, rest: -4, reverse: false },
  { altitude: 13, seconds: 72, delay: -40, rest: 6, reverse: true },
]

// The terrain's depth, in pixels.
export const TERRAIN_DEPTH = 7

// How tall each backdrop's band at the panel's foot is, in CSS pixels, so
// the panel leaves room for it below the tiles: the limb's crown and the
// highest satellite for ORBIT, the terrain for GROUND. Derived from the
// geometry, so a taller limb cannot slide under the tiles unnoticed.
const highestOrbit = Math.max(...ORBITS.map((o) => o.altitude)) + (SILHOUETTE.rows.length * PX) / 2
export const BACKDROP_BAND: Record<Layer, number> = {
  ORBIT: LIMB.crown * PX + Math.ceil(highestOrbit) + PX,
  AIR: 0,
  GROUND: TERRAIN_DEPTH * PX,
}

// THE SCENERY THAT IS COMPUTED rather than written down: each layer's star
// tile, the limb, and the terrain tile, as rects grouped by ink. Built the
// first time a layer's backdrop is drawn and kept, so a backdrop mount is
// a lookup and never a recalculation.
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface Paint {
  ink: Ink
  rects: readonly Rect[]
}
export interface Scene {
  // One tile of a repeating pattern, 48 by 32 pixels.
  stars: readonly Paint[] | null
  // The limb, LIMB.cols wide and LIMB.crown tall.
  limb: readonly Paint[] | null
  // One tile of a repeating pattern, 32 pixels by TERRAIN_DEPTH.
  terrain: readonly Paint[] | null
}

// Stars on the repeating tile, in pixels.
const STARS = [
  [3, 2],
  [17, 9],
  [29, 4],
  [40, 14],
  [9, 19],
  [24, 24],
  [44, 27],
]

// One tile of terrain, 32 pixels wide: a far ridge and the near ground.
const RIDGE_TOPS = [4, 4, 5, 5, 6, 6, 6, 5, 5, 4, 4, 4, 5, 6, 7, 7, 7, 6, 5, 5, 4, 4, 4, 4, 5, 5, 6, 6, 5, 5, 4, 4]
const GROUND_TOPS = [2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 3, 3, 4, 4, 3, 3, 2, 2, 2, 3, 3, 3, 3, 2, 2, 2, 2, 3, 3, 2, 2, 2]

// A height profile as runs: consecutive columns of the same height become
// one run, the same merging the sprite renderer does, so a flat stretch of
// terrain or limb is one rect. Heights count up from the foot of the box.
function profile(heights: readonly number[]) {
  const out: { x: number; w: number; h: number }[] = []
  heights.forEach((h, x) => {
    const last = out[out.length - 1]
    if (last && last.h === h) last.w += 1
    else out.push({ x, w: 1, h })
  })
  return out.filter((r) => r.h > 0)
}

function starTile(): Paint[] {
  return [{ ink: STAR, rects: STARS.map(([x, y]) => ({ x, y, w: 1, h: 1 })) }]
}

function limb(): Paint[] {
  const depth = LIMB.crown
  const crown = profile(
    Array.from({ length: LIMB.cols }, (_, c) => {
      const dx = c - LIMB.cols / 2 + 0.5
      return Math.round(LIMB.crown - (dx * dx) / (2 * LIMB.radius))
    }),
  )
  // The atmosphere is the top pixel of every column, a glow under it, and
  // the body below that.
  return [
    { ink: LIMB_BODY, rects: crown.filter((r) => r.h > 2).map((r) => ({ x: r.x, y: depth - r.h + 2, w: r.w, h: r.h - 2 })) },
    { ink: LIMB_GLOW, rects: crown.filter((r) => r.h > 1).map((r) => ({ x: r.x, y: depth - r.h + 1, w: r.w, h: 1 })) },
    { ink: LIMB_AIR, rects: crown.map((r) => ({ x: r.x, y: depth - r.h, w: r.w, h: 1 })) },
  ]
}

function terrainTile(): Paint[] {
  const depth = TERRAIN_DEPTH
  const ground = profile(GROUND_TOPS)
  return [
    { ink: RIDGE, rects: profile(RIDGE_TOPS).map((r) => ({ x: r.x, y: depth - r.h, w: r.w, h: r.h })) },
    { ink: EARTH, rects: ground.map((r) => ({ x: r.x, y: depth - r.h + 1, w: r.w, h: r.h - 1 })) },
    { ink: GRASS, rects: ground.map((r) => ({ x: r.x, y: depth - r.h, w: r.w, h: 1 })) },
  ]
}

const scenes = new Map<Layer, Scene>()

export function sceneFor(layer: Layer): Scene {
  let scene = scenes.get(layer)
  if (!scene) {
    scene = {
      stars: layer === 'AIR' ? null : starTile(),
      limb: layer === 'ORBIT' ? limb() : null,
      terrain: layer === 'GROUND' ? terrainTile() : null,
    }
    scenes.set(layer, scene)
  }
  return scene
}
