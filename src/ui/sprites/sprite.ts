// The pixel-art sprite format (v1.2 R2, brief 5.1 and 5.2). A sprite is a
// grid of characters, one per pixel, and a small palette that maps each
// character to a section 3 token. '.' is transparent. Grids are written
// as template strings, one row per line, so the art reads as art in the
// source and the data stays a few hundred characters a sprite; large
// sprite data would mean the encoding is wrong.
//
// One component renders every sprite (./PixelSprite.tsx). It draws the
// runs this file computes, one rect per horizontal run of a colour, so an
// eight-pixel stripe is one element and not eight.

// The section 3 tokens a palette may name. Nothing else: a sprite that
// wants a colour the brief does not have is a sprite to redraw.
export type Token = 'ground' | 'chrome' | 'panel' | 'line' | 'ink' | 'muted' | 'go' | 'friendly' | 'hostile' | 'warn' | 'shadow'

// The pieces of a sprite the idle life animates (brief 5.3), each one a
// class the stylesheet knows: beacons blink, rotors flicker, sparks spit
// and smoke breathes. A part only moves under the no-preference guard in
// src/index.css, and never while the board's hidden-tab class is set.
export type Part = 'beacon' | 'rotor' | 'spark' | 'smoke'

export interface Ink {
  token: Token
  alpha?: number
  part?: Part
}

export type Palette = Readonly<Record<string, Ink>>

export interface Sprite {
  readonly rows: readonly string[]
  readonly palette: Palette
}

export const TRANSPARENT = '.'

// The rows of a grid literal: whitespace separates rows, so indentation
// and line breaks in the source are free.
export function grid(art: string): string[] {
  return art.trim().split(/\s+/)
}

export function sprite(palette: Palette, art: string): Sprite {
  return { rows: grid(art), palette }
}

export interface Run {
  x: number
  y: number
  width: number
  char: string
}

// Horizontal runs, row by row: consecutive pixels of the same character
// become one run. Transparent pixels make none.
export function runs(rows: readonly string[]): Run[] {
  const out: Run[] = []
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const char = row[x]
      let end = x + 1
      while (end < row.length && row[end] === char) end += 1
      if (char !== TRANSPARENT) out.push({ x, y, width: end - x, char })
      x = end
    }
  })
  return out
}

// A sprite's runs grouped by palette entry, which is what the renderer
// draws: one group per ink, one rect per run. Computed the first time a
// sprite is drawn and kept for as long as the sprite exists, so drawing
// the same sprite again (another tile, another mount) costs a lookup.
export interface InkRuns {
  char: string
  ink: Ink
  runs: readonly Run[]
}

const drawn = new WeakMap<Sprite, readonly InkRuns[]>()

export function spriteRects(sprite: Sprite): readonly InkRuns[] {
  let groups = drawn.get(sprite)
  if (!groups) {
    const byChar = new Map<string, Run[]>()
    for (const run of runs(sprite.rows)) {
      const list = byChar.get(run.char)
      if (list) list.push(run)
      else byChar.set(run.char, [run])
    }
    groups = [...byChar].map(([char, list]) => ({ char, ink: sprite.palette[char], runs: list }))
    drawn.set(sprite, groups)
  }
  return groups
}

// Knocked out (brief 4.2): the intact art greyed, with a pixel X over it,
// and nothing on it moving. Bright inks go to a dim grey and dark ones to
// the line colour, so the silhouette stays readable as the thing it was.
const DARK: readonly Token[] = ['line', 'shadow', 'panel', 'chrome', 'ground']
const GREYED: Palette = {
  q: { token: 'muted', alpha: 0.7 },
  l: { token: 'line' },
  x: { token: 'hostile' },
}

export function knockedOut(intact: Sprite): Sprite {
  const size = intact.rows.length
  const rows = intact.rows.map((row, y) =>
    [...row]
      .map((char, x) => {
        // The X runs corner to corner, two pixels in from the edge.
        if (x >= 2 && x < size - 2 && (x === y || x === size - 1 - y)) return 'x'
        if (char === TRANSPARENT) return char
        return DARK.includes(intact.palette[char].token) ? 'l' : 'q'
      })
      .join(''),
  )
  return { rows, palette: GREYED }
}
