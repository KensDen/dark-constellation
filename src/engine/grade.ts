// The score screen's grade, stats and turn strip (v1.2 Rounds 5a and 5,
// brief 7.2; the defense bonus since v1.3 Round 0, brief 6.8), as pure
// rules over a finished campaign: the numbers the screen and the share
// text read, in one place, so no test and no component restates them
// (principle 17).

import { defenseBonus } from './learning'
import { newGame } from './reducer'
import { maiScore } from './scoring'
import type { GameState } from './types'

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

// The graded score a WON campaign needs for each grade; below B is C. The
// graded score is the final mission assurance plus the defense bonus
// (brief 6.8).
//
// CALIBRATED, not guessed (principle 18), on the six-turn game the way
// v1.2 R5a calibrated the twelve-turn one (brief 6.8): S about the top 5
// percent of wins and A the next 20, bonus included. Measured on STANDARD
// over 500 seeds of each sweep policy (tests/policies.ts): 664 wins,
// graded score at the 95th percentile 80.7 and at the 75th 76.8. S at 81
// gives 4.5 percent of wins. A is 76.9 rather than a whole number because
// the prepared line's wins cluster at 76.8 to 77.0: 77 would give A 16.0
// percent, 76.9 gives 18.7. B keeps 75, as R5a kept it, since nothing
// measured sets it; B then holds 41.4 percent and C 35.4.
//
// RECALIBRATED IN v1.5 R1 (Ken, 24 October 2026), by the same method, when
// the IR retainer's recovery went from 6 to 4 and Buy everything rejoined
// the gated policies: 899 wins on STANDARD, graded score at the 95th
// percentile 77.8 and at the 75th 76.5. S at 77.9 gives 5.0 percent of
// wins and A at 76.5 21.9; B keeps 75 and holds 21.0. The old 81 and 76.9
// gave S 1.4 and A 11.7 on the new numbers.
// tests/grade.spec.ts re-runs the sweep and holds S and A to their shares.
export const GRADE_THRESHOLDS = { S: 77.9, A: 76.5, B: 75 } as const

// What a grade reads: how the campaign ended, its final mission assurance,
// and the defense bonus it earned.
export interface GradeInput {
  status: GameState['status']
  lossReason?: GameState['lossReason']
  finalMai: number
  bonus?: number
}

// The score a won campaign is graded on, to one decimal.
export const gradedScore = (finalMai: number, bonus = 0): number => Math.round((finalMai + bonus) * 10) / 10

// Won: S, A, B or C by the graded score. Lost after surviving every turn
// (the score ended under the win line): D. Lost early, to a collapse or
// insolvency: F. The bonus never turns a loss into a win.
export function gradeFor({ status, lossReason, finalMai, bonus = 0 }: GradeInput): Grade {
  if (status === 'playing') throw new Error('a campaign in progress has no grade')
  if (status === 'lost') return lossReason === 'belowThreshold' ? 'D' : 'F'
  const graded = gradedScore(finalMai, bonus)
  if (graded >= GRADE_THRESHOLDS.S) return 'S'
  if (graded >= GRADE_THRESHOLDS.A) return 'A'
  if (graded >= GRADE_THRESHOLDS.B) return 'B'
  return 'C'
}

// The defense bonus a game earned.
export const bonusOf = (state: Pick<GameState, 'bestStreak' | 'saved'>): number => defenseBonus(state.bestStreak, state.saved)

// The grade of a finished game, its final score read from the last turn played.
export function gradeOf(state: GameState): Grade {
  const last = state.history[state.history.length - 1]
  if (!last) throw new Error('a campaign with no turns played has no grade')
  return gradeFor({ status: state.status, lossReason: state.lossReason, finalMai: last.maiScore, bonus: bonusOf(state) })
}

// THE TURN STRIP, one square a turn: green when the score did not drop,
// amber for a drop under `magentaDrop`, magenta for a drop of
// `magentaDrop` or more, or whenever an asset was knocked out that turn,
// and since v1.5 R1 on the turn whose close went insolvent: that turn
// ended the run whatever the score did (R6 ledger G6-105, an F shared a
// score above the win line on a green square).
export const TURN_STRIP = { magentaDrop: 3 } as const

export type StripColour = 'green' | 'amber' | 'magenta'

export interface StripTurn {
  maiBefore: number
  maiAfter: number
  // Whether any asset was knocked out during the turn.
  knockedOut: boolean
  // Whether the turn closed with the budget below zero, ending the run.
  insolvent?: boolean
}

export function stripColour({ maiBefore, maiAfter, knockedOut, insolvent = false }: StripTurn): StripColour {
  if (insolvent) return 'magenta'
  // The score is kept to one decimal place (src/engine/scoring.ts), so the
  // drop is too. In raw doubles a drop of exactly 3.0 can come out a hair
  // under it (65.6 - 62.6 is 2.999999999999993) and read amber.
  const drop = Math.round((maiBefore - maiAfter) * 10) / 10
  if (knockedOut || drop >= TURN_STRIP.magentaDrop) return 'magenta'
  return drop > 0 ? 'amber' : 'green'
}

// HITS TAKEN, the score screen's second stat: events that landed, meaning
// an effective severity above 0. A held threat and an opportunity are 0;
// a satellite lost to debris is a hit.
export function hitsTaken(state: GameState): number {
  return state.history.reduce((n, rec) => n + rec.events.filter((ev) => ev.effectiveSeverity > 0).length, 0)
}

// KNOCKOUTS PER TURN, read from the record: an event knocked an asset out
// when its hit took the target from above 0 to 0. Since v1.3 assets heal
// at a solvent close, so the v1.2 derivation (replaying every hit from
// 100) no longer holds and the engine records each hit's integrity
// either side instead.
export function knockoutsByTurn(state: GameState): number[] {
  return state.history.map(
    (rec) => rec.events.filter((ev) => ev.integrityBefore !== undefined && ev.integrityBefore > 0 && ev.integrityAfter === 0).length,
  )
}

// The turn strip of a finished or unfinished campaign, one colour a turn.
// A turn's score before is the turn before's after; the first turn's is
// the campaign's opening score, rebuilt from its seed and difficulty,
// which is the state the first turn resolved from (newGame is pure).
export function turnStrip(state: GameState): StripColour[] {
  const knockouts = knockoutsByTurn(state)
  let maiBefore = maiScore(newGame(state.scenario, state.seed, state.difficulty))
  return state.history.map((rec, i) => {
    const colour = stripColour({ maiBefore, maiAfter: rec.maiScore, insolvent: rec.ledger.insolvent, knockedOut: knockouts[i] > 0 })
    maiBefore = rec.maiScore
    return colour
  })
}
