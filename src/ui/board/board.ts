// The board's derivations (v1.2 R1, brief sections 4.2 and 4.3): what each
// tile shows and which layer a chip or a defense icon belongs on. Pure
// functions over engine state, so the suite can sweep them across real
// play without a DOM, and so the tile components carry no game knowledge
// of their own.

import { SQUADRON } from '../../config'
import {
  LAYERS,
  type ActiveCondition,
  type Asset,
  type AssetBuy,
  type AssetKind,
  type Countermeasure,
  type GameState,
  type Layer,
  type PendingAsset,
  type Scenario,
  type Vector,
} from '../../engine/types'

// Which layer a kind flies in. The engine sets Asset.layer itself and
// keeps the rule private; a pending asset has no layer field, so a ghost
// tile needs the rule here. The board suite checks every asset in real
// play against it, so the two cannot drift silently.
export const KIND_LAYER: Record<AssetKind, Layer> = {
  sat: 'ORBIT',
  rpoSat: 'ORBIT',
  drone: 'AIR',
  groundStation: 'GROUND',
}

// Call signs (brief 4.2): kind plus purchase ordinal, stable for the whole
// campaign. SG for the STORMGLASS constellation's sats, SG-R for the RPO
// servicers, the squadron name for drones, GS for ground stations.
export const CALL_SIGN_PREFIX: Record<AssetKind, string> = {
  sat: 'SG-',
  rpoSat: 'SG-R',
  drone: `${SQUADRON}-`,
  groundStation: 'GS-',
}

// THE ORDINAL COMES FROM THE ENGINE'S ID, not from array position. Assets
// are appended in ARRIVAL order, and arrival is not purchase order: a sat
// can slip a turn, and the rideshare opportunity expedites one, so a rank
// over the array would renumber a tile the turn something else lands.
// Every id the engine mints carries its purchase turn and its place in
// that turn's cart (`start-<kind>-<n>` for the starter fleet, which is
// turn 0, and `t<turn>-<kind>-<i>` for a buy), and ids never leave the
// state: a lost asset keeps its entry at integrity 0, and a pending asset
// keeps its id when it arrives. So the rank within a kind, by (turn,
// place), is fixed the moment the thing is bought, and a ghost tile
// carries the call sign it will keep. The board suite pins both id shapes
// against real play, since this reads a structure the engine owns.
export function purchaseOrder(id: string): { turn: number; place: number } | null {
  const starter = /^start-[A-Za-z]+-(\d+)$/.exec(id)
  if (starter) return { turn: 0, place: Number(starter[1]) }
  const bought = /^t(\d+)-[A-Za-z]+-(\d+)$/.exec(id)
  if (bought) return { turn: Number(bought[1]), place: Number(bought[2]) }
  return null
}

// Call sign by asset or pending id, for everything the campaign owns.
export function callSigns(state: Pick<GameState, 'assets' | 'pipeline'>): Map<string, string> {
  const owned: { id: string; kind: AssetKind; turn: number; place: number }[] = []
  const all: { id: string; kind: AssetKind }[] = [...state.assets, ...state.pipeline]
  all.forEach((a, i) => {
    // An id in a shape this file does not know sorts after every known one,
    // in array order, rather than being dropped from the board.
    const order = purchaseOrder(a.id) ?? { turn: Number.MAX_SAFE_INTEGER, place: i }
    owned.push({ id: a.id, kind: a.kind, ...order })
  })
  const out = new Map<string, string>()
  const count: Partial<Record<AssetKind, number>> = {}
  owned
    .sort((a, b) => a.turn - b.turn || a.place - b.place)
    .forEach((a) => {
      const n = (count[a.kind] ?? 0) + 1
      count[a.kind] = n
      out.set(a.id, `${CALL_SIGN_PREFIX[a.kind]}${n}`)
    })
  return out
}

// The call signs a cart's entries will carry once bought: the next
// ordinals of each kind, in cart order, which is the order the engine
// numbers them in.
export function cartCallSigns(state: Pick<GameState, 'assets' | 'pipeline'>, cart: AssetBuy[]): string[] {
  const count: Partial<Record<AssetKind, number>> = {}
  for (const a of [...state.assets, ...state.pipeline]) count[a.kind] = (count[a.kind] ?? 0) + 1
  return cart.map((buy) => {
    const n = (count[buy.kind] ?? 0) + 1
    count[buy.kind] = n
    return `${CALL_SIGN_PREFIX[buy.kind]}${n}`
  })
}

// Four pips, ceil(integrity / 25); zero lit at zero (brief 4.2).
export function pipsFor(integrity: number): number {
  return Math.max(0, Math.min(4, Math.ceil(integrity / 25)))
}

