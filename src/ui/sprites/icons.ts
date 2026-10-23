// The emblem and the HUD sprites (v1.2 R2, brief 5.2).
//
// The COLDVEIL emblem is 16x16, drawn at 2x on the threat banner. The HUD
// sprites are 8x8: at 2x beside a 16px number and at 1x beside the 9px
// and 10px labels, where one sprite pixel is close to one pixel of the
// display face's own 8x8 grid. The brief's 16x16 is for the art on the
// board; a 16x16 icon drawn at 1x beside a label would put pixels half the
// size of the tiles' next to them.

import { sprite, type Sprite, type Token } from './sprite'

// A magenta diamond with a single eye.
export const COLDVEIL_EMBLEM = sprite(
  { h: { token: 'hostile' }, w: { token: 'ink' }, k: { token: 'shadow' } },
  `
  .......hh....... ......hhhh...... .....hh..hh..... ....hh....hh....
  ...hh......hh... ..hh..wwww..hh.. .hh.wwhhhhww.hh. hh.wwhhkkhhww.hh
  hh.wwhhkkhhww.hh .hh.wwhhhhww.hh. ..hh..wwww..hh.. ...hh......hh...
  ....hh....hh.... .....hh..hh..... ......hhhh...... .......hh.......
`,
)

// Credits.
export const COIN = sprite(
  { y: { token: 'warn' }, w: { token: 'ink' }, d: { token: 'warn', alpha: 0.55 } },
  `
  ..yyyy.. .ywyyyy. ywyddyyd yyydyyyd
  yyydyyyd yyyddyyd .yyyyyd. ..dddd..
`,
)

// Intel.
export const EYE = sprite(
  { w: { token: 'ink' }, b: { token: 'friendly' }, k: { token: 'shadow' } },
  `
  ........ ..wwww.. .wbbbbw. wbbkkbbw
  wbbkkbbw .wbbbbw. ..wwww.. ........
`,
)

// Surge.
export const BOLT = sprite(
  { g: { token: 'go' } },
  `
  ....ggg. ...ggg.. ..ggg... .gggggg.
  ...ggg.. ..ggg... .gg..... .g......
`,
)

// THE STATUS ICONS (v1.3 brief 8.1): ⚠ ◐ ✓ ✕ ▲ are not in the DC Display
// subset, so each is an 8x8 sprite in one ink, which the word beside it
// takes too. Colour never carries the meaning alone (section 4 rule 8):
// every status is one of these and a word.
const mono = (rows: string) => sprite({ i: { token: 'ink' } }, rows)

// ⚠ EXPOSED: a warning triangle with its bar and dot.
export const ICON_WARN = mono(`
  ...ii... ...ii... ..i..i.. ..i..i..
  .i.ii.i. .i....i. i..ii..i iiiiiiii
`)
// ◐ PARTLY BLOCKED: a ring, its left half filled.
export const ICON_HALF = mono(`
  ..iiii.. .iii..i. iiii...i iiii...i
  iiii...i iiii...i .iii..i. ..iiii..
`)
// ✓ BLOCKED.
export const ICON_CHECK = mono(`
  ........ .......i ......ii .....ii.
  i...ii.. ii.ii... .iii.... ..i.....
`)
// ↗ ANSWERED: the debris call with SSA owned, a burn out of the corridor
// that costs nothing (v1.3 R7). Not a block: HOLD can still lose the
// satellite.
export const ICON_BURN = mono(`
  ..iiiiii .....iii ....ii.i ...ii..i
  ..ii...i .ii....i ii...... i.......
`)
// ✕ closes and cancels.
export const ICON_CROSS = mono(`
  i......i .i....i. ..i..i.. ...ii...
  ...ii... ..i..i.. .i....i. i......i
`)
// ▲ the win line's marker.
export const ICON_UP = mono(`
  ........ ...ii... ...ii... ..iiii..
  ..iiii.. .iiiiii. .iiiiii. iiiiiiii
`)

// ▼ a fall, on END OF TURN's score (v1.3 R3).
export const ICON_DOWN = mono(`
  iiiiiiii .iiiiii. .iiiiii. ..iiii..
  ..iiii.. ...ii... ...ii... ........
`)
// ✦ new intel, on COLLECT INTEL CARD (v1.3 R3).
export const ICON_SPARK = mono(`
  ...ii... ...ii... ..iiii.. iiiiiiii
  iiiiiiii ..iiii.. ...ii... ...ii...
`)

// A one-ink icon in another token, for the tone of the status it marks
// (hostile for EXPOSED, warn for PARTLY BLOCKED, go for BLOCKED). One
// object per icon and token, so PixelSprite's memo holds.
const tints = new Map<string, Sprite>()
export function tinted(icon: Sprite, token: Token): Sprite {
  const key = `${icon.rows.join('/')}:${token}`
  let out = tints.get(key)
  if (!out) {
    out = { rows: icon.rows, palette: { i: { token } } }
    tints.set(key, out)
  }
  return out
}
