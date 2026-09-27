// The emblem and the HUD sprites (v1.2 R2, brief 5.2).
//
// The COLDVEIL emblem is 16x16, drawn at 2x on the threat banner. The HUD
// sprites are 8x8: at 2x beside a 16px number and at 1x beside the 9px
// and 10px labels, where one sprite pixel is close to one pixel of the
// display face's own 8x8 grid. The brief's 16x16 is for the art on the
// board; a 16x16 icon drawn at 1x beside a label would put pixels half the
// size of the tiles' next to them.

import { sprite } from './sprite'

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
