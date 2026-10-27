// The turn resolver (spec Sections 4, 6, 9; the v1.3 loop pass, brief
// section 6). Pure and deterministic: resolveTurn(state, actions, rng) ->
// state. No Date, no Math.random. Callers derive the rng with
// turnRng(state.seed, state.turn) so replay and reload resolve
// identically; the adversary's deck stream is derived alongside it.
//
// Turn order (brief 5.5 and 6.1):
//   1. EXECUTE: tonight's orders are paid for and land at once. Defenses
//      are owned from this moment, assets enter the pipeline, and the
//      intel brief names tonight's candidates.
//   2. Live conditions press their meters.
//   3. The reacting adversary plays each slot (src/engine/adversary.ts),
//      and each event resolves on the main stream: the BURN or HOLD call
//      on the debris night, an attack otherwise. Repair bills queue.
//   4. The rare opportunity, from the deck stream.
//   5. Turn close: repairs and upkeep are paid, and a budget below 0 ends
//      the run; then arrivals, mission funding and the coverage bonus
//      (frozen when insolvent), meter recovery, healing, and the
//      conditions' clocks. Then the win and loss checks.

import { adversaryPicks } from './adversary'
import { candidatesTonight, planFor } from './campaign'
import { turnRng, type Rng } from './rng'
import {
  ASSET_DAMAGE_PER_SEVERITY,
  ASSET_HEAL_PER_TURN,
  CONDITION_PRESSURE_PER_SEVERITY,
  DEBRIS_LOSS_CHANCE,
  DEPLOY_TURNS,
  METER_DAMAGE_PER_SEVERITY,
  NEW_DEFENSES_PER_NIGHT,
  RIDESHARE_RESELL_CREDITS,
  briefActive,
  briefFree,
  briefLocked,
  briefOrdered,
  burnFuel,
  chainBonusOf,
  debrisTarget,
  eventById,
  gnssDenied,
  hasRetainer,
  lossReviewBill,
  mitigationOf,
  newDefenses,
  repairBill,
  scaled,
} from './rules'
import { METER_CAP, coverage, maiRaw, maiScore } from './scoring'
import type {
  Asset,
  CountermeasureId,
  DebrisChoice,
  Difficulty,
  GameState,
  LearnedHow,
  ResolvedEvent,
  Scenario,
  ThreatEvent,
  TurnActions,
  TurnLedger,
  TurnRecord,
} from './types'

// The rules and numbers live in ./rules, and tonight's candidates in
// ./campaign; re-exported here, where the presentation has always imported
// them from.
export { candidatesTonight } from './campaign'
export {
  ASSET_DAMAGE_PER_SEVERITY,
  ASSET_HEAL_PER_TURN,
  BURN_FUEL_CREDITS,
  CHAIN_BONUS,
  CONDITION_PRESSURE_PER_SEVERITY,
  DEBRIS_LOSS_CHANCE,
  DEPLOY_TURNS,
  DIFFICULTIES,
  LOSS_REVIEW_FACTOR,
  METER_DAMAGE_PER_SEVERITY,
  NEW_DEFENSES_PER_NIGHT,
  PRIMARY_MITIGATION,
  RIDESHARE_RESELL_CREDITS,
  SECONDARY_MITIGATION,
  briefActive,
  briefFree,
  briefLocked,
  briefOrdered,
  countersAfter,
  debrisTarget,
  defenseOpen,
  gnssDenied,
  hasRetainer,
  mitigationOf,
  newDefenses,
  orderCost,
  scaled,
  type DifficultyProfile,
} from './rules'

const layerFor = (kind: Asset['kind']): Asset['layer'] =>
  kind === 'drone' ? 'AIR' : kind === 'groundStation' ? 'GROUND' : 'ORBIT'

// How the record names an asset order and an asset; exported so a reader
// of the record (the debrief's replay, v1.5 R1) can take an order back to
// its kind without restating the words.
export const kindLabel: Record<Asset['kind'], string> = {
  sat: 'imaging sat',
  rpoSat: 'RPO servicing sat',
  drone: 'drone',
  groundStation: 'ground station',
}

