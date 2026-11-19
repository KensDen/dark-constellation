// THE SWEEP GATE (v1.3 brief 7). Principle 18, say which instrument: the
// instrument is the engine itself, run headless over 500 seeds a line on
// STANDARD and EASY, through the lines of tests/policies.ts (WATCH, FIXED,
// FIXED_SAVING, FLEET, SATELLITES and WATCH_REPORTED). The battery runs it on every pass and
// holds each gated line to its band, so a change to a number that moves a
// line out of its band fails here rather than in a playtest. SWEEP=1 also
// prints the table the round's report carries.
//
// THE RULES IT PLAYS ARE THE GAME'S ONLY RULES (v2.0 R3; the 3D game's
// since R2, Ken's rulings of 14 and 15 November 2026): the answers are a
// pool, the newest defense's asset is the watch post, and the policy
// engine's holds are in every game.
//
// It carries the battery's second R0 guard as well: no seed ever ends a
// turn insolvent when WORST CASE read 0 or more before it (brief 6.4),
// over all 500 seeds of every line on both difficulties.

import { beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import type { Difficulty } from '../src/engine/types'
import { FIXED, FIXED_SAVING, FLEET, SATELLITES, WATCH, WATCH_REPORTED, type WatchLine } from './policies'
import { GRADES, SEEDS, median, playPolicy, type PolicyRun } from './sweep-run'

const pct = (n: number, of: number) => (100 * n) / of
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

// The bands, in percent of games won, inclusive. KEN'S RULINGS OF 15 AND 17
// NOVEMBER 2026: the bands stay where Round 2 put them, Prepared about 86
// percent and Novice about 40, the beginner of tests/policies.ts is the
// right picture of a beginner, and after each round's changes to the
// advice, the guard and the fleet the numbers are re-tuned to land there.
// MEASURED at the numbers the scenario carries since v2.0 R5 (15 meter
// damage a point, 7 recovery a night, 3 answers, funding 7, a starting
// budget of 90, a drone at 25 CR, 4 points for a wrong call): Prepared
// 86.2, Novice 39.4, Nothing 0.0 on STANDARD; Prepared 100.0 and Novice
// 79.2 on EASY; the Expert 98.4 and 100.0.
// src/content/scenarios/firstLight.ts has the settings measured beside it.
// UNDER R4's GUARD AND NUMBERS (80 to start, a drone at 15, 3.5 for a
// wrong call): Prepared 87.2, Novice 41.2, Prepared 100.0 and Novice 79.6
// on EASY. UNDER R3's (13, 5, 6 and 2): Prepared 85.8, Novice 40.2,
// Prepared 92.0 and Novice 84.2 on EASY. A Prepared line that plays its
// orders well and a beginner are about 45 points apart at every setting
// measured, so the two bands cannot both be met to the point: this is the
// whole-number setting nearest both.
const TARGETS: { name: string; difficulty: Difficulty; label: string; min: number; max: number }[] = [
  { name: 'prepared', difficulty: 'standard', label: 'Prepared', min: 75, max: 90 },
  { name: 'prepared', difficulty: 'easy', label: 'Prepared on EASY', min: 90, max: 100 },
  { name: 'novice', difficulty: 'standard', label: 'Novice', min: 35, max: 50 },
  { name: 'novice', difficulty: 'easy', label: 'Novice on EASY', min: 70, max: 100 },
  { name: 'randomLegal', difficulty: 'standard', label: 'Random legal', min: 0, max: 30 },
  { name: 'nothing', difficulty: 'standard', label: 'Nothing', min: 0, max: 0 },
]

describe('the sweep gate (v1.3 brief 7)', () => {
  const runs = new Map<string, PolicyRun>()
  const run = (name: string, difficulty: Difficulty) => runs.get(`${name}:${difficulty}`)!
  const rate = (name: string, difficulty: Difficulty) => pct(run(name, difficulty).wins, SEEDS)
  const ALL: readonly WatchLine[] = [...WATCH, ...FIXED, ...FIXED_SAVING, ...FLEET, ...SATELLITES, ...WATCH_REPORTED]

  beforeAll(() => {
    for (const difficulty of ['standard', 'easy'] as const) {
      for (const p of ALL) runs.set(`${p.name}:${difficulty}`, playPolicy(p.policy, difficulty, p.respond, SEEDS, p.timing ?? 0))
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
      group(FLEET, ', fleet line held under the Expert')
      group(SATELLITES, ', satellite line held under the Expert')
      group(WATCH_REPORTED, ', reported')
    }
    process.stderr.write(
      [
        `\nSweep gate, ${SEEDS} seeds a line, scenario ${DEFAULT_SCENARIO.id}:`,
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

  it('grades a beginner\'s win on EASY B most often, and gives S to no one there (Ken, 15 November 2026: a careful first game on EASY should not earn an S)', () => {
    const { grades } = run('novice', 'easy')
    const usual = GRADES.reduce((best, g) => (grades[g] > grades[best] ? g : best), 'S' as (typeof GRADES)[number])
    expect(usual, `Novice on EASY is graded ${usual} most often (${GRADES.map((g) => `${g} ${grades[g]}`).join(' ')})`).toBe('B')
    // No line takes S on EASY, the Expert and the lines that name every
    // signature included: S is STANDARD's.
    for (const [key, r] of runs) if (key.endsWith(':easy')) expect(r.grades.S, `${key}: S on EASY`).toBe(0)
    // And it is still earned on STANDARD, by the lines that play best.
    expect(run('expert', 'standard').grades.S).toBeGreaterThan(run('prepared', 'standard').grades.S)
    expect(run('prepared', 'standard').grades.S).toBeGreaterThan(0)
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

  it('THE FLEET IS NOT A BANK: Prepared with a drone a night as well wins less than every game, and no drone line wins more often than the Expert (Ken, 17 November 2026)', () => {
    // Under R4's guard, with a drone at 15 CR, the first of these won all
    // 500 on STANDARD. A drone is 25 CR now and the opening budget 90
    // (src/content/scenarios/firstLight.ts has the prices measured beside
    // it). MEASURED: a drone a night as well, 26.6 percent on STANDARD and
    // 77.8 on EASY (62.2 and 93.4 with the Expert's answers); with
    // tomorrow's likely bills kept in hand, 80.0 and 94.0, and with the
    // Expert's answers 92.6 and 99.0; Prepared 86.2 and 100.0, the Expert
    // 98.4 and 100.0. The same bank in satellites has a gate of its own,
    // below.
    for (const difficulty of ['standard', 'easy'] as const) {
      const expert = run('expert', difficulty).wins
      for (const p of FLEET) {
        const wins = run(p.name, difficulty).wins
        expect(wins, `${difficulty}: ${p.label} won ${pct(wins, SEEDS).toFixed(1)} percent, the Expert ${pct(expert, SEEDS).toFixed(1)}`).toBeLessThanOrEqual(expert)
      }
    }
    for (const p of FLEET) expect(run(p.name, 'standard').wins, `${p.label} won every game on STANDARD`).toBeLessThan(SEEDS)
    // Not vacuous: the lines order drones (they end with less in the bank
    // than Prepared does) and still win games.
    expect(median(run('dronesKept', 'standard').creditsLeft)).toBeLessThan(median(run('prepared', 'standard').creditsLeft))
    expect(run('dronesKept', 'standard').wins).toBeGreaterThan(SEEDS / 2)
  })

  it('THE SATELLITES STAY A STRATEGY: Prepared with a satellite a night, bills kept in hand, wins more often than Prepared and no more often than the Expert (Ken, 18 November 2026: held under the Expert, no re-tune)', () => {
    // MEASURED at R5's numbers, which R6 does not move (a satellite at 30
    // CR, 13 coverage, 2 nights out): 94.0 percent on STANDARD and 95.2 on
    // EASY, and with the Expert's answers 97.0 and 96.6; Prepared 86.2 and
    // 100.0, the Expert 98.4 and 100.0. It pays a player who keeps a
    // reserve, and it does not pay more than answering well does.
    for (const difficulty of ['standard', 'easy'] as const) {
      const expert = run('expert', difficulty).wins
      for (const p of SATELLITES) {
        const wins = run(p.name, difficulty).wins
        expect(wins, `${difficulty}: ${p.label} won ${pct(wins, SEEDS).toFixed(1)} percent, the Expert ${pct(expert, SEEDS).toFixed(1)}`).toBeLessThanOrEqual(expert)
      }
    }
    // Not vacuous: the line orders satellites (it ends with less in the
    // bank than Prepared does), and on STANDARD the fleet it buys is worth
    // having, which is what makes it a strategy and not a mistake.
    expect(median(run('satsKept', 'standard').creditsLeft)).toBeLessThan(median(run('prepared', 'standard').creditsLeft))
    expect(run('satsKept', 'standard').wins).toBeGreaterThan(run('prepared', 'standard').wins)
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
    expect(dealt.holds / SEEDS, 'holds a game').toBeCloseTo(DEFAULT_SCENARIO.holdCount, 1)
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

  it('THE NAME ON SIGHT PAYS, AND A GUESS PAYS LITTLE (Ken, 15 November 2026: the Dossier pays in play)', () => {
    // The game offers 4 names and the first wrong one ends naming for the
    // night, so a line that knows none of them names about a third of a
    // signature a night. Knowing them is worth real points to every kind of
    // player. Guessing is held to a gain of 5 points at most. MEASURED
    // (v2.0 R5): it moved Prepared by +3.8 on STANDARD and 0.0 on EASY,
    // where it wins every game already, and the Novice by -0.2 and +1.2
    // (in R4: +4.0 and 0.0, +1.8 and +1.6; in R3: +3.6 and +1.2, -6.2 and
    // -1.8). A third of a signature a night is too little
    // knowledge to move a line one way: what it changes is which piece a
    // line happens to order, and over 500 seeds that reads as a few points
    // either side.
    const lines: string[] = []
    for (const difficulty of ['standard', 'easy'] as const) {
      for (const [base, sight, guess] of [
        ['prepared', 'preparedSight', 'preparedGuess'],
        ['novice', 'noviceSight', 'noviceGuess'],
      ] as const) {
        const [b, s, g] = [rate(base, difficulty), rate(sight, difficulty), rate(guess, difficulty)]
        lines.push(`| ${base} | ${difficulty.toUpperCase()} | ${b.toFixed(1)}% | ${s.toFixed(1)}% | ${(s - b).toFixed(1)} | ${g.toFixed(1)}% | ${(g - b).toFixed(1)} |`)
        // More, or as many where the line already wins every game (Prepared
        // on EASY has since v2.0 R4): nothing is above all 500.
        if (b < 100) expect(s, `${difficulty}: ${base} who names every signature wins ${s.toFixed(1)} percent, against ${b.toFixed(1)}`).toBeGreaterThan(b)
        else expect(s, `${difficulty}: ${base} who names every signature wins ${s.toFixed(1)} percent, against ${b.toFixed(1)}`).toBe(100)
        expect(g - b, `${difficulty}: ${base} guessing at signatures gains ${(g - b).toFixed(1)} points`).toBeLessThanOrEqual(5)
      }
    }
    // The Expert who also names every signature is still the Expert.
    expect(rate('expertSight', 'standard')).toBeGreaterThanOrEqual(rate('expert', 'standard'))
    if (process.env.SWEEP)
      process.stderr.write(['\nThe name on sight, win rates:', '| line | difficulty | scans only | names every signature | lift, points | guesses until wrong (right 1 in 4) | lift, points |', '|---|---|---|---|---|---|---|', ...lines, ''].join('\n') + '\n')
  })

  it('keeps the answers worth taking and the orders worth making (v1.7 R1)', () => {
    for (const difficulty of ['standard', 'easy'] as const) {
      expect(run('respondOnly', difficulty).wins, `${difficulty}: answers alone`).toBeLessThan(run('novice', difficulty).wins)
    }
    expect(run('preparedRide', 'standard').wins).toBeLessThan(run('prepared', 'standard').wins)
    // The pool is spent: a line that answers uses every answer it has.
    expect(mean(run('prepared', 'standard').answers)).toBeGreaterThan(DEFAULT_SCENARIO.answers - 0.5)
    expect(Math.max(...run('prepared', 'standard').answers)).toBeLessThanOrEqual(DEFAULT_SCENARIO.answers)
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
