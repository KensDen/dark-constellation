// The sprite set (v1.2 R2, brief 5.1 and 5.2): the round's first guard,
// that every AssetKind the engine declares is drawn in every sprite state,
// and the checks on the art itself: every grid well formed and painted in
// section 3 tokens only, damage drawn rather than darkened, the chevron's
// corner kept clear, and the panel text readable over every backdrop.
//
// NOTHING HERE LISTS THE KINDS OR THE STATES. The kinds are read out of
// the engine's own AssetKind union by the TypeScript compiler, and the
// states out of SPRITE_STATES, the one table the tiles pick from, so a
// kind the engine grows or a state the table grows fails this suite until
// it is drawn (principle 17).

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { SPRITE_STATES } from '../src/ui/board/board'
import { ASSET_SPRITES, TIER_A_CHEVRON } from '../src/ui/sprites/assets'
import { BACKDROP_INKS, CLOUD, PANEL_FILL, SILHOUETTE } from '../src/ui/sprites/scenery'
import { HIT_BURST, LOCK_ON, PART_SPARKLE, SHIELD_FLASH } from '../src/ui/sprites/effects'
import { BOLT, COIN, COLDVEIL_EMBLEM, EYE } from '../src/ui/sprites/icons'
import { DISASTER, FLOOD, WATCH_OFFICER } from '../src/ui/sprites/coldOpen'
import { TRANSPARENT, type Sprite } from '../src/ui/sprites/sprite'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

// The members of a string-literal union type, parsed from source.
function unionMembers(path: string, name: string): string[] {
  const ts = createRequire(import.meta.url)('typescript')
  const file = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true)
  for (const node of file.statements) {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === name) {
      const types = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type]
      return types.map((t: { literal?: { text: string } }) => {
        if (!ts.isLiteralTypeNode(t) || !ts.isStringLiteral(t.literal)) throw new Error(`${name} has a member that is not a string literal`)
        return t.literal!.text
      })
    }
  }
  throw new Error(`no type ${name} in ${path}`)
}

