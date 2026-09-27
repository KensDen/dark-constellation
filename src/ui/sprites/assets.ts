// The asset sprites (v1.2 R2, brief 5.2): every AssetKind in every sprite
// state, and the Tier A chevron. 16x16, drawn at 2x on a tile.
//
// Damaged and critical are redrawn, not recoloured: they lose pixels
// (a wing cell, a rotor, the dish rim) and gain sparks and then smoke,
// which the idle life animates. Knocked out is the intact art greyed with
// a pixel X, built by knockedOut(), and stays on the board. The battery
// sweeps the engine's AssetKind union against this table (principle 17),
// so a kind the engine grows fails the suite until it is drawn.
//
// The top-right corner, rows 0 to 2 from column 11, is kept clear on every
// sprite: the Tier A chevron sits there, and the suite checks that the two
// never share a pixel.

import type { AssetKind } from '../../engine/types'
import type { SpriteState } from '../board/board'
import { knockedOut, sprite, type Palette, type Sprite } from './sprite'

const ASSET: Palette = {
  w: { token: 'ink' },
  m: { token: 'muted' },
  l: { token: 'line' },
  b: { token: 'friendly' },
  y: { token: 'warn' },
  h: { token: 'hostile' },
  g: { token: 'go', part: 'beacon' },
  r: { token: 'ink', part: 'rotor' },
  s: { token: 'warn', part: 'spark' },
  o: { token: 'muted', alpha: 0.55, part: 'smoke' },
}

const art = (rows: string) => sprite(ASSET, rows)

const SAT = art(`
  ................ ................ .......gg....... .......mm.......
  ......wwwm...... ......wmmm...... bblbb.wmmm.bblbb bblbb.yyyy.bblbb
  lllllmwmmmmlllll bblbb.yyyy.bblbb bblbb.wmmm.bblbb ......wmmm......
  ......mmmm...... .......ll....... .......lw....... ................
`)

const RPO_SAT = art(`
  ................ ................ ......gg........ ......mm........
  bb...wwwwm...... bb...wmmmm...... ll...wyyym...mm. bbmmmwmmmmmmmm..
  bb...wmllm...mm. ll...wyyym...... bb...wmmmm...... bb...mmmmm......
  ......ll........ .....llll....... ................ ................
`)

const DRONE = art(`
  ................ ................ ................ .rrlrr....rrlrr.
  ...m........m... ....m......m.... .....m....m..... ......wwww......
  ......wbbm...... ......mggm...... ......mmmm...... .....m....m.....
  ....m......m.... ...m........m... .rrlrr....rrlrr. ................
`)

const GROUND_STATION = art(`
  ................ ................ ......g......... w.....l.....w...
  wm....l....mw.g. .wm...l...mw..m. ..wmm.l.mmw...m. ....wmmmw.....m.
  .....lml......m. .....lml......m. ....lmmml.....m. .llllllllllllll.
  .lmmbmmbmmbmmml. .lmmmmmmmmmmmml. .llllllllllllll. ................
`)

export const ASSET_SPRITES: Record<AssetKind, Record<SpriteState, Sprite>> = {
  sat: {
    intact: SAT,
    damaged: art(`
      ................ ................ .......gg....... .......m........
      ......wwwm....s. ......wmmm...... bblbb.wmmm.bb.bb bblbb.yyhy.b....
      lllllmwmhmmll... bblbb.yyyy.b.s.. bblbb.wmmm.bb.b. ......wmmm......
      ......mm.m...... .......ll....... .......l........ ................
    `),
    critical: art(`
      .oo............. oooo............ .oo.o..g........ ....oo.m........
      ......w.wm...... ......wmhm...s.. b.lbb.whhm...... bb.b..yhyy.s....
      ll.llmwhhmml.... .b.bb.y.yy...... bb.b..wmhm..s... ......w.mm......
      ......m..m...... .......l........ ................ ................
    `),
    out: knockedOut(SAT),
  },
  rpoSat: {
    intact: RPO_SAT,
    damaged: art(`
      ................ ................ ......gg........ ......m.........
      bb...wwwwm...... b....wmmhm...... l....wyyym..s... bbmmmwmhmmmm....
      bb...wmllm...m.. .l...wyy.m...... bb...wmmmm..s... b....mm.mm......
      ......ll........ .....l.ll....... ................ ................
    `),
    critical: art(`
      .oo............. oooo............ .oo.o.g......... ....o.m.........
      b....w.wwm...... .....whhmm...... l....wyhym...... b.mm.whhmm...s..
      .....wmllm...... .....w.y.m..s... b....wmhmm...... ......m..m......
      ......l......... .....l..l....... ................ ................
    `),
    out: knockedOut(RPO_SAT),
  },
  drone: {
    intact: DRONE,
    damaged: art(`
      ................ ................ ................ .rrlrr....rrlrr.
      ...m........m... ....m......m.... .....m....m..... ......wwww......
      ......wbhm...... ......mggm..s... ......m.mm...... .....m....m.....
      ....m......s.... ...m............ .rrlrr......l... ................
    `),
    critical: art(`
      ................ .oo............. oooo............ .oo.o.....rrlrr.
      .....o......m... ...........m.... .....s....m..... ......wwww......
      ......whhm...... ......mhgm...... ......m..m...... .....m....s.....
      ....m........... ...l............ .r.l.r.......... ................
    `),
    out: knockedOut(DRONE),
  },
  groundStation: {
    intact: GROUND_STATION,
    damaged: art(`
      ................ ................ ......g......... ......l.....w...
      .m....l....mw.g. .wm...l...mw..m. ..w.m.l.mmw...m. ....wmmmw..s..m.
      .....lml......m. .....lml......m. ....lmmml.....m. .llllllllll.lll.
      .lmmbmmhmmbmmml. .lmmmmmmm.mmmml. .lllllll.llllll. ................
    `),
    critical: art(`
      .oo............. oooo............ .oo.o........... ....o.........g.
      .............m.. ............m... ..wm.......s.m.. ....wmm.w.....m.
      .....l.l......m. .....lml...s..m. ....l.mml.....m. .lllll..lll.lll.
      .lmhbmmhmmhmmml. .lmmm.mmm.mmmml. .lll.lll.llllll. ................
    `),
    out: knockedOut(GROUND_STATION),
  },
}

// The Tier A chevron (brief 4.2): gold, in the corner every asset sprite
// keeps clear, drawn over the asset at the same size and scale.
export const TIER_A_CHEVRON = sprite(
  { y: { token: 'warn' } },
  `
  .............y.. ............yyy. ...........yy.yy ................
  ................ ................ ................ ................
  ................ ................ ................ ................
  ................ ................ ................ ................
`,
)
