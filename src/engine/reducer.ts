// The turn resolver (spec Sections 4, 6, 9; dynamics per R3.25). Pure and
// deterministic: resolveTurn(state, actions, rng) -> state. No Date, no
// Math.random. Callers derive the rng with turnRng(state.seed, state.turn)
// so replay and reload resolve identically.
//
// Turn order: income and recovery, pipeline arrivals, purchases and surge
// spend, condition pressure, event resolution (threats may create or
// refresh conditions; opportunities grant benefits), condition expiry
// tick, commendations, win/loss.

import type {
  Difficulty,
  Asset,
  ChainFlags,
  Countermeasure,
  GameState,
  IntelForecast,
  ResolvedEvent,
  Scenario,
  ThreatEvent,
  TurnActions,
  TurnRecord,
} from './types'
import type { Rng } from './rng'
import { METER_CAP, assetPrice, coverage, maiScore } from './scoring'

const METER_DAMAGE_PER_SEVERITY = 6
const ASSET_DAMAGE_PER_SEVERITY = 12
const DEBRIS_LOSS_CHANCE_PER_SEVERITY = 0.35
const SSA_MANEUVER_COST = 5
// Exported so UI copy can interpolate the real values instead of
// duplicating them as prose literals that rot when tuning changes.
export const TIER_A_FLEET_SHARE = 1 / 3
export const MITIGATION_PER_COUNTER = 1
export const CHAIN_BONUS = 2
export const SSA_MITIGATION_BONUS = 1
// Dynamics tuning (R3.25). Conditions press every turn they stay live;
// commendations pay out for holding the line under pressure and for
// zeroing an attack outright; surge authority clears a condition on
// demand; deployments take real time to arrive.
export const CONDITION_PRESSURE_PER_SEVERITY = 5
export const RESILIENCE_CREDITS = [0, 8, 14, 20] // index by min(3, active conditions)
export const RESILIENCE_HEAL = [0, 0, 4, 7] // all meters, same tiers
export const MITIGATION_COMMENDATION_CREDITS = 3
export const SURGE_START_TOKENS = 1
export const SURGE_TOKEN_CAP = 3
// You earn a surge token by holding the win line under at least this many
// active conditions. Exported so UI copy interpolates it (R4 item 5).
export const SURGE_EARN_MIN_CONDITIONS = 2
export const IR_RETAINER_BONUS_TOKENS = 1
export const FUSION_RETROFIT_TURNS = 1
export const DEPLOY_ETA: Record<Asset['kind'], { min: number; max: number }> = {
  sat: { min: 2, max: 3 },
  rpoSat: { min: 2, max: 3 },
  groundStation: { min: 1, max: 2 },
  drone: { min: 1, max: 1 },
}
export const DEPLOY_SLIP_CHANCE = 0.25 // sats only, +1 turn

// Difficulty multipliers (R5). Standard is exactly 1 on every axis, so a
// Standard campaign resolves identically to the pre-R5 tuning. Easy eases
// the sustained pressure and widens the budget; Expert does the reverse.
// Every derived value is rounded to an integer, and rounding a value times
// 1 returns that value unchanged.
export interface DifficultyProfile {
  label: string
  blurb: string
  conditionPressure: number
  income: number
  startCredits: number
}

export const DIFFICULTIES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    label: 'EASY',
    blurb: 'Conditions press lighter and the budget runs wider. For learning the deck.',
    conditionPressure: 0.8,
    income: 1.2,
    startCredits: 1.2,
  },
  standard: {
    label: 'STANDARD',
    blurb: 'The tuned campaign. Prepared play wins most runs; reasonable play is a genuine coin flip.',
    conditionPressure: 1,
    income: 1,
    startCredits: 1,
  },
  expert: {
    label: 'EXPERT',
    blurb: 'Conditions bite harder and credits are tight. Every turn of delay costs you.',
    conditionPressure: 1.2,
    income: 0.85,
    startCredits: 0.85,
  },
}

export const conditionPressureFor = (d: Difficulty): number =>
  Math.round(CONDITION_PRESSURE_PER_SEVERITY * DIFFICULTIES[d].conditionPressure)
export const incomeFor = (d: Difficulty, base: number): number => Math.round(base * DIFFICULTIES[d].income)
export const startCreditsFor = (d: Difficulty, base: number): number =>
  Math.round(base * DIFFICULTIES[d].startCredits)

const layerFor = (kind: Asset['kind']): Asset['layer'] =>
  kind === 'drone' ? 'AIR' : kind === 'groundStation' ? 'GROUND' : 'ORBIT'

