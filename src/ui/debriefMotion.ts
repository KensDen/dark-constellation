// The debrief's reveal timing (v1.2 R5's score screen, brief 7.2; the
// debrief since v1.3 R4, brief 5.6 and 8.3), in a module of its own so the
// screen and its tests read one copy. The CSS durations in ./debrief.css
// are these numbers, and tests/debrief.dom.spec.tsx reads them back from
// the stylesheet.

import { COUNT_MS } from './cues/motion'

export const DEBRIEF_MOTION = {
  // Before the grade lands, so the screen has settled.
  leadMs: 250,
  // A win's moment (v1.3 R5): the stamp, the shield, the grade in it and
  // the burst, before the tiles start. A loss holds a short beat instead.
  heroMs: 900,
  lossMs: 220,
  // The burst's pixels flying out, each a step after the one before.
  burstMs: 700,
  burstStepMs: 12,
  // From one stat tile starting to the next: the six tiles come in a
  // step apart and count up together, each landing with a blip.
  statStepMs: 90,
  // One stat's count, which its blip marks the end of, and its tile's
  // own arrival.
  countMs: COUNT_MS,
  statInMs: 220,
  // The beat after the last stat lands, before the filed cards.
  beatMs: 120,
  // From one strip square to the next, and one square's own fill; and
  // from one filed card's row to the next.
  stripStepMs: 60,
  stripCellMs: 160,
  rowStepMs: 90,
  rowInMs: 220,
} as const
