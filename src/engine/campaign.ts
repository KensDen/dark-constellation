// THE CAMPAIGN A SEED PLAYS (v1.6 R1), in a module of its own because it
// draws from the engine's RNG: the rules module stays pure arithmetic, and
// the music bed, which reads the rules for GNSS denial, never reaches the
// RNG (tests/music.spec.ts). Pure and cached by seed: the board, the
// adversary, the worst case and resolveTurn all read the campaign through
// planFor.

import { turnRng } from './rng'
import type { GameState, Scenario, TurnPlan } from './types'

// THE SEED'S ORDER (v1.6 R1, Ken's ruling of 26 October 2026). Through
// v1.5 every seed met the same campaign in the same order, so one scripted
// order of defenses, written once, answered every night: the prepared
// script's one-a-turn order won all 500 seeds on STANDARD. Now each seed
// draws one of the scenario's variants (CampaignOrder, src/engine/types.ts)
// from its own deck stream before turn 1 (turn 0's, which no turn draws),
// so a seed and a Daily Op stay deterministic and two players on one seed
// meet the same campaign. Every move keeps its strength and its counters;
// only where and when it comes moves.
const ORDERS = new WeakMap<Scenario, Map<number, TurnPlan[]>>()

// Which of the scenario's variants a seed plays: 0, the campaign as
// written, when it has none.
export const variantFor = (scenario: Scenario, seed: number): number =>
  scenario.order ? turnRng(seed, 0, 'deck').int(scenario.order.variants.length) : 0

export function campaignFor(scenario: Scenario, seed: number): TurnPlan[] {
  const { order } = scenario
  if (!order) return scenario.campaign
  let bySeed = ORDERS.get(scenario)
  if (!bySeed) ORDERS.set(scenario, (bySeed = new Map()))
  const cached = bySeed.get(seed)
  if (cached) return cached
  const variant = order.variants[variantFor(scenario, seed)]
  const trade = variant.trade
  const swap = (turn: number, id: string) => (trade?.turns.includes(turn) ? (trade.ids[id] ?? id) : id)
  const traded = scenario.campaign.map((plan) => ({
    ...plan,
    intro: trade?.turns.includes(plan.turn) && plan.introTraded ? plan.introTraded : plan.intro,
    slots: plan.slots.map((slot) => (slot.fixed ? { fixed: swap(plan.turn, slot.fixed) } : { drawFrom: (slot.drawFrom ?? []).map((id) => swap(plan.turn, id)) })),
  }))
  const campaign = variant.turns ? variant.turns.map((from, i) => ({ ...traded.find((p) => p.turn === from)!, turn: i + 1 })) : traded
  bySeed.set(seed, campaign)
  return campaign
}

export const planFor = (state: Pick<GameState, 'scenario' | 'seed'>, turn: number): TurnPlan | undefined =>
  campaignFor(state.scenario, state.seed).find((p) => p.turn === turn)

// Every candidate tonight's slots could play, fixed and drawn, in slot
// order and without repeats: what the intel brief names (brief 6.9).
export function candidatesTonight(state: Pick<GameState, 'scenario' | 'seed' | 'turn'>): string[] {
  const out: string[] = []
  for (const slot of planFor(state, state.turn)?.slots ?? []) {
    for (const id of slot.fixed ? [slot.fixed] : (slot.drawFrom ?? [])) if (!out.includes(id)) out.push(id)
  }
  return out
}