function counterById(scenario: Scenario, id: CountermeasureId) {
  const cm = scenario.countermeasures.find((c) => c.id === id)
  if (!cm) throw new Error(`unknown countermeasure id: ${id}`)
  return cm
}

const liveAssets = (assets: Asset[]) => assets.filter((a) => a.integrity > 0)
const round1 = (n: number) => Math.round(n * 10) / 10
const METER_KEYS = ['linkAvailability', 'dataIntegrity', 'sensorIntegrity'] as const

export function newGame(scenario: Scenario, seed: number, difficulty: Difficulty = 'standard'): GameState {
  return {
    scenario,
    seed,
    turn: 1,
    status: 'playing',
    difficulty,
    credits: scenario.startCredits,
    assets: scenario.starterAssets.map((s, i) => ({ id: `start-${s.kind}-${i + 1}`, kind: s.kind, layer: layerFor(s.kind), integrity: 100 })),
    counters: [],
    meters: { linkAvailability: 100, dataIntegrity: 100, sensorIntegrity: 100 },
    conditions: [],
    pipeline: [],
    // The first intel brief is on the house (D2 a).
    briefFreeThrough: 1,
    streak: 0,
    bestStreak: 0,
    saved: 0,
    learned: [],
    history: [],
  }
}

// Record what the player can now say, once per defense and threat: the
// first time a pair is seen is what the debrief reports (prototype rule).
function learn(state: GameState, counter: CountermeasureId, threat: string, how: LearnedHow): void {
  if (state.learned.some((l) => l.counter === counter && l.threat === threat)) return
  state.learned.push({ counter, threat, how })
}

// EXECUTE: pay for tonight's orders and land them. A defense is owned at
// once (the adversary reads it tonight), an asset joins the pipeline, and
// the brief costs its price unless it is free tonight; a revealed brief
// is paid for whatever the orders say (revealBrief). Throws when the
// orders exceed the budget, which the UI never sends (EXECUTE is disabled
// while REMAINING is below zero), and when they add more than one new
// defense (NEW_DEFENSES_PER_NIGHT), which PROCURE never queues.
function applyOrders(state: GameState, actions: TurnActions, purchases: string[]): number {
  const { scenario } = state
  if (newDefenses(state, actions).length > NEW_DEFENSES_PER_NIGHT) throw new Error('invalid actions: one new defense a night')
  let spent = 0
  if (briefOrdered(state, actions) && !briefFree(state)) {
    spent += scenario.prices.intelBrief
    purchases.push(`Intel brief (-${scenario.prices.intelBrief})`)
  }
  for (const id of actions.buyCounters) {
    if (state.counters.includes(id)) continue
    const cm = counterById(scenario, id)
    spent += cm.cost
    state.counters.push(id)
    purchases.push(`${cm.name} (-${cm.cost})`)
  }
  actions.buyAssets.forEach((buy, i) => {
    const price = scenario.prices[buy.kind]
    spent += price
    state.pipeline.push({ id: `t${state.turn}-${buy.kind}-${i + 1}`, kind: buy.kind, etaTurns: DEPLOY_TURNS[buy.kind] })
    purchases.push(`${kindLabel[buy.kind]} (-${price}, in transit)`)
  })
  state.credits -= spent
  if (state.credits < 0) throw new Error('invalid actions: orders exceed the budget')
  return spent
}

// THE INTEL BRIEF, REVEALED (v1.5 R2): ordering a paid brief names
// tonight's moves at once, so the order locks for the turn (rules.ts,
// briefLocked): from here the brief is ordered and charged at EXECUTE
// whatever the orders say. Nothing to lock on a turn it is free. Throws
// when the game is over, and when the brief's price is more than the
// balance, since a locked order the budget can never meet would leave the
// turn with no way to EXECUTE.
export function revealBrief(state: GameState): GameState {
  if (state.status !== 'playing') throw new Error('game is over; cannot order a brief')
  if (briefFree(state) || briefLocked(state)) return state
  if (state.scenario.prices.intelBrief > state.credits) throw new Error('invalid actions: orders exceed the budget')
  return { ...state, briefRevealed: state.turn }
}

