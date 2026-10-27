// THE ASSET STRIP (v1.3 brief 5.3 item 2): ORBIT, AIR and GROUND side by
// side under the HUD, each column as wide as its count asks. A tile is the
// sprite, the call sign and four pips, or ETA n, OFFLINE or LOST; a wound
// scorches the sprite (8.2). Condition chips on a column's head give the
// turns left (JAMMED · 2T). Tapping a tile opens its intel card (v1.2 4.8,
// kept). An asset ordered tonight sits in its column as ORDERED, and a tap
// cancels the order.
//
// During the night (brief 5.5 item 1) the struck tile carries the lock-on
// and the burst it has had since v1.2 R3; a block puts a green reticle and
// a shield flash on the tile it was aimed at, and its layer flashes HELD.
// Once the operation is over, a tile still in transit says so rather than
// counting down to a turn that will not come (QC G-067).

import { useRef, useSyncExternalStore } from 'react'
import type { ActiveCondition, Layer } from '../../engine/types'
import { LAYERS } from '../../engine/types'
import { kindLabels } from '../labels'
import { assetSprite } from '../sprites/assets'
import { HIT_BURST, LOCK_ON, SHIELD_STAMP } from '../sprites/effects'
import PixelSprite from '../sprites/PixelSprite'
import { STATE_WORD, pipsFor, type SpriteState, type TileModel } from './board'
import type { Strike, Trace } from './strike'
import { NO_ARRIVAL, OPERATION_OVER, chipTurns } from './boardModel'

// THE PLAYFIELD (v1.5 R2): the strip's layers drawn as places, and the
// night's moves on their tiles, in a chunk of its own, fetched as this
// module loads, with the board. Rendered from the loaded module rather than
// through React.lazy, whose first showing suspends (and in the test DOM
// resolved after a test had ended), as the night's chunks are. The strip
// is whole without it: a chunk that never arrives leaves the panels' plain
// fill.
let playfield: typeof import('./Playfield') | null = null
const arrived = new Set<() => void>()
import('./Playfield').then(
  (m) => {
    playfield = m
    arrived.forEach((f) => f())
  },
  () => undefined,
)
const onArrival = (f: () => void) => {
  arrived.add(f)
  return () => void arrived.delete(f)
}
const loadedPlayfield = () => playfield

export interface ChipModel {
  condition: ActiveCondition
  remaining?: number
}

const PIP_TONE: Record<SpriteState, string> = {
  intact: 'text-dc-friendly',
  wounded: 'text-dc-warn',
  critical: 'text-dc-hostile',
  lost: 'text-dc-muted',
}

// Four pips, lit by integrity. The ones a landed hit just took pop red over
// their place (v1.2 R3), keyed on the hit so a second hit pops again.
function Pips({ lit, tone, popFrom = 0, beat }: { lit: number; tone: string; popFrom?: number; beat?: string }) {
  return (
    <span aria-hidden="true" className={`relative flex font-mono text-[10px] leading-none ${tone}`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="relative">
          {i < lit ? '●' : '○'}
          {i >= lit && i < popFrom && <span key={beat} data-pip-pop className="dc-pip-pop absolute inset-0 text-dc-hostile">●</span>}
        </span>
      ))}
    </span>
  )
}

const TILE = 'dc-tile relative flex min-h-11 flex-col items-center gap-0.5 border border-transparent px-0.5 pt-0.5 pb-0.5'

interface TileHit {
  id: string
  landed: boolean
  // The pips the tile showed before the hit.
  fromPips: number
  // The still mark while the move's card is up: the brackets, no motion.
  rest?: boolean
  // The integrity before the hit, so the tile can say the change while
  // the card is up (v1.6 R3, Ken's playtest item 3: the hit card's
  // "integrity 100 → 76" folded into the strip, which shows the damage).
  fromIntegrity?: number
}

