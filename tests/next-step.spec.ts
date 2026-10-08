// The suggested next step (v1.2 R2b): guard (a), a table over every case
// suggestNextStep decides, and the walkthrough's stages. Two steps since
// v1.3 Round 0: PROCURE, which holds assets, defenses and intel in one
// sheet, and EXECUTE. SURGE left the suggestion with its sheet.
//
// Each row states only what the player could see: the credits on the HUD,
// what has been opened this turn, what is owned and whether the intel
// brief is free tonight (turn 1, or a night the allied data share covers).
// The prices are read from the scenario rather than written here, so a
// price change moves the rows' credits with it.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame } from '../src/engine/reducer'
import { briefFree } from '../src/engine/rules'
import { assetPrice } from '../src/engine/scoring'
import type { GameState } from '../src/engine/types'
import { KIND_LAYER, hardenOffers, turnBudget } from '../src/ui/board/board'
import { ACTIONS, GUIDE, NEXT_STEP_SENTENCE, guideStage, suggestNextStep, type StepId } from '../src/ui/board/actions'

const start = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
const scenario = start.scenario
// Every asset is ordered at the one price there is (the tiers are gone).
const cheapestAsset = Math.min(...(Object.keys(KIND_LAYER) as (keyof typeof KIND_LAYER)[]).map((k) => assetPrice(scenario, k)))
const cheapestDefense = Math.min(...hardenOffers(scenario).map((cm) => cm.cost))
const intelPrice = scenario.prices.intelBrief
// INTEL has nothing to sell on a night the brief is free: turn 1 of a new
// game (briefFreeThrough 1), or a night the allied data share extended it.
// On turn 2 of a game without the share the brief is for sale.
const briefFreeTonight: GameState = start
const briefForSale: GameState = { ...start, turn: 2 }
const sharedBrief: GameState = { ...start, turn: 2, briefFreeThrough: 3 }
// One section of the sheet left with something to sell, the other two
// spent: every defense owned, or the brief free tonight, or both.
const ownsEveryDefense = hardenOffers(scenario).map((cm) => cm.id)
const intelOnly: GameState = { ...briefForSale, counters: ownsEveryDefense }
const assetsOnly: GameState = { ...briefFreeTonight, counters: ownsEveryDefense }
const used = (...ids: StepId[]) => new Set<string>(ids)

describe('the suggested next step (v1.2 R2b)', () => {
  it('GUARD (a): picks the step the rules name, case by case', () => {
    // The fixture's own sanity: the rows below depend on these orderings.
    expect(cheapestAsset).toBeGreaterThan(0)
    expect(cheapestDefense).toBeGreaterThan(0)
    expect(intelPrice).toBeGreaterThan(0)
    expect(cheapestDefense, 'the defense row needs a defense cheaper than any asset').toBeLessThan(cheapestAsset)
    expect(intelPrice, 'the intel row needs an intel brief cheaper than any asset').toBeLessThan(cheapestAsset)
    expect(briefFree(briefFreeTonight), 'turn 1 of a new game is not a free brief night').toBe(true)
    expect(briefFree(sharedBrief), 'the allied data share did not make turn 2 a free brief night').toBe(true)
    expect(briefFree(briefForSale), 'the brief is free on turn 2 without the share').toBe(false)
    const rows: [string, GameState, Set<string>, number, StepId][] = [
      ['turn 1, nothing opened, the turn budget', start, used(), turnBudget(start), 'procure'],
      // Each section of PROCURE is enough on its own to point at it.
      ['PROCURE unopened, only a defense affordable, the brief free tonight', briefFreeTonight, used(), cheapestDefense, 'procure'],
      ['PROCURE unopened, only the intel brief affordable', intelOnly, used(), intelPrice, 'procure'],
      ['PROCURE unopened, only an asset affordable', assetsOnly, used(), cheapestAsset, 'procure'],
      ['PROCURE unopened, a credit short of the only asset left to buy', assetsOnly, used(), cheapestAsset - 1, 'resolve'],
      // A free brief is not something left to buy: it is already on.
      ['PROCURE unopened, every defense owned, the brief free on turn 1', assetsOnly, used(), intelPrice, 'resolve'],
      ['PROCURE unopened, every defense owned, the brief free from the share', { ...sharedBrief, counters: ownsEveryDefense }, used(), intelPrice, 'resolve'],
      ['PROCURE unopened, a credit short of everything on it', briefForSale, used(), Math.min(cheapestAsset, cheapestDefense, intelPrice) - 1, 'resolve'],
      ['PROCURE opened, everything still affordable', briefForSale, used('procure'), turnBudget(briefForSale), 'resolve'],
      ['nothing affordable', start, used(), 0, 'resolve'],
    ]
    const wrong: string[] = []
    for (const [name, state, opened, credits, expected] of rows) {
      const got = suggestNextStep(state, opened, credits)
      if (got.step !== expected) wrong.push(`${name}: ${got.step}, expected ${expected}`)
      if (got.sentence !== NEXT_STEP_SENTENCE[got.step]) wrong.push(`${name}: the sentence is not the ${got.step} sentence`)
    }
    expect(wrong).toEqual([])
    // Every step is the answer to some row, so the table is not passing
    // on one hard-coded answer.
    expect(new Set(rows.map((row) => row[4]))).toEqual(new Set(ACTIONS.map((a) => a.id)))
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

  it('walks the first turn: an order or a skip, then execute', () => {
    expect(guideStage(false)).toBe('start')
    expect(guideStage(true), 'an order or a skip did not move the walkthrough on').toBe('last')
    expect([GUIDE.start.step, GUIDE.last.step]).toEqual(['procure', 'resolve'])
  })
})
