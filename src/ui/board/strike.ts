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

import type { GameState, Layer, ResolvedEvent, Scenario } from '../../engine/types'

// "About 1.2 s" (brief 5.5). The stylesheet reads it as --dc-beat.
export const STRIKE_MS = 1200
export const LOCK_SHARE = 0.35
// How much of the strike the score's count takes once the move lands.
export const COUNT_SHARE = 0.35

// `rest` is the still reticle a move's tile keeps while its card is up:
// the mark alone, none of the strike's motion. `eventId` is the move, for
// the playfield's drawing of it (v1.5 R2).
export type Strike =
  | { kind: 'hit'; id: string; eventId?: string; assetId: string; layer: Layer; before: GameState; landed: boolean; rest?: boolean }
  | { kind: 'held'; id: string; eventId?: string; assetId?: string; layers: readonly Layer[]; landed: boolean; rest?: boolean }

// ONE OF TONIGHT'S MOVES ON THE PLAYFIELD (v1.5 R2): the move, the tile it
// was aimed at (or, with none, its layers), and whether any of it got
// through. The playfield keeps the night's earlier moves on the board,
// dimmed, so END OF TURN shows the whole night where it happened.
export interface Trace {
  id: string
  eventId: string
  assetId?: string
  layers: readonly Layer[]
  hit: boolean
  // What it came to, for the desktop's night log: blocked, partly or wholly
  // through, or the debris passing clear or taking the satellite; and the
  // score's change across it.
  result: 'blocked' | 'partial' | 'hit' | 'clear' | 'lost'
  delta: number
}

// The moves of a turn's record, the first `count` of them, as traces:
// opportunities are not moves and leave none, and the debris "hits" only
// when it takes the satellite.
export function tracesOf(turn: number, events: readonly ResolvedEvent[], scenario: Scenario, count = events.length): Trace[] {
  const out: Trace[] = []
  events.slice(0, count).forEach((ev, i) => {
    const def = scenario.events.find((e) => e.id === ev.eventId)
    if (!def || def.kind === 'opportunity') return
    const hit = ev.debris ? ev.debris.lost : ev.effectiveSeverity > 0
    const result = ev.debris
      ? ev.debris.lost
        ? 'lost'
        : 'clear'
      : ev.effectiveSeverity === 0
        ? 'blocked'
        : ev.effectiveSeverity < ev.baseSeverity + ev.chainBonus
          ? 'partial'
          : 'hit'
    const delta = Math.round((ev.scoreAfter - ev.scoreBefore) * 10) / 10
    out.push({ id: `t${turn}-${i}`, eventId: ev.eventId, assetId: ev.targetAssetId ?? ev.debris?.assetId, layers: def.layers, hit, result, delta })
  })
  return out
}

// The strike a move makes: a hit on the tile it was aimed at when any of
// it got through, a held flash on that tile otherwise. A block with no
// live tile on its layers holds on its layers' headers; a move that
// landed with no tile to land on has only its banner.
export function strikeOf(
  id: string,
  ev: { effectiveSeverity: number; targetAssetId?: string; eventId?: string },
  layers: readonly Layer[],
  before: GameState,
  landed: boolean,
): Strike | null {
  const asset = ev.targetAssetId === undefined ? undefined : before.assets.find((a) => a.id === ev.targetAssetId)
  const { eventId } = ev
  if (ev.effectiveSeverity > 0) return asset ? { kind: 'hit', id, eventId, assetId: asset.id, layer: asset.layer, before, landed } : null
  return { kind: 'held', id, eventId, assetId: asset?.id, layers: asset ? [asset.layer] : layers, landed }
}
