// Call signs (v1.2 R1, brief section 4.2): what an asset is called for the
// whole campaign. Pure functions over engine state, so the suite can sweep
// them across real play without a DOM. The pixel board that also read its
// tiles, chips, defense icons and sprite states here was retired in v2.0
// R3; the 3D game and the debrief read what is left.

import { SQUADRON } from '../../config'
import type { AssetBuy, AssetKind, GameState } from '../../engine/types'

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
// place), is fixed the moment the thing is bought, and an asset on its
// way carries the call sign it will keep. The board suite pins both id
// shapes against real play, since this reads a structure the engine owns.
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

