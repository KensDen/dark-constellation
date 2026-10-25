// THE DOSSIER'S EMBLEMS (v1.5 R2, Ken's ruling of 24 October 2026: a
// small emblem for each of the 18 Dossier cards). One 16x16 pictogram per
// move COLDVEIL can make, in the sprite format (./sprite.ts): what the
// move does to what, the move itself in hostile red. The debris is not
// COLDVEIL's, so its fragments are amber. A card not yet filed shows the
// sealed file instead, so no emblem names a move early.
//
// ONLY THE DOSSIER AND THE NIGHT'S INTEL CARD IMPORT THIS FILE, so it
// rides in their chunks and never in the first download.

import { sprite, type Palette, type Sprite } from './sprite'

const INKS: Palette = {
  h: { token: 'hostile' },
  w: { token: 'ink' },
  m: { token: 'muted' },
  l: { token: 'line' },
  b: { token: 'friendly' },
  y: { token: 'warn' },
  s: { token: 'steel' },
  g: { token: 'glass' },
  k: { token: 'shadow' },
}
const e = (art: string) => sprite(INKS, art)

// By threat id, every threat in the deck (tests/sprites.spec.ts).
export const EMBLEMS: Readonly<Record<string, Sprite>> = {
  // A navigation satellite's signal, cut by noise before it reaches the
  // pin on the ground.
  'pnt-jamming': e(`
    ................ .bb..wwwwww..bb. .bbsswwwwwwssbb. .bb..wwwwww..bb.
    .......bb....... ....b..bb..b.... h..h..h..h..h..h .hh.hh.hh.hh.hh.
    h..h..h..h..h..h ................ ......mmmm...... .....mmmmmm.....
    .....mm..mm..... ......mmmm...... .......mm....... ................
  `),
  // The command link from the dish to the satellite, broken by a jammer.
  'uplink-jamming': e(`
    ..........bwwswb ..........bwwswb ..........bwwswb .........b......
    ....h...h....... ...hhh.hhh.h.... .....hh..hh..... .....b....h.....
    ....b........... ...wb........... .wwww........... wwwwww..........
    wwwwww.......... .wwww........... ..ss............ .mmmm...........
  `),
  // The aircraft's true pin, and a red one where the false signal says
  // it is.
  'gnss-spoofing': e(`
    .........hhhh... ........h....h.. ........h.hh.h.. ........h....h..
    ...wwww..h..h... ..ww..ww..hh.... .ww....ww....... .ww.ww.ww...h...
    .ww....ww....... ..ww..ww...h.... ...wwww......... ....ww..........
    .....w.......... ................ mmmmmmmmmmmmmmmm ................
  `),
  // A clock, wound back: the red arrow runs the wrong way round.
  'time-spoof': e(`
    ................ ........ww...... .....wwwwwwww... ....wwwllllwww..
    ...wwwllwwllwww. ...wwlllwwlllww. ...wllllwwllllw. .hwwllllwwllllww
    hhhwllllwwwwllww hhhwllllwwwwllw. .hhwwllllllllww. .hhwwwllllllwww.
    ..hhwwwllllwww.. ...hhwwwwwwww... ....hh..ww...... ................
  `),
  // The docking sensor's eye, flooded by a laser.
  'lidar-dazzle': e(`
    ...........h.... ..........hhh..h ...........h..h. .........h.hh...
    ........h..hhhh. .......h...hh... ......h...h..... ...wwwbbwhw.....
    .wwwwbbbbwwww... wwwwbbkkbbwwww.. wwwwbbkkbbwwww.. .wwwwbbbbwwww...
    ...wwwbbwww..... ................ ................ ................
  `),
  // A point cloud with a phantom in it: a box of points that is not
  // there.
  'lidar-injection': e(`
    ................ .b...b...b...b.. ................ ...b...b...b...b
    ................ .b..hhhh.hh..b.. ....h......h.... ...bh..b...hb..b
    ....h......h.... .b..hh.hhhh..b.. ................ ...b...b...b...b
    ................ .b...b...b...b.. ................ ................
  `),
  // A point cloud with a real object struck out of it.
  'lidar-blinding': e(`
    ................ .b...b...b...b.. ................ ...b...b...b...b
    ................ .b...b.....h.b.. ..........h..... ...b...b.h.....b
    ........h....... .b...bh......b.. .....h.......... ...bh....b...b.b
    ................ .b...b...b...b.. ................ ................
  `),
  // The training data, with bad entries in it and more dripping in.
  'training-data-poisoning': e(`
    ......hh........ .....hhhh....... .....hhhh....... ......hh........
    ................ ...mmmmmmmmmm... ..m..........m.. ..mmmmmmmmmmmm..
    ..m.bb.bb.bb.m.. ..mmmmmmmmmmmm.. ..m.bb.hh.bb.m.. ..mmmmmmmmmmmm..
    ..m.bb.bb.hh.m.. ...mmmmmmmmmm... ................ ................
  `),
  // A sensor's chip, with something red planted at its heart.
  'supply-chain-implant': e(`
    ................ ...w.w.w.w.w.... ...w.w.w.w.w.... ..mmmmmmmmmmm...
    w.mmmmmmmmmmm.w. ..mmmhhhhhmmm... w.mmmhhkhhmmm.w. ..mmmhkhkhmmm...
    w.mmmhhkhhmmm.w. ..mmmhhhhhmmm... w.mmmmmmmmmmm.w. ..mmmmmmmmmmm...
    ...w.w.w.w.w.... ...w.w.w.w.w.... ................ ................
  `),
  // A dish in red, sending commands that are not yours.
  'rogue-ground-station': e(`
    ..........h..... .........hhh.... ........h.h.h... ..........h.....
    ...hh.....h..... ..hhhh....h..... .hhhhhh.h....... ..hhhhhh........
    ...hhhhhh....... ....hhhh........ .....ss......... .....ss.........
    ....ssss........ ...ssssss....... ..mmmmmmmmmm.... ................
  `),
  // A telemetry trace, played back: the red arrow loops it round again.
  'telemetry-replay': e(`
    ..........hhh... .........hhhhh.. .............hh. .............hhh
    mmmmmmmmmmmmhhhh mlllllllllllmhh. mlllllllllllm... mlllllllllllm...
    mllbbllllllbm... mlbbbbllllbbm... mbbllbbllbblm... mbllllbbbbllm...
    mllllllbblllm... mlllllllllllm... mmmmmmmmmmmmm... ................
  `),
  // The downlink, and a red dish listening in on it.
  'downlink-eavesdropping': e(`
    bbbbbwwwwwwbbbbb bbbbbwwwwwwbbbbb bbbbbwwwwwwbbbbb .......b........
    ........b....... .......b.b...... ......b.b....... .....b.b.b.....h
    ......b.b.b...h. .....b.b.b.hhh.. ....b.b.b.hhhhh. ...b.b.b.b.hhh..
    ....b.b.b.b.h... ...b.b.b.b.bhb.. ...........hhh.. mmmmmmmmmmmmmmmm
  `),
  // Data leaving by the satellite backhaul, out of the box and away.
  'backhaul-exfil': e(`
    ................ ................ mmmmmmmmm....... mlllllllm.......
    mlbblbblm....... mlbblbblm...h... mlllllllm...hh.. mlbblbhhhhhhhhhh
    mlbblbhhhhhhhhhh mlllllllm...hh.. mlbblbblm...h... mlbblbblm.......
    mlllllllm....... mmmmmmmmm....... ................ ................
  `),
  // The ground segment's servers, locked by someone else.
  'ground-ransomware': e(`
    .mmmmmmmmmmmm... .m.g.......m.... .mmmmmmmmmmmm... .m.g.......m....
    .mmmmmm.hhhh.... .m.g...hh..hh... .mmmmmm.h..h.... .m.g...hh..hh...
    .mmmmmhhhhhhhh.. .m.g.hhhhhhhhhh. ......hhhkkhhh.. ......hhhkkhhh..
    ......hhhhhhhh.. ......hhhhhhhh.. ................ ................
  `),
  // A message with a hook let down into it, for a mission operator's login.
  'ops-phishing': e(`
    .............hh. .............hh. .............hh. .............hh.
    .............hh. .............hh. wwwwwwwwwwww.hh. wwllllllllww.hh.
    wlwllllllhhw.hh. wllwllllwhhw.hh. wlllwllwlhhhhhh. wllllwwllhhhhhh.
    wllllllllllw.... wllllllllllw.... wllllllllllw.... wwwwwwwwwwww....
  `),
  // Someone inside, walking a file out the door.
  'insider-exfil': e(`
    ....mmm......... ...mmmmm........ ...mmmmm........ ....mmm.........
    ..mmmmmmm....... .mmmmmmmmhhhh... .mm.mmm.mhwwh... .mm.mmm.mhwwh...
    ....mmm..hhhh... ....mmm..hhhhhh. ...mm.mm....hh.. ...mm.mm....h...
    ...mm..mm....... ..mm....mm...... ................ ................
  `),
  // Debris crossing a satellite's orbit: no adversary, a call to make.
  'debris-conjunction': e(`
    ................ ......bbbbb..... ...bb.......bb.. ..b..........b..
    .b......y.....b. .b..y...y......b b....yyy.......b b......y..bwwb.b
    b.y.........ss.. .b...y......wwb. .b..........b... ..b...y.....b...
    ...bb......bb... .....bbbbbb..... ................ ................
  `),
  // GNSS jammed, then the fallback sensor exploited: the chain breaks.
  'blackout-chain': e(`
    ................ ...........hh... ..........hh.... .........hh.....
    .wwww...hh...... w....w.hhhhhh... w....w....hh.... .wwww....hh.www.
    ........hh.w...w .......hh..w...w ......hh....www. ................
    ................ ................ ................ ................
  `),
}

// A card not yet filed: a sealed folder, its contents unread.
export const SEALED = sprite(
  { m: { token: 'muted', alpha: 0.7 }, l: { token: 'line' }, k: { token: 'shadow' } },
  `
  ................ ................ .mmmmm.......... .m...mmmmmmmmm..
  .mllllllllllllm. .mllllllllllllm. .mllllllkkllllm. .mlllllkllklllm.
  .mlllllkllklllm. .mllllllkkllllm. .mllllllllllllm. .mllllllllllllm.
  .mmmmmmmmmmmmmm. ................ ................ ................
`,
)