const kindLabel: Record<Asset['kind'], string> = {
  sat: 'imaging sat',
  rpoSat: 'RPO servicing sat',
  drone: 'drone',
  groundStation: 'ground station',
}

function eventById(scenario: Scenario, id: string): ThreatEvent {
  const ev = scenario.events.find((e) => e.id === id)
  if (!ev) throw new Error(`unknown event id in campaign: ${id}`)
  return ev
}

function counterById(scenario: Scenario, id: string): Countermeasure {
  const cm = scenario.countermeasures.find((c) => c.id === id)
  if (!cm) throw new Error(`unknown countermeasure id: ${id}`)
  return cm
}

const liveAssets = (assets: Asset[]) => assets.filter((a) => a.integrity > 0)
const liveDrones = (assets: Asset[]) => liveAssets(assets).filter((a) => a.kind === 'drone')

function tierAShare(assets: Asset[]): number {
  const sensored = liveAssets(assets).filter((a) => a.kind !== 'groundStation')
  if (sensored.length === 0) return 0
  return sensored.filter((a) => a.tier === 'A').length / sensored.length
}

// Mitigation from owned counters against one event, shared by direct
// resolution and per-turn condition pressure so buying a counter while a
// condition lives reduces its remaining bite.
function mitigationFor(state: GameState, ev: ThreatEvent, notes?: string[]): number {
  let mitigation = 0
  for (const cid of ev.counters) {
    if (!state.counters.includes(cid)) continue
    if (cid === 'tierAAttestation' && tierAShare(state.assets) < TIER_A_FLEET_SHARE) {
      notes?.push('Firmware attestation is in place but most of the fleet is still Tier B.')
      continue
    }
    // Debris mitigation is the paid avoidance burn only (handled in the
    // debrisStrike block), never a passive discount: maneuver fuel has to
    // be spent, so an unfunded SSA subscription does not soften the strike.
    if (cid === 'ssaManeuver' && ev.effect.special === 'debrisStrike') continue
    mitigation += MITIGATION_PER_COUNTER
  }
  return mitigation
}

const jamConditionActive = (state: GameState) => state.conditions.some((c) => c.eventId === 'pnt-jamming')

export function newGame(scenario: Scenario, seed: number, difficulty: Difficulty = 'standard'): GameState {
  const assets = scenario.starterAssets.map((s, i) => ({
    id: `start-${s.kind}-${i + 1}`,
    kind: s.kind,
    layer: layerFor(s.kind),
    tier: s.tier,
    integrity: 100,
  }))
  const state: GameState = {
    scenario,
    seed,
    turn: 1,
    status: 'playing',
    difficulty,
    credits: startCreditsFor(difficulty, scenario.startCredits),
    intelLevel: 0,
    irRetainer: false,
    assets,
    counters: [],
    meters: { linkAvailability: 100, dataIntegrity: 100, sensorIntegrity: 100 },
    flags: { lidarFallback: false },
    conditions: [],
    pipeline: [],
    pendingCounters: [],
    surgeTokens: SURGE_START_TOKENS,
    intelBoostTurns: 0,
    forecast: { turn: 1, lines: [] },
    history: [],
  }
  state.forecast = forecastFor(state, 1)
  return state
}

// Effective intel fidelity: investment level plus any temporary boost from
// an allied data share, capped at the top level.
export function effectiveIntel(state: GameState): number {
  return Math.min(3, state.intelLevel + (state.intelBoostTurns > 0 ? 1 : 0))
}

// Intel brief fidelity scales with investment (spec Section 4).
export function forecastFor(state: GameState, turn: number): IntelForecast {
  const { scenario } = state
  const intelLevel = effectiveIntel(state)
  const plan = scenario.campaign.find((p) => p.turn === turn)
  if (!plan || plan.slots.length === 0) {
    return { turn, lines: ['No adversary activity forecast. Quiet is not the same as safe.'] }
  }
  const slotEvents = plan.slots.map((s) =>
    s.fixed ? [eventById(scenario, s.fixed)] : (s.drawFrom ?? []).map((id) => eventById(scenario, id)),
  )
  const lines: string[] = []
  if (intelLevel === 0) {
    lines.push('Forecast unavailable at intel level 0. Raise intel investment in the procure phase to see what is coming.')
  } else if (intelLevel === 1) {
    const layers = [...new Set(slotEvents.flat().flatMap((e) => e.layers))]
    lines.push(`Indicators point at the ${layers.join(' and ')} segment${layers.length > 1 ? 's' : ''}.`)
  } else if (intelLevel === 2) {
    const layers = [...new Set(slotEvents.flat().flatMap((e) => e.layers))]
    const vectors = [...new Set(slotEvents.flat().map((e) => e.vector))]
    lines.push(`Likely target: ${layers.join(', ')}. Signature class: ${vectors.join(', ')}.`)
  } else {
    for (const candidates of slotEvents) {
      lines.push(
        candidates.length === 1
          ? `Assessed likely: ${candidates[0].name}.`
          : `Assessed likely, one of: ${candidates.map((e) => e.name).join(' / ')}.`,
      )
    }
  }
  return { turn, lines }
}

