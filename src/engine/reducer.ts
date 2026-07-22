// The turn resolver (spec Sections 4, 6, 9). Pure and deterministic:
// resolveTurn(state, actions, rng) -> state. No Date, no Math.random.
// Callers derive the rng with turnRng(state.seed, state.turn) so replay
// and reload resolve identically.

import type {
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
import { assetPrice, coverage, maiScore } from './scoring'

const METER_DAMAGE_PER_SEVERITY = 6
const ASSET_DAMAGE_PER_SEVERITY = 12
const DEBRIS_LOSS_CHANCE_PER_SEVERITY = 0.2
const SSA_MANEUVER_COST = 5
const GNSS_JAM_DURATION = 2
// Exported so UI copy can interpolate the real values instead of
// duplicating them as prose literals that rot when tuning changes.
export const TIER_A_FLEET_SHARE = 1 / 3
export const MITIGATION_PER_COUNTER = 1
export const CHAIN_BONUS = 2
export const SSA_MITIGATION_BONUS = 2

// Tier A attestation only pulls its weight once a meaningful share of the
// sensored fleet actually flies Tier A packages.
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

export function newGame(scenario: Scenario, seed: number): GameState {
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
    credits: scenario.startCredits,
    intelLevel: 0,
    irRetainer: false,
    assets,
    counters: [],
    meters: { linkAvailability: 100, dataIntegrity: 100, sensorIntegrity: 100 },
    flags: { gnssJammedTurns: 0, lidarFallback: false },
    forecast: { turn: 1, lines: [] },
    history: [],
  }
  state.forecast = forecastFor(state, 1)
  return state
}

// Intel brief fidelity scales with investment (spec Section 4).
export function forecastFor(state: GameState, turn: number): IntelForecast {
  const { scenario, intelLevel } = state
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

function applyPurchases(state: GameState, actions: TurnActions, purchases: string[]): void {
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
    purchases.push(`${ir.name} (-${ir.cost})`)
  }
  for (const id of [...new Set(actions.buyCounters)]) {
    if (id === 'irRetainer' || id === 'intelInvestment' || state.counters.includes(id)) continue
    const cm = counterById(scenario, id)
    state.credits -= cm.cost
    state.counters.push(id)
    purchases.push(`${cm.name} (-${cm.cost})`)
  }
  actions.buyAssets.forEach((buy, i) => {
    const price = assetPrice(scenario, buy.kind, buy.tier)
    state.credits -= price
    state.assets.push({
      id: `t${state.turn}-${buy.kind}-${i + 1}`,
      kind: buy.kind,
      layer: layerFor(buy.kind),
      tier: buy.tier,
      integrity: 100,
    })
    purchases.push(`${kindLabel[buy.kind]} Tier ${buy.tier} (-${price})`)
  })
  if (state.credits < 0) {
    throw new Error('invalid actions: purchases exceed available credits')
  }
}

function resolveEvent(state: GameState, ev: ThreatEvent, rng: Rng, flags: ChainFlags): ResolvedEvent {
  const notes: string[] = []
  let chainBonus = 0
  let mitigation = 0
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

  for (const cid of ev.counters) {
    if (!state.counters.includes(cid)) continue
    if (cid === 'tierAAttestation' && tierAShare(state.assets) < TIER_A_FLEET_SHARE) {
      notes.push('Firmware attestation is in place but most of the fleet is still Tier B.')
      continue
    }
    mitigation += MITIGATION_PER_COUNTER
  }

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
    if (ev.effect.special === 'jamsGnss') {
      flags.gnssJammedTurns = Math.max(flags.gnssJammedTurns, GNSS_JAM_DURATION)
      if (liveDrones(state.assets).length > 0) {
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
    const targetLayers = ev.layers
    const candidates =
      ev.effect.special === 'implantTierB'
        ? [] // the implant damages its Tier B host, picked above
        : liveAssets(state.assets).filter((a) => targetLayers.includes(a.layer))
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

export function resolveTurn(state: GameState, actions: TurnActions, rng: Rng): GameState {
  if (state.status !== 'playing') throw new Error('game is over; cannot resolve further turns')
  const scenario = state.scenario
  // Structured clone keeps the reducer pure without a deep-merge library.
  const next: GameState = JSON.parse(JSON.stringify(state))
  const notes: string[] = []
  const purchases: string[] = []

  // Income, SLA bonus, recovery.
  next.credits += scenario.incomePerTurn
  if (coverage(next.assets) >= scenario.slaBonus.coverageMin) {
    next.credits += scenario.slaBonus.credits
    notes.push(`Coverage SLA met: +${scenario.slaBonus.credits} credits.`)
  }
  const recovery = next.irRetainer ? scenario.recovery.withIrRetainer : scenario.recovery.base
  for (const key of ['linkAvailability', 'dataIntegrity', 'sensorIntegrity'] as const) {
    next.meters[key] = Math.min(100, next.meters[key] + recovery)
  }

  applyPurchases(next, actions, purchases)

  // Chain state entering the turn.
  next.flags.lidarFallback = next.flags.gnssJammedTurns > 0 && liveDrones(next.assets).length > 0
  if (next.flags.lidarFallback) {
    notes.push('KESTREL remains in LiDAR-fallback navigation while GNSS denial persists.')
  }

  // COLDWAKE plays the deck.
  const plan = scenario.campaign.find((p) => p.turn === next.turn)
  const resolved: ResolvedEvent[] = []
  for (const slot of plan?.slots ?? []) {
    const id = slot.fixed ?? (slot.drawFrom && slot.drawFrom.length > 0 ? rng.pick(slot.drawFrom) : undefined)
    if (!id) continue
    resolved.push(resolveEvent(next, eventById(scenario, id), rng, next.flags))
  }

  // Jam clock ticks at end of turn.
  if (next.flags.gnssJammedTurns > 0) next.flags.gnssJammedTurns -= 1
  next.flags.lidarFallback = next.flags.gnssJammedTurns > 0 && liveDrones(next.assets).length > 0

  const record: TurnRecord = {
    turn: next.turn,
    creditsAfter: next.credits,
    purchases,
    events: resolved,
    meters: { ...next.meters },
    coverage: coverage(next.assets),
    maiScore: maiScore(next),
    flags: { ...next.flags },
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