// The mission assurance an event would leave at the given strength on the
// given target, measured on a copy and restored, for points saved (brief
// 6.8): what full strength would have cost, against what it did.
function maiAfterHit(state: GameState, ev: ThreatEvent, target: Asset | undefined, strength: number): number {
  const meters = { ...state.meters }
  const integrity = target?.integrity
  for (const m of ev.effect.meters) state.meters[m] = Math.max(0, state.meters[m] - scaled(METER_DAMAGE_PER_SEVERITY * strength, state.difficulty))
  if (target) target.integrity = Math.max(0, target.integrity - scaled(ASSET_DAMAGE_PER_SEVERITY * strength, state.difficulty))
  const after = maiRaw(state)
  state.meters = meters
  if (target && integrity !== undefined) target.integrity = integrity
  return after
}

// What a resolver returns: the event as it resolved, before the turn's loop
// stamps the score it found and left (the per-event score).
type Unscored = Omit<ResolvedEvent, 'scoreBefore' | 'scoreAfter'>

function resolveThreat(state: GameState, ev: ThreatEvent, rng: Rng): Unscored {
  const { scenario, difficulty } = state
  const notes: string[] = []
  const chainBonus = chainBonusOf(ev, gnssDenied(state.conditions, scenario))
  if (chainBonus > 0) notes.push('GNSS is denied, so the squadron flies on LiDAR alone. The chain added a point before the defenses saw it.')
  const strength = ev.baseSeverity + chainBonus
  const mitigation = mitigationOf(ev, state.counters)
  const effectiveSeverity = Math.max(0, strength - mitigation)
  const outcome = effectiveSeverity === 0 ? 'held' : mitigation > 0 ? 'reduced' : 'open'

  // The tile it is aimed at: a live asset on its layers, held or not, and
  // of a kind the move prefers when the player holds one (G-028: the
  // docking dazzle strikes the RPO sat, not an imaging sat).
  const onLayers = liveAssets(state.assets).filter((a) => ev.layers.includes(a.layer))
  const preferred = ev.prefersKinds ? onLayers.filter((a) => ev.prefersKinds!.includes(a.kind)) : []
  const pool = preferred.length > 0 ? preferred : onLayers
  const target = pool.length > 0 ? rng.pick(pool) : undefined
  const struck = ev.effect.assetDamage !== false ? target : undefined

  const before = maiRaw(state)
  const fullLoss = before - maiAfterHit(state, ev, struck, strength)
  let integrityBefore: number | undefined
  let integrityAfter: number | undefined
  if (effectiveSeverity > 0) {
    for (const m of ev.effect.meters) {
      state.meters[m] = Math.max(0, state.meters[m] - scaled(METER_DAMAGE_PER_SEVERITY * effectiveSeverity, difficulty))
    }
    if (struck) {
      integrityBefore = struck.integrity
      struck.integrity = Math.max(0, struck.integrity - scaled(ASSET_DAMAGE_PER_SEVERITY * effectiveSeverity, difficulty))
      integrityAfter = struck.integrity
      notes.push(
        struck.integrity === 0
          ? `${kindLabel[struck.kind]} ${struck.id} disabled.`
          : `${kindLabel[struck.kind]} ${struck.id} degraded to ${struck.integrity} percent integrity.`,
      )
    }
    if (ev.condition) {
      const existing = state.conditions.find((c) => c.eventId === ev.id)
      if (existing) {
        existing.remainingTurns = Math.max(existing.remainingTurns, ev.condition.turns)
        notes.push(`${ev.condition.name} renewed for ${ev.condition.turns} turns.`)
      } else {
        state.conditions.push({
          instanceId: `${ev.id}-t${state.turn}`,
          eventId: ev.id,
          name: ev.condition.name,
          startedTurn: state.turn,
          remainingTurns: ev.condition.turns,
          baseSeverity: ev.baseSeverity,
        })
        notes.push(`${ev.condition.name} for ${ev.condition.turns} turns: a condition that presses every turn it stays.`)
      }
    }
  } else {
    notes.push('Posture held. The attempt was mitigated below effect threshold.')
  }
  const saved = round1(Math.max(0, fullLoss - (before - maiRaw(state))))

  // The defense streak and points saved (brief 6.8): a streak counts
  // events with nothing through and resets on any point through.
  if (effectiveSeverity === 0) {
    state.streak += 1
    state.bestStreak = Math.max(state.bestStreak, state.streak)
  } else {
    state.streak = 0
  }
  state.saved = round1(state.saved + saved)
  const owned = ev.counters.filter((c) => state.counters.includes(c))
  const missing = ev.counters.filter((c) => !state.counters.includes(c))
  if (owned.length > 0) learn(state, owned[0], ev.id, outcome === 'held' ? 'held' : 'reduced')
  if (effectiveSeverity > 0 && missing.length > 0) learn(state, missing[0], ev.id, 'missed')

  return {
    eventId: ev.id,
    name: ev.name,
    baseSeverity: ev.baseSeverity,
    chainBonus,
    mitigation,
    effectiveSeverity,
    repairCost: repairBill(ev, effectiveSeverity, difficulty),
    notes,
    firedTechniqueRefs: effectiveSeverity > 0 ? ev.techniqueRefs : [],
    outcome,
    saved,
    targetAssetId: target?.id,
    integrityBefore,
    integrityAfter,
    condition: effectiveSeverity > 0 ? ev.condition : undefined,
  }
}

