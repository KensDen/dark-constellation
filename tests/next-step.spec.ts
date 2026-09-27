// The suggested next step (v1.2 R2b): guard (a), a table over every case
// suggestNextStep decides, and the walkthrough's stages.
//
// Each row states only what the player could see: the credits on the HUD,
// what has been opened this turn, what is owned, and the conditions on the
// layer headers. The prices are read from the scenario rather than
// written here, so a price change moves the rows' credits with it.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame } from '../src/engine/reducer'
import { assetPrice } from '../src/engine/scoring'
import type { ActiveCondition, GameState } from '../src/engine/types'
import { KIND_LAYER, hardenOffers, turnBudget } from '../src/ui/board/board'
import { ACTIONS, GUIDE, NEXT_STEP_SENTENCE, guideStage, suggestNextStep, type StepId } from '../src/ui/board/actions'

const start = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
const scenario = start.scenario
const cheapestAsset = Math.min(
  ...(Object.keys(KIND_LAYER) as (keyof typeof KIND_LAYER)[]).flatMap((k) => (['A', 'B'] as const).map((t) => assetPrice(scenario, k, t))),
)
const cheapestDefense = Math.min(...hardenOffers(scenario).map((cm) => cm.cost))
const intelPrice = scenario.prices.intelLevels[0]
const condition = { instanceId: 'c1', eventId: scenario.events[0].id } as unknown as ActiveCondition
const withSurge: GameState = { ...start, surgeTokens: 1, conditions: [condition] }
const used = (...ids: StepId[]) => new Set<string>(ids)

describe('the suggested next step (v1.2 R2b)', () => {
  it('GUARD (a): picks the step the rules name, case by case', () => {
    // The fixture's own sanity: the rows below depend on these orderings.
    expect(cheapestAsset).toBeGreaterThan(0)
    expect(cheapestDefense).toBeGreaterThan(0)
    expect(cheapestDefense, 'the second row needs a defense cheaper than any asset').toBeLessThan(cheapestAsset)
    const rows: [string, GameState, Set<string>, number, StepId][] = [
      ['turn 1, nothing opened, the turn budget', start, used(), turnBudget(start), 'procure'],
      ['PROCURE unopened but nothing in it affordable', start, used(), cheapestAsset - 1, 'harden'],
      ['PROCURE opened, a defense affordable', start, used('procure'), cheapestDefense, 'harden'],
      ['PROCURE and HARDEN opened, the next intel level affordable', start, used('procure', 'harden'), intelPrice, 'intel'],
      ['intel at the top level', { ...start, intelLevel: scenario.prices.intelLevels.length }, used('procure', 'harden'), 10_000, 'resolve'],
      ['the first three opened, a token and a condition', withSurge, used('procure', 'harden', 'intel'), 0, 'surge'],
      ['a token but no condition', { ...withSurge, conditions: [] }, used('procure', 'harden', 'intel'), 0, 'resolve'],
      ['a condition but no token', { ...withSurge, surgeTokens: 0 }, used('procure', 'harden', 'intel'), 0, 'resolve'],
      ['SURGE already opened', withSurge, used('procure', 'harden', 'intel', 'surge'), 0, 'resolve'],
      ['nothing affordable and no surge', start, used(), 0, 'resolve'],
      ['every defense already owned', { ...start, counters: hardenOffers(scenario).map((cm) => cm.id) }, used('procure'), 10_000, 'intel'],
    ]
    const wrong: string[] = []
    for (const [name, state, opened, credits, expected] of rows) {
      const got = suggestNextStep(state, opened, credits)
      if (got.step !== expected) wrong.push(`${name}: ${got.step}, expected ${expected}`)
      if (got.sentence !== NEXT_STEP_SENTENCE[got.step]) wrong.push(`${name}: the sentence is not the ${got.step} sentence`)
    }
    expect(wrong).toEqual([])
    // The default credits are the turn's budget, which is what the HUD
    // shows before anything is bought.
    expect(suggestNextStep(start, used()).step).toBe('procure')
  })

  it('names, in every sentence, the step it glows', () => {
    for (const [step, sentence] of Object.entries(NEXT_STEP_SENTENCE)) {
      const label = ACTIONS.find((a) => a.id === step)!.label
      expect(sentence, `${step}'s sentence does not name ${label}`).toContain(label)
      for (const other of ACTIONS.filter((a) => a.id !== step)) expect(sentence).not.toContain(other.label)
    }
    for (const stage of Object.values(GUIDE)) {
      const label = ACTIONS.find((a) => a.id === stage.step)!.label
      expect(stage.sentence).toContain(label)
    }
  })

  it('walks the first turn buy, then harden or skip, then resolve', () => {
    expect(guideStage(false, false)).toBe('start')
    expect(guideStage(false, true), 'hardening before buying skipped the buy').toBe('start')
    expect(guideStage(true, false)).toBe('harden')
    expect(guideStage(true, true)).toBe('last')
    expect([GUIDE.start.step, GUIDE.harden.step, GUIDE.last.step]).toEqual(['procure', 'harden', 'resolve'])
  })
})
