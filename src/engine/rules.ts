// The v1.3 rules and numbers (brief 6.1), in one module that the turn
// resolver, the adversary's pick and the worst case all read, so the three
// cannot drift apart: the board's LIKELY TARGET and WORST CASE are only
// true if they compute exactly what resolveTurn will. Pure; nothing here
// rolls a die.
//
// Every number is a starting tuning from the loop prototype. The sweep
// gate (brief 7, tests/sweep.spec.ts) may move one; where it did, the
// measured reason is written beside it.

import type {
  ActiveCondition,
  Asset,
  AssetKind,
  CountermeasureId,
  Difficulty,
  GameState,
  Scenario,
  ThreatEvent,
  TurnActions,
  TurnPlan,
} from './types'

// Difficulty (brief 6.1): EASY scales damage and repair bills by 0.75 and
// nothing else. The label and blurb are what the start screen shows.
export interface DifficultyProfile {
  label: string
  blurb: string
  damage: number
}

export const DIFFICULTIES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    label: 'EASY',
    blurb: 'Hits do less damage and repairs take less of the budget. For learning the deck.',
    damage: 0.75,
  },
  standard: {
    label: 'STANDARD',
    blurb: 'The tuned campaign. Prepared play wins most runs; reasonable play is a genuine coin flip.',
    damage: 1,
  },
}

// A damage or repair figure at the difficulty, rounded to a whole number.
// STANDARD multiplies by exactly 1, so it rounds nothing it did not have.
export const scaled = (amount: number, difficulty: Difficulty): number => Math.round(amount * DIFFICULTIES[difficulty].damage)

// Per point of strength that gets through, before the difficulty.
//
// METER DAMAGE IS 5, TUNED BY THE SWEEP GATE (brief 7) from the
// prototype's 10, the one number Round 0 moved. Measured over 500 seeds a
// policy (tests/sweep.spec.ts), with every other number as brief 6.1 has
// it: at 10, Prepared won 0 percent on STANDARD and Novice 0.4 (12.4 on
// EASY), against targets of 65 to 85 and 35 to 60 (70 or more); at 5,
// Prepared wins 79, Prepared on EASY 100, Novice 54 and 92 on EASY, Buy
// everything, Random legal and Nothing 0, and Prepared never goes
// insolvent. The response is steep: at 6, Prepared fell to 36.
export const ASSET_DAMAGE_PER_SEVERITY = 12
export const METER_DAMAGE_PER_SEVERITY = 5
// A live condition presses its meters every turn it stays, by this much a
// point of its strength the owned defenses do not take off.
export const CONDITION_PRESSURE_PER_SEVERITY = 5
// Mitigation (brief 6.1 and 6.7): the first defense in a threat's list is
// its primary and takes two points off; each other one owned takes one.
export const PRIMARY_MITIGATION = 2
export const SECONDARY_MITIGATION = 1
// The chain (brief 6.5): while GNSS denial is live, a chain exploit strikes
// one point harder. One, as the prototype plays it ("chain added 1",
// brief 5.5); v1.2 added two.
export const CHAIN_BONUS = 1
// A solvent turn close heals every damaged asset this much (brief 6.1).
export const ASSET_HEAL_PER_TURN = 10
// Turns from order to arrival, fixed, with no slip (brief 6.1).
export const DEPLOY_TURNS: Record<AssetKind, number> = { sat: 2, rpoSat: 2, drone: 1, groundStation: 1 }
// The debris call (brief 6.1): a burn costs this much fuel without the SSA
// subscription and nothing with it; a hold loses the satellite on this
// chance, and a loss queues a loss review of the event's repair rate times
// LOSS_REVIEW_FACTOR, at the difficulty.
export const BURN_FUEL_CREDITS = 10
export const DEBRIS_LOSS_CHANCE = 0.35
export const LOSS_REVIEW_FACTOR = 2
// The rideshare opportunity with nothing far enough out to expedite.
export const RIDESHARE_RESELL_CREDITS = 5

export function eventById(scenario: Scenario, id: string): ThreatEvent {
  const ev = scenario.events.find((e) => e.id === id)
  if (!ev) throw new Error(`unknown event id in campaign: ${id}`)
  return ev
}

export const planFor = (scenario: Scenario, turn: number): TurnPlan | undefined => scenario.campaign.find((p) => p.turn === turn)

// Every candidate tonight's slots could play, fixed and drawn, in slot
// order and without repeats: what the intel brief names (brief 6.9).
export function candidatesTonight(state: Pick<GameState, 'scenario' | 'turn'>): string[] {
  const out: string[] = []
  for (const slot of planFor(state.scenario, state.turn)?.slots ?? []) {
    for (const id of slot.fixed ? [slot.fixed] : (slot.drawFrom ?? [])) if (!out.includes(id)) out.push(id)
  }
  return out
}

