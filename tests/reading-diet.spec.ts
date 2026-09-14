// Reading diet battery (brief v0.5 section 5, Round 3). The copy budget is
// a design constraint with a number on it, so it is measured rather than
// trusted: the headline stays inside eight words, the brief phase stays
// inside sixty words before the player's first input, and the verdict line
// stays one line. Every string is derived from the deck, so a content
// change that would blow the budget fails here.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { DIFFICULTIES, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { Difficulty, GameState, TurnActions } from '../src/engine/types'
import {
  CHROME_WORD_BUDGET,
  FIRST_INPUT_WORD_BUDGET,
  HEADLINE_WORD_MAX,
  briefCopy,
  chromeCopy,
  chromeWords,
  countWords,
  firstInputCopy,
  firstInputWords,
} from '../src/ui/brief'
import { VERDICT_WORD_MAX, verdictFor } from '../src/ui/verdict'
import { LAZY_SCRIPT, LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

const SEEDS = 12
const DIFFS: Difficulty[] = ['easy', 'standard', 'expert']
// Four lines of play, so the copy is measured against the deck as a lazy
// player meets it as well as a prepared one.
const LINES: [string, Record<number, TurnActions>][] = [
  ['prepared', WIN_SCRIPT],
  ['mixed', MIXED_SCRIPT],
  ['lazy', LAZY_SCRIPT],
  ['passive', LOSS_SCRIPT],
]

function* playTurns(seed: number, script: Record<number, TurnActions>, difficulty: Difficulty = 'standard') {
  let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
  while (state.status === 'playing') {
    const next = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    yield { before: state, after: next }
    state = next
  }
}

// Every intel level a player can reach, so the brief is measured at the
// fidelity that produces the longest copy, not just the default.
function statesAtEveryIntel(seed: number): GameState[] {
  const out: GameState[] = []
  for (let level = 0; level <= 3; level += 1) {
    let state = newGame(DEFAULT_SCENARIO, seed)
    for (let i = 0; i < level; i += 1) {
      state = resolveTurn(state, { ...NO_OP, buyIntelLevel: true }, turnRng(state.seed, state.turn))
    }
    out.push(state)
  }
  return out
}

describe('reading diet: the intel brief', () => {
  it('keeps the headline inside its word budget on every turn, intel level and difficulty', () => {
    let checked = 0
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { before } of playTurns(seed, script, difficulty)) {
            const copy = briefCopy(before)
            checked += 1
            expect(
              countWords(copy.headline),
              `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}: "${copy.headline}"`,
            ).toBeLessThanOrEqual(HEADLINE_WORD_MAX)
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(SEEDS * DIFFS.length * LINES.length * 4)
  })

  it('keeps every intel level inside the headline budget, including the named-event level', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const state of statesAtEveryIntel(seed)) {
        const copy = briefCopy(state)
        expect(countWords(copy.headline), `${copy.headline}`).toBeLessThanOrEqual(HEADLINE_WORD_MAX)
        expect(copy.headline.length).toBeGreaterThan(0)
        expect(copy.vector.length).toBeGreaterThan(0)
      }
    }
  })

  it('stays inside sixty words before the first input on every turn of a campaign', () => {
    const overruns: string[] = []
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { before } of playTurns(seed, script, difficulty)) {
            const words = firstInputWords(before, DIFFICULTIES[difficulty].label)
            if (words > FIRST_INPUT_WORD_BUDGET) {
              overruns.push(
                `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}: ${words} words\n  ${firstInputCopy(
                  before,
                  DIFFICULTIES[difficulty].label,
                ).join(' / ')}`,
              )
            }
          }
        }
      }
    }
    expect(overruns.join('\n')).toBe('')
  })

  it('stays inside the budget at top intel, which produces the longest copy', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const state of statesAtEveryIntel(seed)) {
        expect(
          firstInputWords(state, DIFFICULTIES.standard.label),
          `intel ${state.intelLevel}, seed ${seed}`,
        ).toBeLessThanOrEqual(FIRST_INPUT_WORD_BUDGET)
      }
    }
  })

  it('bounds the interface chrome that the reading budget excludes', () => {
    // The budget counts the brief's reading load, not navigation. The
    // excluded words are still counted here, so the exclusion cannot grow
    // into a loophole.
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const { before } of playTurns(seed, WIN_SCRIPT)) {
        expect(chromeWords(before), chromeCopy(before).join(' / ')).toBeLessThanOrEqual(CHROME_WORD_BUDGET)
      }
    }
  })

  it('keeps the brief and its chrome together under a hundred words on screen', () => {
    // The two budgets added: a sanity ceiling on everything the brief
    // phase puts in front of the player, badges aside.
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const { before } of playTurns(seed, WIN_SCRIPT)) {
        const total = firstInputWords(before, DIFFICULTIES.standard.label) + chromeWords(before)
        expect(total, `turn ${before.turn}, seed ${seed}`).toBeLessThanOrEqual(
          FIRST_INPUT_WORD_BUDGET + CHROME_WORD_BUDGET,
        )
      }
    }
  })

  it('never emits an em dash in generated copy', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const { before, after } of playTurns(seed, WIN_SCRIPT)) {
        const copy = briefCopy(before)
        const record = after.history[after.history.length - 1]
        for (const line of [copy.headline, copy.vector, copy.tag ?? '', verdictFor(record, DEFAULT_SCENARIO)]) {
          expect(line).not.toContain('\u{2014}')
        }
      }
    }
  })
})

describe('reading diet: the damage report verdict', () => {
  it('is one line inside its word cap for every turn of every line of play', () => {
    let checked = 0
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { after } of playTurns(seed, script, difficulty)) {
            const record = after.history[after.history.length - 1]
            const verdict = verdictFor(record, DEFAULT_SCENARIO)
            checked += 1
            expect(verdict).not.toContain('\n')
            expect(
              countWords(verdict),
              `${name}, turn ${record.turn}: "${verdict}"`,
            ).toBeLessThanOrEqual(VERDICT_WORD_MAX)
            expect(verdict.endsWith('.')).toBe(true)
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(SEEDS * DIFFS.length * LINES.length * 4)
  })

  it('names the heaviest landed event when anything lands, and says so plainly when nothing does', () => {
    let sawLanded = false
    let sawHeld = false
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const { after } of playTurns(seed, WIN_SCRIPT)) {
        const record = after.history[after.history.length - 1]
        const verdict = verdictFor(record, DEFAULT_SCENARIO)
        const threats = record.events.filter((ev) => {
          const def = DEFAULT_SCENARIO.events.find((e) => e.id === ev.eventId)
          return (def?.kind ?? 'threat') === 'threat'
        })
        const landed = threats.filter((ev) => ev.effectiveSeverity > 0)
        if (landed.length > 0) {
          sawLanded = true
          const worst = landed.reduce((a, b) => (b.effectiveSeverity > a.effectiveSeverity ? b : a))
          expect(verdict, `turn ${record.turn}`).toContain(worst.name.split(' (')[0])
        } else if (threats.length > 0) {
          sawHeld = true
          expect(verdict.toLowerCase()).toMatch(/held|nothing landed/)
        }
      }
    }
    expect(sawLanded, 'no seed produced a landed event').toBe(true)
    expect(sawHeld, 'no seed produced a fully held turn').toBe(true)
  })
})
