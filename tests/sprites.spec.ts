// The sprite set (v1.2 R2, brief 5.1 and 5.2; v1.3 R2, brief 8.1 and 8.2):
// the round's first guard, that every AssetKind the engine declares is
// drawn in every sprite state, and the checks on the art itself: every
// grid well formed and painted in section 3 tokens and the five sprite
// inks only, a wound scorching the sprite by integrity (deterministic, and
// more scorch the lower it falls), lost drawn greyed with the red X and
// transit as the grey silhouette, and the strip's text readable on its
// panel. The Tier A chevron and the check that kept its corner clear left
// with the tiers in v1.3 Round 0 (D2 a); the backdrop contrast check left
// with the backdrops behind the tiles in v1.3 R2.
//
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { SPRITE_STATES } from '../src/ui/board/board'
import { ASSET_MAPS, ASSET_SPRITES, assetSprite } from '../src/ui/sprites/assets'
import { CLOUD, SILHOUETTE } from '../src/ui/sprites/scenery'
import { HIT_BURST, LOCK_ON, PART_SPARKLE, SHIELD_PLAIN, SHIELD_STAMP } from '../src/ui/sprites/effects'
import { BOLT, COIN, COLDVEIL_EMBLEM, EYE } from '../src/ui/sprites/icons'
import { DISASTER, FLOOD, WATCH_OFFICER } from '../src/ui/sprites/coldOpen'
import { EMBLEMS, SEALED } from '../src/ui/sprites/emblems'
import { DEFAULT_SCENARIO } from '../src/content'
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

const tokenAt = (s: Sprite, p: string) => {
  const [x, y] = p.split(',').map(Number)
  return s.palette[s.rows[y][x]].token
}
const inksAt = (s: Sprite, cells: Set<string>) => [...new Set([...cells].map((p) => tokenAt(s, p)))].sort()
// The scorched pixels: the cells the scorcher wrote over the map, read off
// the map itself rather than off the scorch characters, so a scorch drawn
// in any ink still counts.
const scorched = (kind: keyof typeof ASSET_MAPS, s: Sprite) => {
  const out = new Set<string>()
  s.rows.forEach((row, y) => [...row].forEach((c, x) => {
    const was = ASSET_MAPS[kind][y][x]
    // A critical sprite darkens its panels as well; a darkened panel is
    // not a scorch.
    if (c !== was && !(was === 'P' && s.palette[c].alpha !== undefined)) out.add(`${x},${y}`)
  }))
  return out
}

const KINDS = unionMembers('src/engine/types.ts', 'AssetKind')
const STATES = SPRITE_STATES.map((s) => s.state)

