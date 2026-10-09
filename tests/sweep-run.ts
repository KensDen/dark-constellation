// The sweep's driver, shared by the gate (tests/sweep.spec.ts) and the
// one-step robustness sweep (tests/sweep-steps.spec.ts, v1.3 R0b): plays a
// policy over seeds 1 to 500 exactly as the gate always has and keeps what
// the table reports. A plain module, not a spec, so either file can import
// it without registering the other's tests.

import { DEFAULT_SCENARIO } from '../src/content'
import { gradeOf, type Grade } from '../src/engine/grade'
import { metOnTurn } from '../src/engine/learning'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
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
  // Runs whose best streak, recomputed from the record, is not the one the
  // engine kept (brief 6.8): the instrument and the rule must agree.
  streakMismatches: string[]
}

export function playPolicy(policy: Policy, difficulty: Difficulty, seeds = SEEDS): PolicyRun {
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
    streakMismatches: [],
  }
  for (let seed = 1; seed <= seeds; seed += 1) {
    let state: GameState = newGame(DEFAULT_SCENARIO, seed, difficulty)
    const met = new Set<string>()
    let streak = 0
    let best = 0
    while (state.status === 'playing') {
      const actions = policy(state)
      const read = worstCase(state, actions).value
      const after = resolveTurn(state, actions, turnRng(state.seed, state.turn))
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
        if (ev.effectiveSeverity === 0) {
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
    if (state.status === 'won') run.wins += 1
    if (state.lossReason === 'insolvency') run.insolvencies += 1
    if (state.lossReason === 'maiCollapse') run.collapses += 1
    if (state.lossReason === 'belowThreshold') run.belowLine += 1
    run.finalScores.push(state.history.at(-1)!.maiScore)
    run.bestStreaks.push(state.bestStreak)
    run.met.push(met.size)
    run.grades[gradeOf(state)] += 1
  }
  return run
}

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10
}
