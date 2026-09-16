// Presentation adapter (game-feel brief section 3, Round 2): derives the
// beat-by-beat grain the engine log does not carry. resolveTurn records
// per-event severity math and prose notes, but only an end-of-turn meter
// snapshot; condition apply and clear, deployment arrivals, asset damage
// and commendations exist only as note text. This module walks the
// engine's documented turn order over a shadow copy of the before-state,
// emitting one Beat per step with an exact Patch, and closes with a
// residual reconciliation against the real after-state. The engine and
// the content modules are untouched; nothing here feeds resolveTurn.
//
// Every number comes from the record, the scenario, or an exported engine
// constant. Nothing is mirrored and no constant is parsed out of note
// prose (brief v0.5, principle 7); the engine exports the three values
// presentation needs. Note text is still read for the two things only the
// engine's own rolls know: which asset an event hit and the integrity it
// was left at, and which in-transit item a rideshare expedited. Private
// engine helpers are restated rather than imported: mitigationFor,
// tierAShare, liveAssets and liveDrones, the short-name split, and the
// GNSS-denial test behind lidarFallback (keyed here on the event's effect
// where the engine keys on the event id; the two agree for this deck).
// Two fallbacks restate engine formats only if an engine invariant is ever
// broken (an arriving asset missing from after.assets; a condition applied
// and gone in the same turn). tests/director.spec.ts proves the whole
// ledger, restatements included, reproduces the engine's after-state with
// an empty residual on every turn of hundreds of games, so none of it can
// drift silently.

import {
  IR_RETAINER_BONUS_TOKENS,
  METER_DAMAGE_PER_SEVERITY,
  MITIGATION_COMMENDATION_CREDITS,
  MITIGATION_PER_COUNTER,
  RESILIENCE_CREDITS,
  RESILIENCE_HEAL,
  RIDESHARE_RESELL_CREDITS,
  SSA_MANEUVER_COST,
  SURGE_EARN_MIN_CONDITIONS,
  SURGE_TOKEN_CAP,
  TIER_A_FLEET_SHARE,
  conditionPressureFor,
  incomeFor,
} from '../engine/reducer'
import { METER_CAP, assetPrice, coverage, maiScore } from '../engine/scoring'
import type { ActiveCondition, Asset, GameState, Scenario, ThreatEvent } from '../engine/types'
import { applyPatch, cloneModeled, residualPatch } from './patch'
import { kindLabels } from '../ui/labels'
import { type Beat, type BeatKind, type MeterKey, type Patch } from './types'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

function eventById(scenario: Scenario, id: string): ThreatEvent {
  const ev = scenario.events.find((e) => e.id === id)
  if (!ev) throw new Error(`deriveBeats: unknown event id ${id}`)
  return ev
}

const shortName = (ev: ThreatEvent) => ev.name.split(' (')[0]
const liveAssets = (assets: Asset[]) => assets.filter((a) => a.integrity > 0)
const liveDrones = (assets: Asset[]) => liveAssets(assets).filter((a) => a.kind === 'drone')

function tierAShare(assets: Asset[]): number {
  const sensored = liveAssets(assets).filter((a) => a.kind !== 'groundStation')
  if (sensored.length === 0) return 0
  return sensored.filter((a) => a.tier === 'A').length / sensored.length
}

// The engine's mitigation rule, restated: owned counters on the event's
// list count MITIGATION_PER_COUNTER each; attestation only once enough of
// the sensored fleet flies Tier A; SSA never softens a debris strike
// passively (the paid burn is recorded separately in the event's notes).
function mitigationFor(state: GameState, ev: ThreatEvent): number {
  let m = 0
  for (const cid of ev.counters) {
    if (!state.counters.includes(cid)) continue
    if (cid === 'tierAAttestation' && tierAShare(state.assets) < TIER_A_FLEET_SHARE) continue
    if (cid === 'ssaManeuver' && ev.effect.special === 'debrisStrike') continue
    m += MITIGATION_PER_COUNTER
  }
  return m
}

// A GNSS-denial condition holds the drones in LiDAR fallback. Keyed on the
// event's effect; the engine keys on the event id, and the ledger test is
// the tripwire should the deck ever make those differ.
function jamActive(state: GameState): boolean {
  return state.conditions.some((c) => eventById(state.scenario, c.eventId).effect.special === 'jamsGnss')
}