function Art({ tile, hit }: { tile: TileModel; hit?: TileHit | null }) {
  const kind = tile.kind === 'asset' ? tile.asset.kind : tile.kind === 'transit' ? tile.pending.kind : tile.buy.kind
  const sprite = tile.kind === 'asset' ? assetSprite(kind, tile.asset.integrity) : assetSprite(kind, 100, 'transit')
  return (
    <span aria-hidden="true" data-art className="relative block">
      {/* The landing's strobe, on the sprite alone so the call sign and
          the pips stay readable through it (v1.5 R2's review: over the
          whole tile it read as a debug box). */}
      {hit?.landed && !hit.rest && <span key={`${hit.id}-strobe`} data-strobe className="dc-hit-strobe pointer-events-none absolute inset-0 bg-dc-hostile/45" />}
      <PixelSprite sprite={sprite} name={`${kind}.${tile.kind === 'asset' ? tile.state : 'transit'}`} className="relative block" />
      {/* Sized to the art's own box (the square sprite keeps its shape
          inside it), so the brackets stay off the call sign below, at the
          desktop strip's zoom too (R6 question 14). */}
      {hit && <PixelSprite key={hit.id} sprite={LOCK_ON} name="lock-on" className={`${hit.rest ? '' : 'dc-lock-on'} absolute inset-0 m-auto h-full w-full`} />}
      {hit?.landed &&
        !hit.rest &&
        HIT_BURST.map((frame, i) => (
          <PixelSprite key={`${hit.id}-${i}`} sprite={frame} name={`hit-burst-${i}`} className={`dc-burst dc-burst-${i} absolute inset-0 m-auto`} />
        ))}
    </span>
  )
}

