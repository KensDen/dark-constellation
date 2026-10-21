// The briefing's four scenes (v1.3 R1, brief 5.2), ported from the loop
// prototype's canvas scenes onto the shipped art: the watch officer, the
// wrecks and the flood from ./sprites/coldOpen.ts, the COLDVEIL emblem from
// ./sprites/icons.ts, and the board's asset sprites and scenery, drawn,
// not redrawn. Every scene is a pure function of time on one canvas,
// drawn at about 15 frames a second for a stepped, pixel feel; under
// reduced motion each is drawn once, at a representative moment.
//
// ONLY THE BRIEFING IMPORTS THIS FILE (and with it ./sprites/coldOpen.ts),
// so it ships in the IntroSequence chunk.

import type { SceneName } from './coldOpenSlides'
import { DISASTER, FLOOD, WATCH_OFFICER } from './sprites/coldOpen'
import { COLDVEIL_EMBLEM } from './sprites/icons'
import { ASSET_SPRITES } from './sprites/assets'
import { CLOUD, SILHOUETTE } from './sprites/scenery'
import { runs, spriteRects, type Ink, type Palette, type Sprite, type Token } from './sprites/sprite'

// The section 3 tokens, read from the stylesheet when a scene starts, with
// the shipped values as the fallback (a test DOM has no stylesheet).
const FALLBACK: Record<Token, string> = {
  ground: '#0B0F14',
  chrome: '#0E141C',
  panel: '#121821',
  line: '#243041',
  ink: '#E6EDF3',
  muted: '#8B98A8',
  go: '#7CFF9B',
  friendly: '#5AA9FF',
  hostile: '#FF4FA3',
  warn: '#FFB547',
  shadow: '#05080C',
}
let INK: Record<Token, string> = { ...FALLBACK }

