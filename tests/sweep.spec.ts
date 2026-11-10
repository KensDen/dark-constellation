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
import type { Difficulty } from '../src/engine/types'
import { bestOrders } from './fixed-orders'
import { POLICIES, REPORTED, type PolicyName } from './policies'
import { GRADES, SEEDS, median, playPolicy, type PolicyRun } from './sweep-run'

const pct = (n: number, of: number) => (100 * n) / of
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

// The brief's targets, by policy and difficulty: win rate in percent,
// inclusive, and whether insolvency must be zero. Only the rows the brief
// sets are gated; the rest are reported.
//
// Buy everything has no band of its own since v1.4 (Ken, 24 October 2026):
// under one new defense a night it can no longer order every defense and
// die of the upkeep, so its row is the priciest defense it can afford each
// night, and its target is to win no more often than Prepared on the same
// difficulty (the test after these). v1.4.0 reported it with no target, at
// 99.6 percent; v1.5 R1's retainer recovery of 4 gates it again.
// v1.7 R1 (Ken's rulings of 9 November 2026: a decision in the night, and
// a game you can lose): each line now answers in the night as well
// (tests/policies.ts, the responders), and the bands are that round's.
// Prepared 70 to 85 on STANDARD; Novice 40 to 60 there, and most games on
// EASY; Nothing never wins. The tests after these hold the round's other
// targets: the medians, the usual grade on EASY, the budget Prepared ends
// on, the share of moves a beginner stops, and that orders still matter.
const TARGETS: { name: PolicyName; difficulty: Difficulty; label: string; min: number; max: number }[] = [
  { name: 'prepared', difficulty: 'standard', label: 'Prepared', min: 70, max: 85 },
  { name: 'prepared', difficulty: 'easy', label: 'Prepared on EASY', min: 90, max: 100 },
  { name: 'novice', difficulty: 'standard', label: 'Novice', min: 40, max: 60 },
  { name: 'novice', difficulty: 'easy', label: 'Novice on EASY', min: 70, max: 100 },
  { name: 'randomLegal', difficulty: 'standard', label: 'Random legal', min: 0, max: 30 },
  { name: 'nothing', difficulty: 'standard', label: 'Nothing', min: 0, max: 0 },
]