// Sprite state by integrity (brief 4.2): intact 67 to 100, damaged 34 to
// 66, critical 1 to 33, knocked out at 0.
export type SpriteState = 'intact' | 'damaged' | 'critical' | 'out'
export function spriteState(integrity: number): SpriteState {
  if (integrity <= 0) return 'out'
  if (integrity <= 33) return 'critical'
  if (integrity <= 66) return 'damaged'
  return 'intact'
}

export type TileModel =
  | { kind: 'asset'; key: string; layer: Layer; asset: Asset; callSign: string; pips: number; state: SpriteState }
  | { kind: 'transit'; key: string; layer: Layer; pending: PendingAsset; callSign: string }
  | { kind: 'queued'; key: string; layer: Layer; buy: AssetBuy; index: number; callSign: string; cue?: string }

// One tile per asset, a ghost per pending asset, and a ghost per cart
// entry, each on the layer its kind flies in. Assets keep the engine's
// order, which is arrival order, so a tile never moves once it lands.
export function tilesByLayer(state: Pick<GameState, 'assets' | 'pipeline'>, cart: AssetBuy[]): Record<Layer, TileModel[]> {
  const signs = callSigns(state)
  const queued = cartCallSigns(state, cart)
  const out: Record<Layer, TileModel[]> = { ORBIT: [], AIR: [], GROUND: [] }
  for (const asset of state.assets) {
    out[asset.layer].push({
      kind: 'asset',
      key: asset.id,
      layer: asset.layer,
      asset,
      callSign: signs.get(asset.id) ?? asset.id,
      pips: pipsFor(asset.integrity),
      state: spriteState(asset.integrity),
    })
  }
  for (const pending of state.pipeline) {
    const layer = KIND_LAYER[pending.kind]
    out[layer].push({ kind: 'transit', key: pending.id, layer, pending, callSign: signs.get(pending.id) ?? pending.id })
  }
  cart.forEach((buy, index) => {
    const layer = KIND_LAYER[buy.kind]
    out[layer].push({ kind: 'queued', key: `cart-${index}`, layer, buy, index, callSign: queued[index] })
  })
  return out
}

// The layers an event touches, by id; unknown ids touch none.
function layersOfEvent(scenario: Scenario, eventId: string): readonly Layer[] {
  return scenario.events.find((e) => e.id === eventId)?.layers ?? []
}

// A condition's chip goes on EVERY layer its event touches (brief 4.3): the
// engine attaches conditions to events and layers, not to assets, and
// some events sit on two layers.
export function conditionsOn<T extends Pick<ActiveCondition, 'eventId'>>(layer: Layer, conditions: T[], scenario: Scenario): T[] {
  return conditions.filter((c) => layersOfEvent(scenario, c.eventId).includes(layer))
}

// The vectors a countermeasure answers, derived from the events it
// counters. Only the vector values are read, never an event's name: the
// harden sheet shows a defense by its vector icons and its blurb and NOT
// by the threats it answers (brief 4.4, the answer-key fix), and this is
// the one place that derivation is written.
export function vectorsOf(cm: Pick<Countermeasure, 'counters'>, scenario: Scenario): Vector[] {
  const out: Vector[] = []
  for (const ev of scenario.events) {
    if (cm.counters.includes(ev.id) && !out.includes(ev.vector)) out.push(ev.vector)
  }
  return out
}

// The layers a countermeasure's countered events touch, in LAYERS order.
export function layersOf(cm: Pick<Countermeasure, 'counters'>, scenario: Scenario): Layer[] {
  return LAYERS.filter((layer) => cm.counters.some((id) => layersOfEvent(scenario, id).includes(layer)))
}

export interface DefenseIcon {
  id: Countermeasure['id']
  name: string
  vector: Vector
}

// Deployed defenses shown on a layer header (brief 4.3): one icon per
// ACTIVE countermeasure whose countered events touch the layer, carrying
// its first vector. Posture-wide purchases (intel, the IR retainer)
// counter no event and so sit on no layer.
export function defensesOn(layer: Layer, counters: readonly Countermeasure['id'][], scenario: Scenario): DefenseIcon[] {
  const out: DefenseIcon[] = []
  for (const cm of scenario.countermeasures) {
    if (!counters.includes(cm.id)) continue
    if (!layersOf(cm, scenario).includes(layer)) continue
    const vectors = vectorsOf(cm, scenario)
    if (vectors.length === 0) continue
    out.push({ id: cm.id, name: cm.name, vector: vectors[0] })
  }
  return out
}
