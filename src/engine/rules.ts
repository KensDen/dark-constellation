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
  ResolvedEvent,
  ResponseEffect,
  Scenario,
  ThreatEvent,
  ThreatResponse,
  TurnActions,
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
// METER DAMAGE WAS 5 THROUGH v1.6, TUNED BY THE SWEEP GATE (brief 7) from
// the prototype's 10, the one number Round 0 moved. Measured over 500
// seeds a policy (tests/sweep.spec.ts), with every other number as brief
// 6.1 has it: at 10, Prepared won 0 percent on STANDARD and Novice 0.4
// (12.4 on EASY), against targets of 65 to 85 and 35 to 60 (70 or more);
// at 5, Prepared wins 79, Prepared on EASY 100, Novice 54 and 92 on EASY,
// Buy everything, Random legal and Nothing 0, and Prepared never goes
// insolvent. The response is steep: at 6, Prepared fell to 36.
//
// 9 SINCE v1.7 R1 (Ken's ruling of 9 November 2026: a game you can lose).
// At 5 a player who ordered nothing and rode every move out ended at a
// median 53.9 on STANDARD, 16 under the line, and a careful beginner at
// 69.0: trying was worth 15 points, and the 9 November playtest's
// beginner took an S on EASY for 8 hits. With responses in the night
// (below) the same 5 let Prepared win every seed. Measured at each step,
// responses at 8 and 4 a point and one a night: at 7, Nothing's median is
// 42.8 and Novice wins 76; at 8, 37.5, Novice 60 and Prepared 94; at 9,
// Nothing 32.9 (it never wins, and 337 of 500 runs collapse under 35
// before turn 6), Novice 47.2 with a median of 69.4, Prepared 81.8, and
// on EASY Novice 85.2 and Prepared 96.6. A strength 2 move ridden out now
// costs about 4 points of score, so four of them lose the game.
export const ASSET_DAMAGE_PER_SEVERITY = 12
export const METER_DAMAGE_PER_SEVERITY = 9
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

// THE RESPONSE (v1.7 R1, Ken's ruling of 9 November 2026: a decision in
// the night). When a move would land, the night stops on it and the player
// answers: block it, halve it, or ride it out for nothing. Fixed numbers,
// no dice: a block lets nothing through, a halved move does half its
// damage to the meters and its target and leaves half its repair bill, and
// each costs this much a point of the strength that would have landed, so
// a defense that takes a point off a move also makes it cheaper to answer.
// EASY scales damage and repair bills and nothing else, so a response
// costs the same on both.
//
// 8 AND 4 A POINT, SET BY THE SWEEP (tests/sweep.spec.ts, 500 seeds a
// policy). A strength 2 move costs 16 CR to block and 8 to halve, against
// 8 to 15 CR for the defense that stops it every night. At 5 and 2, with
// every other number as v1.6 had it, Prepared and Buy everything won all
// 500 seeds on STANDARD and Novice 98.6 percent: the budget met every
// move. At 10 and 4 (with METER_DAMAGE_PER_SEVERITY at 9 and one response
// a night, below) Prepared wins 90.0 percent and stops 58 percent of the
// moves it faces; at 10 and 5, 53.0. At 8 and 4: Prepared 81.8 (band 70
// to 85), Novice 47.2 (band 40 to 60, median final score 69.4), Nothing
// 0.0 (median 32.9).
export const RESPONSE_COST_PER_POINT: Record<ResponseEffect, number> = { block: 8, halve: 4 }
export const RESPONSE_DAMAGE_SHARE: Record<ResponseEffect, number> = { block: 0, halve: 0.5 }
// ONE RESPONSE A NIGHT. The watch can run one response at a time, so on a
// night of two moves the player answers one and meets the other with what
// the board already owns, or rides it out: which move gets tonight's
// answer is the decision, and a defense ordered before EXECUTE is the only
// thing that stops the second.
//
// MEASURED, and the reason orders still matter. With a response for every
// move (at 8 and 4 a point, meter damage 9, funding 15), a line that
// orders nothing at all and takes the strongest response every time won
// 89.0 percent on STANDARD, above Prepared's 79.0: PROCURE was a trap.
// Doubling each further response's cost left it at 82.0, tripling at 57.0
// (Novice 48.0). At one a night it wins 25.6 percent, under Novice's 47.2
// and Prepared's 81.8, and the sweep gate holds it under Novice.
export const RESPONSES_PER_NIGHT = 1