function Tile({
  tile,
  hit,
  shield,
  over,
  selected,
  onSelect,
  onCancel,
}: {
  tile: TileModel
  hit?: TileHit | null
  // A block aimed at this tile: the strike's id, whether it has landed,
  // and whether it is the still mark while the card is up.
  shield?: { id: string; landed: boolean; rest?: boolean } | null
  over?: boolean
  selected: boolean
  onSelect: () => void
  onCancel: () => void
}) {
  if (tile.kind === 'asset') {
    const { asset, callSign, state } = tile
    return (
      <button
        type="button"
        data-asset-id={asset.id}
        data-state={state}
        data-struck={hit ? (hit.rest ? 'rest' : hit.landed ? 'hit' : 'lock') : undefined}
        // A tile opens its intel card (the wide board's inspector went in
        // v1.3 R5).
        aria-haspopup="dialog"
        aria-label={`${callSign}, ${kindLabels[asset.kind]}, integrity ${asset.integrity}%${STATE_WORD[state]}`}
        onClick={onSelect}
        data-shield={shield ? (shield.rest ? 'rest' : shield.landed ? 'held' : 'lock') : undefined}
        className={`${TILE} ${selected ? 'border-dc-go' : ''} ${shield?.landed && !shield.rest ? 'dc-shield-tile' : ''}`}
      >
        {/* The square reticle, where no playfield draws the shield's dome
            (src/index.css steps it aside once one does). */}
        {shield && <i key={shield.id} aria-hidden="true" data-shield-reticle className={`${shield.rest ? '' : 'dc-reticle'} pointer-events-none absolute -inset-[3px] border-2 border-dc-go`} />}
        {/* The stamp a block leaves on its tile (v1.3 R5), there from the
            landing until the move's card is gone: a block's own shape. */}
        {shield && (shield.landed || shield.rest) && (
          <span key={`${shield.id}-stamp`} aria-hidden="true" data-shield-stamp className={`${shield.rest ? '' : 'dc-stamp-pop'} pointer-events-none absolute -right-1.5 -top-1.5 z-10`}>
            <PixelSprite sprite={SHIELD_STAMP} scale={1} name="tile-shield-stamp" />
          </span>
        )}
        <Art tile={tile} hit={hit} />
        {hit?.rest && hit.fromIntegrity !== undefined && hit.fromIntegrity !== asset.integrity && (
          <span data-integrity-change aria-hidden="true" className="pointer-events-none absolute -top-1.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap bg-dc-ground px-0.5 font-mono text-[10px] leading-none text-dc-hostile">
            {hit.fromIntegrity}→{asset.integrity}
          </span>
        )}
        {/* Positioned, so the call sign and the pips sit above the strobe
            and stay readable through a hit (fresh-eyes review). */}
        <span className={`relative whitespace-nowrap font-mono text-[10px] leading-none ${state === 'lost' ? 'text-dc-muted' : 'text-dc-ink'}`}>{callSign}</span>
        {state === 'lost' ? (
          <span className="whitespace-nowrap font-mono text-[10px] leading-none text-dc-muted">LOST</span>
        ) : (
          <Pips lit={pipsFor(asset.integrity)} tone={PIP_TONE[state]} popFrom={hit?.landed && !hit.rest ? hit.fromPips : 0} beat={hit?.id} />
        )}
      </button>
    )
  }
  if (tile.kind === 'transit') {
    return (
      <div data-asset-id={tile.pending.id} data-state="transit" className={TILE} aria-label={`${tile.callSign}, ${kindLabels[tile.pending.kind]}, arriving in ${tile.pending.etaTurns}`}>
        <Art tile={tile} />
        <span className="whitespace-nowrap font-mono text-[10px] leading-none text-dc-muted">{tile.callSign}</span>
        <span className="whitespace-nowrap font-mono text-[10px] leading-none text-dc-muted">{over ? NO_ARRIVAL : `ETA ${tile.pending.etaTurns}`}</span>
      </div>
    )
  }
  return (
    <button
      type="button"
      data-queued={tile.buy.kind}
      aria-label={`Cancel the order for ${tile.callSign}, ${kindLabels[tile.buy.kind]}`}
      onClick={onCancel}
      className={`${TILE} border-dashed border-dc-friendly/60! ${tile.cue ?? ''}`}
    >
      <Art tile={tile} />
      <span className="whitespace-nowrap font-mono text-[10px] leading-none text-dc-friendly">{tile.callSign}</span>
      <span className="whitespace-nowrap font-mono text-[10px] leading-none text-dc-friendly">ORDERED</span>
    </button>
  )
}

export interface AssetStripProps {
  tiles: Record<Layer, TileModel[]>
  chips: (layer: Layer) => ChipModel[]
  selectedKey: string | null
  onSelect: (key: string | null) => void
  onCancelQueued: (index: number) => void
  hit?: Extract<Strike, { kind: 'hit' }> | null
  held?: Extract<Strike, { kind: 'held' }> | null
  // The operation is over: nothing in transit will arrive.
  over?: boolean
  // Tonight's earlier moves, for the playfield, and whether the night is on.
  traces?: readonly Trace[]
  night?: boolean
  // While deciding, tonight's moves for the playfield's lane marks.
  threats?: readonly { layers: readonly Layer[]; status: string }[]
  // In the night, the moves landed so far, named at their tiles.
  labels?: readonly Trace[]
}

const NO_TRACES: readonly Trace[] = []

