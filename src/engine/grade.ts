// The score screen's grade, stats and turn strip (v1.2 Rounds 5a and 5,
// brief 7.2; the defense bonus since v1.3 Round 0, brief 6.8), as pure
// rules over a finished campaign: the numbers the screen and the share
// text read, in one place, so no test and no component restates them
// (principle 17).

import { defenseBonus } from './learning'
import { newGame } from './reducer'
import { maiScore } from './scoring'
import type { Difficulty, GameState } from './types'

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

// The graded score a WON campaign needs for each grade, at the difficulty
// it was played on; below B is C. The graded score is the final mission
// assurance plus the defense bonus (brief 6.8).
//
// CALIBRATED, not guessed (principle 18), by one method since v1.2 R5a: S
// about the top 5 percent of wins and A the next 20, bonus included, over
// 500 seeds of each gated line of the sweep (tests/policies.ts), and B
// about the 25th percentile of those wins, so C is a win that scraped the
// line. tests/grade.spec.ts re-runs the sweep and holds S and A to their
// shares on both difficulties.
//
// RECALIBRATED IN v2.0 R3 (Ken's ruling of 15 November 2026: to Round 2's
// economy, and a careful first game on EASY should not earn an S). The
// bands R2 shipped were v1.7's (88, 85.5 and 77.5), set when an answer was
// bought with credits. Under R2's rules (the answers a pool, 13 meter
// damage a point, 5 recovery a night) the wins moved up: on those bands S
// took 21.1 percent of the gated lines' wins on STANDARD and 33.4 on EASY,
// Prepared took S on 54 percent of its EASY wins, and the round's first
// reviewer took S for a first game on EASY at 87.4.
//   STANDARD, 669 wins (Prepared 429, Novice 201, Buy everything 38,
//   Random legal 1): graded score at the 95th percentile 90.6, at the 75th
//   86.8, at the 25th 77.8. S at 90.6 is 5.8 percent of wins and A at 86.6
//   the next 20.2 (86.8 gives 19.3); B keeps 77.5, with a quarter of the
//   wins under it.
//   EASY, 945 wins (Prepared 460, Novice 421, Buy everything 63, Random
//   legal 1): at the 95th percentile 92.6, at the 75th 88.9, at the 25th
//   80.9. S at 92.6 is 5.7 percent of wins and A at 88.9 the next 20.8. B
//   is 80, a little under the 25th percentile, so that a beginner's usual
//   win on EASY still reads B: at 80.9 the gate's Novice took C on 207 of
//   its 421 EASY wins and B on 186; at 80, B on 218 and C on 175, and a
//   fifth of all the wins are under it.
// EASY HAS BANDS OF ITS OWN, by the same method on its own wins: hits do
// three quarters of the damage there, so a game ends about 4 points higher
// for the same play, and one set of bands either handed S to a careful
// EASY game or put it out of reach on STANDARD. With its own, the gate's
// Novice would take S on 0.2 percent of its EASY wins and Prepared on 11.5; on
// STANDARD, Novice on 0.5 and Prepared on 8.9.
//
// AND S IS NOT EARNED ON EASY AT ALL (TOP_GRADE). The bands alone did not
// keep the ruling: the round's own fresh-eyes reviewer, a careful first
// game on EASY at a desktop, won at 89.1 with a bonus of 4.0 and took S at
// 93.1, and the Expert line took S on half its EASY wins. A band high
// enough to stop that would be out of reach of any game. So EASY's best
// grade is A, from the same 88.9, which with what was S makes A the top
// quarter of EASY's wins; S is STANDARD's, and the debrief says so. A
// first win moves PLAY to STANDARD in any case.
export const GRADE_BANDS = {
  standard: { S: 90.6, A: 86.6, B: 77.5 },
  easy: { S: 92.6, A: 88.9, B: 80 },
} as const satisfies Record<Difficulty, { S: number; A: number; B: number }>
export const TOP_GRADE: Record<Difficulty, Grade> = { standard: 'S', easy: 'A' }

// What the next grade up takes at a difficulty, for the debrief: the grade
// and the graded score it starts at, or nothing from the top grade.
export function nextGrade(grade: Grade, difficulty: Difficulty): { grade: Grade; from: number } | null {
  if (grade === TOP_GRADE[difficulty] || grade === 'S' || grade === 'D' || grade === 'F') return null
  const up = grade === 'C' ? 'B' : grade === 'B' ? 'A' : 'S'
  return { grade: up, from: GRADE_BANDS[difficulty][up] }
}

// What a grade reads: how the campaign ended, its final mission assurance,
// the defense bonus it earned, and the difficulty it was played on
// (STANDARD when absent: the Daily Op's, and every record from before the
// difficulty rode with a score).
export interface GradeInput {
  status: GameState['status']
  lossReason?: GameState['lossReason']
  finalMai: number
  bonus?: number
  difficulty?: Difficulty
}

// The score a won campaign is graded on, to one decimal.
export const gradedScore = (finalMai: number, bonus = 0): number => Math.round((finalMai + bonus) * 10) / 10

// Won: S, A, B or C by the graded score. Lost after surviving every turn
// (the score ended under the win line): D. Lost early, to a collapse or
// insolvency: F. The bonus never turns a loss into a win.
export function gradeFor({ status, lossReason, finalMai, bonus = 0, difficulty = 'standard' }: GradeInput): Grade {
  if (status === 'playing') throw new Error('a campaign in progress has no grade')
  if (status === 'lost') return lossReason === 'belowThreshold' ? 'D' : 'F'
  const graded = gradedScore(finalMai, bonus)
  const bands = GRADE_BANDS[difficulty]
  if (graded >= bands.S && TOP_GRADE[difficulty] === 'S') return 'S'
  if (graded >= bands.A) return 'A'
  if (graded >= bands.B) return 'B'
  return 'C'
}

// The defense bonus a game earned.
export const bonusOf = (state: Pick<GameState, 'bestStreak' | 'saved'>): number => defenseBonus(state.bestStreak, state.saved)

// The grade of a finished game, its final score read from the last turn played.
export function gradeOf(state: GameState): Grade {
  const last = state.history[state.history.length - 1]
  if (!last) throw new Error('a campaign with no turns played has no grade')
  return gradeFor({ status: state.status, lossReason: state.lossReason, finalMai: last.maiScore, bonus: bonusOf(state), difficulty: state.difficulty })
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
