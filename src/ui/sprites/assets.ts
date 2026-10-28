// The asset sprites (v1.3 brief 8.2): the prototype's four 16x12 maps,
// drawn at 2x on a tile. The panelled sat with its foil and beacon, the RPO
// sat with its sensor and probe, the fixed-wing KESTREL, and the GS-1
// station with its roof dish (Ken's sprite ruling, brief section 3).
//
// Two views (v1.6 R5, Ken's ruling of 27 October 2026: side-profile
// drones). The scenes are drawn side on: the cold open's sky, the strip's
// AIR panel with its clouds and the strike's close-up. So wherever a sprite
// stands in a scene it is drawn in profile, and the KESTREL there flies
// nose east. The sats face the viewer with their panels spread, and the
// station stands on its ground line, which is already side on. PROCURE's
// tiles are icons on a card, not a scene, and keep the KESTREL top down.
//
// Damage is not redrawn per state any more. A wound scorches body pixels
// in one fixed order, as many as the integrity lost: amber while wounded,
// red at 50 or below, with the panels darkened when critical. Lost is the
// map greyed with a red pixel X; in transit it is a grey silhouette. So any
// wound changes the sprite (critique row M11), and the same integrity
// always scorches the same pixels.
//
// The battery sweeps the engine's AssetKind union against ASSET_SPRITES in
// every SpriteState (principle 17): a kind the engine grows fails the suite
// until it is drawn.

import type { AssetKind } from '../../engine/types'
import { SPRITE_STATES, type SpriteState } from '../board/board'
import type { Palette, Sprite } from './sprite'

// The maps, character for character from the prototype's PIX. B hull,
// P panel, D deep panel, R glass, W bright, S steel, L sensor (the
// beacon), G the ground line.
export const ASSET_MAPS: Record<AssetKind, readonly string[]> = {
  sat: [
    '................',
    '................',
    '.......WB.......',
    '........B.......',
    'PPPPP..BBB..PPPP',
    'PDPDPSBRRRBSPDPD',
    'PPPPPSBRRRBSPPPP',
    'PDPDPSBRRRBSPDPD',
    'PPPPP..BBB..PPPP',
    '........S.......',
    '................',
    '................',
  ],
  rpoSat: [
    '................',
    '................',
    '.......WB.......',
    '........B.......',
    'PPPPP..BBB..PPPP',
    'PDPDPSBRRRBSPDPD',
    'PPPPPSBRLRBSPPPP',
    'PDPDPSBRRRBSPDPD',
    'PPPPP..BBB..PPPP',
    '........S.......',
    '........L.......',
    '................',
  ],
  drone: [
    '.......WW.......',
    '.......BB.......',
    '.......BL.......',
    'PPPPPPPBBPPPPPPP',
    'DDDDDDDBBDDDDDDD',
    '.......BB.......',
    '.......BB.......',
    '.......BB.......',
    '.....PPBBPP.....',
    '....PP.BB.PP....',
    '.......SS.......',
    '................',
  ],
  groundStation: [
    '...........L....',
    '....WW....S.....',
    '...RRRW..S......',
    '..DPRRRWS.......',
    '..DPPRRRW.......',
    '...DPPRRRW......',
    '....DDDSS.......',
    '..BBBBBBBBBBBB..',
    '..BPPDPPPPDPPB..',
    '..BPPPPPPPPPPB..',
    '..BPPPPSSPPPPB..',
    '.GGGGGGGGGGGGGG.',
  ],
}

// The KESTREL in profile, nose east: the satcom bulge (no canopy, it is
// uncrewed), the wing edge on and a little from below in the panel blue,
// the sensor ball under the chin, the tail fin with its beacon, the short
// ventral fin, and the pusher prop a little taller than the body.
export const KESTREL_SIDE: readonly string[] = [
  '................',
  '................',
  '................',
  '.L..............',
  'SBB.......BBB...',
  'SBBB.....BBBBBB.',
  'SBBBBBBBBBBBBBBB',
  'SDDDPPPPPPPPDDB.',
  'S.D...DPPPD..RR.',
  '.......DPD...RR.',
  '................',
  '................',
]

// What a scene draws for each kind, and what an icon does.
export type View = 'scene' | 'icon'
export const SCENE_MAPS: Record<AssetKind, readonly string[]> = { ...ASSET_MAPS, drone: KESTREL_SIDE }
const mapOf = (kind: AssetKind, view: View) => (view === 'icon' ? ASSET_MAPS : SCENE_MAPS)[kind]

