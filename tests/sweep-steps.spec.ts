// THE ONE-STEP ROBUSTNESS SWEEP (v1.3 R0b, brief 11; the game's numbers
// since v2.0 R3). Move each number one step either side, every other
// number where it is, and see where Prepared and Novice land. Opt-in, and
// one step a process: `npm run sweep:steps` (scripts/sweep-steps.mjs) runs
// this file once per step with SWEEP_STEP set, because the rules module's
// numbers are read when it is imported. Without SWEEP_STEP it does nothing.
//
// How a step is applied, the same way for every caller: the rules module's
// asset damage and its two bill functions are overridden with vi.mock, so
// the reducer, WORST CASE and the lines all import the overridden module;
// meter damage, upkeep, funding and recovery are scenario fields, set on
// the scenario before play. Each run first proves its step is live on the
// engine itself: it plays a hit and a close through resolveTurn and reads
// the damage, the bill, the upkeep, the funding and the recovery off the
// record, computed from the step and the ORIGINAL module, never from the
// mocked one (the R0b review found the first version reading the mock
// back, which proves only that vi.mock ran).

import { writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/engine/rules', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/engine/rules')>()
  const step = JSON.parse(process.env.SWEEP_STEP ?? '{}') as { asset?: number; bills?: number }
  const f = step.bills ?? 1
  return {
    ...orig,
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
import type { GameState } from '../src/engine/types'
import { WATCH, WATCH_REPORTED } from './policies'
import { SEEDS, playPolicy } from './sweep-run'

interface Step {
  meter?: number
  asset?: number
  bills?: number
  upkeep?: number
  funding?: number
  recovery?: number
}

describe.runIf(process.env.SWEEP_STEP)('one step of a number (opt-in)', () => {
  it('plays Prepared, Novice and the Expert with the step live', async () => {
    const step = JSON.parse(process.env.SWEEP_STEP!) as Step
    const actual = await vi.importActual<typeof import('../src/engine/rules')>('../src/engine/rules')
    const asset = step.asset ?? actual.ASSET_DAMAGE_PER_SEVERITY
    const bills = step.bills ?? 1
    if (step.meter !== undefined) DEFAULT_SCENARIO.meterDamage = step.meter
    if (step.upkeep !== undefined) DEFAULT_SCENARIO.upkeepPerDefense = step.upkeep
    if (step.funding !== undefined) DEFAULT_SCENARIO.incomePerTurn = step.funding
    if (step.recovery !== undefined) DEFAULT_SCENARIO.recovery = { base: step.recovery, withIrRetainer: step.recovery + (DEFAULT_SCENARIO.recovery.withIrRetainer - DEFAULT_SCENARIO.recovery.base) }
    const meter = DEFAULT_SCENARIO.meterDamage

    // A hit, through the engine: night 1 with no orders on STANDARD, meters
    // set to 50 so neither the cap nor zero clips the damage. The meter
    // falls by round(meter x strength through), recovery then adds the
    // scenario's base; the struck asset loses round(asset x strength); the
    // bill is round(strength x cost per point x bills).
    const start: GameState = { ...newGame(DEFAULT_SCENARIO, 1), meters: { linkAvailability: 50, dataIntegrity: 50, sensorIntegrity: 50 } }
    const after = resolveTurn(start, { buyAssets: [], buyCounters: [] }, turnRng(1, 1))
    const hit = after.history[0].events[0]
    const ev = DEFAULT_SCENARIO.events.find((e) => e.id === hit.eventId)!
    expect(hit.effectiveSeverity, 'night 1 should land unmitigated with no orders').toBe(ev.baseSeverity)
    for (const m of ev.effect.meters) {
      expect(50 - after.meters[m] + DEFAULT_SCENARIO.recovery.base, `meter damage is not the step (${m})`).toBe(Math.round(meter * hit.effectiveSeverity))
    }
    if (step.recovery !== undefined) expect(after.history[0].ledger.recovery, 'recovery is not the step').toBe(step.recovery)
    if (ev.effect.assetDamage !== false) {
      expect(hit.integrityBefore! - hit.integrityAfter!, 'asset damage is not the step').toBe(Math.min(hit.integrityBefore!, Math.round(asset * hit.effectiveSeverity)))
    }
    expect(hit.repairCost, 'the repair bill is not the step').toBe(Math.round(hit.effectiveSeverity * ev.effect.repairCostPerSeverity! * bills))
    // A close, read off the ledger against the step itself, not against the
    // field this file just wrote, so a step that never reached the scenario
    // fails.
    const second = resolveTurn(after, { buyAssets: [], buyCounters: ['antiJam'] }, turnRng(1, 2)).history[1].ledger
    if (step.upkeep !== undefined) expect(second.upkeep, 'upkeep is not the step').toBe(step.upkeep)
    if (step.funding !== undefined && !second.insolvent) expect(second.funding, 'funding is not the step').toBe(step.funding)

    const row: Record<string, unknown> = { step, seeds: SEEDS }
    const lines = [WATCH.find((l) => l.name === 'prepared')!, WATCH.find((l) => l.name === 'novice')!, WATCH_REPORTED.find((l) => l.name === 'expert')!]
    for (const l of lines) {
      for (const difficulty of ['standard', 'easy'] as const) {
        const r = playPolicy(l.policy, difficulty, l.respond)
        row[`${l.name}:${difficulty}`] = {
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
