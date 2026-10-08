// Presentation adapter (game-feel brief section 3, Round 2): derives the
// beat-by-beat grain the engine log does not carry. resolveTurn records
// each event, the turn's ledger and an end-of-turn snapshot; this module
// walks the engine's documented turn order (src/engine/reducer.ts) over a
// shadow copy of the before-state, emitting one Beat per step with an
// exact Patch, and closes with a residual reconciliation against the real
// after-state. The engine and the content modules are untouched; nothing
// here feeds resolveTurn.
//
// THE v1.3 TURN ORDER (Round 0, brief 5.5 and 6.1): the orders land at
// EXECUTE, live conditions press, the adversary plays each slot, the rare
// opportunity, then the close: repairs and upkeep, arrivals, funding and
// the coverage bonus, recovery and healing, the conditions' clocks. The
// engine records far more than v1.2's did (each hit's integrity either
// side, the condition it left, the debris call, the whole ledger), so the
// beats read the record and the engine's exported rules rather than
// restating private helpers. Note text is still read for one thing only
// the engine's own rolls know: which in-transit item a rideshare
// expedited. tests/director.spec.ts proves the whole ledger reproduces the
// engine's after-state with an empty residual on every turn of hundreds of
// games, so none of it can drift silently. Round 3 retires the beats for
// the hit card, the intel card and the end of turn.

import {
  CONDITION_PRESSURE_PER_SEVERITY,
  DEPLOY_TURNS,
  METER_DAMAGE_PER_SEVERITY,
  RIDESHARE_RESELL_CREDITS,
  ASSET_HEAL_PER_TURN,
  gnssDenied,
  hasRetainer,
  mitigationOf,
  scaled,
} from '../engine/reducer'
import { coverage, METER_CAP } from '../engine/scoring'
import { LAYERS, type ActiveCondition, type GameState, type PendingAsset, type Scenario, type ThreatEvent } from '../engine/types'
import { applyPatch, cloneModeled, residualPatch } from './patch'
import { coverageFigure, kindLabels, techniqueLabel } from '../ui/labels'
import { METER_KEYS, type Beat, type BeatKind, type MeterKey, type Patch } from './types'

function eventById(scenario: Scenario, id: string): ThreatEvent {
  const ev = scenario.events.find((e) => e.id === id)
  if (!ev) throw new Error(`deriveBeats: unknown event id ${id}`)
  return ev
}

// Clamped meter deltas against the running value, so the patch carries the
// exact number that moved.
function damage(state: GameState, key: MeterKey, amount: number): number {
  return -Math.min(state.meters[key], amount)
}
function heal(state: GameState, key: MeterKey, amount: number): number {
  return Math.min(METER_CAP - state.meters[key], amount)
}

// The playback card's technique line: named as the brief and the GLOSSARY
// name it, not by a sixth copy of the expression.
const techniques = (ev: ThreatEvent) => ev.techniqueRefs.map((r) => ({ tag: techniqueLabel(r), url: r.url }))

// The rideshare note names the pipeline id it expedited; asset ids are
// stable engine strings (start-<kind>-<n>, t<turn>-<kind>-<n>).
const EXPEDITED = /\b((?:start|t\d+)-(?:sat|rpoSat|drone|groundStation)-\d+) manifested on the rideshare/
const RESELL_NOTE = 'resold for'