// The five sprite inks and three section 3 tokens (brief 8.1). Panels are
// friendly, sensors go, the ground line muted. The scorch and the X are
// extra characters the scorcher writes over the map.
const PALETTE: Palette = {
  B: { token: 'hull' },
  P: { token: 'friendly' },
  D: { token: 'deep' },
  R: { token: 'glass' },
  W: { token: 'bright' },
  S: { token: 'steel' },
  L: { token: 'go', part: 'beacon' },
  G: { token: 'muted' },
  // Scorched pixels: amber while wounded, red at 50 or below.
  a: { token: 'warn' },
  h: { token: 'hostile' },
  // A panel darkened on a critical asset.
  k: { token: 'hostile', alpha: 0.45 },
  // Lost and in transit: every pixel the line grey; the X red.
  g: { token: 'line' },
  x: { token: 'hostile' },
}

// The characters a scorch can take: everything but the sensor light and
// the ground line, as in the prototype.
const BODY = 'BPRDWS'

// The scorch order: the body cells, in reading order, sorted by the
// prototype's fixed hash, (i * 7919) % 31 on each cell's index among all
// opaque cells. Stable sort, so ties keep reading order.
function scorchOrder(rows: readonly string[]): [x: number, y: number][] {
  const cells: { x: number; y: number; ch: string; i: number }[] = []
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && cells.push({ x, y, ch, i: cells.length })))
  return cells
    .filter((c) => BODY.includes(c.ch))
    .sort((a, b) => ((a.i * 7919) % 31) - ((b.i * 7919) % 31))
    .map((c) => [c.x, c.y])
}

const ORDER = new Map<readonly string[], [number, number][]>()
const orderOf = (map: readonly string[]) => {
  let o = ORDER.get(map)
  if (!o) ORDER.set(map, (o = scorchOrder(map)))
  return o
}

// How many body pixels a given integrity scorches: the share lost, rounded
// up, so the first point of damage already shows.
export function scorchCount(kind: AssetKind, integrity: number, view: View = 'scene'): number {
  const n = orderOf(mapOf(kind, view)).length
  if (integrity >= 100) return 0
  return Math.min(n, Math.ceil(((100 - Math.max(0, integrity)) / 100) * n))
}

// The red X over a lost asset, corner to corner as the prototype draws it
// (from 17% to 83% across, 21% to 79% down), one pixel wide.
function crossCells(w: number, h: number): Set<string> {
  const out = new Set<string>()
  const [x0, x1, y0, y1] = [Math.round(w * 0.17), Math.round(w * 0.83) - 1, Math.round(h * 0.21), Math.round(h * 0.79) - 1]
  const steps = Math.max(x1 - x0, y1 - y0)
  for (let k = 0; k <= steps; k += 1) {
    const x = Math.round(x0 + ((x1 - x0) * k) / steps)
    const y = Math.round(y0 + ((y1 - y0) * k) / steps)
    out.add(`${x},${y}`)
    out.add(`${x1 - (x - x0)},${y}`)
  }
  return out
}

export type DrawMode = 'live' | 'transit' | 'lost'

const cache = new Map<string, Sprite>()

// The sprite for an asset at an integrity, in a scene or as an icon.
// `live` scorches by integrity; `transit` is the grey silhouette of an
// asset on its way; `lost` is the greyed map with the red X. One object per
// distinct picture, so a tile that re-renders at the same integrity hands
// PixelSprite the same sprite.
export function assetSprite(kind: AssetKind, integrity: number, mode: DrawMode = integrity <= 0 ? 'lost' : 'live', view: View = 'scene'): Sprite {
  const map = mapOf(kind, view)
  const n = mode === 'live' ? scorchCount(kind, integrity, view) : 0
  const critical = mode === 'live' && integrity <= 50
  const key = `${kind}:${view}:${mode}:${n}:${critical ? 1 : 0}`
  const hit = cache.get(key)
  if (hit) return hit
  const grid = map.map((row) => [...row])
  if (mode !== 'live') {
    for (const row of grid) row.forEach((ch, x) => ch !== '.' && (row[x] = 'g'))
    if (mode === 'lost') for (const at of crossCells(grid[0].length, grid.length)) {
      const [x, y] = at.split(',').map(Number)
      grid[y][x] = 'x'
    }
  } else {
    if (critical) for (const row of grid) row.forEach((ch, x) => ch === 'P' && (row[x] = 'k'))
    for (const [x, y] of orderOf(map).slice(0, n)) grid[y][x] = critical ? 'h' : 'a'
  }
  const made: Sprite = { rows: grid.map((r) => r.join('')), palette: PALETTE }
  cache.set(key, made)
  return made
}

// The integrity each named state is drawn at, where code needs one picture
// for a state rather than for an exact integrity (the briefing, the wide
// inspector's legend, the battery's sweep).
export const STATE_INTEGRITY: Record<SpriteState, number> = { intact: 100, wounded: 75, critical: 25, lost: 0 }

export const ASSET_SPRITES = Object.fromEntries(
  (Object.keys(ASSET_MAPS) as AssetKind[]).map((kind) => [
    kind,
    Object.fromEntries(SPRITE_STATES.map(({ state }) => [state, assetSprite(kind, STATE_INTEGRITY[state])])),
  ]),
) as Record<AssetKind, Record<SpriteState, Sprite>>
