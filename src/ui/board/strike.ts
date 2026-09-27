// What a playback beat does to the board (v1.2 R3, brief 4.5): a hit
// lands on the tile the engine named, and a held event flashes a shield on
// its layers' headers. Derived from the beat alone; the asset is the
// engine's own record of it (Beat.targetAssetId, from
// ResolvedEvent.targetAssetId), never a parse of the note.
//
// A hit plays in two parts inside its beat. For the first LOCK_SHARE of the
// dwell the board still shows the state before the hit while magenta
// brackets lock onto the tile and a dotted beam draws from the COLDVEIL
// emblem; then it lands, and the tile, its pips and MAI change with the
// strobe, the burst, the shake and the falling "-n".

import type { Beat } from '../../director'
import type { GameState, Layer } from '../../engine/types'

export const LOCK_SHARE = 0.35
// How much of the beat MAI's count takes once the hit lands.
export const COUNT_SHARE = 0.35

export type Strike =
  | { kind: 'hit'; id: string; assetId: string; layer: Layer; before: GameState; landed: boolean }
  | { kind: 'held'; id: string; layers: readonly Layer[] }

export function strikeFor(beat: Beat | null, before: GameState | null): Strike | null {
  if (!beat || beat.kind !== 'threat' || !beat.severity) return null
  if (beat.severity.effective > 0) {
    const asset = beat.targetAssetId === undefined ? undefined : before?.assets.find((a) => a.id === beat.targetAssetId)
    // With no state before the beat there is nothing to hold or lock onto;
    // the tile still changes with the presented state.
    if (!asset || !before) return null
    return { kind: 'hit', id: beat.id, assetId: asset.id, layer: asset.layer, before, landed: false }
  }
  return { kind: 'held', id: beat.id, layers: beat.layers ?? [] }
}