function applyPurchases(state: GameState, actions: TurnActions, rng: Rng, purchases: string[]): void {
  const { scenario } = state
  if (actions.buyIntelLevel && state.intelLevel !== 3) {
    const cost = scenario.prices.intelLevels[state.intelLevel]
    state.credits -= cost
    state.intelLevel = (state.intelLevel + 1) as GameState['intelLevel']
    purchases.push(`Intel investment to level ${state.intelLevel} (-${cost})`)
  }
  if (actions.buyIrRetainer && !state.irRetainer) {
    const ir = counterById(scenario, 'irRetainer')
    state.credits -= ir.cost
    state.irRetainer = true
    state.counters.push('irRetainer')
    state.surgeTokens = Math.min(SURGE_TOKEN_CAP, state.surgeTokens + IR_RETAINER_BONUS_TOKENS)
    purchases.push(`${ir.name} (-${ir.cost}, +${IR_RETAINER_BONUS_TOKENS} surge authority)`)
  }
  for (const id of [...new Set(actions.buyCounters)]) {
    if (id === 'irRetainer' || id === 'intelInvestment' || state.counters.includes(id)) continue
    if (state.pendingCounters.some((p) => p.id === id)) continue
    const cm = counterById(scenario, id)
    state.credits -= cm.cost
    if (id === 'sensorFusion') {
      state.pendingCounters.push({ id, etaTurns: FUSION_RETROFIT_TURNS })
      purchases.push(`${cm.name} (-${cm.cost}, retrofit, active in ${FUSION_RETROFIT_TURNS} turn)`)
    } else {
      state.counters.push(id)
      purchases.push(`${cm.name} (-${cm.cost})`)
    }
  }
  actions.buyAssets.forEach((buy, i) => {
    const price = assetPrice(scenario, buy.kind, buy.tier)
    state.credits -= price
    const eta = DEPLOY_ETA[buy.kind]
    let etaTurns = eta.min + rng.int(eta.max - eta.min + 1)
    if ((buy.kind === 'sat' || buy.kind === 'rpoSat') && rng.chance(DEPLOY_SLIP_CHANCE)) {
      etaTurns += 1
    }
    state.pipeline.push({
      id: `t${state.turn}-${buy.kind}-${i + 1}`,
      kind: buy.kind,
      tier: buy.tier,
      etaTurns,
    })
    purchases.push(`${kindLabel[buy.kind]} Tier ${buy.tier} (-${price}, in transit)`)
  })
  if (state.credits < 0) {
    throw new Error('invalid actions: purchases exceed available credits')
  }
}

