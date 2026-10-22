// THE STRIKE ON THE BOARD (v1.3 brief 5.5 item 1): the strip brings the
// target tile into view, a reticle locks on, and the tile takes the
// scorch, or a shield flash when a defense held. The tile is the engine's
// own record of the move (ResolvedEvent.targetAssetId), never a parse of
// its note; it is set whether or not the move landed, so a block can
// flash on the tile it was aimed at.
//
// A strike plays in two parts. For the first LOCK_SHARE of STRIKE_MS the
// board still shows the state before the move while the reticle locks on;
// then it lands, and the tile, its pips and the score change with the
// strobe, the burst and the falling "-n" (or the shield and HELD). It is
// one of the two things in the night that play on their own (the other is
// the 750ms overlay); the cards wait for a tap. Skipped under reduced
// motion, where the card arrives with the board already changed.

import type { GameState, Layer } from '../../engine/types'

// "About 1.2 s" (brief 5.5). The stylesheet reads it as --dc-beat.
export const STRIKE_MS = 1200
export const LOCK_SHARE = 0.35
// How much of the strike the score's count takes once the move lands.
export const COUNT_SHARE = 0.35

// `rest` is the still reticle a move's tile keeps while its card is up:
// the mark alone, none of the strike's motion.
export type Strike =
  | { kind: 'hit'; id: string; assetId: string; layer: Layer; before: GameState; landed: boolean; rest?: boolean }
  | { kind: 'held'; id: string; assetId?: string; layers: readonly Layer[]; landed: boolean; rest?: boolean }

// The strike a move makes: a hit on the tile it was aimed at when any of
// it got through, a held flash on that tile otherwise. A block with no
// live tile on its layers holds on its layers' headers; a move that
// landed with no tile to land on has only its banner.
export function strikeOf(
  id: string,
  ev: { effectiveSeverity: number; targetAssetId?: string },
  layers: readonly Layer[],
  before: GameState,
  landed: boolean,
): Strike | null {
  const asset = ev.targetAssetId === undefined ? undefined : before.assets.find((a) => a.id === ev.targetAssetId)
  if (ev.effectiveSeverity > 0) return asset ? { kind: 'hit', id, assetId: asset.id, layer: asset.layer, before, landed } : null
  return { kind: 'held', id, assetId: asset?.id, layers: asset ? [asset.layer] : layers, landed }
}
