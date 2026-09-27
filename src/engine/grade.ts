// The score screen's grade and turn strip (v1.2 Round 5a, brief 7.2), as
// pure rules over a finished campaign. The screen itself is a later round;
// these are the numbers it will read, in one place, so no test and no
// component restates them (principle 17).

import type { GameState } from './types'

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

// The final MAI a WON campaign needs for each grade; below B is C.
//
// CALIBRATED, not guessed (principle 18). The brief's starting guess was
// S 85, A 80, B 75. Measured on Standard across 500 seeds, with every
// scripted line in tests/scripts.ts and the seeded random line: 734 wins,
// final MAI at the 95th percentile 83.9 and at the 75th 79.0. So S is 84,
// which gives 4.5 percent of wins (the brief's 85 gave 1.9), and A is 79,
// which gives the next 20.7 percent (80 gave 15.0). B keeps the brief's 75,
// since nothing measured sets it; B then holds 32.8 percent and C 42.0.
// tests/grade.spec.ts re-runs the sweep and holds S and A to their shares.
export const GRADE_THRESHOLDS = { S: 84, A: 79, B: 75 } as const

// What a grade reads: how the campaign ended and its final MAI.
export interface GradeInput {
  status: GameState['status']
  lossReason?: GameState['lossReason']
  finalMai: number
}

// Won: S, A, B or C by final MAI. Lost after surviving every turn (the MAI
// ended under the win line): D. Lost early, to a collapse or insolvency: F.
export function gradeFor({ status, lossReason, finalMai }: GradeInput): Grade {
  if (status === 'playing') throw new Error('a campaign in progress has no grade')
  if (status === 'lost') return lossReason === 'belowThreshold' ? 'D' : 'F'
  if (finalMai >= GRADE_THRESHOLDS.S) return 'S'
  if (finalMai >= GRADE_THRESHOLDS.A) return 'A'
  if (finalMai >= GRADE_THRESHOLDS.B) return 'B'
  return 'C'
}

// The grade of a finished game, its final MAI read from the last turn played.
export function gradeOf(state: GameState): Grade {
  const last = state.history[state.history.length - 1]
  if (!last) throw new Error('a campaign with no turns played has no grade')
  return gradeFor({ status: state.status, lossReason: state.lossReason, finalMai: last.maiScore })
}

// THE TURN STRIP, one square a turn: green when MAI did not drop, amber for
// a drop under `magentaDrop`, magenta for a drop of `magentaDrop` or more,
// or whenever an asset was knocked out that turn.
export const TURN_STRIP = { magentaDrop: 3 } as const

export type StripColour = 'green' | 'amber' | 'magenta'

export interface StripTurn {
  maiBefore: number
  maiAfter: number
  // Whether any asset was knocked out during the turn.
  knockedOut: boolean
}

export function stripColour({ maiBefore, maiAfter, knockedOut }: StripTurn): StripColour {
  // The MAI is kept to one decimal place (src/engine/scoring.ts), so the
  // drop is too. In raw doubles a drop of exactly 3.0 can come out a hair
  // under it (65.6 - 62.6 is 2.999999999999993) and read amber.
  const drop = Math.round((maiBefore - maiAfter) * 10) / 10
  if (knockedOut || drop >= TURN_STRIP.magentaDrop) return 'magenta'
  return drop > 0 ? 'amber' : 'green'
}