describe('the sprite set (v1.2 R2, v1.3 R2)', () => {
  it('GUARD (a): every AssetKind in the engine union has a sprite in every state SPRITE_STATES lists', () => {
    // The positive controls: the parse found the union, and the table has
    // its four states, so the sweep below cannot pass by sweeping nothing.
    expect(KINDS).toContain('sat')
    expect(KINDS.length).toBeGreaterThanOrEqual(4)
    expect(STATES).toEqual(['intact', 'wounded', 'critical', 'lost'])
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

  it('draws every sprite as a well-formed grid in section 3 tokens and the five sprite inks only', () => {
    const palette = tokens()
    expect(Object.keys(palette).length, 'no tokens parsed from :root').toBeGreaterThanOrEqual(16)
    // The five sprite inks (brief 8.1) are on :root beside the section 3
    // tokens, so the token check below accepts them by reading them there.
    for (const ink of ['hull', 'glass', 'deep', 'bright', 'steel']) expect(palette, `--dc-${ink} is not on :root`).toHaveProperty(ink)
    const named: [string, Sprite, number][] = [
      ['coldveil', COLDVEIL_EMBLEM, 16],
      ['coin', COIN, 8],
      ['eye', EYE, 8],
      ['bolt', BOLT, 8],
      ...HIT_BURST.map((s, i): [string, Sprite, number] => [`hit-burst.${i}`, s, 16]),
      ['lock-on', LOCK_ON, 16],
      // The block's stamp and the won debrief's shield (v1.3 R5; the outline
      // shield flash before it).
      ['shield-stamp', SHIELD_STAMP, 16],
      ['shield-plain', SHIELD_PLAIN, 16],
      ['part-sparkle', PART_SPARKLE, 16],
      // The cold open's own (v1.2 R4): the officer is the brief's other
      // size, 26x26.
      ...WATCH_OFFICER.map((s, i): [string, Sprite, number] => [`watch-officer.${i}`, s, 26]),
      ...DISASTER.map((s, i): [string, Sprite, number] => [`disaster.${i}`, s, 16]),
      // The Dossier's emblems and its sealed card (v1.5 R2).
      ...Object.entries(EMBLEMS).map(([id, s]): [string, Sprite, number] => [`emblem.${id}`, s, 16]),
      ['emblem.sealed', SEALED, 16],
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
    // The asset sprites are the prototype's 16x12 maps (brief 8.2), in
    // every state and in transit; the bands and small scenery are not
    // square either. Each is held to its own width and height the same way.
    const banded: [string, Sprite, number, number][] = [
      ...KINDS.flatMap((kind) => STATES.map((state): [string, Sprite, number, number] => [`${kind}.${state}`, ASSET_SPRITES[kind as keyof typeof ASSET_SPRITES][state], 16, 12])),
      ...KINDS.map((kind): [string, Sprite, number, number] => [`${kind}.transit`, assetSprite(kind as keyof typeof ASSET_MAPS, 100, 'transit'), 16, 12]),
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

  it('gives every threat in the deck an emblem of its own, and nothing else one (v1.5 R2)', () => {
    // Ken's ruling of 24 October 2026: a small emblem for each of the 18
    // Dossier cards. A threat the deck grows fails here until it is drawn.
    const threats = DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat').map((e) => e.id)
    expect(threats).toHaveLength(18)
    expect(Object.keys(EMBLEMS).sort()).toEqual([...threats].sort())
    const drawn = new Set(Object.values(EMBLEMS).map((e) => e.rows.join('/')))
    expect(drawn.size, 'two threats share an emblem').toBe(threats.length)
    expect(drawn.has(SEALED.rows.join('/')), 'an emblem is the sealed card').toBe(false)
    // The move in hostile red, except the debris, which is not COLDVEIL's.
    for (const [id, e] of Object.entries(EMBLEMS)) {
      const inks = new Set(e.rows.join('').replace(/\./g, ''))
      const red = [...inks].some((c) => e.palette[c].token === 'hostile')
      expect(red, `${id}: ${id === 'debris-conjunction' ? 'the debris is drawn in hostile red' : 'the move is not in hostile red'}`).toBe(id !== 'debris-conjunction')
    }
  })

  it('GUARD: any wound changes the sprite, and the scorch is deterministic and grows with damage', () => {
    for (const kind of KINDS as (keyof typeof ASSET_MAPS)[]) {
      const intact = assetSprite(kind, 100)
      // Integrity 99 is already a different picture (critique row M11): the
      // first point of damage shows.
      expect(assetSprite(kind, 99).rows, `${kind} at 99 draws the same as at 100`).not.toEqual(intact.rows)
      expect(scorched(kind, intact).size, `${kind} at 100 is scorched`).toBe(0)
      // Deterministic: the same integrity scorches the same pixels, every
      // time, and the order is fixed, so a lower integrity scorches every
      // pixel a higher one did and more besides.
      let before = new Set<string>()
      for (const integrity of [99, 75, 50, 25, 1]) {
        const now = scorched(kind, assetSprite(kind, integrity))
        expect([...scorched(kind, assetSprite(kind, integrity))].sort(), `${kind} at ${integrity} scorches differently twice`).toEqual([...now].sort())
        expect(now.size, `${kind} at ${integrity} is not more scorched than above it`).toBeGreaterThan(before.size)
        expect([...before].filter((p) => !now.has(p)), `${kind} at ${integrity} unscorches a pixel`).toEqual([])
        before = now
      }
      // Scorch is drawn, not erased: a wounded sprite keeps its outline.
      expect(opaque(assetSprite(kind, 25)), `${kind} at 25 loses pixels`).toEqual(opaque(intact))
      // Amber while wounded, red at 50 or below.
      expect(inksAt(assetSprite(kind, 75), scorched(kind, assetSprite(kind, 75))), `${kind} wounded scorch is not amber`).toEqual(['warn'])
      expect(inksAt(assetSprite(kind, 50), scorched(kind, assetSprite(kind, 50))), `${kind} critical scorch is not red`).toEqual(['hostile'])
    }
  })

  it('keeps a lost asset on the board, greyed with the red X, and draws transit as the grey silhouette', () => {
    for (const kind of KINDS as (keyof typeof ASSET_MAPS)[]) {
      const intact = opaque(assetSprite(kind, 100))
      const lost = ASSET_SPRITES[kind].lost
      // Lost: nothing on it moves, every pixel is the line grey or the
      // hostile X, the X is there, and the X sits over the outline rather
      // than replacing the asset.
      expect([...parts(lost)], `${kind}.lost still animates`).toEqual([])
      expect(inksAt(lost, opaque(lost)), `${kind}.lost is not greyed and crossed`).toEqual(['hostile', 'line'])
      expect([...intact].filter((p) => !opaque(lost).has(p)), `${kind}.lost drops part of the asset`).toEqual([])
      const cross = new Set([...opaque(lost)].filter((p) => tokenAt(lost, p) === 'hostile'))
      expect(cross.size, `${kind}.lost has no X`).toBeGreaterThanOrEqual(10)
      // Corner to corner both ways: the X reaches each quarter of the grid.
      const quarters = new Set([...cross].map((p) => { const [x, y] = p.split(',').map(Number); return `${x < 8 ? 'W' : 'E'}${y < 6 ? 'N' : 'S'}` }))
      expect(quarters.size, `${kind}.lost X does not cross the sprite`).toBe(4)
      // Transit: the map's own outline in the line grey, no X, nothing moving.
      const transit = assetSprite(kind, 100, 'transit')
      expect(opaque(transit), `${kind}.transit is not the asset's silhouette`).toEqual(intact)
      expect(inksAt(transit, opaque(transit)), `${kind}.transit is not grey`).toEqual(['line'])
      expect([...parts(transit)], `${kind}.transit still animates`).toEqual([])
    }
  })

  it('keeps every text colour on the asset strip, and the hostile red, at 4.5:1 on the panel colour', () => {
    // The text colours are the ones AssetStrip.tsx paints with, read from
    // its source; the strip's columns sit on the opaque panel colour since
    // v1.3 R2 dropped the scenery backdrops behind the tiles. The hostile
    // red (#FF5A4F since R2) carries the condition chips and the critical
    // pips, so it is held to the same bar by name as well.
    const hex = tokens()
    const rgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
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
    const source = read('src/ui/board/AssetStrip.tsx')
    expect(source, 'the strip columns no longer sit on the panel colour').toMatch(/data-layer=\{layer\}[^>]*bg-dc-panel\b/)
    const textTokens = [...new Set([...source.matchAll(/text-dc-([a-z]+)/g)].map((m) => m[1]))]
    expect(textTokens, 'no text colours read from AssetStrip.tsx').toContain('muted')
    expect(textTokens).toContain('hostile')
    const failures: string[] = []
    for (const text of textTokens) {
      const ratio = contrast(rgb(hex[text]), rgb(hex.panel))
      if (ratio < 4.5) failures.push(`${text} on panel is ${ratio.toFixed(2)}:1`)
    }
    expect(failures).toEqual([])
  })
})
