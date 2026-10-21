// Patch application and reconciliation for the presented state (Round 2).
// applyPatch is the only way a beat changes what the player sees; it is
// pure (returns a new state) so React re-renders on identity. residualPatch
// diffs a shadow state against the engine's real after-state on every
// field the ledger models, so the adapter can prove it reproduced the turn
// (empty residual) or reconcile exactly when it did not.

import type { GameState } from '../engine/types'
import { kindLabels } from '../ui/labels'
import { callSigns } from '../ui/board/board'
import { METER_KEYS, type BeatKind, type MeterKey, type Patch } from './types'

// The fields a beat can move on the board. The learning state (the defense
// streak, points saved, what the player can now say) and the free-brief
// clock are the engine's own and shown after the turn, not beat by beat
// (v1.3 Round 0; Round 3 builds the cards that show them).
type Modeled = Pick<GameState, 'meters' | 'credits' | 'assets' | 'conditions' | 'pipeline' | 'counters'>

export const MODELED_FIELDS: (keyof Modeled)[] = ['meters', 'credits', 'assets', 'conditions', 'pipeline', 'counters']

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

// Copy only what a patch can touch. The scenario, history and forecast are
// shared by reference: they are never modified by presentation, and
// cloning the deck on every beat would dominate the ledger's cost.
export function cloneModeled(state: GameState): GameState {
  return {
    ...state,
    meters: { ...state.meters },
    assets: clone(state.assets),
    conditions: clone(state.conditions),
    pipeline: clone(state.pipeline),
    counters: [...state.counters],
  }
}

