// THE DEFENSES' ICONS (v1.6 R1, Ken's ruling of 26 October 2026: PROCURE
// as compact cards, each with an icon). One 8x8 icon a defense, one ink,
// drawn at 3x on the card in the friendly token, as the HUD's status icons
// are drawn (./icons.ts). Each shows what the defense is, never which move
// it answers: a move's emblem stays the Dossier's, sealed until it is
// filed (v1.5 R2).

import type { CountermeasureId } from '../../engine/types'
import { sprite, type Sprite } from './sprite'

const mono = (rows: string) => sprite({ i: { token: 'friendly' } }, rows)

export const DEFENSE_ICONS: Record<CountermeasureId, Sprite> = {
  // An antenna mast with its nulls either side.
  antiJam: mono(`
  .i....i. i..ii..i .i.ii.i. ...ii...
  ...ii... ..iiii.. .i....i. i......i
`),
  // A sealed envelope.
  encryptedBackhaul: mono(`
  ........ .iiiiii. i......i ii....ii
  i.i..i.i i..ii..i i......i .iiiiii.
`),
  // A key.
  linkAuth: mono(`
  ........ .iii.... i...i... i...iiii
  i...i.i. .iii..i. ........ ........
`),
  // A position pin.
  pntAuth: mono(`
  ..iiii.. .i....i. .i.ii.i. .i.ii.i.
  .i....i. ..i..i.. ...ii... ...ii...
`),
  // Three sensors voting into one answer.
  sensorFusion: mono(`
  i..i..i. i..i..i. .i.i.i.. ..iii...
  ...i.... ...i.... ..iii... ........
`),
  // A chip on its pins.
  tierAAttestation: mono(`
  .i.i.i.. iiiiiii. .i...i.. ii.i.ii.
  .i...i.. iiiiiii. .i.i.i.. ........
`),
  // A filter: only clean data through.
  mlPipelineIntegrity: mono(`
  iiiiiiii .i....i. ..i..i.. ...ii...
  ...ii... ...ii... ...ii... ........
`),
  // A wall in sealed segments.
  groundZeroTrust: mono(`
  iiii.iii iiii.iii ........ ii.iiiii
  ii.iiiii ........ iiii.iii iiii.iii
`),
  // A person with a badge.
  insiderProgram: mono(`
  ...ii... ..iiii.. ...ii... ..iiii..
  .iiiiii. .ii..ii. .ii..ii. ........
`),
  // A tracking scope's sweep.
  ssaManeuver: mono(`
  ..iiii.. .i....i. i...i..i i..i...i
  i.i....i .i....i. ..iiii.. ........
`),
  // A cross: recovery.
  irRetainer: mono(`
  ........ ...ii... ...ii... .iiiiii.
  .iiiiii. ...ii... ...ii... ........
`),
}
