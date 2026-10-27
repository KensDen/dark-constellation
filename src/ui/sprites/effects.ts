// The effect sprites (v1.2 R2, brief 5.2): the lock-on, the hit burst and
// the shield the strike puts on a tile (v1.3 brief 5.5 item 1).
// 16x16.

import { sprite, type Palette } from './sprite'

const FX: Palette = {
  k: { token: 'ground' },
  h: { token: 'hostile' },
  w: { token: 'ink' },
  y: { token: 'warn' },
  b: { token: 'friendly' },
  g: { token: 'go' },
  o: { token: 'muted', alpha: 0.55 },
}

const fx = (rows: string) => sprite(FX, rows)

// The hit burst, three frames: the flash, the star, the debris.
export const HIT_BURST = [
  fx(`
    ................ ................ ................ ................
    ................ ................ .......ww....... ......whhw......
    ......whhw...... .......ww....... ................ ................
    ................ ................ ................ ................
  `),
  fx(`
    ................ .......h........ .h.....h.....h.. ..h....w....h...
    ...h...w...h.... ....y..w..y..... .....yhwhy...... .hhwwwwwwwwwhh..
    .....yhwhy...... ....y..w..y..... ...h...w...h.... ..h....w....h...
    .h.....h.....h.. .......h........ ................ ................
  `),
  fx(`
    ................ ..h.........y... ................ .....h....h.....
    .y............h. ...........o.... ..h..oo......... .....ooo..h.....
    ......oo........ .y..........y... ..........o..... ....h...........
    .........h...... ..y..........h.. ................ ................
  `),
] as const

// The lock-on brackets, the beat before a hit lands.
export const LOCK_ON = fx(`
  hhhh........hhhh h..............h h..............h h..............h
  ................ ................ ................ ................
  ................ ................ ................ ................
  h..............h h..............h h..............h hhhh........hhhh
`)

// THE SHIELD STAMP (v1.3 R5, R3's question 3): a filled shield with its
// check cut out of it, so a block reads as a win by its shape, colour
// aside. It goes on the BLOCKED banner and on the tile a defense held.
export const SHIELD_STAMP = fx(`
  ................ .gggggggggggggg. .gggggggggggggg. .gggggggggggggg.
  .ggggggggggkkgg. .gggggggggkkggg. .ggkkggggkkgggg. .gggkkggkkggggg.
  ..gggkkkkggggg.. ..ggggkkgggggg.. ...gggggggggg... ....gggggggg....
  .....gggggg..... ......gggg...... .......gg....... ................
`)

// The same shield, plain, for the won debrief: the grade sits in it.
export const SHIELD_PLAIN = fx(`
  ................ .gggggggggggggg. .gggggggggggggg. .gggggggggggggg.
  .gggggggggggggg. .gggggggggggggg. .gggggggggggggg. .gggggggggggggg.
  ..gggggggggggg.. ..gggggggggggg.. ...gggggggggg... ....gggggggg....
  .....gggggg..... ......gggg...... .......gg....... ................
`)

// The lost debrief's shield (v1.6 R1): the same shield in the hostile ink,
// cracked from its top edge and chipped at its foot, so a loss carries the
// win's shape, not a bare letter on a flat panel.
export const SHIELD_BROKEN = fx(`
  ................ .hhhhhhhhhhhkhh. .hhhhhhhhhhhkhh. .hhhhhhhhhhhhkh.
  .hhhhhhhhhhhhkh. .hhhhhhhhhhhhhk. .hhhhhhhhhhhhhk. .hhhhhhhhhhhhhh.
  ..hhhhhhhhhhhh.. ..hkhhhhhhhhhh.. ...khhhhhhhhh... ....hkhhhhhh....
  .....hhhhhh..... ......hhhh...... .......hh....... ................
`)

// The sparkle a bought part arrives with.
export const PART_SPARKLE = fx(`
  ................ .g...........w.. gwg.........wgw. .g...........w..
  .......g........ .......g........ .......w........ ....ggwwwgg.....
  .......w........ .......g........ .......g........ ............g...
  ...........gwg.. ...w........g... ................ ................
`)