// THE DEBRIS CALL (brief 5.5 item 5 and 6.1). Not an attack: the player
// chooses. BURN moves the satellite out of the corridor, for nothing with
// the SSA subscription and BURN_FUEL_CREDITS without, and takes it off
// station for tonight's coverage bonus check. HOLD spends nothing and
// loses the satellite on DEBRIS_LOSS_CHANCE, which queues a loss review.
// The call neither extends nor breaks the defense streak, as the
// prototype plays it: no defense blocks debris, the player decides.
function resolveDebris(state: GameState, ev: ThreatEvent, choice: DebrisChoice, rng: Rng, offStation: Set<string>): Unscored {
  const ssa = state.counters.includes('ssaManeuver')
  const sat = debrisTarget(state)
  const notes: string[] = []
  let fuel = 0
  let lost = false
  let repairCost = 0
  let integrityBefore: number | undefined
  if (!sat) {
    notes.push('No satellite was on the crossing orbit. The debris passed through empty sky.')
  } else if (choice === 'burn') {
    fuel = burnFuel(ssa)
    state.credits -= fuel
    offStation.add(sat.id)
    notes.push(
      `${kindLabel[sat.kind]} ${sat.id} burned out of the corridor and is off station tonight.${ssa ? ' The fuel was already budgeted.' : ` Unbudgeted fuel: ${fuel} credits.`}`,
    )
  } else if (rng.chance(DEBRIS_LOSS_CHANCE)) {
    lost = true
    integrityBefore = sat.integrity
    sat.integrity = 0
    repairCost = lossReviewBill(ev, state.difficulty)
    notes.push(`Conjunction with uncontrolled debris. ${kindLabel[sat.kind]} ${sat.id} lost.`)
  } else {
    notes.push(`Closest approach was a miss. ${kindLabel[sat.kind]} ${sat.id} held its orbit.`)
  }
  // Learned as held only when the satellite came through (R6 question 7):
  // owning SSA and choosing HOLD can still lose it, and then SSA neither
  // held nor was missing; the loss was the call.
  if (ssa) {
    if (!lost) learn(state, 'ssaManeuver', ev.id, 'held')
  } else if (lost) learn(state, 'ssaManeuver', ev.id, 'missed')
  return {
    eventId: ev.id,
    name: ev.name,
    baseSeverity: ev.baseSeverity,
    chainBonus: 0,
    mitigation: 0,
    effectiveSeverity: lost ? ev.baseSeverity : 0,
    repairCost,
    notes,
    firedTechniqueRefs: lost ? ev.techniqueRefs : [],
    outcome: lost ? 'open' : 'held',
    saved: 0,
    targetAssetId: sat?.id,
    integrityBefore,
    integrityAfter: lost ? 0 : undefined,
    debris: { choice, assetId: sat?.id, lost, fuel, ssa },
  }
}