const lidarFallbackFor = (state: GameState) => jamActive(state) && liveDrones(state.assets).length > 0

// Clamped meter deltas against the running value, so the patch carries the
// exact number that moved.
function damage(state: GameState, key: MeterKey, amount: number): number {
  return -Math.min(state.meters[key], amount)
}
function heal(state: GameState, key: MeterKey, amount: number): number {
  return Math.min(METER_CAP - state.meters[key], amount)
}

const techniques = (ev: ThreatEvent) => ev.techniqueRefs.map((r) => ({ tag: `${r.framework} ${r.id}`, url: r.url }))

// Note templates from resolveThreat that carry an asset id and its
// resulting integrity. Asset ids are stable engine strings
// (start-<kind>-<n>, t<turn>-<kind>-<n>); the implant activation note also
// names a host but reports no damage, and the rideshare note names a
// pipeline id, so the match requires the outcome word.
const ASSET_OUTCOME =
  /\b((?:start|t\d+)-(?:sat|rpoSat|drone|groundStation)-\d+) (?:degraded to (\d+) percent integrity|disabled|lost)\./
const EXPEDITED = /\b((?:start|t\d+)-(?:sat|rpoSat|drone|groundStation)-\d+) manifested on the rideshare/
// The engine only executes the avoidance burn when it can afford it, so
// the note says whether it happened; the amount comes from the constant.
const SSA_BURN_EXECUTED = 'conjunction avoidance burn executed'
const RESELL_NOTE = 'resold for'

const isConditionNote = (n: string) =>
  n.startsWith('This is not a single strike') ||
  n.includes('pressure renewed. The condition persists.') ||
  n.startsWith('GNSS denied across the AO')

