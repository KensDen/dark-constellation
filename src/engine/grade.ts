// The score screen's grade, stats and turn strip (v1.2 Rounds 5a and 5,
// brief 7.2), as pure rules over a finished campaign: the numbers the
// screen and the share text read, in one place, so no test and no
// component restates them (principle 17).

import { ASSET_DAMAGE_PER_SEVERITY, newGame } from './reducer'
import { maiScore } from './scoring'
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

// HITS TAKEN, the score screen's second stat: events that landed, meaning
// an effective severity above 0. A held threat and an opportunity are 0.
export function hitsTaken(state: GameState): number {
  return state.history.reduce((n, rec) => n + rec.events.filter((ev) => ev.effectiveSeverity > 0).length, 0)
}

// KNOCKOUTS PER TURN, DERIVED rather than recorded, so the turn record and
// the determinism snapshot stay as they are. The derivation is exact
// because of how the reducer treats integrity, and each of these is a
// fact of src/engine/reducer.ts that tests/grade.spec.ts holds against
// the engine's own assets on every turn of many campaigns:
// - every asset starts at 100, whether it began the campaign or arrived;
// - integrity only ever falls, and only through an event that names its
//   asset in targetAssetId (nothing repairs an asset);
// - a debris strike that names an asset sets it to 0, and every other
//   named hit takes effectiveSeverity * ASSET_DAMAGE_PER_SEVERITY off it,
//   floored at 0;
// - a named asset was live when it was hit.
// So replaying the named hits from 100 reproduces every asset's integrity
// after every turn, and a knockout is a named asset that reached 0.
export function knockoutsByTurn(state: GameState): number[] {
  const integrity = new Map<string, number>()
  return state.history.map((rec) => {
    let knocked = 0
    for (const ev of rec.events) {
      const id = ev.targetAssetId
      if (id === undefined) continue
      const before = integrity.get(id) ?? 100
      const def = state.scenario.events.find((e) => e.id === ev.eventId)
      const after =
        def?.effect.special === 'debrisStrike' ? 0 : Math.max(0, before - ev.effectiveSeverity * ASSET_DAMAGE_PER_SEVERITY)
      integrity.set(id, after)
      if (before > 0 && after === 0) knocked += 1
    }
    return knocked
  })
}

// The turn strip of a finished or unfinished campaign, one colour a turn.
// A turn's MAI before is the turn before's after; the first turn's is the
// campaign's opening MAI, rebuilt from its seed and difficulty, which is
// the state the first turn resolved from (newGame is pure).
export function turnStrip(state: GameState): StripColour[] {
  const knockouts = knockoutsByTurn(state)
  let maiBefore = maiScore(newGame(state.scenario, state.seed, state.difficulty))
  return state.history.map((rec, i) => {
    const colour = stripColour({ maiBefore, maiAfter: rec.maiScore, knockedOut: knockouts[i] > 0 })
    maiBefore = rec.maiScore
    return colour
  })
}
