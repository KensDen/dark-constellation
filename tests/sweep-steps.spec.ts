// THE ONE-STEP ROBUSTNESS SWEEP (v1.3 R0b, brief 11). Ken's question: move
// each 6.1 number one step either side, every other number where it is,
// and see whether Prepared on STANDARD leaves 55 to 90 percent. Opt-in, and
// one step a process: `npm run sweep:steps` (scripts/sweep-steps.mjs) runs
// this file once per step with SWEEP_STEP set, because the rules module's
// numbers are read when it is imported. Without SWEEP_STEP it does nothing.
//
// How a step is applied, the same way for every caller: the rules module's
// damage numbers and its two bill functions are overridden with vi.mock, so
// the reducer, WORST CASE and the policies all import the overridden
// module; upkeep and funding are scenario fields, set on the scenario before
// play. Each run first proves its step is live, on the engine itself.

import { writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/engine/rules', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/engine/rules')>()
  const step = JSON.parse(process.env.SWEEP_STEP ?? '{}') as { meter?: number; asset?: number; bills?: number }
  const f = step.bills ?? 1
  return {
    ...orig,
    METER_DAMAGE_PER_SEVERITY: step.meter ?? orig.METER_DAMAGE_PER_SEVERITY,
    ASSET_DAMAGE_PER_SEVERITY: step.asset ?? orig.ASSET_DAMAGE_PER_SEVERITY,
    // A repair bill, and the debris loss review, scaled and rounded per
    // bill; the burn's fuel is not a repair bill and keeps its price.
    repairBill: (...a: Parameters<typeof orig.repairBill>) => (f === 1 ? orig.repairBill(...a) : Math.round(orig.repairBill(...a) * f)),
    lossReviewBill: (...a: Parameters<typeof orig.lossReviewBill>) => (f === 1 ? orig.lossReviewBill(...a) : Math.round(orig.lossReviewBill(...a) * f)),
  }
})

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import * as rules from '../src/engine/rules'
import { novice, prepared, preparedFollow } from './policies'
import { playPolicy } from './sweep-run'

interface Step {
  meter?: number
  asset?: number
  bills?: number
  upkeep?: number
  funding?: number
}

describe.runIf(process.env.SWEEP_STEP)('one step of a 6.1 number (opt-in)', () => {
  it('plays Prepared, the line that follows the flag, and Novice with the step live', () => {
    const step = JSON.parse(process.env.SWEEP_STEP!) as Step
    if (step.upkeep !== undefined) DEFAULT_SCENARIO.upkeepPerDefense = step.upkeep
    if (step.funding !== undefined) DEFAULT_SCENARIO.incomePerTurn = step.funding

    // The step is live where the engine reads it.
    if (step.meter !== undefined) expect(rules.METER_DAMAGE_PER_SEVERITY).toBe(step.meter)
    if (step.asset !== undefined) expect(rules.ASSET_DAMAGE_PER_SEVERITY).toBe(step.asset)
    const implant = DEFAULT_SCENARIO.events.find((e) => e.id === 'supply-chain-implant')!
    expect(rules.repairBill(implant, 3, 'standard')).toBe(Math.round(3 * implant.effect.repairCostPerSeverity! * (step.bills ?? 1)))
    const first = resolveTurn(
      newGame(DEFAULT_SCENARIO, 1),
      { buyAssets: [], buyCounters: ['antiJam'], intelBrief: false },
      turnRng(1, 1),
    ).history[0].ledger
    // Read off the ledger against the step itself, not against the field
    // this file just wrote, so a step that never reached the scenario fails.
    if (step.upkeep !== undefined) expect(first.upkeep, 'upkeep is not the step').toBe(step.upkeep)
    if (step.funding !== undefined && !first.insolvent) expect(first.funding, 'funding is not the step').toBe(step.funding)

    const row: Record<string, unknown> = { step }
    for (const [name, policy] of [
      ['prepared', prepared],
      ['follow', preparedFollow],
      ['novice', novice],
    ] as const) {
      for (const difficulty of ['standard', 'easy'] as const) {
        const r = playPolicy(policy, difficulty)
        row[`${name}:${difficulty}`] = {
          wins: r.wins,
          insolvencies: r.insolvencies,
          grades: r.grades,
          streak2: r.bestStreaks.filter((b) => b >= 2).length,
        }
      }
    }
    writeFileSync(process.env.SWEEP_STEP_OUT!, JSON.stringify(row))
  }, 120_000)
})
