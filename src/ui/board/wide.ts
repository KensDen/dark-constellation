// The wide board's two columns as data (v1.2 R6, brief 4.6): the ops log
// of the last turns and the inspector for the selected tile. Pure, and
// read from the state the board shows (`shown`), whose history and assets
// hold back the turn still playing out; a condition's age counts from the
// turn it is given, the engine's, as the layer chips count it. Loaded only
// with the wide board, never in the first download.

import { effectiveIntel } from '../../engine/reducer'
import type { AssetKind, GameState, Layer } from '../../engine/types'
import { kindLabels } from '../labels'
import { verdictFor } from '../verdict'
import { STATE_WORD, callSigns, conditionsOn, spriteState } from './board'

// How many turns the log keeps: the brief's "short ops log of the last turns".
export const OPS_LOG_TURNS = 3
export const OPS_LOG_HEADING = 'OPS LOG'
export const INSPECTOR_HEADING = 'INSPECTOR'
export const INSPECT_PROMPT = 'Select an asset.'
// An empty log, or a layer with no conditions, as the intel card says it.
export const NOTHING = 'None.'

export interface OpsLogRow {
  turn: number
  mai: number
  verdict: string
}

// Newest first.
export function opsLogRows(shown: GameState): OpsLogRow[] {
  return shown.history
    .slice(-OPS_LOG_TURNS)
    .reverse()
    .map((r) => ({ turn: r.turn, mai: r.maiScore, verdict: verdictFor(r, shown.scenario) }))
}

export const opsLogLine = (row: OpsLogRow) => `T${row.turn} MAI ${row.mai}`

// Every line the log puts on screen, in order, for the reading diet.
export function opsLogCopy(shown: GameState): string[] {
  const rows = opsLogRows(shown)
  return [OPS_LOG_HEADING, ...(rows.length === 0 ? [NOTHING] : rows.flatMap((r) => [opsLogLine(r), r.verdict]))]
}

export interface InspectedCondition {
  instanceId: string
  eventId: string
  name: string
  age: number
  left?: number
}
export interface Inspected {
  assetId: string
  kind: AssetKind
  layer: Layer
  title: string
  integrity: string
  conditions: InspectedCondition[]
}

// What the inspector says about one tile: what the tile intel card says
// about it, less its role, tier note and sources, which stay one tap away.
export function inspectTile(shown: GameState, turn: number, assetId: string | null): Inspected | null {
  const asset = assetId ? shown.assets.find((a) => a.id === assetId) : undefined
  if (!asset) return null
  const top = effectiveIntel(shown) >= 3
  return {
    assetId: asset.id,
    kind: asset.kind,
    layer: asset.layer,
    title: `${callSigns(shown).get(asset.id)} · ${kindLabels[asset.kind]}`,
    integrity: `${asset.integrity}%${STATE_WORD[spriteState(asset.integrity)]}`,
    conditions: conditionsOn(asset.layer, shown.conditions, shown.scenario).map((c) => ({
      instanceId: c.instanceId,
      eventId: c.eventId,
      name: c.name,
      age: turn - c.startedTurn,
      left: top ? c.remainingTurns : undefined,
    })),
  }
}
