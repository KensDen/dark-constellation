// The cold open's own art (v1.2 R4, brief 5.1 and 6): what the four
// slides need that the board does not already draw. Everything else on
// those slides is the board's art reused: the ORBIT, AIR and GROUND
// backdrops, the asset sprites and the COLDVEIL emblem.
//
// ONLY THE COLD OPEN IMPORTS THIS FILE, so it ships in the IntroSequence
// chunk and a player who never opens the briefing never downloads it.
// tests/cold-open.dom.spec.tsx holds that: nothing reachable from
// main.tsx may import it statically.

import { sprite, type Palette } from './sprite'

const OFFICER: Palette = {
  l: { token: 'line' },
  k: { token: 'shadow' },
  m: { token: 'muted' },
  w: { token: 'ink' },
  b: { token: 'friendly' },
  y: { token: 'warn' },
  g: { token: 'go' },
  e: { token: 'muted', alpha: 0.6 },
  f: { token: 'chrome' },
}

const officer = (rows: string) => sprite(OFFICER, rows)

// THE WATCH OFFICER at the desk, 26x26, in three frames: typing with the
// left hand, typing with the right, and a blink. No name, as decided
// (brief 6): the label on every slide is WATCH OFFICER. The frames share
// one silhouette, so a later frame drawn over an earlier one covers it
// exactly and the loop is opacity alone.
export const WATCH_OFFICER = [
  officer(`
    .......................... .......................... ..........llllll.......... .........llllllll.........
    ........kllllllllk........ .......kklmmmmmmlkk....... .......kkmmkmmkmmkk....... ........kmmmmmmmmk........
    ........kgmmllmmmk........ .........kmmmmmmk......... ...........mmmm........... .......bbbbwmmwbbbb.......
    .....ybbbbbbwwbbbbbby..... ....bbbbbbbbllbbbbbbbb.ww. ....bbbbbbbbllbbbbbbbb.ww. ...bbbbbbbbbbbbbbbbbbbbww.
    lllllllmmkkkkkkkkmmllllwwl eeeeeeeeeeeeeeeeeeeeeeeeee ffffffffffffffffffffffffff ffkkkkkkkkkkffffffkgkykkff
    ffkbbbbbbbbkffffffkkkkkkff ffkkkkkkkkkkffffffffffffff ffffffffffffffffffffffffff ffffffffffffffffffffffffff
    ffffffffffffffffffffffffff ffffffffffffffffffffffffff
  `),
  officer(`
    .......................... .......................... ..........llllll.......... .........llllllll.........
    ........kllllllllk........ .......kklmmmmmmlkk....... .......kkmmkmmkmmkk....... ........kmmmmmmmmk........
    ........kgmmllmmmk........ .........kmmmmmmk......... ...........mmmm........... .......bbbbwmmwbbbb.......
    .....ybbbbbbwwbbbbbby..... ....bbbbbbbbllbbbbbbbb.ww. ....bbbbbbbbllbbbbbbbb.ww. ...bbbbmmbbbbbbbbbbbbbbww.
    lllllllllkkkkkkkkmmllllwwl eeeeeeeeeeeeeeeeeeeeeeeeee ffffffffffffffffffffffffff ffkkkkkkkkkkffffffkgkykkff
    ffkbbbbbbbbkffffffkkkkkkff ffkkkkkkkkkkffffffffffffff ffffffffffffffffffffffffff ffffffffffffffffffffffffff
    ffffffffffffffffffffffffff ffffffffffffffffffffffffff
  `),
  officer(`
    .......................... .......................... ..........llllll.......... .........llllllll.........
    ........kllllllllk........ .......kklmmmmmmlkk....... .......kkmmmmmmmmkk....... ........kmmmmmmmmk........
    ........kgmmllmmmk........ .........kmmmmmmk......... ...........mmmm........... .......bbbbwmmwbbbb.......
    .....ybbbbbbwwbbbbbby..... ....bbbbbbbbllbbbbbbbb.ww. ....bbbbbbbbllbbbbbbbb.ww. ...bbbbbbbbbbbbbbbbbbbbww.
    lllllllmmkkkkkkkkmmllllwwl eeeeeeeeeeeeeeeeeeeeeeeeee ffffffffffffffffffffffffff ffkkkkkkkkkkffffffkgkykkff
    ffkbbbbbbbbkffffffkkkkkkff ffkkkkkkkkkkffffffffffffff ffffffffffffffffffffffffff ffffffffffffffffffffffffff
    ffffffffffffffffffffffffff ffffffffffffffffffffffffff
  `),
] as const

