// The sweep's driver, shared by the gate (tests/sweep.spec.ts) and the
// one-step robustness sweep (tests/sweep-steps.spec.ts, v1.3 R0b): plays a
// policy over seeds 1 to 500 exactly as the gate always has and keeps what
// the table reports. A plain module, not a spec, so either file can import
// it without registering the other's tests.

import { DEFAULT_SCENARIO } from '../src/content'
import { bonusOf, gradeOf, gradedScore, type Grade } from '../src/engine/grade'
import { metOnTurn } from '../src/engine/learning'
import { newGame } from '../src/engine/reducer'
import { playNight, type Responder } from '../src/engine/responses'
import type { Difficulty, GameState } from '../src/engine/types'
import { worstCase } from '../src/engine/worstCase'
import type { Policy } from './policies'

export const SEEDS = 500
export const GRADES: Grade[] = ['S', 'A', 'B', 'C', 'D', 'F']

export interface PolicyRun {
  wins: number
  insolvencies: number
  collapses: number
  belowLine: number
  finalScores: number[]
  bestStreaks: number[]
  met: number[]
  grades: Record<Grade, number>
  // Turns that read WORST CASE 0 or more and still closed insolvent.
  unsafe: string[]
  // Turns that read WORST CASE 0 or more, so the guard is not vacuous.
  safeTurns: number
  // The defense streak and the blocks behind it (R0b): threats met and
  // fully blocked (nothing through) per run, by base strength 1, 2 and 3,
  // summed over the runs. Debris and opportunities are not threats.
  met1to3: [number, number, number]
  blocked1to3: [number, number, number]
  // v1.7 R1: per run, the attacks faced, those stopped outright (by a
  // defense or a response), those a response halved, the responses paid
  // for, and the budget the run ended on.
  faced: number[]
  stopped: number[]
  halved: number[]
  spentOnResponses: number[]
  creditsLeft: number[]
  // The graded score (final score plus the defense bonus) of each win.
  gradedWins: number[]
  // Runs whose best streak, recomputed from the record, is not the one the
  // engine kept (brief 6.8): the instrument and the rule must agree.
  streakMismatches: string[]
}

export function playPolicy(policy: Policy, difficulty: Difficulty, respond: Responder = () => null, seeds = SEEDS, timing: 0 | 1 | 2 = 0): PolicyRun {
  const run: PolicyRun = {
    wins: 0,
    insolvencies: 0,
    collapses: 0,
    belowLine: 0,
    finalScores: [],
    bestStreaks: [],
    met: [],
    grades: { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 },
    unsafe: [],
    safeTurns: 0,
    met1to3: [0, 0, 0],
    blocked1to3: [0, 0, 0],
    faced: [],
    stopped: [],
    halved: [],
    spentOnResponses: [],
    creditsLeft: [],
    gradedWins: [],
    streakMismatches: [],
  }
  for (let seed = 1; seed <= seeds; seed += 1) {
    let state: GameState = newGame(DEFAULT_SCENARIO, seed, difficulty)
    const met = new Set<string>()
    let streak = 0
    let best = 0
    const tally = { faced: 0, stopped: 0, halved: 0, spent: 0 }
    while (state.status === 'playing') {
      // A tap of the same grade on every move, for the lines that report
      // the timed block's lift (v2.0 R1); the gated lines take none.
      const actions = timing ? { ...policy(state), timing: [timing, timing, timing, timing] } : policy(state)
      const read = worstCase(state, actions).value
      const after = playNight(state, actions, respond)
      const record = after.history.at(-1)!
      if (read >= 0) {
        run.safeTurns += 1
        if (record.ledger.insolvent) run.unsafe.push(`seed ${seed} turn ${record.turn}: WORST CASE read ${read}, closed at ${record.ledger.after}`)
      }
      for (const id of metOnTurn(record, DEFAULT_SCENARIO)) met.add(id)
      for (const ev of record.events) {
        const def = DEFAULT_SCENARIO.events.find((e) => e.id === ev.eventId)!
        if (def.kind === 'opportunity' || def.effect.special === 'debrisStrike') continue
        const strength = def.baseSeverity - 1
        run.met1to3[strength] += 1
        tally.faced += 1
        tally.spent += ev.response?.cost ?? 0
        if (ev.response?.effect === 'halve') tally.halved += 1
        if (ev.effectiveSeverity === 0) {
          tally.stopped += 1
          run.blocked1to3[strength] += 1
          streak += 1
          best = Math.max(best, streak)
        } else {
          streak = 0
        }
      }
      state = after
    }
    if (best !== state.bestStreak) run.streakMismatches.push(`seed ${seed}: record ${best}, engine ${state.bestStreak}`)
    if (state.status === 'won') {
      run.wins += 1
      run.gradedWins.push(gradedScore(state.history.at(-1)!.maiScore, bonusOf(state)))
    }
    if (state.lossReason === 'insolvency') run.insolvencies += 1
    if (state.lossReason === 'maiCollapse') run.collapses += 1
    if (state.lossReason === 'belowThreshold') run.belowLine += 1
    run.finalScores.push(state.history.at(-1)!.maiScore)
    run.bestStreaks.push(state.bestStreak)
    run.met.push(met.size)
    run.faced.push(tally.faced)
    run.stopped.push(tally.stopped)
    run.halved.push(tally.halved)
    run.spentOnResponses.push(tally.spent)
    run.creditsLeft.push(state.credits)
    run.grades[gradeOf(state)] += 1
  }
  return run
}

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10
}