export function readTokens(): void {
  if (typeof document === 'undefined') return
  const css = getComputedStyle(document.documentElement)
  const next = { ...FALLBACK }
  for (const t of Object.keys(FALLBACK) as Token[]) {
    const v = css.getPropertyValue(`--dc-${t}`).trim()
    if (/^#[0-9a-f]{6}$/i.test(v)) next[t] = v
  }
  INK = next
}

function hexA(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}
const inkColor = (ink: Ink) => hexA(INK[ink.token], ink.alpha ?? 1)

type Swap = (ink: Ink, char: string) => string | undefined

// A sprite at (x0, y0), s CSS pixels to a sprite pixel, one rect per run.
function blit(ctx: CanvasRenderingContext2D, spr: Sprite, x0: number, y0: number, s: number, swap?: Swap) {
  x0 = Math.round(x0)
  y0 = Math.round(y0)
  for (const g of spriteRects(spr)) {
    ctx.fillStyle = swap?.(g.ink, g.char) ?? inkColor(g.ink)
    for (const r of g.runs) ctx.fillRect(x0 + r.x * s, y0 + r.y * s, r.width * s, s)
  }
}

// Some rows of a sprite, for the emblem's torn slices.
function blitRows(ctx: CanvasRenderingContext2D, rows: readonly string[], palette: Palette, x0: number, y0: number, s: number) {
  x0 = Math.round(x0)
  y0 = Math.round(y0)
  for (const r of runs(rows)) {
    ctx.fillStyle = inkColor(palette[r.char])
    ctx.fillRect(x0 + r.x * s, y0 + r.y * s, r.width * s, s)
  }
}

const hash = (i: number) => {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function stars(ctx: CanvasRenderingContext2D, W: number, t: number, maxY: number, n: number, seed: number) {
  const r = mulberry(seed)
  for (let i = 0; i < n; i += 1) {
    const x = Math.floor((r() * W) / 3) * 3
    const y = Math.floor((r() * maxY) / 3) * 3
    const tw = r() < 0.18
    const big = r() < 0.08
    let a = 0.25 + r() * 0.35
    if (tw) a = [0.15, 0.5, 0.9][Math.floor((t * 2.2 + i) % 3)]
    ctx.fillStyle = hexA(INK.ink, a)
    ctx.fillRect(x, y, big ? 3 : 2, big ? 3 : 2)
  }
}

function brackets(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string) {
  ctx.fillStyle = color
  const L = 7
  const T = 2
  cx = Math.round(cx)
  cy = Math.round(cy)
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const x = cx + sx * rx
    const y = cy + sy * ry
    ctx.fillRect(sx < 0 ? x : x - L, sy < 0 ? y : y - T, L, T)
    ctx.fillRect(sx < 0 ? x : x - T, sy < 0 ? y : y - L, T, L)
  }
}

function dash(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, step: number, size: number, color: string, offset = 0) {
  const d = Math.hypot(x2 - x1, y2 - y1)
  const n = Math.floor(d / step)
  ctx.fillStyle = color
  for (let k = 0; k <= n; k += 1) {
    const f = Math.min(1, (k * step + (offset % step)) / d)
    ctx.fillRect(Math.round(x1 + (x2 - x1) * f - size / 2), Math.round(y1 + (y2 - y1) * f - size / 2), size, size)
  }
}

const RIDGE_TOPS = [4, 4, 5, 5, 6, 6, 6, 5, 5, 4, 4, 4, 5, 6, 7, 7, 7, 6, 5, 5, 4, 4, 4, 4, 5, 5, 6, 6, 5, 5, 4, 4]
const GROUND_TOPS = [2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 3, 3, 4, 4, 3, 3, 2, 2, 2, 3, 3, 3, 3, 2, 2, 2, 2, 3, 3, 2, 2, 2]

// A beacon ink lit or dim.
const beacon = (on: boolean): Swap => (ink) => (ink.part === 'beacon' ? (on ? INK.go : hexA(INK.go, 0.3)) : undefined)

type Draw = (ctx: CanvasRenderingContext2D, W: number, H: number, t: number) => void

const SAT = ASSET_SPRITES.sat.intact
const RPO = ASSET_SPRITES.rpoSat.intact
const DRONE = ASSET_SPRITES.drone.intact
const STATION = ASSET_SPRITES.groundStation.intact

export const SCENES: Record<SceneName, Draw> = {
  // STORMGLASS-9 in a drifting train over a stepped Earth, beacons
  // blinking, frames coming home as packets.
  orbit(ctx, W, H, t) {
    ctx.fillStyle = INK.ground
    ctx.fillRect(0, 0, W, H)
    stars(ctx, W, t, H * 0.75, 70, 11)
    const U = 4
    const R = Math.max(W * 1.6, 560)
    const crown = Math.round(H * 0.28)
    const cx = W / 2
    const cy = H - crown + R
    const surf = (x: number) => cy - Math.sqrt(Math.max(0, R * R - (x - cx) ** 2))
    const Rf = R + H * 0.56
    for (let k = 0; k < 4; k += 1) {
      const x = W + 40 - ((k * 140 + t * 7) % (4 * 140))
      const y = cy - Math.sqrt(Math.max(0, Rf * Rf - (x - cx) ** 2))
      blit(ctx, SILHOUETTE, x - 7, y - 3, 2)
    }
    const drift = Math.floor((t * 6) / U) * U
    const cdrift = Math.floor((t * 13) / U) * U
    for (let x = 0; x < W; x += U) {
      const top = Math.round(surf(x + U / 2) / U) * U
      ctx.fillStyle = hexA(INK.friendly, 0.8)
      ctx.fillRect(x, top, U, U)
      ctx.fillStyle = hexA(INK.friendly, 0.42)
      ctx.fillRect(x, top + U, U, U)
      ctx.fillStyle = hexA(INK.friendly, 0.2)
      ctx.fillRect(x, top + 2 * U, U, H - top)
      for (let y = top + 2 * U; y < H; y += U) {
        const u = x + drift
        const v = y * 1.6
        const land = Math.sin(u * 0.019) + Math.sin(u * 0.043 + v * 0.031) + Math.sin(v * 0.05 - u * 0.011)
        if (land > 1.15) {
          ctx.fillStyle = hexA(INK.go, land > 1.9 ? 0.3 : 0.18)
          ctx.fillRect(x, y, U, U)
        }
        const cu = x + cdrift
        const cl = Math.sin(cu * 0.05 + y * 0.11) * Math.sin(y * 0.07 - cu * 0.017)
        if (cl > 0.62) {
          ctx.fillStyle = hexA(INK.ink, 0.26)
          ctx.fillRect(x, y, U, U)
        }
      }
    }
    const Ra = R + H * 0.34
    const orbitY = (x: number) => cy - Math.sqrt(Math.max(0, Ra * Ra - (x - cx) ** 2))
    ctx.fillStyle = hexA(INK.friendly, 0.2)
    for (let x = 0; x < W; x += 9) ctx.fillRect(x, Math.round(orbitY(x)), 2, 2)
    const gap = 96
    const loop = 10 * gap
    for (let i = 0; i < 10; i += 1) {
      const x = ((i * gap + t * 11) % loop) - gap
      if (x < -60 || x > W + 60) continue
      const y = orbitY(x)
      const on = Math.floor(t * 2.5 + i * 1.7) % 3 === 0
      blit(ctx, i === 4 ? RPO : SAT, x - 24, y - 24, 3, beacon(on))
      const p = ((t + i * 0.61) % 2.6) / 1.1
      if (p < 1) {
        const y0 = y + 24
        const y1 = surf(x)
        const yy = y0 + (y1 - y0) * p
        ctx.fillStyle = hexA(INK.friendly, 0.5)
        for (let k = 1; k <= 3; k += 1) ctx.fillRect(Math.round(x - 1), Math.round(yy - k * 7), 2, 2)
        ctx.fillStyle = INK.go
        ctx.fillRect(Math.round(x - 2), Math.round(yy - 2), 4, 4)
      } else if (p < 1.25) {
        const y1 = Math.round(surf(x) / U) * U
        ctx.fillStyle = hexA(INK.go, 0.9)
        ctx.fillRect(Math.round(x - 6), y1 - 2, 12, 2)
      }
    }
  },

  // The KESTREL squadron over the flooded town, rain falling, the lead
  // drone's scan cone locking onto the survivor.
  disaster(ctx, W, H, t) {
    ctx.fillStyle = INK.ground
    ctx.fillRect(0, 0, W, H)
    const bands = [0, 0.4, 0.65, 0.85, 1]
    ;[0.04, 0.08, 0.12, 0.16].forEach((a, i) => {
      ctx.fillStyle = hexA(INK.friendly, a)
      ctx.fillRect(0, Math.round(bands[i] * H), W, Math.round((bands[i + 1] - bands[i]) * H) + 1)
    })
    for (const c of [
      { y: 0.1, v: 9, o: 0.1 },
      { y: 0.42, v: 6, o: 0.55 },
      { y: 0.24, v: 4, o: 0.8 },
    ]) {
      const x = ((c.o * (W + 60) + t * c.v) % (W + 60)) - 60
      blit(ctx, CLOUD, Math.floor(x / 3) * 3, Math.round(c.y * H), 3)
    }
    const waterTop = H - 46
    ctx.globalAlpha = 0.6
    for (const [p, k] of [
      [6, 0],
      [22, 1],
      [48, 3],
      [70, 1],
      [84, 0],
    ])
      blit(ctx, DISASTER[k], (p / 100) * W - 24, H - 22 - 48, 3)
    ctx.globalAlpha = 1
    const wreckX = 0.62 * W - 48
    const wreckY = H - 96
    for (let k = 0; k < 4; k += 1) {
      const ph = (t * 0.55 + k / 4) % 1
      ctx.fillStyle = hexA(INK.muted, 0.4 * (1 - ph))
      const s = 6 + Math.floor(ph * 3) * 3
      ctx.fillRect(Math.round(wreckX + 60 + ph * 18 - s / 2), Math.round(wreckY - ph * 70), s, s)
    }
    const lit = t % 1.8 > 0.25 ? INK.warn : hexA(INK.warn, 0.25)
    const litWindow: Swap = (_ink, char) => (char === 'y' ? lit : undefined)
    for (const [p, k] of [
      [10, 1],
      [36, 0],
      [62, 2],
      [90, 0],
    ])
      blit(ctx, DISASTER[k], (p / 100) * W - 48, H - 96, 6, litWindow)
    const ox = ((Math.floor((t * 8) / 3) * 3) % 48)
    ctx.fillStyle = hexA(INK.friendly, 0.3)
    ctx.fillRect(0, waterTop + 30, W, H - waterTop - 30)
    for (let x = -ox; x < W; x += 48) blit(ctx, FLOOD, x, waterTop, 3)
    const rr = mulberry(5)
    ctx.fillStyle = hexA(INK.ink, 0.16)
    for (let i = 0; i < 46; i += 1) {
      const x0 = rr() * (W + 60)
      const sp = 150 + rr() * 60
      const y = ((rr() * H + t * sp) % (H + 20)) - 10
      const x = (((x0 - y * 0.25) % W) + W) % W
      ctx.fillRect(Math.floor(x / 3) * 3, Math.floor(y / 3) * 3, 2, 6)
    }
    let footprint: [number, number] | null = null
    const fleet = [
      { y: 0.08, v: 26, o: 0.1, s: 2 },
      { y: 0.3, v: 20, o: 0.62, s: 2 },
      { y: 0.14, v: 30, o: 0.45, s: 3, lead: true },
    ]
    fleet.forEach((d, i) => {
      const w = 16 * d.s
      const h = 16 * d.s
      const x = ((d.o * (W + 120) + t * d.v) % (W + 120)) - 80
      const y = Math.round(d.y * H)
      if (d.lead) {
        const bx = x + w / 2
        const by = y + h
        const sweep = (t * 1.6) % 1
        for (let yy = by + 6; yy < waterTop; yy += 6) {
          const f = (yy - by) / (waterTop - by)
          const hw = 4 + f * 40
          const bright = Math.abs(f - sweep) < 0.06
          ctx.fillStyle = hexA(INK.go, bright ? 0.55 : 0.12 + 0.06 * ((Math.floor(t * 8) + yy / 6) % 2))
          for (let xx = -hw; xx <= hw; xx += 6) ctx.fillRect(Math.round(bx + xx), Math.round(yy), 2, 2)
        }
        ctx.fillStyle = hexA(INK.go, 0.7)
        ctx.fillRect(Math.round(bx - 44), waterTop - 2, 88, 2)
        footprint = [bx - 44, bx + 44]
      }
      blit(ctx, DRONE, x, y, d.s, beacon(Math.floor(t * 3 + i) % 2 === 1))
    })
    const sx = 0.36 * W - 48 + 8 * 6
    const sy = H - 96
    const fp = footprint as [number, number] | null
    if (fp && sx > fp[0] && sx < fp[1] && Math.floor(t * 6) % 2) brackets(ctx, sx + 3, sy + 3, 12, 10, INK.warn)
  },

  // The COLDVEIL emblem glitching in over the ground segment; a red ripple
  // goes out; a probe lands on the thinner station.
  coldveil(ctx, W, H, t) {
    ctx.fillStyle = INK.ground
    ctx.fillRect(0, 0, W, H)
    stars(ctx, W, t, H * 0.7, 55, 23)
    const S6 = W >= 360 ? 6 : 5
    const ew = 16 * S6
    const ex = W / 2
    const ey = Math.round(H * 0.08)
    const ecx = ex
    const ecy = ey + ew / 2
    if (t > 0.5) {
      const rr = ((t - 0.5) * 110) % (2.2 * 110)
      for (let y = 6; y < H - 40; y += 12)
        for (let x = 6; x < W; x += 12) {
          const d = Math.hypot(x - ecx, y - ecy)
          if (d < ew * 0.62) continue
          const k = Math.exp(-(((d - rr) / 16) ** 2))
          ctx.fillStyle = hexA(INK.hostile, Number((0.05 + 0.55 * k).toFixed(3)))
          const s = k > 0.5 ? 3 : 2
          ctx.fillRect(x, y, s, s)
        }
    }
    const U = 4
    for (let c = 0; c * U < W; c += 1) {
      const rt = RIDGE_TOPS[c % 32] + 1
      const gt = GROUND_TOPS[c % 32]
      ctx.fillStyle = INK.line
      ctx.fillRect(c * U, H - rt * U, U, rt * U)
      ctx.fillStyle = hexA(INK.muted, 0.18)
      ctx.fillRect(c * U, H - (gt - 1) * U, U, (gt - 1) * U)
      ctx.fillStyle = hexA(INK.go, 0.3)
      ctx.fillRect(c * U, H - gt * U, U, U)
    }
    const period = 5.2
    const ph = t < 1.1 ? -1 : (t - 1.1) % period
    const st = [
      { x: 0.27 * W, s: 4, thin: false },
      { x: 0.76 * W, s: 3, thin: true },
    ].map((g) => {
      const w = 16 * g.s
      const h = 16 * g.s
      const l = g.x - w / 2
      const top = H - 2 * U - h
      return { ...g, l, top, dish: [l + 4 * g.s, top + 3 * g.s] as [number, number] }
    })
    for (const g of st) {
      const up: [number, number] = [g.dish[0] + 40, -10]
      dash(ctx, g.dish[0], g.dish[1], up[0], up[1], 8, 2, hexA(INK.friendly, 0.22))
      const pp = (t * 0.7 + g.s * 0.3) % 1
      ctx.fillStyle = INK.friendly
      ctx.fillRect(Math.round(g.dish[0] + (up[0] - g.dish[0]) * pp - 1), Math.round(g.dish[1] + (up[1] - g.dish[1]) * pp - 1), 3, 3)
      const probed = g.thin && ph > 1.1 && ph < 3.6
      const swap: Swap = (ink) =>
        ink.part === 'beacon' ? (probed ? (Math.floor(t * 6) % 2 ? INK.hostile : INK.line) : Math.floor(t * 1.5 + g.s) % 2 ? INK.go : hexA(INK.go, 0.3)) : undefined
      blit(ctx, STATION, g.l, g.top, g.s, swap)
    }
    if (ph >= 0) {
      const g = st[1]
      const a = [ecx, ey + ew]
      const b = g.dish
      const grow = Math.min(1, ph / 1.1)
      const fade = ph > 3.6 ? Math.max(0, 1 - (ph - 3.6) / 0.6) : 1
      if (fade > 0) {
        const end = [a[0] + (b[0] - a[0]) * grow, a[1] + (b[1] - a[1]) * grow]
        dash(ctx, a[0], a[1], end[0], end[1], 7, 3, hexA(INK.hostile, Number((0.85 * fade).toFixed(2))), t * 30)
        if (ph > 1.1 && ph < 3.6 && Math.floor(t * 5) % 2) brackets(ctx, g.x, g.top + 8 * g.s, g.s * 10, g.s * 9, INK.hostile)
      }
    }
    const arriving = t < 0.9
    const glitch = arriving || t % 2.9 < 0.2
    if (arriving && Math.floor(t * 14) % 3 === 0) return
    const emblem = COLDVEIL_EMBLEM
    if (glitch) {
      const seed = Math.floor(t * 18)
      ctx.globalAlpha = 0.45
      blit(ctx, emblem, ex - ew / 2 + (hash(seed) > 0.5 ? S6 : -S6), ey, S6)
      ctx.globalAlpha = 1
      emblem.rows.forEach((row, y) => {
        const off = hash(seed * 31 + Math.floor(y / 3)) < (arriving ? 0.6 : 0.3) ? Math.round((hash(seed + y) - 0.5) * 6) * S6 : 0
        blitRows(ctx, [row], emblem.palette, ex - ew / 2 + off, ey + y * S6, S6)
      })
    } else blit(ctx, emblem, ex - ew / 2, ey, S6)
  },

  // The watch officer at the desk, typing, under the big board.
  watch(ctx, W, H, t) {
    ctx.fillStyle = INK.ground
    ctx.fillRect(0, 0, W, H)
    const sx = Math.round(W * 0.06)
    const sy = 34
    const sw = W - 2 * sx
    const sh = Math.max(40, Math.round(H * 0.52) - 34)
    ctx.fillStyle = INK.line
    ctx.fillRect(sx - 3, sy - 3, sw + 6, sh + 6)
    ctx.fillStyle = INK.ground
    ctx.fillRect(sx, sy, sw, sh)
    ctx.save()
    ctx.beginPath()
    ctx.rect(sx, sy, sw, sh)
    ctx.clip()
    const mw = Math.round(sw * 0.64)
    ctx.save()
    ctx.beginPath()
    ctx.rect(sx, sy, mw, sh)
    ctx.clip()
    stars(ctx, sx + mw, t, sy + sh, 26, 41)
    const R = sw * 1.4
    const cxm = sx + mw / 2
    const cym = sy + sh - 10 + R
    for (let x = sx; x < sx + mw; x += 2) {
      const top = Math.round((cym - Math.sqrt(Math.max(0, R * R - (x - cxm) ** 2))) / 2) * 2
      ctx.fillStyle = hexA(INK.friendly, 0.75)
      ctx.fillRect(x, top, 2, 2)
      ctx.fillStyle = hexA(INK.friendly, 0.22)
      ctx.fillRect(x, top + 2, 2, sy + sh - top)
    }
    for (let i = 0; i < 6; i += 1) {
      const x = sx + ((i * 44 + t * 9) % (6 * 44)) - 20
      const y = cym - Math.sqrt(Math.max(0, (R + sh * 0.42) ** 2 - (x - cxm) ** 2))
      blit(ctx, SILHOUETTE, x - 7, y - 3, 2, (ink) => (ink.token === 'muted' ? hexA(INK.friendly, 0.8) : INK.ink))
    }
    ctx.restore()
    ctx.fillStyle = INK.line
    ctx.fillRect(sx + 8, sy + 8, mw - 16, 4)
    ctx.fillStyle = INK.go
    ctx.fillRect(sx + 8, sy + 8, Math.round((mw - 16) * 0.78), 4)
    ctx.fillStyle = INK.ink
    ctx.fillRect(sx + 8 + Math.round((mw - 16) * 0.7), sy + 5, 2, 10)
    if (Math.floor(t * 2.4) % 3) {
      const bx = sx + Math.round(mw * 0.7)
      const by = sy + Math.round(sh * 0.42)
      ctx.fillStyle = INK.hostile
      ctx.fillRect(bx, by, 4, 4)
      const k = (t * 1.2) % 1
      ctx.strokeStyle = hexA(INK.hostile, Number((0.7 * (1 - k)).toFixed(2)))
      ctx.lineWidth = 2
      ctx.strokeRect(bx + 2 - 4 - 10 * k, by + 2 - 4 - 10 * k, 8 + 20 * k, 8 + 20 * k)
    }
    const lx = sx + mw + 6
    ctx.fillStyle = INK.line
    ctx.fillRect(sx + mw, sy, 2, sh)
    const step = 9
    const scroll = Math.floor(t * 2.2)
    for (let k = 0; k < Math.ceil(sh / step) + 1; k += 1) {
      const n = scroll + k
      const y = sy + sh - 8 - k * step
      const w = 12 + Math.floor(hash(n) * Math.max(4, sw - mw - 26))
      const hot = hash(n * 7) > 0.92
      ctx.fillStyle = hot ? INK.hostile : hexA(INK.muted, k === 0 ? 0.9 : 0.45)
      ctx.fillRect(lx, y, 6, 3)
      ctx.fillStyle = hot ? hexA(INK.hostile, 0.7) : hexA(INK.ink, k === 0 ? 0.7 : 0.3)
      ctx.fillRect(lx + 9, y, w, 3)
    }
    ctx.restore()
    ctx.fillStyle = INK.chrome
    ctx.fillRect(0, H - 60, W, 60)
    ctx.fillStyle = INK.line
    ctx.fillRect(0, H - 66, W, 6)
    ctx.fillStyle = hexA(INK.muted, 0.6)
    ctx.fillRect(0, H - 60, W, 6)
    if (W >= 330)
      for (const [p, i] of [
        [0.1, 0],
        [0.9, 1],
      ]) {
        const mx = Math.round(p * W) - 26
        const my = H - 66 - 40
        ctx.fillStyle = INK.line
        ctx.fillRect(mx, my, 52, 36)
        ctx.fillStyle = INK.ground
        ctx.fillRect(mx + 3, my + 3, 46, 30)
        ctx.fillStyle = INK.line
        ctx.fillRect(mx + 22, my + 36, 8, 4)
        for (let k = 0; k < 5; k += 1) {
          const w = 8 + Math.floor(hash(k + i * 9 + Math.floor(t * (1.3 + i))) * 32)
          ctx.fillStyle = hexA(i ? INK.friendly : INK.go, 0.55)
          ctx.fillRect(mx + 6, my + 6 + k * 5, w, 2)
        }
      }
    const s = W >= 340 ? 6 : 5
    const blink = t % 3.4 < 0.14
    const f = blink ? 2 : Math.floor(t / 0.16) % 2
    blit(ctx, WATCH_OFFICER[f], W / 2 - 13 * s, H - 26 * s, s)
  },
}

// The moment each scene stands still at under reduced motion.
export const STILL_T: Record<SceneName, number> = { orbit: 3.2, disaster: 2.2, coldveil: 2.6, watch: 1 }

// The pixel dissolve over the first moments of a scene: 8 pixel blocks
// switch from ground to picture in a fixed order.
export function dissolve(ctx: CanvasRenderingContext2D, W: number, H: number, k: number) {
  const B = 8
  const cols = Math.ceil(W / B)
  ctx.fillStyle = INK.ground
  for (let y = 0; y * B < H; y += 1) for (let x = 0; x < cols; x += 1) if (hash(y * 977 + x) > k) ctx.fillRect(x * B, y * B, B, B)
}