export function deriveBeats(before: GameState, after: GameState): Beat[] {
  const record = after.history[after.history.length - 1]
  if (!record || record.turn !== before.turn || after.history.length !== before.history.length + 1) {
    throw new Error('deriveBeats: after is not the resolution of before')
  }
  const scenario = before.scenario
  const turn = before.turn
  const beats: Beat[] = []
  let shadow: GameState = cloneModeled(before)

  type BeatInput = Pick<Beat, 'kind' | 'title'> & Partial<Omit<Beat, 'id' | 'kind' | 'title'>>
  const push = (b: BeatInput): Beat => {
    const beat: Beat = {
      id: `t${turn}-${String(beats.length).padStart(2, '0')}-${b.kind}${b.subjectId ? `-${b.subjectId}` : ''}`,
      kind: b.kind,
      visible: b.visible ?? true,
      title: b.title,
      subjectId: b.subjectId,
      cueKey: b.cueKey ?? `beat:${b.kind}`,
      techniques: b.techniques,
      layers: b.layers,
      severity: b.severity,
      lines: b.lines ?? [],
      patch: b.patch ?? {},
      lost: b.lost,
    }
    shadow = applyPatch(shadow, beat.patch)
    beats.push(beat)
    return beat
  }
  const noteStarting = (prefix: string) => record.notes.filter((n) => n.startsWith(prefix))
  const noteIncluding = (needle: string) => record.notes.filter((n) => n.includes(needle))

  // 1. Income, SLA, recovery, and the in-transit countdown.
  {
    const income = incomeFor(before.difficulty, scenario.incomePerTurn)
    const sla = coverage(shadow.assets) >= scenario.slaBonus.coverageMin ? scenario.slaBonus.credits : 0
    const recovery = shadow.irRetainer ? scenario.recovery.withIrRetainer : scenario.recovery.base
    const patch: Patch = { credits: income + sla, meters: {} }
    for (const key of ['linkAvailability', 'dataIntegrity', 'sensorIntegrity'] as MeterKey[]) {
      const d = heal(shadow, key, recovery)
      if (d) patch.meters![key] = d
    }
    const pipelineEta: Record<string, number> = {}
    for (const p of shadow.pipeline) if (p.etaTurns > 1) pipelineEta[p.id] = p.etaTurns - 1
    if (Object.keys(pipelineEta).length) patch.pipelineEta = pipelineEta
    const pendingEta: Patch['pendingCountersEta'] = {}
    for (const p of shadow.pendingCounters) if (p.etaTurns > 1) pendingEta[p.id] = p.etaTurns - 1
    if (Object.keys(pendingEta).length) patch.pendingCountersEta = pendingEta
    push({
      kind: 'turn-start',
      title: `Turn ${turn}: income +${income}${sla ? `, coverage SLA +${sla}` : ''}, recovery +${recovery}`,
      lines: noteStarting('Coverage SLA met'),
      patch,
    })
  }

  // 2. Arrivals: assets on station, retrofits active.
  const arrivedCounters = new Set<string>()
  for (const p of before.pipeline.filter((p) => p.etaTurns <= 1)) {
    const landed = after.assets.find((a) => a.id === p.id)
    const asset: Asset = landed
      ? { ...landed, integrity: 100 }
      : { id: p.id, kind: p.kind, layer: p.kind === 'drone' ? 'AIR' : p.kind === 'groundStation' ? 'GROUND' : 'ORBIT', tier: p.tier, integrity: 100 }
    push({
      kind: 'deploy-arrived',
      title: `${kindLabels[p.kind]} ${p.tier} on station`,
      subjectId: p.id,
      lines: noteIncluding(`${p.id} arrived on station`),
      patch: { pipelineRemove: [p.id], assetsAdd: [asset] },
    })
  }
  for (const c of before.pendingCounters.filter((p) => p.etaTurns <= 1)) {
    arrivedCounters.add(c.id)
    const cm = scenario.countermeasures.find((x) => x.id === c.id)
    push({
      kind: 'deploy-arrived',
      title: `${cm?.name ?? c.id} retrofit complete`,
      subjectId: c.id,
      cueKey: `counter:${c.id}`,
      lines: noteIncluding('retrofit complete'),
      patch: { pendingCountersRemove: [c.id], countersAdd: [c.id] },
    })
  }

  // A rideshare opportunity this turn may have expedited one in-transit
  // entry, possibly one bought this very turn. The engine names it in the
  // event's note; the rolled ETA of a same-turn purchase is the after-state
  // ETA plus the expedite amount. That is exact while expediteTurns is 1:
  // the engine only expedites entries above 1 and clamps at 1, so the clamp
  // never binds. A larger expedite would make a rolled ETA of 2 ambiguous;
  // the zero-residual test would still pass (the shadow ends on the same
  // ETA), only the slip beat could then be missed.
  const expedite = (() => {
    for (const ev of record.events) {
      const def = eventById(scenario, ev.eventId)
      const n = def.benefit?.expediteTurns
      if (!n) continue
      for (const note of ev.notes) {
        const m = note.match(EXPEDITED)
        if (m) return { id: m[1], turns: n }
      }
    }
    return null
  })()

  // 3. Purchases, recovered from the diff plus scenario prices.
  const boughtAssets = after.pipeline
    .filter((p) => !before.pipeline.some((q) => q.id === p.id))
    .map((p) => (expedite && p.id === expedite.id ? { ...p, etaTurns: p.etaTurns + expedite.turns } : { ...p }))
  {
    const intelBought = after.intelLevel > before.intelLevel
    const irBought = !before.irRetainer && after.irRetainer
    const newCounters = after.counters.slice(before.counters.length).filter((id) => !arrivedCounters.has(id))
    const boughtPending = after.pendingCounters.filter((p) => !before.pendingCounters.some((q) => q.id === p.id))
    const cmCost = (id: string) => scenario.countermeasures.find((c) => c.id === id)?.cost ?? 0
    let cost = 0
    const patch: Patch = {}
    if (intelBought && before.intelLevel !== 3) {
      cost += scenario.prices.intelLevels[before.intelLevel]
      patch.intelLevel = after.intelLevel
    }
    if (irBought) {
      cost += cmCost('irRetainer')
      patch.irRetainer = true
      const tokens = Math.min(SURGE_TOKEN_CAP, shadow.surgeTokens + IR_RETAINER_BONUS_TOKENS) - shadow.surgeTokens
      if (tokens) patch.surgeTokens = tokens
    }
    for (const id of newCounters) if (id !== 'irRetainer') cost += cmCost(id)
    if (newCounters.length) patch.countersAdd = newCounters
    for (const p of boughtPending) cost += cmCost(p.id)
    if (boughtPending.length) patch.pendingCountersAdd = clone(boughtPending)
    for (const p of boughtAssets) cost += assetPrice(scenario, p.kind, p.tier)
    if (boughtAssets.length) patch.pipelineAdd = clone(boughtAssets)
    if (cost) patch.credits = -cost
    const bought = intelBought || irBought || newCounters.length > 0 || boughtPending.length > 0 || boughtAssets.length > 0
    if (bought) {
      // Silent by decision (brief v0.5 section 6): the buy already fired
      // its cue in the procurement phase, so replaying it here would
      // duplicate a cue and spend the reading budget twice. The beat stays
      // in the ledger because the patch is load-bearing.
      push({
        kind: 'procurement',
        visible: false,
        title: `Procurement confirmed: ${cost} credits`,
        lines: [...record.purchases],
        patch,
      })
    }
  }

  // The engine has no deployment-slip event: the roll happens once inside
  // applyPurchases and is folded into the ETA the player already sees, so
  // there is nothing to show here (brief v0.5 section 6, cue removed).

  // 5. Surge authority: a before-condition that neither pressed this turn
  // (absent from conditionsActive) nor survived was cleared by surge.
  {
    const pressed = new Set(record.conditionsActive)
    for (const c of before.conditions.filter((c) => !pressed.has(c.name))) {
      const patch: Patch = { conditionsRemove: [c.instanceId], surgeTokens: -1 }
      push({
        kind: 'surge-spent',
        title: `Surge authority spent: ${c.name} cleared`,
        subjectId: c.eventId,
        cueKey: `condition:${c.eventId}`,
        lines: noteStarting('Surge authority spent'),
        patch,
      })
    }
  }

  // 6. Sustained pressure from every live condition.
  for (const c of [...shadow.conditions]) {
    const def = eventById(scenario, c.eventId)
    const mitigation = mitigationFor(shadow, def)
    const pressure = Math.max(0, c.baseSeverity - mitigation)
    const patch: Patch = {}
    if (pressure > 0) {
      patch.meters = {}
      for (const key of def.effect.meters) {
        const d = damage(shadow, key, pressure * conditionPressureFor(shadow.difficulty))
        if (d) patch.meters[key] = d
      }
    }
    push({
      kind: 'condition-pressure',
      title: pressure > 0 ? `${c.name} persists: sustained pressure` : `${c.name} persists, held below effect threshold`,
      subjectId: c.eventId,
      cueKey: `condition:${c.eventId}`,
      techniques: techniques(def),
      layers: def.layers,
      severity: { base: c.baseSeverity, chain: 0, mitigation, effective: pressure },
      lines: noteStarting(`${c.name} continues`),
      patch,
    })
  }

  // 7. Chain state entering resolution.
  {
    const armed = lidarFallbackFor(shadow)
    if (armed) {
      // The flag only enters the patch when it actually changes, so the
      // card does not announce a fallback that was already engaged.
      push({
        kind: 'chain-armed',
        title: shadow.flags.lidarFallback
          ? 'BLACKOUT CHAIN still armed: drones navigating on LiDAR alone'
          : 'BLACKOUT CHAIN armed: drones navigating on LiDAR alone',
        lines: noteIncluding('remains in LiDAR-fallback navigation'),
        patch: shadow.flags.lidarFallback ? {} : { flags: { lidarFallback: true } },
      })
    } else if (shadow.flags.lidarFallback) {
      // The jam was cleared before resolution (surge) or no drone is left;
      // the engine drops the flag silently here.
      push({ kind: 'end-of-turn-tick', visible: false, title: 'Chain released', patch: { flags: { lidarFallback: false } } })
    }
  }

  // 8. The adversary plays the deck, then the opportunity roll.
  if (record.events.length === 0) {
    push({ kind: 'quiet', title: 'No adversary activity this turn.' })
  }
  for (const ev of record.events) {
    const def = eventById(scenario, ev.eventId)
    const isOpportunity = (def.kind ?? 'threat') === 'opportunity'
    if (isOpportunity) {
      const b = def.benefit ?? {}
      const patch: Patch = {}
      let credits = 0
      if (b.credits) credits += b.credits
      if (b.intelBoostTurns) patch.intelBoostTurns = Math.max(shadow.intelBoostTurns, b.intelBoostTurns)
      if (b.expediteTurns) {
        const named = expedite ? shadow.pipeline.find((p) => p.id === expedite.id) : undefined
        const soonest = named ?? shadow.pipeline.filter((p) => p.etaTurns > 1).sort((x, y) => x.etaTurns - y.etaTurns)[0]
        if (soonest) {
          patch.pipelineEta = { [soonest.id]: Math.max(1, soonest.etaTurns - b.expediteTurns) }
        } else {
          if (ev.notes.some((n) => n.includes(RESELL_NOTE))) credits += RIDESHARE_RESELL_CREDITS
        }
      }
      if (credits) patch.credits = credits
      push({
        kind: 'opportunity',
        title: ev.name,
        subjectId: ev.eventId,
        cueKey: `event:${ev.eventId}`,
        layers: def.layers,
        lines: [...ev.notes],
        patch,
      })
      continue
    }

    const patch: Patch = {}
    // The engine decides GNSS denial before this event's own asset damage
    // lands, so the drone count is read now, not after the patch.
    const dronesBeforeDamage = liveDrones(shadow.assets).length
    if (ev.effectiveSeverity > 0) {
      patch.meters = {}
      for (const key of def.effect.meters) {
        const d = damage(shadow, key, ev.effectiveSeverity * METER_DAMAGE_PER_SEVERITY)
        if (d) patch.meters[key] = d
      }
      if (!Object.keys(patch.meters).length) delete patch.meters
    }
    let credits = -ev.repairCost
    const assetIntegrity: Record<string, number> = {}
    for (const n of ev.notes) {
      if (n.includes(SSA_BURN_EXECUTED)) credits -= SSA_MANEUVER_COST
      const hit = n.match(ASSET_OUTCOME)
      if (hit && shadow.assets.some((a) => a.id === hit[1])) {
        assetIntegrity[hit[1]] = hit[2] !== undefined ? Number.parseInt(hit[2], 10) : 0
      }
    }
    if (credits) patch.credits = credits
    if (Object.keys(assetIntegrity).length) patch.assetIntegrity = assetIntegrity
    const landed = ev.effectiveSeverity > 0
    push({
      kind: 'threat',
      title: landed ? ev.name : `${ev.name}: held`,
      subjectId: ev.eventId,
      cueKey: `event:${ev.eventId}`,
      techniques: techniques(def),
      layers: def.layers,
      severity: { base: ev.baseSeverity, chain: ev.chainBonus, mitigation: ev.mitigation, effective: ev.effectiveSeverity },
      lines: ev.notes.filter((n) => !isConditionNote(n)),
      patch,
    })

    // A landed event with a duration becomes, or refreshes, a condition.
    if (landed && def.duration) {
      const existing = shadow.conditions.find((c) => c.eventId === ev.eventId)
      const final = after.conditions.find((c) => c.eventId === ev.eventId)
      // The rolled span is hidden and irrelevant to presentation; the value
      // the engine ends the turn on, plus the end-of-turn tick, is exact.
      const remaining = (final?.remainingTurns ?? 0) + 1
      const condPatch: Patch = {}
      if (existing) {
        condPatch.conditionsRemaining = { [existing.instanceId]: remaining }
      } else {
        const fresh: ActiveCondition = final
          ? { ...final, remainingTurns: remaining }
          : {
              instanceId: `${ev.eventId}-t${turn}`,
              eventId: ev.eventId,
              name: shortName(def),
              startedTurn: turn,
              remainingTurns: remaining,
              baseSeverity: def.baseSeverity,
            }
        condPatch.conditionsAdd = [fresh]
      }
      if (def.effect.special === 'jamsGnss' && dronesBeforeDamage > 0 && !shadow.flags.lidarFallback) {
        condPatch.flags = { lidarFallback: true }
      }
      push({
        kind: existing ? 'condition-renewed' : 'condition-applied',
        title: existing ? `${shortName(def)}: condition renewed` : `${shortName(def)}: now an active condition`,
        subjectId: ev.eventId,
        cueKey: `condition:${ev.eventId}`,
        layers: def.layers,
        lines: ev.notes.filter(isConditionNote),
        patch: condPatch,
      })
    }
  }

  // 9 and 10. End-of-turn tick, then expiries, then the chain flag.
  {
    const expiring = shadow.conditions.filter((c) => c.remainingTurns - 1 <= 0)
    const remainingAfter = shadow.conditions.filter((c) => c.remainingTurns - 1 > 0)
    const armedAfter = lidarFallbackFor({ ...shadow, conditions: remainingAfter })
    const tick: Patch = { conditionsRemaining: {} }
    for (const c of shadow.conditions) tick.conditionsRemaining![c.instanceId] = c.remainingTurns - 1
    if (shadow.intelBoostTurns > 0 && shadow.intelBoostTurns <= before.intelBoostTurns) {
      tick.intelBoostTurns = shadow.intelBoostTurns - 1
    }
    if (!shadow.conditions.length) delete tick.conditionsRemaining
    if (expiring.length === 0 && armedAfter !== shadow.flags.lidarFallback) tick.flags = { lidarFallback: armedAfter }
    if (Object.keys(tick).length) {
      push({ kind: 'end-of-turn-tick', visible: false, title: 'End of turn', patch: tick })
    }
    expiring.forEach((c, i) => {
      const patch: Patch = { conditionsRemove: [c.instanceId] }
      if (i === expiring.length - 1 && armedAfter !== shadow.flags.lidarFallback) patch.flags = { lidarFallback: armedAfter }
      push({
        kind: 'condition-cleared',
        title: `${c.name} subsided: condition lifted`,
        subjectId: c.eventId,
        cueKey: `condition:${c.eventId}`,
        lines: noteStarting(`${c.name} subsided`),
        patch,
      })
    })
  }

  // 11. Commendations: zeroed attacks, then holding the line under pressure.
  {
    const strings = [...record.commendations]
    for (const ev of record.events) {
      const def = eventById(scenario, ev.eventId)
      if ((def.kind ?? 'threat') === 'threat' && ev.effectiveSeverity === 0 && ev.mitigation > 0 && ev.baseSeverity > 0) {
        push({
          kind: 'commendation',
          title: `Mitigation commendation: ${shortName(def)} fully countered`,
          subjectId: ev.eventId,
          lines: strings.splice(0, 1),
          patch: { credits: MITIGATION_COMMENDATION_CREDITS },
        })
      }
    }
    const endured = record.conditionsActive.length
    if (endured > 0 && maiScore(shadow) >= scenario.winThreshold) {
      const tier = Math.min(3, endured)
      const patch: Patch = { credits: RESILIENCE_CREDITS[tier] }
      if (RESILIENCE_HEAL[tier] > 0) {
        patch.meters = {}
        for (const key of ['linkAvailability', 'dataIntegrity', 'sensorIntegrity'] as MeterKey[]) {
          const d = heal(shadow, key, RESILIENCE_HEAL[tier])
          if (d) patch.meters[key] = d
        }
      }
      const grantsSurge = endured >= SURGE_EARN_MIN_CONDITIONS && shadow.surgeTokens < SURGE_TOKEN_CAP
      if (grantsSurge) patch.surgeTokens = 1
      push({
        kind: 'commendation',
        title: `Resilience commendation, tier ${tier}: held the win line under ${endured} condition${endured === 1 ? '' : 's'}`,
        lines: strings.splice(0, grantsSurge ? 2 : 1),
        patch,
      })
    }
  }

  // 12. Reconciliation: empty when the ledger reproduced the engine, which
  // the battery asserts. If it ever is not, the player still ends on the
  // engine's real numbers; the correction is silent bookkeeping, never a
  // beat with a dwell.
  {
    const residual = residualPatch(shadow, after)
    if (residual) {
      push({ kind: 'settle', visible: false, title: 'Ledger reconciled with the engine', patch: residual })
    }
  }

  // 13. Outcome.
  if (after.status !== 'playing') {
    const reason =
      after.status === 'won'
        ? 'MISSION ASSURED'
        : after.lossReason === 'insolvency'
          ? 'MISSION FAILED: budget insolvency'
          : after.lossReason === 'maiCollapse'
            ? 'MISSION FAILED: Mission Assurance Index collapse'
            : 'MISSION FAILED: below the win threshold at end of campaign'
    // The field, not the title, decides the treatment downstream.
    push({ kind: 'outcome', title: reason, lost: after.status !== 'won' })
  }

  return beats
}

// Kinds that carry the deck's ids, for the coverage test.
export const ID_KEYED_KINDS: BeatKind[] = ['threat', 'opportunity', 'condition-applied', 'condition-renewed', 'condition-pressure', 'condition-cleared', 'surge-spent']
