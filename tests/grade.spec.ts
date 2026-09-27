// The score screen's grade and turn strip (v1.2 Round 5a, brief 7.2).
// Every threshold is read from the constants in src/engine/grade.ts and
// none is written here (principle 17), so moving one cannot leave a test
// asserting the old number.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { GRADE_THRESHOLDS, TURN_STRIP, gradeFor, gradeOf, stripColour, type Grade } from '../src/engine/grade'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { LAZY_SCRIPT, LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, TOP_INTEL_SCRIPT, WIN_SCRIPT, randomPolicy } from './scripts'

// The smallest step the MAI takes: it is shown to one decimal place.
const STEP = 0.1

describe('the grade', () => {
  it('grades a won campaign by final MAI, each threshold inclusive', () => {
    const won = (finalMai: number) => gradeFor({ status: 'won', finalMai })
    expect(won(GRADE_THRESHOLDS.S)).toBe('S')
    expect(won(GRADE_THRESHOLDS.S - STEP)).toBe('A')
    expect(won(GRADE_THRESHOLDS.A)).toBe('A')
    expect(won(GRADE_THRESHOLDS.A - STEP)).toBe('B')
    expect(won(GRADE_THRESHOLDS.B)).toBe('B')
    expect(won(GRADE_THRESHOLDS.B - STEP)).toBe('C')
    expect(won(DEFAULT_SCENARIO.winThreshold)).toBe('C')
  })

  it('orders its thresholds above the win line, so every grade can be earned', () => {
    expect(GRADE_THRESHOLDS.S).toBeGreaterThan(GRADE_THRESHOLDS.A)
    expect(GRADE_THRESHOLDS.A).toBeGreaterThan(GRADE_THRESHOLDS.B)
    expect(GRADE_THRESHOLDS.B, 'no won campaign could be graded C').toBeGreaterThan(DEFAULT_SCENARIO.winThreshold)
  })

  it('gives D to a campaign that survived every turn under the line, and F to one that ended early', () => {
    // A lost grade does not look at the MAI, so the highest one is used.
    const finalMai = GRADE_THRESHOLDS.S
    expect(gradeFor({ status: 'lost', lossReason: 'belowThreshold', finalMai })).toBe('D')
    expect(gradeFor({ status: 'lost', lossReason: 'maiCollapse', finalMai })).toBe('F')
    expect(gradeFor({ status: 'lost', lossReason: 'insolvency', finalMai })).toBe('F')
    expect(() => gradeFor({ status: 'playing', finalMai })).toThrow()
  })

  it('reads a finished game the same way, from its last turn', () => {
    // Real campaigns, one of each ending: a win, a loss at the line, a collapse.
    const cases: [number, Record<number, TurnActions>, 'won' | 'belowThreshold' | 'maiCollapse'][] = []
    for (let seed = 1; seed <= 40 && cases.length < 3; seed += 1) {
      for (const script of [WIN_SCRIPT, LOSS_SCRIPT]) {
        const end = play(seed, (s) => script[s.turn] ?? NO_OP)
        const how = end.status === 'won' ? 'won' : end.lossReason!
        if ((how === 'won' || how === 'belowThreshold' || how === 'maiCollapse') && !cases.some((c) => c[2] === how)) cases.push([seed, script, how])
      }
    }
    expect(cases.map((c) => c[2]).sort()).toEqual(['belowThreshold', 'maiCollapse', 'won'])
    for (const [seed, script] of cases) {
      const end = play(seed, (s) => script[s.turn] ?? NO_OP)
      const finalMai = end.history[end.history.length - 1].maiScore
      expect(gradeOf(end)).toBe(gradeFor({ status: end.status, lossReason: end.lossReason, finalMai }))
    }
  })
})

describe('the turn strip', () => {
  it('is green when MAI did not drop, amber for a small drop, magenta for a large one or a knockout', () => {
    const at = (drop: number, knockedOut = false) => stripColour({ maiBefore: 80, maiAfter: 80 - drop, knockedOut })
    expect(at(-STEP)).toBe('green')
    expect(at(0)).toBe('green')
    expect(at(STEP)).toBe('amber')
    expect(at(TURN_STRIP.magentaDrop - STEP)).toBe('amber')
    expect(at(TURN_STRIP.magentaDrop)).toBe('magenta')
    // A knockout is magenta whatever the MAI did.
    expect(at(-STEP, true)).toBe('magenta')
    expect(at(0, true)).toBe('magenta')
  })

  it('reads a drop of exactly the boundary as magenta from every MAI the engine can show', () => {
    // The MAI moves in tenths, and some pairs of tenths subtract to a hair
    // under the boundary in floating point (65.6 - 62.6 among them). Every
    // one-decimal MAI from 0 to 100 is tried, the drop at the boundary and
    // a tenth under it.
    const tenths = Math.round(TURN_STRIP.magentaDrop * 10)
    const wrong: string[] = []
    for (let before = tenths; before <= 1000; before += 1) {
      const at = (dropTenths: number) => stripColour({ maiBefore: before / 10, maiAfter: (before - dropTenths) / 10, knockedOut: false })
      if (at(tenths) !== 'magenta') wrong.push(`${before / 10} - ${(before - tenths) / 10} read ${at(tenths)}`)
      if (at(tenths - 1) !== 'amber') wrong.push(`${before / 10} - ${(before - tenths + 1) / 10} read ${at(tenths - 1)}`)
    }
    expect(wrong.join('\n')).toBe('')
  })
})

describe('the grade is calibrated (brief 7.2)', () => {
  // The sweep the thresholds were set from: every scripted line and the
  // seeded random line, 500 seeds on Standard. S should be roughly the top
  // 5 percent of wins and A roughly the next 20 percent.
  it(
    'gives S to about the top 5 percent of wins and A to about the next 20',
    () => {
      const lines: ((seed: number) => (s: GameState) => TurnActions)[] = [
        () => (s) => WIN_SCRIPT[s.turn] ?? NO_OP,
        () => (s) => MIXED_SCRIPT[s.turn] ?? NO_OP,
        () => (s) => TOP_INTEL_SCRIPT[s.turn] ?? NO_OP,
        () => (s) => LAZY_SCRIPT[s.turn] ?? NO_OP,
        () => (s) => LOSS_SCRIPT[s.turn] ?? NO_OP,
        (seed) => randomPolicy(seed),
      ]
      const grades: Grade[] = []
      for (const line of lines) {
        for (let seed = 1; seed <= 500; seed += 1) {
          const end = play(seed, line(seed))
          if (end.status === 'won') grades.push(gradeOf(end))
        }
      }
      expect(grades.length, 'too few wins to calibrate against').toBeGreaterThanOrEqual(100)
      const share = (g: Grade) => grades.filter((x) => x === g).length / grades.length
      expect(share('S'), 'S is not roughly the top 5 percent of wins').toBeGreaterThanOrEqual(0.03)
      expect(share('S')).toBeLessThanOrEqual(0.07)
      expect(share('A'), 'A is not roughly the next 20 percent of wins').toBeGreaterThanOrEqual(0.17)
      expect(share('A')).toBeLessThanOrEqual(0.23)
    },
    // Three thousand campaigns: about seven seconds on a laptop.
    60_000,
  )
})

function play(seed: number, policy: (s: GameState) => TurnActions): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing') state = resolveTurn(state, policy(state), turnRng(state.seed, state.turn))
  return state
}