function resolveThreat(state: GameState, ev: ThreatEvent, rng: Rng, flags: ChainFlags): ResolvedEvent {
  const notes: string[] = []
  let chainBonus = 0
  let fizzled = false

  // BLACKOUT CHAIN (spec Section 6): LiDAR attacks gain potency while
  // drones run on LiDAR odometry, unless fusion cross-checks or an
  // assured-tier fleet break the chain.
  if (ev.effect.special === 'chainExploit' && flags.lidarFallback) {
    const fusion = state.counters.includes('sensorFusion')
    const allTierA = liveDrones(state.assets).every((d) => d.tier === 'A') && liveDrones(state.assets).length > 0
    if (fusion || allTierA) {
      notes.push(
        fusion
          ? 'Sensor fusion cross-checks rejected the injected returns. Chain broken.'
          : 'Tier A sensor stack resisted the injection. Chain broken.',
      )
    } else {
      chainBonus = CHAIN_BONUS
      notes.push('KESTREL is navigating on LiDAR alone. The injection landed at full potency.')
    }
  }

  let mitigation = mitigationFor(state, ev, notes)

  // Tier A is immune to the implant (spec Sections 5 and 8): the implant
  // both activates in and damages a Tier B host only.
  let implantHost: Asset | undefined
  if (ev.effect.special === 'implantTierB') {
    const tierB = liveAssets(state.assets).filter((a) => a.tier === 'B' && a.kind !== 'groundStation')
    if (tierB.length === 0) {
      fizzled = true
      notes.push('The implant found no Tier B host in the fleet. Assured supply chain held.')
    } else {
      implantHost = rng.pick(tierB)
      notes.push(`Dormant firmware implant activated in ${kindLabel[implantHost.kind]} ${implantHost.id}.`)
    }
  }

  if (ev.effect.special === 'debrisStrike' && state.counters.includes('ssaManeuver')) {
    if (state.credits >= SSA_MANEUVER_COST) {
      mitigation += SSA_MITIGATION_BONUS
      state.credits -= SSA_MANEUVER_COST
      notes.push(`SSA warning received; conjunction avoidance burn executed (-${SSA_MANEUVER_COST}).`)
    } else {
      notes.push('SSA warning received, but the maneuver budget is empty. No avoidance burn.')
    }
  }

  const effectiveSeverity = fizzled ? 0 : Math.max(0, ev.baseSeverity + chainBonus - mitigation)

  if (effectiveSeverity > 0) {
    for (const meter of ev.effect.meters) {
      state.meters[meter] = Math.max(0, state.meters[meter] - effectiveSeverity * METER_DAMAGE_PER_SEVERITY)
    }
    // A landed event with a duration becomes (or refreshes) an active
    // condition. The rolled span is hidden from the player.
    if (ev.duration) {
      const span = ev.duration.min + rng.int(ev.duration.max - ev.duration.min + 1)
      const existing = state.conditions.find((c) => c.eventId === ev.id)
      if (existing) {
        existing.remainingTurns = Math.max(existing.remainingTurns, span)
        notes.push(`${ev.name.split(' (')[0]} pressure renewed. The condition persists.`)
      } else {
        state.conditions.push({
          instanceId: `${ev.id}-t${state.turn}`,
          eventId: ev.id,
          name: ev.name.split(' (')[0],
          startedTurn: state.turn,
          remainingTurns: span,
          baseSeverity: ev.baseSeverity,
        })
        notes.push('This is not a single strike: it is now an active condition applying pressure every turn.')
      }
      if (ev.effect.special === 'jamsGnss' && liveDrones(state.assets).length > 0) {
        flags.lidarFallback = true
        notes.push('GNSS denied across the AO. KESTREL drones fell back to LiDAR odometry.')
      }
    }
    if (ev.effect.special === 'debrisStrike' && rng.chance(effectiveSeverity * DEBRIS_LOSS_CHANCE_PER_SEVERITY)) {
      const sats = liveAssets(state.assets).filter((a) => a.layer === 'ORBIT')
      if (sats.length > 0) {
        const hit = rng.pick(sats)
        hit.integrity = 0
        notes.push(`Conjunction with uncontrolled debris. ${kindLabel[hit.kind]} ${hit.id} lost.`)
      }
    }
    const candidates =
      ev.effect.special === 'implantTierB'
        ? [] // the implant damages its Tier B host, picked above
        : liveAssets(state.assets).filter((a) => ev.layers.includes(a.layer))
    if (implantHost) candidates.push(implantHost)
    if (candidates.length > 0 && ev.effect.special !== 'debrisStrike' && ev.effect.assetDamage !== false) {
      const target = implantHost ?? rng.pick(candidates)
      target.integrity = Math.max(0, target.integrity - effectiveSeverity * ASSET_DAMAGE_PER_SEVERITY)
      notes.push(
        target.integrity === 0
          ? `${kindLabel[target.kind]} ${target.id} disabled.`
          : `${kindLabel[target.kind]} ${target.id} degraded to ${target.integrity} percent integrity.`,
      )
    }
  } else if (!fizzled) {
    notes.push('Posture held. The attempt was mitigated below effect threshold.')
  }

  const repairCost = effectiveSeverity * ev.effect.repairCostPerSeverity
  state.credits -= repairCost

  return {
    eventId: ev.id,
    name: ev.name,
    baseSeverity: ev.baseSeverity,
    chainBonus,
    mitigation,
    effectiveSeverity,
    repairCost,
    notes,
    firedTechniqueRefs: effectiveSeverity > 0 ? ev.techniqueRefs : [],
  }
}