function resolveOpportunity(state: GameState, ev: ThreatEvent): Unscored {
  const notes: string[] = []
  const b = ev.benefit ?? {}
  if (b.credits) {
    state.credits += b.credits
    notes.push(`+${b.credits} credits appropriated to the program.`)
  }
  if (b.briefTurns) {
    state.briefFreeThrough = Math.max(state.briefFreeThrough, state.turn + b.briefTurns)
    notes.push(`Allied tracking data: the intel brief is free for the next ${b.briefTurns} turns.`)
  }
  if (b.expediteTurns) {
    // Only an item still more than a turn out can actually arrive sooner;
    // one already due at this close cannot be advanced, so the slot is resold.
    const soonest = state.pipeline.filter((p) => p.etaTurns > 1).sort((x, y) => x.etaTurns - y.etaTurns)[0]
    if (soonest) {
      soonest.etaTurns = Math.max(1, soonest.etaTurns - b.expediteTurns)
      notes.push(`${kindLabel[soonest.kind]} ${soonest.id} manifested on the rideshare: arrival moved up a turn.`)
    } else {
      state.credits += RIDESHARE_RESELL_CREDITS
      notes.push(`No deployment far enough out to expedite; the slot resold for +${RIDESHARE_RESELL_CREDITS} credits.`)
    }
  }
  return {
    eventId: ev.id,
    name: ev.name,
    baseSeverity: 0,
    chainBonus: 0,
    mitigation: 0,
    effectiveSeverity: 0,
    repairCost: 0,
    notes,
    firedTechniqueRefs: [],
    saved: 0,
  }
}

