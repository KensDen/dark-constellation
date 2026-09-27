// The effect sprites (v1.2 R2, brief 5.2), drawn now and wired in R3,
// when the director's beats land on tiles (brief 4.5). Nothing imports
// them yet outside the suite, so they cost the bundle nothing until R3
// uses them. 16x16.

import { sprite, type Palette } from './sprite'

const FX: Palette = {
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

// The shield flash, when a defense holds.
export const SHIELD_FLASH = fx(`
  ................ .bbbbbbbbbbbbbb. .bwwwwwwwwwwwwb. .bw..........wb.
  .bw..........wb. .bw..........wb. .bw..........wb. .bw..........wb.
  ..bw........wb.. ..bw........wb.. ...bw......wb... ....bw....wb....
  .....bw..wb..... ......bwwb...... .......bb....... ................
`)

// The sparkle a bought part arrives with.
export const PART_SPARKLE = fx(`
  ................ .g...........w.. gwg.........wgw. .g...........w..
  .......g........ .......g........ .......w........ ....ggwwwgg.....
  .......w........ .......g........ .......g........ ............g...
  ...........gwg.. ...w........g... ................ ................
`)