// The section 3 tokens, as src/index.css declares them on :root.
function tokens(): Record<string, string> {
  const root = /:root\s*{([^}]*)}/.exec(read('src/index.css'))![1]
  return Object.fromEntries([...root.matchAll(/--dc-([a-z]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
}

const opaque = (s: Sprite) => {
  const out = new Set<string>()
  s.rows.forEach((row, y) => [...row].forEach((c, x) => c !== TRANSPARENT && out.add(`${x},${y}`)))
  return out
}
const parts = (s: Sprite) => {
  const used = new Set(s.rows.join(''))
  return new Set(Object.entries(s.palette).flatMap(([c, ink]) => (used.has(c) && ink.part ? [ink.part] : [])))
}

const KINDS = unionMembers('src/engine/types.ts', 'AssetKind')
const STATES = SPRITE_STATES.map((s) => s.state)

describe('the sprite set (v1.2 R2)', () => {
  it('GUARD (a): every AssetKind in the engine union has a sprite in every state SPRITE_STATES lists', () => {
    // The positive controls: the parse found the union, and the table has
    // its four states, so the sweep below cannot pass by sweeping nothing.
    expect(KINDS).toContain('sat')
    expect(KINDS.length).toBeGreaterThanOrEqual(4)
    expect(STATES).toEqual(['intact', 'damaged', 'critical', 'out'])
    const table = ASSET_SPRITES as Record<string, Partial<Record<string, Sprite>>>
    const missing: string[] = []
    for (const kind of KINDS) {
      for (const state of STATES) {
        const sprite = table[kind]?.[state]
        if (!sprite || sprite.rows.length === 0) missing.push(`${kind}.${state}`)
      }
    }
    expect(missing, 'kinds and states with no sprite').toEqual([])
    // And nothing drawn for a kind the engine does not have.
    expect(Object.keys(ASSET_SPRITES).sort()).toEqual([...KINDS].sort())
  })

  it('draws every sprite as a well-formed grid in section 3 tokens only', () => {
    const palette = tokens()
    expect(Object.keys(palette).length, 'no tokens parsed from :root').toBeGreaterThanOrEqual(11)
    const named: [string, Sprite, number][] = [
      ...KINDS.flatMap((kind) => STATES.map((state): [string, Sprite, number] => [`${kind}.${state}`, ASSET_SPRITES[kind as keyof typeof ASSET_SPRITES][state], 16])),
      ['tier-a', TIER_A_CHEVRON, 16],
      ['coldveil', COLDVEIL_EMBLEM, 16],
      ['coin', COIN, 8],
      ['eye', EYE, 8],
      ['bolt', BOLT, 8],
      ...HIT_BURST.map((s, i): [string, Sprite, number] => [`hit-burst.${i}`, s, 16]),
      ['lock-on', LOCK_ON, 16],
      ['shield-flash', SHIELD_FLASH, 16],
      ['part-sparkle', PART_SPARKLE, 16],
      // The cold open's own (v1.2 R4): the officer is the brief's other
      // size, 26x26.
      ...WATCH_OFFICER.map((s, i): [string, Sprite, number] => [`watch-officer.${i}`, s, 26]),
      ...DISASTER.map((s, i): [string, Sprite, number] => [`disaster.${i}`, s, 16]),
    ]
    const faults: string[] = []
    for (const [name, sprite, size] of named) {
      if (sprite.rows.length !== size) faults.push(`${name}: ${sprite.rows.length} rows, not ${size}`)
      sprite.rows.forEach((row, y) => {
        if (row.length !== size) faults.push(`${name}: row ${y} is ${row.length} wide, not ${size}`)
        for (const c of row) if (c !== TRANSPARENT && !sprite.palette[c]) faults.push(`${name}: '${c}' is not in its palette`)
      })
      for (const [c, ink] of Object.entries(sprite.palette)) {
        if (!(ink.token in palette)) faults.push(`${name}: '${c}' paints ${ink.token}, which is not a section 3 token`)
      }
    }
    // The bands and small scenery are not square, and are held to their
    // own widths and heights the same way.
    const banded: [string, Sprite, number, number][] = [
      ['cloud', CLOUD, 16, 4],
      ['silhouette', SILHOUETTE, 7, 3],
      ['flood', FLOOD, 16, 10],
    ]
    for (const [name, sprite, w, h] of banded) {
      if (sprite.rows.length !== h) faults.push(`${name}: ${sprite.rows.length} rows, not ${h}`)
      sprite.rows.forEach((row, y) => {
        if (row.length !== w) faults.push(`${name}: row ${y} is ${row.length} wide, not ${w}`)
        for (const c of row) if (c !== TRANSPARENT && !sprite.palette[c]) faults.push(`${name}: '${c}' is not in its palette`)
      })
      for (const [c, ink] of Object.entries(sprite.palette)) {
        if (!(ink.token in palette)) faults.push(`${name}: '${c}' paints ${ink.token}, which is not a section 3 token`)
      }
    }
    expect(faults).toEqual([])
    expect(HIT_BURST.length, 'the hit burst is three frames').toBe(3)
    expect(WATCH_OFFICER.length, 'the watch officer loops on 2 to 4 frames (brief 6)').toBeGreaterThanOrEqual(2)
    expect(WATCH_OFFICER.length).toBeLessThanOrEqual(4)
  })

  it('draws damage rather than darkening it, and keeps a lost asset on the board, greyed and crossed', () => {
    for (const kind of KINDS) {
      const s = ASSET_SPRITES[kind as keyof typeof ASSET_SPRITES]
      const intact = opaque(s.intact)
      for (const state of ['damaged', 'critical'] as const) {
        const hurt = opaque(s[state])
        const lost = [...intact].filter((p) => !hurt.has(p))
        expect(lost.length, `${kind}.${state} loses no pixels`).toBeGreaterThan(0)
        const gained = parts(s[state])
        expect(gained.has('spark') || gained.has('smoke'), `${kind}.${state} has no sparks or smoke`).toBe(true)
      }
      expect(opaque(s.critical).size, `${kind}: critical is not more broken than damaged`).toBeLessThan(opaque(s.damaged).size)
      expect(parts(s.critical).has('smoke'), `${kind}.critical has no smoke`).toBe(true)
      // Knocked out: nothing on it moves, it is painted grey and line with a
      // hostile X, and the X is there.
      expect([...parts(s.out)], `${kind}.out still animates`).toEqual([])
      const inks = new Set(s.out.rows.join('').replaceAll(TRANSPARENT, '').split('').map((c) => s.out.palette[c].token))
      expect([...inks].sort(), `${kind}.out is not greyed`).toEqual(['hostile', 'line', 'muted'])
    }
  })

  it('keeps the Tier A corner clear on every asset sprite', () => {
    const chevron = opaque(TIER_A_CHEVRON)
    expect(chevron.size).toBeGreaterThan(0)
    const clashes: string[] = []
    for (const kind of KINDS) {
      for (const state of STATES) {
        const art = opaque(ASSET_SPRITES[kind as keyof typeof ASSET_SPRITES][state])
        for (const p of chevron) if (art.has(p)) clashes.push(`${kind}.${state} at ${p}`)
      }
    }
    expect(clashes).toEqual([])
  })

  it('keeps every text colour on a panel at 4.5:1 over the brightest backdrop ink under PANEL_FILL', () => {
    // The text colours are the ones LayerPanel.tsx paints with, read from
    // its source; the fill's alpha is read from PANEL_FILL itself. The
    // backdrop ink is composited over the opaque panel colour, which is
    // lighter than what really sits under it (the panel at 60% over the
    // page ground), so the check errs on the dark side of honest.
    const hex = tokens()
    const rgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
    const mix = (under: number[], over: number[], alpha: number) => under.map((u, i) => u + (over[i] - u) * alpha)
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    const fill = /^bg-dc-([a-z]+)\/(\d+)$/.exec(PANEL_FILL)
    expect(fill, `PANEL_FILL is not a token at an alpha: ${PANEL_FILL}`).not.toBeNull()
    const [fillToken, fillAlpha] = [fill![1], Number(fill![2]) / 100]
    const textTokens = [...new Set([...read('src/ui/board/LayerPanel.tsx').matchAll(/text-dc-([a-z]+)/g)].map((m) => m[1]))]
    expect(textTokens, 'no text colours read from LayerPanel.tsx').toContain('muted')
    const failures: string[] = []
    for (const [layer, inks] of Object.entries(BACKDROP_INKS)) {
      for (const ink of inks) {
        const under = mix(rgb(hex.panel), rgb(hex[ink.token]), ink.alpha ?? 1)
        const surface = mix(under, rgb(hex[fillToken]), fillAlpha)
        for (const text of textTokens) {
          const ratio = contrast(rgb(hex[text]), surface)
          if (ratio < 4.5) failures.push(`${layer}: ${text} over ${ink.token}@${ink.alpha ?? 1} is ${ratio.toFixed(2)}:1`)
        }
      }
    }
    expect(failures).toEqual([])
  })
})