// `rng` is the turn's main stream, from the caller as it always was.
// `deck` is the adversary's stream (v1.2 Round 5a), derived here from the
// same (seed, turn) unless a caller supplies one; see src/engine/rng.ts.
export function resolveTurn(state: GameState, actions: TurnActions, rng: Rng, deck: Rng = turnRng(state.seed, state.turn, 'deck')): GameState {
  if (state.status !== 'playing') throw new Error('game is over; cannot resolve further turns')
  const { scenario, ...rest } = state
  // A structured clone of everything but the scenario, which is static
  // content the engine never writes: cloning it every turn was most of
  // the cost of a turn, and a sweep plays tens of thousands.
  const next: GameState = { ...(JSON.parse(JSON.stringify(rest)) as Omit<GameState, 'scenario'>), scenario }
  const { difficulty } = next
  const notes: string[] = []
  const purchases: string[] = []
  const start = next.credits

  // 1. EXECUTE.
  const briefed = briefActive(next, actions)
  const ordered = applyOrders(next, actions, purchases)
  const named = briefed ? candidatesTonight(next) : []
  // The lock is the turn's own (briefLocked): paid for above, it goes.
  delete next.briefRevealed

  // 2. Live conditions press. Mitigation is recomputed, so a defense bought
  // tonight blunts the rest of a condition's life.
  const pressing = next.conditions.map((c) => c.name)
  for (const cond of next.conditions) {
    const def = eventById(scenario, cond.eventId)
    const severity = Math.max(0, cond.baseSeverity - mitigationOf(def, next.counters))
    if (severity > 0) {
      for (const m of def.effect.meters) {
        next.meters[m] = Math.max(0, next.meters[m] - scaled(CONDITION_PRESSURE_PER_SEVERITY * severity, difficulty))
      }
      notes.push(`${cond.name} continues: sustained pressure on the mission.`)
    } else {
      notes.push(`${cond.name} continues, but current defenses hold it below effect threshold.`)
    }
  }

  // 3. The adversary plays each slot, reading the defenses owned now.
  const offStation = new Set<string>()
  const resolved: ResolvedEvent[] = []
  for (const read of adversaryPicks(next, next.counters, deck)) {
    const ev = eventById(scenario, read.pick)
    const scoreBefore = maiScore(next)
    const r = ev.effect.special === 'debrisStrike' ? resolveDebris(next, ev, actions.debris ?? 'hold', rng, offStation) : resolveThreat(next, ev, rng)
    resolved.push({ ...r, scoreBefore, scoreAfter: maiScore(next) })
  }
  const fuel = resolved.reduce((n, r) => n + (r.debris?.fuel ?? 0), 0)

  // 4. The rare opportunity, from the deck stream.
  const plan = planFor(next, next.turn)
  let windfall = 0
  if (plan?.opportunity && plan.opportunity.drawFrom.length > 0 && deck.chance(plan.opportunity.chance)) {
    const before = next.credits
    const scoreBefore = maiScore(next)
    const r = resolveOpportunity(next, eventById(scenario, deck.pick(plan.opportunity.drawFrom)))
    resolved.push({ ...r, scoreBefore, scoreAfter: maiScore(next) })
    windfall = next.credits - before
  }
  const afterNight = next.credits

  // 5. Turn close.
  const repairs = resolved.reduce((n, r) => n + r.repairCost, 0)
  const repaired = resolved.filter((r) => r.repairCost > 0).map((r) => r.targetAssetId ?? r.eventId)
  const defensesKept = next.counters.length
  const upkeep = defensesKept * scenario.upkeepPerDefense
  next.credits -= repairs + upkeep
  const insolvent = next.credits < 0
  if (repairs > 0) notes.push(`Repairs paid: -${repairs} credits.`)
  if (upkeep > 0) notes.push(`Keeping ${defensesKept} defense${defensesKept === 1 ? '' : 's'}: -${upkeep} credits.`)

  const due = next.pipeline.filter((p) => p.etaTurns <= 1)
  next.pipeline = next.pipeline.filter((p) => p.etaTurns > 1)
  for (const p of next.pipeline) p.etaTurns -= 1
  for (const a of due) {
    next.assets.push({ id: a.id, kind: a.kind, layer: layerFor(a.kind), integrity: 100 })
    notes.push(`${kindLabel[a.kind]} ${a.id} arrived on station and is operational.`)
  }

  const bonusCoverage = coverage(next.assets, offStation)
  const funding = insolvent ? 0 : scenario.incomePerTurn
  const coverageBonus = !insolvent && bonusCoverage >= scenario.slaBonus.coverageMin ? scenario.slaBonus.credits : 0
  next.credits += funding + coverageBonus
  if (insolvent) notes.push('Repairs and defense costs are paid before funding arrives, and the budget could not cover them. Funding is frozen.')
  else notes.push(`Mission funding: +${funding} credits.${coverageBonus > 0 ? ` Coverage bonus: +${coverageBonus} credits.` : ''}`)

  const recovery = hasRetainer(next) ? scenario.recovery.withIrRetainer : scenario.recovery.base
  for (const key of METER_KEYS) next.meters[key] = Math.min(METER_CAP, next.meters[key] + recovery)
  if (!insolvent) {
    for (const a of liveAssets(next.assets)) a.integrity = Math.min(100, a.integrity + ASSET_HEAL_PER_TURN)
  }

  for (const cond of [...next.conditions]) {
    cond.remainingTurns -= 1
    if (cond.remainingTurns <= 0) {
      next.conditions = next.conditions.filter((c) => c.instanceId !== cond.instanceId)
      notes.push(`${cond.name} subsided. The condition has lifted.`)
    }
  }

  const ledger: TurnLedger = {
    start,
    ordered,
    fuel,
    windfall,
    afterNight,
    repairs,
    repaired,
    upkeep,
    defensesKept,
    funding,
    coverageBonus,
    bonusCoverage,
    arrivals: due.map((a) => a.id),
    recovery,
    after: next.credits,
    insolvent,
  }
  const record: TurnRecord = {
    turn: next.turn,
    purchases,
    briefed,
    named,
    events: resolved,
    conditionsActive: pressing,
    ledger,
    creditsAfter: next.credits,
    meters: { ...next.meters },
    coverage: coverage(next.assets),
    maiScore: maiScore(next),
    streak: next.streak,
    bestStreak: next.bestStreak,
    saved: next.saved,
    notes,
  }
  next.history.push(record)

  // Win and loss (spec Section 4; brief 6.1).
  const mai = record.maiScore
  if (insolvent) {
    next.status = 'lost'
    next.lossReason = 'insolvency'
  } else if (mai < scenario.collapseThreshold) {
    next.status = 'lost'
    next.lossReason = 'maiCollapse'
  } else if (next.turn >= scenario.totalTurns) {
    if (mai >= scenario.winThreshold) {
      next.status = 'won'
    } else {
      next.status = 'lost'
      next.lossReason = 'belowThreshold'
    }
  }
  next.turn += 1
  return next
}