export function deriveBeats(before: GameState, after: GameState): Beat[] {
  const record = after.history[after.history.length - 1]
  if (!record || record.turn !== before.turn || after.history.length !== before.history.length + 1) {
    throw new Error('deriveBeats: after is not the resolution of before')
  }
  const scenario = before.scenario
  const turn = before.turn
  const difficulty = before.difficulty
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
      targetAssetId: b.targetAssetId,
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

  // 1. EXECUTE: the orders land. Silent by decision (brief v0.5 section 6):
  // each order already fired its cue in PROCURE, so replaying it here would
  // duplicate a cue and spend the reading budget twice. The beat stays in
  // the ledger because the patch is load-bearing; its spend is declared on
  // the next visible beat.
  {
    const countersAdd = after.counters.slice(before.counters.length)
    const ordered: PendingAsset[] = []
    for (const id of [...after.pipeline.map((p) => p.id), ...after.assets.map((a) => a.id)]) {
      const m = /^t(\d+)-([A-Za-z]+)-(\d+)$/.exec(id)
      if (!m || Number(m[1]) !== turn) continue
      const kind = m[2] as PendingAsset['kind']
      ordered.push({ id, kind, etaTurns: DEPLOY_TURNS[kind] })
    }
    ordered.sort((x, y) => Number(x.id.split('-').pop()) - Number(y.id.split('-').pop()))
    const patch: Patch = {}
    if (record.ledger.ordered) patch.credits = -record.ledger.ordered
    if (countersAdd.length) patch.countersAdd = countersAdd
    if (ordered.length) patch.pipelineAdd = ordered
    if (record.purchases.length || record.ledger.ordered) {
      push({ kind: 'procurement', visible: false, title: `Orders confirmed: ${record.ledger.ordered} credits`, lines: [...record.purchases], patch })
    }
  }

  // 2. The night opens: the watch officer's line for the turn.
  {
    const intro = scenario.campaign.find((p) => p.turn === turn)?.intro
    // The coverage bonus is a lever a new player cannot see from the title,
    // and the starter fleet sits just under it, so the turn says so while
    // it is true (Round 7b). Stated as the fleet stands now: the bonus is
    // checked at the close, after tonight's arrivals.
    const cov = coverage(shadow.assets)
    const { coverageMin, credits } = scenario.slaBonus
    const short = cov < coverageMin ? [`Coverage ${coverageFigure(cov)} is under the ${coverageMin} the SLA pays ${credits} at.`] : []
    push({ kind: 'turn-start', title: `Turn ${turn}: COLDVEIL is moving`, lines: intro ? [intro, ...short] : short })
  }

  // 3. Sustained pressure from every live condition.
  for (const c of [...shadow.conditions]) {
    const def = eventById(scenario, c.eventId)
    const mitigation = mitigationOf(def, shadow.counters)
    const pressure = Math.max(0, c.baseSeverity - mitigation)
    const patch: Patch = {}
    if (pressure > 0) {
      patch.meters = {}
      for (const key of def.effect.meters) {
        const d = damage(shadow, key, scaled(CONDITION_PRESSURE_PER_SEVERITY * pressure, difficulty))
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

  // 4. The chain, armed entering the night: GNSS denial is live, so a
  // chain exploit strikes a point harder.
  if (gnssDenied(shadow.conditions, scenario)) {
    push({ kind: 'chain-armed', title: 'BLACKOUT CHAIN armed: GNSS denied, the squadron flies on LiDAR alone' })
  }

  // 5. The adversary's moves, then the opportunity.
  const expedite = (() => {
    for (const ev of record.events) {
      const n = eventById(scenario, ev.eventId).benefit?.expediteTurns
      if (!n) continue
      for (const note of ev.notes) {
        const m = note.match(EXPEDITED)
        if (m) return { id: m[1], turns: n }
      }
    }
    return null
  })()
  let landedAny = false
  for (const ev of record.events) {
    const def = eventById(scenario, ev.eventId)
    if ((def.kind ?? 'threat') === 'opportunity') {
      const b = def.benefit ?? {}
      const patch: Patch = {}
      let credits = b.credits ?? 0
      if (b.expediteTurns) {
        const named = expedite ? shadow.pipeline.find((p) => p.id === expedite.id) : undefined
        if (named) patch.pipelineEta = { [named.id]: Math.max(1, named.etaTurns - b.expediteTurns) }
        else if (ev.notes.some((n) => n.includes(RESELL_NOTE))) credits += RIDESHARE_RESELL_CREDITS
      }
      if (credits) patch.credits = credits
      push({ kind: 'opportunity', title: ev.name, subjectId: ev.eventId, cueKey: `event:${ev.eventId}`, layers: def.layers, lines: [...ev.notes], patch })
      continue
    }

    const patch: Patch = {}
    if (ev.effectiveSeverity > 0) {
      landedAny = true
      patch.meters = {}
      for (const key of def.effect.meters) {
        const d = damage(shadow, key, scaled(METER_DAMAGE_PER_SEVERITY * ev.effectiveSeverity, difficulty))
        if (d) patch.meters[key] = d
      }
      if (!Object.keys(patch.meters).length) delete patch.meters
    }
    if (ev.integrityAfter !== undefined && ev.targetAssetId !== undefined) patch.assetIntegrity = { [ev.targetAssetId]: ev.integrityAfter }
    if (ev.debris?.fuel) patch.credits = -ev.debris.fuel
    const title = ev.debris
      ? ev.debris.lost
        ? `${ev.name}: satellite lost`
        : ev.debris.choice === 'burn'
          ? `${ev.name}: burned clear`
          : `${ev.name}: held its orbit`
      : ev.effectiveSeverity > 0
        ? ev.name
        : `${ev.name}: held`
    push({
      kind: 'threat',
      title,
      subjectId: ev.eventId,
      // The tile the board lands the hit on: only when the hit damaged it.
      targetAssetId: ev.integrityAfter !== undefined ? ev.targetAssetId : undefined,
      cueKey: `event:${ev.eventId}`,
      techniques: techniques(def),
      layers: def.layers,
      severity: { base: ev.baseSeverity, chain: ev.chainBonus, mitigation: ev.mitigation, effective: ev.effectiveSeverity },
      lines: ev.notes.filter((n) => !ev.condition || !n.startsWith(ev.condition.name)),
      patch,
    })

    // A landed event with a condition places it, or renews its clock.
    if (ev.condition) {
      const existing = shadow.conditions.find((c) => c.eventId === ev.eventId)
      const condPatch: Patch = {}
      if (existing) {
        condPatch.conditionsRemaining = { [existing.instanceId]: Math.max(existing.remainingTurns, ev.condition.turns) }
      } else {
        const fresh: ActiveCondition = {
          instanceId: `${ev.eventId}-t${turn}`,
          eventId: ev.eventId,
          name: ev.condition.name,
          startedTurn: turn,
          remainingTurns: ev.condition.turns,
          baseSeverity: def.baseSeverity,
        }
        condPatch.conditionsAdd = [fresh]
      }
      push({
        kind: existing ? 'condition-renewed' : 'condition-applied',
        title: existing ? `${ev.condition.name}: clock reset to ${ev.condition.turns} turns` : `${ev.condition.name} for ${ev.condition.turns} turns`,
        subjectId: ev.eventId,
        cueKey: `condition:${ev.eventId}`,
        layers: def.layers,
        lines: ev.notes.filter((n) => n.startsWith(ev.condition!.name)),
        patch: condPatch,
      })
    }
  }

  // The defense streak (brief 6.8), the commendation's successor: events
  // with nothing through, running across turns. Walked event by event from
  // the streak the turn opened on, the way the engine counts it (the debris
  // call neither extends nor breaks it), and announced when tonight carried
  // it to two or more.
  {
    let streak = before.streak
    let grew = false
    for (const ev of record.events) {
      const def = eventById(scenario, ev.eventId)
      if ((def.kind ?? 'threat') === 'opportunity' || ev.debris) continue
      if (ev.effectiveSeverity === 0) {
        streak += 1
        grew = true
      } else {
        streak = 0
      }
    }
    if (grew && streak >= 2) push({ kind: 'commendation', title: `Defense streak ×${streak}: nothing got through ${streak} moves running` })
  }

  // Nothing got through: the night's moves were all held.
  if (!landedAny) {
    const held = LAYERS.filter((l) => shadow.assets.some((a) => a.layer === l && a.integrity > 0))
    push({ kind: 'quiet', title: `Nothing reached you. ${held.length} of ${LAYERS.length} layers holding.`, layers: held })
  }

  // 6. The close (brief 5.5 item 6): repairs and upkeep, arrivals, funding
  // and the coverage bonus, recovery and healing, the conditions' clocks.
  {
    const l = record.ledger
    // What lands at this close: read before the countdown below moves the
    // rest of the pipeline a turn closer.
    const due = shadow.pipeline.filter((p) => p.etaTurns <= 1)
    const pipelineEta: Record<string, number> = {}
    for (const p of shadow.pipeline) if (p.etaTurns > 1) pipelineEta[p.id] = p.etaTurns - 1
    const paid: Patch = {}
    if (l.repairs + l.upkeep) paid.credits = -(l.repairs + l.upkeep)
    if (Object.keys(pipelineEta).length) paid.pipelineEta = pipelineEta
    push({
      kind: 'end-of-turn-tick',
      visible: false,
      title: `Repairs -${l.repairs}, defenses kept -${l.upkeep}`,
      lines: [...noteStarting('Repairs paid'), ...noteStarting('Keeping ')],
      patch: paid,
    })
    for (const p of due) {
      const landed = after.assets.find((a) => a.id === p.id)
      if (!landed) continue
      push({
        kind: 'deploy-arrived',
        title: `${kindLabels[p.kind]} on station`,
        subjectId: p.id,
        lines: noteIncluding(`${p.id} arrived on station`),
        patch: { pipelineRemove: [p.id], assetsAdd: [{ ...landed, integrity: 100 }] },
      })
    }
    const close: Patch = { meters: {} }
    if (l.funding + l.coverageBonus) close.credits = l.funding + l.coverageBonus
    const recovery = hasRetainer(shadow) ? scenario.recovery.withIrRetainer : scenario.recovery.base
    for (const key of METER_KEYS) {
      const d = heal(shadow, key, recovery)
      if (d) close.meters![key] = d
    }
    if (!Object.keys(close.meters!).length) delete close.meters
    if (!l.insolvent) {
      const healed: Record<string, number> = {}
      for (const a of shadow.assets) if (a.integrity > 0 && a.integrity < 100) healed[a.id] = Math.min(100, a.integrity + ASSET_HEAL_PER_TURN)
      if (Object.keys(healed).length) close.assetIntegrity = healed
    }
    push({
      kind: 'end-of-turn-tick',
      visible: false,
      title: `Funding +${l.funding}${l.coverageBonus ? `, coverage bonus +${l.coverageBonus}` : ''}, recovery +${recovery}`,
      lines: noteStarting('Mission funding'),
      patch: close,
    })
    const expiring = shadow.conditions.filter((c) => c.remainingTurns - 1 <= 0)
    if (shadow.conditions.length) {
      const tick: Patch = { conditionsRemaining: {} }
      for (const c of shadow.conditions) tick.conditionsRemaining![c.instanceId] = c.remainingTurns - 1
      push({ kind: 'end-of-turn-tick', visible: false, title: 'Conditions count down', patch: tick })
    }
    for (const c of expiring) {
      push({
        kind: 'condition-cleared',
        title: `${c.name} subsided: condition lifted`,
        subjectId: c.eventId,
        cueKey: `condition:${c.eventId}`,
        lines: noteStarting(`${c.name} subsided`),
        patch: { conditionsRemove: [c.instanceId] },
      })
    }
  }

  // 7. Reconciliation: empty when the ledger reproduced the engine, which
  // the battery asserts. If it ever is not, the player still ends on the
  // engine's real numbers; the correction is silent bookkeeping.
  {
    const residual = residualPatch(shadow, after)
    if (residual) push({ kind: 'settle', visible: false, title: 'Ledger reconciled with the engine', patch: residual })
  }

  // 8. Outcome.
  if (after.status !== 'playing') {
    const reason =
      after.status === 'won'
        ? 'MISSION ASSURED'
        : after.lossReason === 'insolvency'
          ? 'MISSION FAILED: budget insolvency'
          : after.lossReason === 'maiCollapse'
            ? 'MISSION FAILED: mission assurance collapse'
            : 'MISSION FAILED: below the win line at the end of the operation'
    // The field, not the title, decides the treatment downstream.
    push({ kind: 'outcome', title: reason, lost: after.status !== 'won' })
  }

  return beats
}

// Kinds that carry the deck's ids, for the coverage test.
export const ID_KEYED_KINDS: BeatKind[] = ['threat', 'opportunity', 'condition-applied', 'condition-renewed', 'condition-pressure', 'condition-cleared']