// The strength a move lands with before any response: what the defenses
// leave of it.
export const exposedOf = (ev: Pick<ResolvedEvent, 'baseSeverity' | 'chainBonus' | 'mitigation'>): number =>
  Math.max(0, ev.baseSeverity + ev.chainBonus - ev.mitigation)
export const responseCost = (effect: ResponseEffect, exposed: number): number => RESPONSE_COST_PER_POINT[effect] * exposed
// The share of its damage and its repair bill a resolved move did.
export const damageShare = (ev: Pick<ResolvedEvent, 'response'>): number => (ev.response ? RESPONSE_DAMAGE_SHARE[ev.response.effect] : 1)

// A RESPONSE NEVER SPENDS THE NIGHT'S BILLS. What a response may draw on
// is the budget less the repairs already queued tonight, the largest bill
// each move still to come could leave, the upkeep at the close, and what
// the nights ahead could need (the turn resolver computes it as each move
// arrives; src/engine/worstCase.ts, heldForLater). A response fits when
// its cost and what is left of this move's own repair bill fit in that
// room. So WORST CASE on the board stays true with responses in the game:
// a turn that read 0 or more at EXECUTE cannot close insolvent whatever
// the player answers (tests/sweep.spec.ts holds it over every policy).
// `earlier` is how many responses the player has already taken tonight:
// at RESPONSES_PER_NIGHT, none fits.
export function responseFits(ev: ThreatEvent, response: ThreatResponse, exposed: number, room: number, difficulty: Difficulty, earlier = 0): boolean {
  if (earlier >= RESPONSES_PER_NIGHT) return false
  return responseCost(response.effect, exposed) + billAfter(ev, exposed, RESPONSE_DAMAGE_SHARE[response.effect], difficulty) <= room
}
// The repair bill a move leaves once a response has taken its share off.
export const billAfter = (ev: ThreatEvent, exposed: number, share: number, difficulty: Difficulty): number =>
  Math.round(repairBill(ev, exposed, difficulty) * share)

// The largest repair bill a move still to come tonight could leave, read
// the way WORST CASE reads a slot, with the chain's extra point always
// counted, so the figure can only be too careful.
export function worstBillOf(ev: ThreatEvent, counters: readonly CountermeasureId[], difficulty: Difficulty): number {
  if (ev.effect.special === 'debrisStrike') return Math.max(burnFuel(counters.includes('ssaManeuver')), lossReviewBill(ev, difficulty))
  const chain = ev.effect.special === 'chainExploit' ? CHAIN_BONUS : 0
  return repairBill(ev, Math.max(0, ev.baseSeverity + chain - mitigationOf(ev, counters)), difficulty)
}

export function eventById(scenario: Scenario, id: string): ThreatEvent {
  const ev = scenario.events.find((e) => e.id === id)
  if (!ev) throw new Error(`unknown event id in campaign: ${id}`)
  return ev
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

// THE BRIEF LOCKS ONCE IT HAS NAMED THE MOVES (v1.5 R2, Ken's ruling of 24
// October 2026). A paid brief names tonight's moves the moment it is
// ordered, so ordering it, reading it and cancelling it read it free (v1.5
// R1's re-review). Revealing it records the turn on the state
// (revealBrief, src/engine/reducer.ts), and on that turn the brief is
// ordered whatever the orders say: it cannot be cancelled, and EXECUTE
// charges it. On the state, so a reload keeps the lock; resolveTurn clears
// it.
export const briefLocked = (state: Pick<GameState, 'turn' | 'briefRevealed'>): boolean => state.briefRevealed === state.turn
export const briefOrdered = (state: Pick<GameState, 'turn' | 'briefRevealed'>, actions: Pick<TurnActions, 'intelBrief'>): boolean =>
  actions.intelBrief || briefLocked(state)
export const briefActive = (
  state: Pick<GameState, 'turn' | 'briefFreeThrough' | 'briefRevealed'>,
  actions: Pick<TurnActions, 'intelBrief'>,
): boolean => briefFree(state) || briefOrdered(state, actions)

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
// nothing on a night it is free, and a revealed brief costs its price
// whatever the orders say.
export function orderCost(state: Pick<GameState, 'scenario' | 'counters' | 'turn' | 'briefFreeThrough' | 'briefRevealed'>, actions: TurnActions): number {
  const { scenario } = state
  let total = briefOrdered(state, actions) && !briefFree(state) ? scenario.prices.intelBrief : 0
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