function resolveOpportunity(state: GameState, ev: ThreatEvent): ResolvedEvent {
  const notes: string[] = []
  const b = ev.benefit ?? {}
  if (b.credits) {
    state.credits += b.credits
    notes.push(`+${b.credits} credits appropriated to the program.`)
  }
  if (b.intelBoostTurns) {
    state.intelBoostTurns = Math.max(state.intelBoostTurns, b.intelBoostTurns)
    notes.push(`Allied tracking data raises forecast fidelity by one level for ${b.intelBoostTurns} turns.`)
  }
  if (b.expediteTurns) {
    // Only an item still more than a turn out can actually arrive sooner;
    // one already due next turn cannot be advanced, so the slot is resold.
    const soonest = state.pipeline
      .filter((p) => p.etaTurns > 1)
      .sort((x, y) => x.etaTurns - y.etaTurns)[0]
    if (soonest) {
      soonest.etaTurns = Math.max(1, soonest.etaTurns - b.expediteTurns)
      notes.push(`${kindLabel[soonest.kind]} ${soonest.id} manifested on the rideshare: arrival moved up a turn.`)
    } else {
      state.credits += 5
      notes.push('No deployment far enough out to expedite; the slot resold for +5 credits.')
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
  }
}

export function resolveTurn(state: GameState, actions: TurnActions, rng: Rng): GameState {
  if (state.status !== 'playing') throw new Error('game is over; cannot resolve further turns')
  const scenario = state.scenario
  // Structured clone keeps the reducer pure without a deep-merge library.
  const next: GameState = JSON.parse(JSON.stringify(state))
  const notes: string[] = []
  const purchases: string[] = []
  const commendations: string[] = []
  // Boost turns granted this turn must not be counted down before they are
  // used, so the intel share delivers the full span it advertises.
  const intelBoostBefore = next.intelBoostTurns

  // Income, SLA bonus, recovery.
  next.credits += incomeFor(next.difficulty, scenario.incomePerTurn)
  if (coverage(next.assets) >= scenario.slaBonus.coverageMin) {
    next.credits += scenario.slaBonus.credits
    notes.push(`Coverage SLA met: +${scenario.slaBonus.credits} credits.`)
  }
  const recovery = next.irRetainer ? scenario.recovery.withIrRetainer : scenario.recovery.base
  for (const key of ['linkAvailability', 'dataIntegrity', 'sensorIntegrity'] as const) {
    next.meters[key] = Math.min(METER_CAP, next.meters[key] + recovery)
  }

  // Pipeline arrivals, then countdown for what is still in transit.
  const arrivals = next.pipeline.filter((p) => p.etaTurns <= 1)
  next.pipeline = next.pipeline.filter((p) => p.etaTurns > 1)
  for (const p of next.pipeline) p.etaTurns -= 1
  for (const a of arrivals) {
    next.assets.push({ id: a.id, kind: a.kind, layer: layerFor(a.kind), tier: a.tier, integrity: 100 })
    notes.push(`${kindLabel[a.kind]} ${a.id} arrived on station and is operational.`)
  }
  const counterArrivals = next.pendingCounters.filter((p) => p.etaTurns <= 1)
  next.pendingCounters = next.pendingCounters.filter((p) => p.etaTurns > 1)
  for (const p of next.pendingCounters) p.etaTurns -= 1
  for (const c of counterArrivals) {
    next.counters.push(c.id)
    notes.push(`${counterById(scenario, c.id).name} retrofit complete and active.`)
  }

  applyPurchases(next, actions, rng, purchases)

  // Surge authority: clear one named active condition before pressure.
  if (actions.spendSurgeOn) {
    const idx = next.conditions.findIndex((c) => c.instanceId === actions.spendSurgeOn)
    if (idx >= 0 && next.surgeTokens > 0) {
      const cleared = next.conditions[idx]
      next.conditions.splice(idx, 1)
      next.surgeTokens -= 1
      notes.push(`Surge authority spent: ${cleared.name} cleared by an emergency response push.`)
    }
  }

  // Per-turn pressure from live conditions. Mitigation is recomputed, so a
  // counter bought this turn blunts the rest of the condition's life.
  const enduredConditions = next.conditions.map((c) => c.name)
  for (const cond of next.conditions) {
    const def = eventById(scenario, cond.eventId)
    const pressureSeverity = Math.max(0, cond.baseSeverity - mitigationFor(next, def))
    if (pressureSeverity > 0) {
      for (const meter of def.effect.meters) {
        next.meters[meter] = Math.max(
          0,
          next.meters[meter] - pressureSeverity * conditionPressureFor(next.difficulty),
        )
      }
      notes.push(`${cond.name} continues: sustained pressure on the mission.`)
    } else {
      notes.push(`${cond.name} continues, but current defenses hold it below effect threshold.`)
    }
  }

  // Chain state entering resolution: the jam condition holds the fallback.
  next.flags.lidarFallback = jamConditionActive(next) && liveDrones(next.assets).length > 0
  if (next.flags.lidarFallback) {
    notes.push('KESTREL remains in LiDAR-fallback navigation while GNSS denial persists.')
  }

  // The adversary plays the deck, then the rare opportunity roll.
  const plan = scenario.campaign.find((p) => p.turn === next.turn)
  const resolved: ResolvedEvent[] = []
  for (const slot of plan?.slots ?? []) {
    const id = slot.fixed ?? (slot.drawFrom && slot.drawFrom.length > 0 ? rng.pick(slot.drawFrom) : undefined)
    if (!id) continue
    resolved.push(resolveThreat(next, eventById(scenario, id), rng, next.flags))
  }
  if (plan?.opportunity && plan.opportunity.drawFrom.length > 0 && rng.chance(plan.opportunity.chance)) {
    const id = rng.pick(plan.opportunity.drawFrom)
    resolved.push(resolveOpportunity(next, eventById(scenario, id)))
  }

  // Conditions age at end of turn; expiry is announced.
  for (const cond of [...next.conditions]) {
    cond.remainingTurns -= 1
    if (cond.remainingTurns <= 0) {
      next.conditions = next.conditions.filter((c) => c.instanceId !== cond.instanceId)
      notes.push(`${cond.name} subsided. The condition has lifted.`)
    }
  }
  next.flags.lidarFallback = jamConditionActive(next) && liveDrones(next.assets).length > 0

  // Commendations (R3.25): zeroing a live attack, and holding the win line
  // while conditions press.
  for (const ev of resolved) {
    const def = eventById(scenario, ev.eventId)
    if ((def.kind ?? 'threat') === 'threat' && ev.effectiveSeverity === 0 && ev.mitigation > 0 && ev.baseSeverity > 0) {
      next.credits += MITIGATION_COMMENDATION_CREDITS
      commendations.push(
        `Mitigation commendation: ${ev.name.split(' (')[0]} fully countered (+${MITIGATION_COMMENDATION_CREDITS} credits).`,
      )
    }
  }
  const maiNow = maiScore(next)
  if (enduredConditions.length > 0 && maiNow >= scenario.winThreshold) {
    const tier = Math.min(3, enduredConditions.length)
    next.credits += RESILIENCE_CREDITS[tier]
    if (RESILIENCE_HEAL[tier] > 0) {
      for (const key of ['linkAvailability', 'dataIntegrity', 'sensorIntegrity'] as const) {
        next.meters[key] = Math.min(METER_CAP, next.meters[key] + RESILIENCE_HEAL[tier])
      }
    }
    commendations.push(
      `Resilience commendation, tier ${tier}: held the win line under ${enduredConditions.length} active condition${enduredConditions.length > 1 ? 's' : ''} (+${RESILIENCE_CREDITS[tier]} credits${RESILIENCE_HEAL[tier] > 0 ? `, +${RESILIENCE_HEAL[tier]} all meters` : ''}).`,
    )
    if (enduredConditions.length >= SURGE_EARN_MIN_CONDITIONS && next.surgeTokens < SURGE_TOKEN_CAP) {
      next.surgeTokens += 1
      commendations.push('Surge authority granted for sustained operations under pressure (+1, spend to clear a condition).')
    }
  }

  // Only count down a boost that was already running at the start of the
  // turn; one granted this turn keeps its full advertised span.
  if (next.intelBoostTurns > 0 && next.intelBoostTurns <= intelBoostBefore) next.intelBoostTurns -= 1

  const record: TurnRecord = {
    turn: next.turn,
    creditsAfter: next.credits,
    purchases,
    events: resolved,
    meters: { ...next.meters },
    coverage: coverage(next.assets),
    maiScore: maiScore(next),
    flags: { ...next.flags },
    conditionsActive: enduredConditions,
    commendations,
    surgeTokensAfter: next.surgeTokens,
    notes,
  }
  next.history.push(record)

  // Win and loss (spec Section 4).
  const mai = record.maiScore
  if (next.credits < 0) {
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
  if (next.status === 'playing') {
    next.forecast = forecastFor(next, next.turn)
  }
  return next
}
