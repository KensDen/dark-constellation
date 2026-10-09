// THE SWEEP GATE (v1.3 brief 7; Round 0 does not merge without it).
// Principle 18, say which instrument: the instrument is the engine itself,
// run headless over 500 seeds a policy on STANDARD and EASY, through the
// five policies of tests/policies.ts (the brief's six rows: Prepared is
// also a row on EASY, and all five play both difficulties). The battery
// runs it on every pass and holds every policy to its target band, so a
// change to a number in brief 6.1 that moves a policy out of its band
// fails here rather than in a playtest. SWEEP=1 also prints the table the R0 report carries.
//
// It carries the battery's second R0 guard as well: no seed and posture
// ever ends a turn insolvent when WORST CASE read 0 or more before it
// (brief 6.4), over all 500 seeds of every policy on both difficulties.

import { beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { gradeOf, type Grade } from '../src/engine/grade'
import { metOnTurn } from '../src/engine/learning'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { Difficulty, GameState } from '../src/engine/types'
import { worstCase } from '../src/engine/worstCase'
import { POLICIES, REPORTED, type Policy, type PolicyName } from './policies'

const SEEDS = 500
const GRADES: Grade[] = ['S', 'A', 'B', 'C', 'D', 'F']

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
const pct = (n: number, of: number) => (100 * n) / of

// The brief's targets, by policy and difficulty: win rate in percent,
// inclusive, and whether insolvency must be zero. Only the rows the brief
// sets are gated; the rest are reported.
const TARGETS: { name: PolicyName; difficulty: Difficulty; label: string; min: number; max: number }[] = [
  { name: 'buyEverything', difficulty: 'standard', label: 'Buy everything', min: 0, max: 15 },
  { name: 'prepared', difficulty: 'standard', label: 'Prepared', min: 65, max: 85 },
  { name: 'prepared', difficulty: 'easy', label: 'Prepared on EASY', min: 90, max: 100 },
  { name: 'novice', difficulty: 'standard', label: 'Novice', min: 35, max: 60 },
  { name: 'novice', difficulty: 'easy', label: 'Novice on EASY', min: 70, max: 100 },
  { name: 'randomLegal', difficulty: 'standard', label: 'Random legal', min: 0, max: 30 },
  { name: 'nothing', difficulty: 'standard', label: 'Nothing', min: 0, max: 10 },
]

describe('the sweep gate (v1.3 brief 7)', () => {
  const runs = new Map<string, PolicyRun>()
  const key = (name: PolicyName, difficulty: Difficulty) => `${name}:${difficulty}`

  // The lines the sweep reports beside the gated ones (tests/policies.ts
  // REPORTED): played and printed, held to no target band.
  const reported = new Map<string, PolicyRun>()

  beforeAll(() => {
    for (const difficulty of ['standard', 'easy'] as const) {
      for (const p of POLICIES) runs.set(key(p.name, difficulty), playPolicy(p.policy, difficulty))
      for (const p of REPORTED) reported.set(`${p.name}:${difficulty}`, playPolicy(p.policy, difficulty))
    }
    if (!process.env.SWEEP) return
    const rows: string[] = []
    const share = (r: PolicyRun, n: number) => `${pct(r.bestStreaks.filter((b) => b >= n).length, SEEDS).toFixed(1)}%`
    const blocks = (r: PolicyRun) =>
      [0, 1, 2].map((i) => `${(r.blocked1to3[i] / SEEDS).toFixed(2)} of ${(r.met1to3[i] / SEEDS).toFixed(2)}`).join(' / ')
    for (const difficulty of ['standard', 'easy'] as const) {
      const lines = [
        ...POLICIES.map((p) => ({ label: p.label, r: runs.get(key(p.name, difficulty))! })),
        ...REPORTED.map((p) => ({ label: `${p.label}, reported`, r: reported.get(`${p.name}:${difficulty}`)! })),
      ]
      for (const { label, r } of lines) {
        const grades = GRADES.map((g) => `${g} ${r.grades[g]}`).join(' ')
        rows.push(
          `| ${label} | ${difficulty.toUpperCase()} | ${pct(r.wins, SEEDS).toFixed(1)}% | ${r.insolvencies} | ${r.collapses} | ${r.belowLine} | ${median(r.finalScores)} | ${median(r.bestStreaks)} | ${share(r, 2)} | ${share(r, 3)} | ${blocks(r)} | ${median(r.met)} | ${grades} |`,
        )
      }
    }
    process.stderr.write(
      [
        `\nSweep gate, ${SEEDS} seeds a policy, scenario ${DEFAULT_SCENARIO.id}:`,
        '| policy | difficulty | win rate | insolvent | collapse | below line | median final score | median best streak | best streak 2+ | best streak 3+ | blocked a run of met, strength 1 / 2 / 3 | median threats met | grades |',
        '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
        ...rows,
        '',
      ].join('\n') + '\n',
    )
  }, 120_000)

  for (const t of TARGETS) {
    it(`holds ${t.label} to ${t.min} to ${t.max} percent wins`, () => {
      const r = runs.get(key(t.name, t.difficulty))!
      const rate = pct(r.wins, SEEDS)
      expect(rate, `${t.label} won ${rate.toFixed(1)} percent`).toBeGreaterThanOrEqual(t.min)
      expect(rate, `${t.label} won ${rate.toFixed(1)} percent`).toBeLessThanOrEqual(t.max)
    })
  }

  it('never lets the prepared player go insolvent, on either difficulty', () => {
    for (const difficulty of ['standard', 'easy'] as const) expect(runs.get(key('prepared', difficulty))!.insolvencies, difficulty).toBe(0)
  })

  it('keeps the defense streak the record shows, on every run of every line (brief 6.8)', () => {
    // The streak the sweep reports is recomputed from each turn's events
    // (threats only; the debris call and opportunities neither extend nor
    // break it) and must equal the one the engine keeps in state.
    const all = [...runs, ...reported]
    const wrong = all.flatMap(([k, r]) => r.streakMismatches.map((m) => `${k} ${m}`))
    expect(wrong.slice(0, 10).join('\n'), `${wrong.length} runs disagree`).toBe('')
    // Not vacuous: some run reaches a streak of 3, so a counter stuck at 0
    // or 1 would disagree somewhere.
    expect(all.some(([, r]) => r.bestStreaks.some((b) => b >= 3)), 'no run reached a streak of 3').toBe(true)
  })

  it('GUARD R0 (b): no turn that read WORST CASE 0 or more closes insolvent, over every seed of every policy (brief 6.4)', () => {
    let safe = 0
    const unsafe: string[] = []
    for (const [k, r] of [...runs, ...reported]) {
      safe += r.safeTurns
      unsafe.push(...r.unsafe.map((u) => `${k} ${u}`))
    }
    // Not vacuous: thousands of turns read 0 or more, and some policy does
    // go insolvent, so the guard is looking where insolvency happens.
    expect(safe).toBeGreaterThan(1000)
    expect([...runs.values()].some((r) => r.insolvencies > 0), 'no policy ever went insolvent, so the guard proves nothing').toBe(true)
    expect(unsafe.join('\n'), 'WORST CASE read 0 or more and the turn closed insolvent').toBe('')
  })
})