export default function AssetStrip({ tiles, chips, selectedKey, onSelect, onCancelQueued, hit, held, over, traces = NO_TRACES, night = false, threats, labels }: AssetStripProps) {
  const strip = useRef<HTMLElement | null>(null)
  const Playfield = useSyncExternalStore(onArrival, loadedPlayfield, loadedPlayfield)?.default
  const struck = hit ? hit.before.assets.find((a) => a.id === hit.assetId) : undefined
  const tileHit: TileHit | null = hit && struck ? { id: hit.id, landed: hit.landed, fromPips: pipsFor(struck.integrity), rest: hit.rest, fromIntegrity: struck.integrity } : null
  // Each column starts as wide as its tiles. When the fleet outgrows the
  // row, the fullest column gives way and its tiles wrap; the others keep
  // one row.
  const most = Math.max(...LAYERS.map((layer) => tiles[layer].length))
  const live = Object.fromEntries(LAYERS.map((layer) => [layer, chips(layer).map((c) => c.condition.name)]))
  return (
    <>
      <section ref={strip} aria-label="Assets" data-strip className="relative flex flex-none gap-1.5">
        {Playfield && <Playfield strip={strip} conditions={live} strike={hit ?? held ?? null} traces={traces} night={night} threats={threats} labels={labels} />}
        {LAYERS.map((layer) => {
          const list = tiles[layer]
          const layerChips = chips(layer)
          // The shield on the header only for a block with no tile to
          // shield: a block on a tile says so on the tile, and the header
          // keeps its width, so nothing on the strip moves mid-strike. The
          // stamp alone (R6 question 7): BLOCKED beside GROUND fills its
          // 108 px header at 375 with no pixel to spare, so the word is for
          // screen readers; the night card says it in full.
          const heldHere = held && held.landed && !held.rest && !held.assetId && held.layers.includes(layer) ? held.id : null
          return (
            <div key={layer} data-layer={layer} className="relative z-10 min-w-0 border border-dc-line bg-dc-panel px-1 pt-0.5" style={{ flex: `${Math.max(1, list.length)} ${list.length === most ? 1 : 0} auto` }}>
              <div className="flex flex-wrap items-center gap-1">
                <h2 className="font-mono text-[10px] tracking-widest text-dc-muted">{layer}</h2>
                {heldHere && (
                  <span key={heldHere} data-held className="dc-shield-flash inline-flex items-center gap-1 font-mono text-[10px] text-dc-go">
                    <PixelSprite sprite={SHIELD_STAMP} scale={1} name="shield-stamp" />
                    <span className="sr-only">BLOCKED</span>
                  </span>
                )}
              </div>
              {/* The chips on a line of their own under the layer's name
                  (v1.3 R3), and asking the column for no more width than
                  their longest word (min-content), so a chip on a short
                  column wraps inside it rather than widening it until the
                  fullest column has to stack its tiles. Laid out, they take
                  the column's whole width. The turns stay with their dot. */}
              {layerChips.length > 0 && (
                <div className="flex flex-col items-start" style={{ width: 'min-content', minWidth: '100%' }}>
                  {layerChips.map((chip) => (
                    // The name holds its count too (v1.5 R1: in the narrow
                    // GROUND column "· 0T" wrapped onto a line of its own),
                    // and the last turn reads LAST (R6b's fresh eyes, item 4).
                    <span key={chip.condition.instanceId} data-condition-chip className="font-mono text-[10px] leading-tight text-dc-hostile">
                      {chip.condition.name}
                      {'\u00a0·\u00a0'}
                      {chipTurns(chip.condition.remainingTurns, chip.remaining ?? chip.condition.remainingTurns)}
                    </span>
                  ))}
                </div>
              )}
              <div data-tiles className="mt-0.5 flex flex-wrap gap-1">
                {list.map((tile) => (
                  <Tile
                    key={tile.key}
                    tile={tile}
                    selected={tile.key === selectedKey}
                    hit={tile.kind === 'asset' && hit && tile.key === hit.assetId ? tileHit : null}
                    shield={tile.kind === 'asset' && held && tile.key === held.assetId ? { id: held.id, landed: held.landed, rest: held.rest } : null}
                    over={over}
                    onSelect={() => onSelect(tile.key === selectedKey ? null : tile.key)}
                    onCancel={() => tile.kind === 'queued' && onCancelQueued(tile.index)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </section>
      {over && (
        <p data-strip-over className="flex-none text-center font-mono text-[10px] tracking-widest text-dc-muted">
          {OPERATION_OVER}
        </p>
      )}
    </>
  )
}
