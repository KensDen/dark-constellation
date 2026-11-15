// THE SWEEP GATE (v1.3 brief 7; Round 0 does not merge without it).
// Principle 18, say which instrument: the instrument is the engine itself,
// run headless over 500 seeds a policy on STANDARD and EASY, through the
// five policies of tests/policies.ts (the brief's six rows: Prepared is
// also a row on EASY, and all five play both difficulties). The battery
// runs it on every pass and holds every policy to its target band, so a
// change to a number in brief 6.1 that moves a policy out of its band
// fails here rather than in a playtest. SWEEP=1 also prints the table the R0 report carries.
//
// SINCE v2.0 R2 THE GATE PLAYS THE 3D GAME'S RULES (GameState.watch 2;
// Ken's rulings of 14 November 2026): the answers are a pool, a defense
// hardens the asset it sits on, and the policy engine's holds are in every
// game. The lines are tests/policies.ts WATCH, FIXED and WATCH_REPORTED.
// The classic board's rules keep their own suites; their sweep is no
// longer gated.
//
// It carries the battery's second R0 guard as well: no seed and posture
// ever ends a turn insolvent when WORST CASE read 0 or more before it
// (brief 6.4), over all 500 seeds of every policy on both difficulties.

import { beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import type { Difficulty } from '../src/engine/types'
import { FIXED, FIXED_SAVING, WATCH, WATCH_REPORTED, type WatchLine } from './policies'
import { GRADES, SEEDS, median, playPolicy, type PolicyRun } from './sweep-run'

const pct = (n: number, of: number) => (100 * n) / of
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

// The bands (Ken, 14 November 2026: keep Round 1's, Novice around 40
// percent, Prepared around 80, Nothing at 0), in percent of games won,
// inclusive. MEASURED at the numbers the scenario carries (watch2: 13
// meter damage a point, 5 recovery a night, 3 answers, funding 6, a
// starting budget of 80, 2 points for a wrong call): Prepared 85.8,
// Novice 40.2, Nothing 0.0 on STANDARD; Prepared 92.0 and Novice 84.2 on
// EASY. The points either side: 12 damage with 4 recovery, Prepared 89.8
// and Novice 41.4; 13 with 4, 75.8 and 32.0; 12 with 3, 78.6 and 32.8.
// Funding under 6 is a cliff (at 4 the WORST CASE guard stops every line
// buying, and Prepared wins 45). A Prepared line that plays its orders
// well and a beginner are about 46 points apart at every setting
// measured, so the two bands cannot both be met to the point: this is
// the setting nearest both.
const TARGETS: { name: string; difficulty: Difficulty; label: string; min: number; max: number }[] = [
  { name: 'prepared', difficulty: 'standard', label: 'Prepared', min: 75, max: 90 },
  { name: 'prepared', difficulty: 'easy', label: 'Prepared on EASY', min: 90, max: 100 },
  { name: 'novice', difficulty: 'standard', label: 'Novice', min: 35, max: 50 },
  { name: 'novice', difficulty: 'easy', label: 'Novice on EASY', min: 70, max: 100 },
  { name: 'randomLegal', difficulty: 'standard', label: 'Random legal', min: 0, max: 30 },
  { name: 'nothing', difficulty: 'standard', label: 'Nothing', min: 0, max: 0 },
]

describe('the sweep gate (v1.3 brief 7; the 3D game\'s rules since v2.0 R2)', () => {
  const runs = new Map<string, PolicyRun>()
  const run = (name: string, difficulty: Difficulty) => runs.get(`${name}:${difficulty}`)!
  const rate = (name: string, difficulty: Difficulty) => pct(run(name, difficulty).wins, SEEDS)
  const ALL: readonly WatchLine[] = [...WATCH, ...FIXED, ...FIXED_SAVING, ...WATCH_REPORTED]

  beforeAll(() => {
    for (const difficulty of ['standard', 'easy'] as const) {
      for (const p of ALL) runs.set(`${p.name}:${difficulty}`, playPolicy(p.policy, difficulty, p.respond, SEEDS, p.timing ?? 0, 2))
    }
    if (!process.env.SWEEP) return
    const rows: string[] = []
    for (const difficulty of ['standard', 'easy'] as const) {
      const group = (lines: readonly WatchLine[], tag: string) => {
        for (const p of lines) {
          const r = run(p.name, difficulty)
          const grades = GRADES.map((g) => `${g} ${r.grades[g]}`).join(' ')
          rows.push(
            `| ${p.label}${tag} | ${difficulty.toUpperCase()} | ${pct(r.wins, SEEDS).toFixed(1)}% | ${r.insolvencies} | ${r.collapses} | ${r.belowLine} | ${median(r.finalScores)} | ${grades} | ${(100 * mean(r.stopped) / mean(r.faced)).toFixed(0)}% of ${mean(r.faced).toFixed(1)} (${mean(r.halved).toFixed(1)} halved) | ${mean(r.answers).toFixed(1)} | ${r.holds ? `${pct(r.holdsRight, r.holds).toFixed(0)}% of ${(r.holds / SEEDS).toFixed(1)}` : 'none'} | ${median(r.creditsLeft)} |`,
          )
        }
      }
      group(WATCH, '')
      group(FIXED, ', fixed line')
      group(FIXED_SAVING, ', fixed line with the Expert\'s answers')
      group(WATCH_REPORTED, ', reported')
    }
    process.stderr.write(
      [
        `\nSweep gate, ${SEEDS} seeds a line, scenario ${DEFAULT_SCENARIO.id}, the 3D game's rules:`,
        '| line | difficulty | win rate | insolvent | collapse | below line | median final score | grades | attacks stopped, of those faced a run | answers spent a run | holds called right, of those dealt a run | median CR left |',
        '|---|---|---|---|---|---|---|---|---|---|---|---|',
        ...rows,
        '',
      ].join('\n') + '\n',
    )
  }, 240_000)

  for (const t of TARGETS) {
    it(`holds ${t.label} to ${t.min} to ${t.max} percent wins`, () => {
      const r = rate(t.name, t.difficulty)
      expect(r, `${t.label} won ${r.toFixed(1)} percent`).toBeGreaterThanOrEqual(t.min)
      expect(r, `${t.label} won ${r.toFixed(1)} percent`).toBeLessThanOrEqual(t.max)
    })
  }

  it('makes a game you can lose: Nothing ends under 50 and never reaches the line, on STANDARD (v1.7 R1)', () => {
    const nothing = run('nothing', 'standard')
    expect(median(nothing.finalScores), 'Nothing: median final score').toBeLessThan(50)
    expect(Math.max(...nothing.finalScores), 'Nothing: best final score').toBeLessThan(DEFAULT_SCENARIO.winThreshold)
  })

  it('grades Novice on EASY B or A most often, not S (v1.7 R1)', () => {
    const { grades } = run('novice', 'easy')
    const usual = GRADES.reduce((best, g) => (grades[g] > grades[best] ? g : best), 'S' as (typeof GRADES)[number])
    expect(['A', 'B'], `Novice on EASY is graded ${usual} most often (${GRADES.map((g) => `${g} ${grades[g]}`).join(' ')})`).toContain(usual)
    expect(grades.S, 'S on EASY').toBeLessThan(grades.A + grades.B)
  })

  it('NO FIXED LINE WINS MORE OFTEN THAN PREPARED, on either difficulty (Ken, 14 November 2026: the thrifty line is a bug)', () => {
    // Under the R1 rules the first of these won all 500 seeds on STANDARD
    // against Prepared's 82 percent, and a drone a night with no defense
    // won 90: credits kept back bought an answer every night. With the
    // answers a pool, credits buy no more of them, and a line that fields
    // less than Prepared wins less.
    for (const difficulty of ['standard', 'easy'] as const) {
      const prepared = run('prepared', difficulty).wins
      for (const p of FIXED) {
        const wins = run(p.name, difficulty).wins
        expect(wins, `${difficulty}: ${p.label} won ${pct(wins, SEEDS).toFixed(1)} percent, Prepared ${pct(prepared, SEEDS).toFixed(1)}`).toBeLessThanOrEqual(prepared)
      }
      expect(run('buyEverything', difficulty).wins, `${difficulty}: Buy everything`).toBeLessThanOrEqual(prepared)
    }
    // And a fixed line that also answers as the Expert answers (saving the
    // pool for a move worth an answer) stays under the Expert.
    for (const difficulty of ['standard', 'easy'] as const) {
      const expert = run('expert', difficulty).wins
      for (const p of FIXED_SAVING) {
        const wins = run(p.name, difficulty).wins
        expect(wins, `${difficulty}: ${p.label} won ${pct(wins, SEEDS).toFixed(1)} percent, the Expert ${pct(expert, SEEDS).toFixed(1)}`).toBeLessThanOrEqual(expert)
      }
    }
    // Not vacuous: the thrifty lines play whole games and win some on EASY.
    expect(run('thrifty', 'easy').wins).toBeGreaterThan(0)
  })

  it('THE TIE-BREAK COUNTS: always overriding and never overriding each win clearly less than reading the evidence (Ken, 14 November 2026)', () => {
    const prepared = rate('prepared', 'standard')
    for (const name of ['alwaysOverride', 'neverOverride']) {
      const r = rate(name, 'standard')
      expect(prepared - r, `STANDARD: ${name} won ${r.toFixed(1)} percent, Prepared ${prepared.toFixed(1)}`).toBeGreaterThanOrEqual(5)
      // On EASY too, by whatever margin its ceiling leaves.
      expect(run(name, 'easy').wins).toBeLessThanOrEqual(run('prepared', 'easy').wins)
      expect(median(run(name, 'easy').finalScores)).toBeLessThan(median(run('prepared', 'easy').finalScores))
    }
    // The deal is as the rule says: 3 holds a game, each extreme wrong at
    // least once, and the line that reads right every time.
    const dealt = run('prepared', 'standard')
    expect(dealt.holds / SEEDS, 'holds a game').toBeCloseTo(DEFAULT_SCENARIO.watch2!.holds, 1)
    expect(dealt.holdsRight).toBe(dealt.holds)
    for (const name of ['alwaysOverride', 'neverOverride']) {
      const r = run(name, 'standard')
      expect(r.holdsRight).toBeLessThanOrEqual(r.holds - SEEDS)
      expect(r.holdsRight).toBeGreaterThanOrEqual(SEEDS)
    }
  })

  it('makes where a defense sits matter: Prepared placing at random wins clearly less (v2.0 R2)', () => {
    expect(rate('prepared', 'standard') - rate('randomPlace', 'standard'), `Prepared ${rate('prepared', 'standard').toFixed(1)}, at random ${rate('randomPlace', 'standard').toFixed(1)}`).toBeGreaterThanOrEqual(5)
  })

  it('keeps the answers worth taking and the orders worth making (v1.7 R1)', () => {
    for (const difficulty of ['standard', 'easy'] as const) {
      expect(run('respondOnly', difficulty).wins, `${difficulty}: answers alone`).toBeLessThan(run('novice', difficulty).wins)
    }
    expect(run('preparedRide', 'standard').wins).toBeLessThan(run('prepared', 'standard').wins)
    // The pool is spent: a line that answers uses every answer it has.
    expect(mean(run('prepared', 'standard').answers)).toBeGreaterThan(DEFAULT_SCENARIO.watch2!.answers - 0.5)
    expect(Math.max(...run('prepared', 'standard').answers)).toBeLessThanOrEqual(DEFAULT_SCENARIO.watch2!.answers)
  })

  it('has a beginner stop a fair share of the moves, and a prepared player more (v1.7 R1)', () => {
    const share = (name: string) => (100 * mean(run(name, 'standard').stopped)) / mean(run(name, 'standard').faced)
    expect(share('novice'), 'Novice: moves stopped, percent').toBeGreaterThanOrEqual(25)
    expect(share('novice')).toBeLessThanOrEqual(65)
    expect(share('prepared'), 'Prepared stops more than Novice').toBeGreaterThan(share('novice'))
    expect(share('nothing'), 'Nothing stops none').toBe(0)
  })

  it('keeps the timed tap a bonus: a perfect tap on every strike lifts Novice by 10 points at most, and no tap ever costs a game (v2.0 R1)', () => {
    // Ken's bound of 10 November 2026, kept on 14 November. The gated
    // lines take no tap; these are the same lines with the Assist rate,
    // and with a perfect tap, on every move.
    const lines: string[] = []
    for (const difficulty of ['standard', 'easy'] as const) {
      const none = run('novice', difficulty)
      const assist = run('noviceAssist', difficulty)
      const perfect = run('novicePerfect', difficulty)
      const prepared = run('prepared', difficulty)
      const preparedPerfect = run('preparedPerfect', difficulty)
      const r = (x: PolicyRun) => pct(x.wins, SEEDS)
      lines.push(
        `| ${difficulty.toUpperCase()} | ${r(none).toFixed(1)}% | ${r(assist).toFixed(1)}% | ${r(perfect).toFixed(1)}% | ${(r(perfect) - r(none)).toFixed(1)} | ${median(none.finalScores)} / ${median(assist.finalScores)} / ${median(perfect.finalScores)} | ${r(prepared).toFixed(1)}% | ${r(preparedPerfect).toFixed(1)}% | ${(r(preparedPerfect) - r(prepared)).toFixed(1)} |`,
      )
      expect(r(perfect) - r(none), `${difficulty}: a perfect tap on every strike lifts Novice by ${(r(perfect) - r(none)).toFixed(1)} points`).toBeLessThanOrEqual(10)
      expect(perfect.wins, `${difficulty}: perfect taps cost Novice games`).toBeGreaterThanOrEqual(none.wins)
      expect(assist.wins, `${difficulty}: the Assist rate cost Novice games`).toBeGreaterThanOrEqual(none.wins)
      expect(perfect.wins, `${difficulty}: the Assist rate is worth more than a perfect tap`).toBeGreaterThanOrEqual(assist.wins)
      expect(preparedPerfect.wins).toBeGreaterThanOrEqual(prepared.wins)
    }
    if (process.env.SWEEP)
      process.stderr.write(
        ['\nThe timed tap, win rates with and without it:', '| difficulty | Novice, no taps | Novice, Assist rate | Novice, perfect taps | lift at perfect, points | Novice median final score (none / Assist / perfect) | Prepared, no taps | Prepared, perfect taps | lift, points |', '|---|---|---|---|---|---|---|---|---|', ...lines, ''].join('\n') + '\n',
      )
  })

  it('never lets the prepared player go insolvent, on either difficulty', () => {
    for (const difficulty of ['standard', 'easy'] as const) expect(run('prepared', difficulty).insolvencies, difficulty).toBe(0)
  })

  it('keeps the defense streak the record shows, on every run of every line (brief 6.8)', () => {
    const wrong = [...runs].flatMap(([k, r]) => r.streakMismatches.map((m) => `${k} ${m}`))
    expect(wrong.slice(0, 10).join('\n'), `${wrong.length} runs disagree`).toBe('')
    expect([...runs].some(([, r]) => r.bestStreaks.some((b) => b >= 2)), 'no run reached a streak of 2').toBe(true)
  })

  it('GUARD R0 (b): no turn that read WORST CASE 0 or more closes insolvent, over every seed of every line (brief 6.4)', () => {
    let safe = 0
    const unsafe: string[] = []
    for (const [k, r] of runs) {
      safe += r.safeTurns
      unsafe.push(...r.unsafe.map((u) => `${k} ${u}`))
    }
    expect(safe).toBeGreaterThan(1000)
    expect([...runs.values()].some((r) => r.insolvencies > 0), 'no line ever went insolvent, so the guard proves nothing').toBe(true)
    expect(unsafe.join('\n'), 'WORST CASE read 0 or more and the turn closed insolvent').toBe('')
  })
})