export function applyPatch(state: GameState, patch: Patch): GameState {
  const next = cloneModeled(state)
  if (patch.meters) {
    for (const key of METER_KEYS) {
      const d = patch.meters[key]
      if (d !== undefined) next.meters[key] += d
    }
  }
  if (patch.credits !== undefined) next.credits += patch.credits

  if (patch.assetsSet) next.assets = clone(patch.assetsSet)
  if (patch.assetsAdd) next.assets.push(...clone(patch.assetsAdd))
  if (patch.assetIntegrity) {
    for (const a of next.assets) {
      const v = patch.assetIntegrity[a.id]
      if (v !== undefined) a.integrity = v
    }
  }

  if (patch.conditionsSet) next.conditions = clone(patch.conditionsSet)
  if (patch.conditionsRemove) {
    const gone = new Set(patch.conditionsRemove)
    next.conditions = next.conditions.filter((c) => !gone.has(c.instanceId))
  }
  if (patch.conditionsAdd) next.conditions.push(...clone(patch.conditionsAdd))
  if (patch.conditionsRemaining) {
    for (const c of next.conditions) {
      const v = patch.conditionsRemaining[c.instanceId]
      if (v !== undefined) c.remainingTurns = v
    }
  }

  if (patch.pipelineSet) next.pipeline = clone(patch.pipelineSet)
  if (patch.pipelineRemove) {
    const gone = new Set(patch.pipelineRemove)
    next.pipeline = next.pipeline.filter((p) => !gone.has(p.id))
  }
  if (patch.pipelineAdd) next.pipeline.push(...clone(patch.pipelineAdd))
  if (patch.pipelineEta) {
    for (const p of next.pipeline) {
      const v = patch.pipelineEta[p.id]
      if (v !== undefined) p.etaTurns = v
    }
  }

  if (patch.countersSet) next.counters = [...patch.countersSet]
  if (patch.countersAdd) next.counters.push(...patch.countersAdd)
  return next
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// The patch that turns `shadow` into `after` on every modeled field, or
// null when they already agree. Scalars and meters come back as deltas so
// the settle beat can still display what moved; collections come back as
// absolute sets because order matters for equality with the engine.
export function residualPatch(shadow: GameState, after: GameState): Patch | null {
  const patch: Patch = {}
  let any = false
  const meters: Partial<Record<MeterKey, number>> = {}
  for (const key of METER_KEYS) {
    if (shadow.meters[key] !== after.meters[key]) {
      meters[key] = after.meters[key] - shadow.meters[key]
      any = true
    }
  }
  if (Object.keys(meters).length) patch.meters = meters
  if (shadow.credits !== after.credits) {
    patch.credits = after.credits - shadow.credits
    any = true
  }
  if (!same(shadow.assets, after.assets)) {
    patch.assetsSet = clone(after.assets)
    any = true
  }
  if (!same(shadow.conditions, after.conditions)) {
    patch.conditionsSet = clone(after.conditions)
    any = true
  }
  if (!same(shadow.pipeline, after.pipeline)) {
    patch.pipelineSet = clone(after.pipeline)
    any = true
  }
  if (!same(shadow.counters, after.counters)) {
    patch.countersSet = [...after.counters]
    any = true
  }
  return any ? patch : null
}

// Delta lines for the playback card. Every line names things the way the
// HUD does: no engine ids, no raw enum values (brief v0.5 section 5, and
// the Round 2 review finding on placeholder copy). Each line carries a
// tone decided per field, never inferred from the text, so the view can
// colour damage and gains without guessing.
export type DeltaTone = 'good' | 'bad' | 'neutral'
export interface DeltaLine {
  text: string
  tone: DeltaTone
}

const METER_LABEL: Record<MeterKey, string> = {
  linkAvailability: 'Link',
  dataIntegrity: 'Data',
  sensorIntegrity: 'Sensor',
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

// The beat kind refines a tone the sign alone would get wrong: credits
// spent on purpose are not damage.
export function describePatch(patch: Patch, state: GameState, kind?: BeatKind): DeltaLine[] {
  const out: DeltaLine[] = []
  const scenario = state.scenario
  const counterName = (id: string) => scenario.countermeasures.find((c) => c.id === id)?.name ?? id
  // Assets and in-transit items are named by kind and by the call sign the
  // board shows on the tile (QC gauntlet Q16, G-027: an ordinal over like
  // assets, "Drone #2", named the same airframe KESTREL-2 on the board
  // differently); the engine id never reaches the player.
  const signs = callSigns(state)
  const assetName = (id: string) => {
    const asset = state.assets.find((a) => a.id === id) ?? state.pipeline.find((p) => p.id === id)
    if (!asset) return 'Asset'
    const sign = signs.get(id)
    return sign ? `${kindLabels[asset.kind]} ${sign}` : kindLabels[asset.kind]
  }

  for (const key of METER_KEYS) {
    const d = patch.meters?.[key]
    if (d) out.push({ text: `${METER_LABEL[key]} ${signed(d)}`, tone: d > 0 ? 'good' : 'bad' })
  }
  if (patch.credits) {
    const spent = kind === 'procurement'
    out.push({ text: `Budget ${signed(patch.credits)}`, tone: patch.credits > 0 ? 'good' : spent ? 'neutral' : 'bad' })
  }
  for (const a of patch.assetsAdd ?? []) {
    // The arrival beat's own title already says this; repeating it below
    // spends the reading budget twice on one sentence.
    if (kind === 'deploy-arrived') continue
    out.push({ text: `${kindLabels[a.kind]} on station`, tone: 'good' })
  }
  for (const [id, v] of Object.entries(patch.assetIntegrity ?? {})) {
    out.push({ text: v === 0 ? `${assetName(id)} lost` : `${assetName(id)} down to ${v} percent`, tone: 'bad' })
  }
  for (const c of patch.conditionsAdd ?? []) out.push({ text: `Condition applied: ${c.name}`, tone: 'bad' })
  for (const p of patch.pipelineAdd ?? []) {
    out.push({
      text: `${kindLabels[p.kind]} in transit, ETA ${p.etaTurns} turn${p.etaTurns === 1 ? '' : 's'}`,
      tone: 'neutral',
    })
  }
  for (const [id, v] of Object.entries(patch.pipelineEta ?? {})) {
    out.push({ text: `${assetName(id)} ETA ${v} turn${v === 1 ? '' : 's'}`, tone: 'neutral' })
  }
  for (const id of patch.countersAdd ?? []) out.push({ text: `${counterName(id)} active`, tone: 'good' })
  if (patch.assetsSet || patch.conditionsSet || patch.pipelineSet || patch.countersSet) {
    out.push({ text: 'State reconciled with the engine', tone: 'neutral' })
  }
  return out
}