describe('the sweep gate (v1.3 brief 7)', () => {
  const runs = new Map<string, PolicyRun>()
  const key = (name: PolicyName, difficulty: Difficulty) => `${name}:${difficulty}`

  // The lines the sweep reports beside the gated ones (tests/policies.ts
  // REPORTED): played and printed, held to no target band.
  const reported = new Map<string, PolicyRun>()

  beforeAll(() => {
    for (const difficulty of ['standard', 'easy'] as const) {
      for (const p of POLICIES) runs.set(key(p.name, difficulty), playPolicy(p.policy, difficulty, p.respond))
      for (const p of REPORTED) reported.set(`${p.name}:${difficulty}`, playPolicy(p.policy, difficulty, p.respond, SEEDS, p.timing ?? 0))
    }
    if (!process.env.SWEEP) return
    const rows: string[] = []
    const share = (r: PolicyRun, n: number) => `${pct(r.bestStreaks.filter((b) => b >= n).length, SEEDS).toFixed(1)}%`
    const blocks = (r: PolicyRun) =>
      [0, 1, 2].map((i) => `${(r.blocked1to3[i] / SEEDS).toFixed(2)} of ${(r.met1to3[i] / SEEDS).toFixed(2)}`).join(' / ')
    for (const difficulty of ['standard', 'easy'] as const) {
      const lines = [
        ...POLICIES.map((p) => ({ label: p.reported ? `${p.label}, reported` : p.label, r: runs.get(key(p.name, difficulty))! })),
        ...REPORTED.map((p) => ({ label: `${p.label}, reported`, r: reported.get(`${p.name}:${difficulty}`)! })),
      ]
      for (const { label, r } of lines) {
        const grades = GRADES.map((g) => `${g} ${r.grades[g]}`).join(' ')
        rows.push(
          `| ${label} | ${difficulty.toUpperCase()} | ${pct(r.wins, SEEDS).toFixed(1)}% | ${r.insolvencies} | ${r.collapses} | ${r.belowLine} | ${median(r.finalScores)} | ${median(r.bestStreaks)} | ${share(r, 2)} | ${share(r, 3)} | ${blocks(r)} | ${median(r.met)} | ${grades} | ${(100 * mean(r.stopped) / mean(r.faced)).toFixed(0)}% of ${mean(r.faced).toFixed(1)} (${mean(r.halved).toFixed(1)} halved) | ${median(r.spentOnResponses)} | ${median(r.creditsLeft)} (${pct(r.creditsLeft.filter((c) => c < 40).length, SEEDS).toFixed(0)}% under 40) |`,
        )
      }
    }
    process.stderr.write(
      [
        `\nSweep gate, ${SEEDS} seeds a policy, scenario ${DEFAULT_SCENARIO.id}:`,
        '| policy | difficulty | win rate | insolvent | collapse | below line | median final score | median best streak | best streak 2+ | best streak 3+ | threats blocked a run, of those played, strength 1 / 2 / 3 | median distinct threats met | grades | attacks stopped, of those faced a run | median CR on responses | median CR left |',
        '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
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

  it('makes a game you can lose: Nothing ends under 50 and Novice within 5 of the line, on STANDARD (v1.7 R1)', () => {
    const nothing = runs.get(key('nothing', 'standard'))!
    expect(median(nothing.finalScores), 'Nothing: median final score').toBeLessThan(50)
    // Not near it either: no run of Nothing's reaches the line.
    expect(Math.max(...nothing.finalScores), 'Nothing: best final score').toBeLessThan(DEFAULT_SCENARIO.winThreshold)
    const novice = median(runs.get(key('novice', 'standard'))!.finalScores)
    expect(Math.abs(novice - DEFAULT_SCENARIO.winThreshold), `Novice: median final score ${novice}`).toBeLessThanOrEqual(5)
  })

  it('grades Novice on EASY B or A most often, not S (v1.7 R1)', () => {
    const { grades } = runs.get(key('novice', 'easy'))!
    const usual = GRADES.reduce((best, g) => (grades[g] > grades[best] ? g : best), 'S' as (typeof GRADES)[number])
    expect(['A', 'B'], `Novice on EASY is graded ${usual} most often (${GRADES.map((g) => `${g} ${grades[g]}`).join(' ')})`).toContain(usual)
    expect(grades.S, 'S on EASY').toBeLessThan(grades.A + grades.B)
  })

  it('leaves Prepared under 40 CR at the end of most games (v1.7 R1)', () => {
    for (const difficulty of ['standard', 'easy'] as const) {
      const left = runs.get(key('prepared', difficulty))!.creditsLeft
      expect(pct(left.filter((c) => c < 40).length, SEEDS), `${difficulty}: games Prepared ends under 40 CR, percent`).toBeGreaterThan(50)
    }
  })

  it('has a beginner stop about half the moves, and a prepared player more (v1.7 R1)', () => {
    const share = (name: PolicyName) => {
      const r = runs.get(key(name, 'standard'))!
      return (100 * mean(r.stopped)) / mean(r.faced)
    }
    expect(share('novice'), 'Novice: moves stopped, percent').toBeGreaterThanOrEqual(35)
    expect(share('novice')).toBeLessThanOrEqual(65)
    expect(share('prepared'), 'Prepared stops more than Novice').toBeGreaterThan(share('novice'))
    expect(share('nothing'), 'Nothing stops none').toBe(0)
  })

  it('keeps orders worth making: answering every move with no orders wins less than Novice (v1.7 R1)', () => {
    // One response a night (src/engine/rules.ts RESPONSES_PER_NIGHT): with
    // a response for every move this line won 89 percent on STANDARD,
    // above Prepared.
    for (const difficulty of ['standard', 'easy'] as const) {
      const only = reported.get(`respondOnly:${difficulty}`)!.wins
      const novice = runs.get(key('novice', difficulty))!.wins
      expect(only, `${difficulty}: answers alone won ${pct(only, SEEDS).toFixed(1)} percent, Novice ${pct(novice, SEEDS).toFixed(1)}`).toBeLessThan(novice)
    }
    // And the answers are worth taking: Prepared's orders with every move
    // ridden out win less than Prepared.
    expect(reported.get('preparedRide:standard')!.wins).toBeLessThan(runs.get(key('prepared', 'standard'))!.wins)
  })

  it('holds Buy everything to no more wins than Prepared, on each difficulty (v1.5 R1)', () => {
    for (const difficulty of ['standard', 'easy'] as const) {
      const spend = runs.get(key('buyEverything', difficulty))!.wins
      const prepared = runs.get(key('prepared', difficulty))!.wins
      expect(spend, `${difficulty}: Buy everything won ${pct(spend, SEEDS).toFixed(1)} percent, Prepared ${pct(prepared, SEEDS).toFixed(1)}`).toBeLessThanOrEqual(prepared)
    }
  })

  it('holds the prepared script to no more wins than Prepared, on each difficulty (v1.6 R1)', () => {
    // Ken's ruling of 26 October 2026: one scripted order of defenses can
    // no longer answer every night. The script won all 500 seeds on
    // STANDARD through v1.5, above Prepared's 79.6; each seed now plays
    // its own order of the campaign (campaignFor, src/engine/campaign.ts).
    for (const difficulty of ['standard', 'easy'] as const) {
      const script = reported.get(`preparedScript:${difficulty}`)!.wins
      const prepared = runs.get(key('prepared', difficulty))!.wins
      expect(script, `${difficulty}: the prepared script won ${pct(script, SEEDS).toFixed(1)} percent, Prepared ${pct(prepared, SEEDS).toFixed(1)}`).toBeLessThanOrEqual(prepared)
    }
    // Not vacuous: on STANDARD the script loses some seeds. (Since v1.7 R1
    // it rides every move out and loses them all there.)
    expect(reported.get('preparedScript:standard')!.wins, 'the prepared script still wins every seed').toBeLessThan(SEEDS)
  })

  // THE FIXED-ORDER SEARCH, on request (v1.6 R2): the best one-a-turn
  // orders of the eight defenses that matter, reported beside Prepared.
  // Ken's ruling of 27 October 2026 asked for none to win more often than
  // Prepared on STANDARD; no campaign measured that keeps the targets
  // above does it (brief 6.1), so this reports and does not gate. About 80
  // seconds.
  it.skipIf(!process.env.SWEEP_ORDERS)('reports the best fixed one-a-turn orders beside Prepared (v1.6 R2)', () => {
    const best = bestOrders()
    const prepared = runs.get(key('prepared', 'standard'))!.wins
    process.stderr.write(
      [`\nBest fixed one-a-turn orders on STANDARD (60 seeds screened, ${SEEDS} confirmed), Prepared ${pct(prepared, SEEDS).toFixed(1)}%:`, ...best.map(([order, wins]) => `${pct(wins, SEEDS).toFixed(1)}% ${order}`), ''].join('\n') + '\n',
    )
    // Not vacuous: the search found and played orders.
    expect(best.length).toBe(8)
  }, 600_000)

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
    // Not vacuous: some run reaches a streak of 2, so a counter stuck at 0
    // or 1 would disagree somewhere. The bar was 3 until v1.4 (Ken, 24
    // October 2026): under one new defense a night no plan reaches 3 in
    // FIRST LIGHT (turns 1 and 2 always land, and the later slots need more
    // defenses than the nights allow), which a search of every
    // one-defense-a-night plan, budget lifted, confirmed (v1.4 report).
    expect(all.some(([, r]) => r.bestStreaks.some((b) => b >= 2)), 'no run reached a streak of 2').toBe(true)
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
