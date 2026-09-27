// The score screen's reveal timing (v1.2 R5, brief 7.2), in a module of
// its own so the screen and its tests read one copy. The CSS durations in
// ./scoreScreen.css are these numbers, and tests/score-screen.dom.spec.tsx
// reads them back from the stylesheet.

import { COUNT_MS } from './cues/motion'

export const SCORE_MOTION = {
  // Before the first stat starts, so the screen has settled.
  leadMs: 250,
  // One stat's count, which its blip marks the end of, and its whole
  // turn: the count, then a beat before the next.
  countMs: COUNT_MS,
  statMs: COUNT_MS + 100,
  // The grade block's drop and its one bounce.
  gradeMs: 640,
  // From one strip square to the next, and one square's own fill.
  stripStepMs: 60,
  stripCellMs: 160,
} as const