const WRECK: Palette = {
  q: { token: 'muted', alpha: 0.5 },
  m: { token: 'muted' },
  l: { token: 'muted', alpha: 0.7 },
  k: { token: 'shadow' },
  y: { token: 'warn' },
  w: { token: 'ink' },
  o: { token: 'muted', alpha: 0.55 },
}

const wreck = (rows: string) => sprite(WRECK, rows)

// THE DISASTER ZONE (brief 6, slide 2): a flooded town the squadron
// maps, 16x16 a piece, standing in the water the scene draws over their
// lower floors. A survivor signals from a split roof and one lit window
// says somebody is still inside. Nothing here moves: the slide's one loop
// is the rotors.
export const DISASTER = [
  // A house with its roof split open, and somebody on it.
  wreck(`
    ........w....... .......ww....... .......y........ ....m..y.m......
    ...mqm...mqm.... ..mqqqm.mqqqm... .mqqqqqm.qqqqqm. ..qkkqq..qqyyq..
    ..qkkqqq.qqyyq.. ..qqqqqqqqq.qq.. ..qqq.qqqqqqqq.. ..qqqqqqqqqqqq..
    ..qqqqqqqqqqqq.. ..qqqqqqqqqqqq.. ..qqqqqqqqqqqq.. ..qqqqqqqqqqqq..
  `),
  // A block of flats with its top torn off.
  wreck(`
    ......m......... ......qm..m..... ......qqmmqm.... ......qqqqqqm...
    ......qkqkqkq... ......qqqqqqq... ......qkqyqkq... ......qqqqqqq...
    ......qkqkq.q... ......qqqqqqq... ......qkqkqkq... ......qqqqqqq...
    ......qqqqqqq... ......qqqqqqq... ......qqqqqqq... ......qqqqqqq...
  `),
  // What is left of one, still smoking.
  wreck(`
    .........ooo.... ........ooooo... .........oooo... ..........ooo...
    ...........o.... ...........l.... .........m.l.... ........mqml....
    ...m...mqqqm.... ..mqm.mqqkqqm... .mqqqmqqqqqqqm.. mqqqqqqqqqqqqqm.
    qqqqqqqqqqqqqqqq qqqqqqqqqqqqqqqq qqqqqqqqqqqqqqqq qqqqqqqqqqqqqqqq
  `),
  // A power pole down, its line trailing.
  wreck(`
    ................ ...m............ ..mmm........... ...m.l..........
    ....m..l........ ....m...l....... ....m....ll..... .....m.....ll...
    .....m.......ll. .....m.......... ......m......... ......m.........
    ......m......... .......m........ .......m........ .......m........
  `),
] as const

// The water, one tile of a band repeated across the scene: a surface
// line, ripples and something floating.
export const FLOOD = sprite(
  {
    s: { token: 'friendly', alpha: 0.6 },
    b: { token: 'friendly', alpha: 0.3 },
    r: { token: 'ink', alpha: 0.35 },
    d: { token: 'muted', alpha: 0.7 },
  },
  `
  ssssssssssssssss bbrrbbbbbbddddbb bbbbbbbbbrrrbbbb bbbbbbbbbbbbbbbb
  bbbbbrrbbbbbbbbb bbbbbbbbbbbbbbbb bbbbbbbbbbbrrbbb bbbbbbbbbbbbbbbb
  bbrrbbbbbbbbbbbb bbbbbbbbbbbbbbbb
`,
)
