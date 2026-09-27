// Balance baseline sweep, not a pass/fail gate. Runs only when SWEEP=1
// (npm run sweep): plays the prepared, lazy, and passive lines across a
// seed range and prints win rates, loss reasons, and mean final MAI.
// R3 records the pre-tuning baseline; the dynamics round tunes against it.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { LAZY_SCRIPT, LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

const SEEDS = 300

function playGame(seed: number, script: Record<number, TurnActions>): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed)
  while (state.status === 'playing') {
    const actions = script[state.turn] ?? NO_OP
    state = resolveTurn(state, actions, turnRng(state.seed, state.turn))
  }
  return state
}

describe.runIf(process.env.SWEEP)('balance baseline sweep', () => {
  it(`plays each line across ${SEEDS} seeds and reports the baseline`, () => {
    const lines = [
      ['prepared', WIN_SCRIPT],
      ['mixed', MIXED_SCRIPT],
      ['lazy', LAZY_SCRIPT],
      ['passive', LOSS_SCRIPT],
    ] as const
    const rows: string[] = []
    for (const [name, script] of lines) {
      let wins = 0
      let maiSum = 0
      const lossReasons: Record<string, number> = {}
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const end = playGame(seed, script)
        const finalMai = end.history[end.history.length - 1]?.maiScore ?? 0
        maiSum += finalMai
        if (end.status === 'won') wins += 1
        else lossReasons[end.lossReason ?? 'unknown'] = (lossReasons[end.lossReason ?? 'unknown'] ?? 0) + 1
      }
      const reasons =
        Object.entries(lossReasons)
          .sort((x, y) => y[1] - x[1])
          .map(([r, n]) => `${r} ${n}`)
          .join(', ') || 'none'
      rows.push(
        `| ${name} | ${((wins / SEEDS) * 100).toFixed(1)}% | ${(maiSum / SEEDS).toFixed(1)} | ${reasons} |`,
      )
      expect(wins + Object.values(lossReasons).reduce((s, n) => s + n, 0)).toBe(SEEDS)
    }
    // stderr so the table survives vitest's stdout interception in
    // non-interactive runs.
    process.stderr.write(
      [
        `\nBaseline sweep, ${SEEDS} seeds per line, scenario ${DEFAULT_SCENARIO.id}:`,
        '| line | win rate | mean final MAI | loss reasons |',
        '|------|----------|----------------|--------------|',
        ...rows,
        '',
      ].join('\n') + '\n',
    )
  })
})