// How much the given defenses take off a threat (brief 6.1). The debris
// conjunction is not an attack and nothing mitigates it: it is the
// player's call.
export function mitigationOf(ev: ThreatEvent, counters: readonly CountermeasureId[]): number {
  if (ev.effect.special === 'debrisStrike') return 0
  return ev.counters.reduce((m, id, i) => (counters.includes(id) ? m + (i === 0 ? PRIMARY_MITIGATION : SECONDARY_MITIGATION) : m), 0)
}

// Whether GNSS denial is live: a condition left by an event that jams GNSS.
export function gnssDenied(conditions: readonly Pick<ActiveCondition, 'eventId'>[], scenario: Scenario): boolean {
  return conditions.some((c) => scenario.events.find((e) => e.id === c.eventId)?.effect.special === 'jamsGnss')
}

export const chainBonusOf = (ev: ThreatEvent, denied: boolean): number => (ev.effect.special === 'chainExploit' && denied ? CHAIN_BONUS : 0)

export const repairBill = (ev: ThreatEvent, effective: number, difficulty: Difficulty): number =>
  scaled(effective * ev.effect.repairCostPerSeverity, difficulty)
export const lossReviewBill = (ev: ThreatEvent, difficulty: Difficulty): number =>
  scaled(ev.effect.repairCostPerSeverity * LOSS_REVIEW_FACTOR, difficulty)
export const burnFuel = (ssa: boolean): number => (ssa ? 0 : BURN_FUEL_CREDITS)

export const hasRetainer = (state: Pick<GameState, 'counters'>): boolean => state.counters.includes('irRetainer')

// The intel brief (D2 a): free on turn 1 and on the turns an allied data
// share covers, otherwise ordered for one turn.
export const briefFree = (state: Pick<GameState, 'turn' | 'briefFreeThrough'>): boolean => state.turn <= state.briefFreeThrough
export const briefActive = (state: Pick<GameState, 'turn' | 'briefFreeThrough'>, actions: Pick<TurnActions, 'intelBrief'>): boolean =>
  briefFree(state) || actions.intelBrief

// The defenses owned once tonight's orders land: what the adversary reads
// at EXECUTE (brief 6.3), and what the board reads with the orders queued.
export function countersAfter(state: Pick<GameState, 'counters'>, actions: Pick<TurnActions, 'buyCounters'>): CountermeasureId[] {
  const out = [...state.counters]
  for (const id of actions.buyCounters) if (!out.includes(id)) out.push(id)
  return out
}

// ONE NEW DEFENSE A NIGHT (v1.4, Ken's ruling of 24 October 2026 on the R6b
// measurement, option A), on both difficulties. Without it, the flag named
// COLDVEIL's move and the budget bought an answer to every move it could
// take, so following LIKELY TARGET won every game at S; with it, which
// defense comes first is the decision. A defense already owned is not new,
// and the IR retainer is a defense here as it is in PROCURE. resolveTurn
// refuses orders that add more (src/engine/reducer.ts).
export const NEW_DEFENSES_PER_NIGHT = 1

// The defenses tonight's orders add, each once, leaving out any owned.
export function newDefenses(state: Pick<GameState, 'counters'>, actions: Pick<TurnActions, 'buyCounters'>): CountermeasureId[] {
  return countersAfter(state, actions).filter((id) => !state.counters.includes(id))
}

// Whether tonight's orders leave room for another new defense.
export const defenseOpen = (state: Pick<GameState, 'counters'>, actions: Pick<TurnActions, 'buyCounters'>): boolean =>
  newDefenses(state, actions).length < NEW_DEFENSES_PER_NIGHT

// What tonight's orders cost, at the prices the scenario sets. A defense
// already owned, or ordered twice, costs nothing more; the brief costs
// nothing on a night it is free.
export function orderCost(state: Pick<GameState, 'scenario' | 'counters' | 'turn' | 'briefFreeThrough'>, actions: TurnActions): number {
  const { scenario } = state
  let total = actions.intelBrief && !briefFree(state) ? scenario.prices.intelBrief : 0
  const counted: CountermeasureId[] = []
  for (const id of actions.buyCounters) {
    if (state.counters.includes(id) || counted.includes(id)) continue
    counted.push(id)
    total += scenario.countermeasures.find((c) => c.id === id)?.cost ?? 0
  }
  for (const buy of actions.buyAssets) total += scenario.prices[buy.kind]
  return total
}

// The satellite on the debris's crossing orbit (brief 5.5 item 5): SG-2,
// the second starter sat, while it flies, as the prototype has it, and
// otherwise the first live asset in orbit. Deterministic, so the call can
// name it before the player chooses.
export function debrisTarget(state: Pick<GameState, 'assets'>): Asset | undefined {
  const live = state.assets.filter((a) => a.layer === 'ORBIT' && a.integrity > 0)
  return live.find((a) => a.id === 'start-sat-2') ?? live[0]
}
