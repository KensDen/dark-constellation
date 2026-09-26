// One layer panel (v1.2 R1, brief 4.1 to 4.3): the layer name, the
// condition chips and deployed-defense icons on its header, and the asset
// tiles in a grid, two across for ORBIT and AIR and full width for GROUND.
//
// Tiles are plain coloured squares this round; R2 brings the sprites. The
// square's colour is the sprite state (intact, damaged, critical, knocked
// out), the pips are ceil(integrity / 25), and the exact percent is in
// the tile's accessible name. A knocked-out tile stays on the board,
// greyed and crossed, so losses stay visible. Tap a tile for its full
// name and exact integrity, which the panel prints under the grid.
//
// Nothing here marks a tile as targeted: the engine picks the target at
// resolution, and the lock-on beat is R3's (brief 4.3).

import type { ActiveCondition, Layer, Vector } from '../../engine/types'
import ConditionBadge, { type BadgePhase } from '../cues/ConditionBadge'
import { vectorIcons } from '../cues/icons'
import { kindLabels, vectorLabels } from '../labels'
import type { DefenseIcon, SpriteState, TileModel } from './board'

export interface ChipModel {
  condition: ActiveCondition
  phase: BadgePhase
  elapsed: number
  remainingEstimate?: number
  queuedForSurge: boolean
}

const SQUARE: Record<SpriteState, string> = {
  intact: 'bg-dc-friendly',
  damaged: 'bg-dc-warn',
  critical: 'bg-dc-hostile',
  out: 'bg-dc-muted/40 text-dc-muted',
}

const STATE_WORD: Record<SpriteState, string> = {
  intact: '',
  damaged: ', damaged',
  critical: ', critical',
  out: ', knocked out',
}

function Pips({ lit, tone }: { lit: number; tone: string }) {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`h-1.5 w-3 ${i < lit ? tone : 'bg-dc-line'}`} />
      ))}
    </span>
  )
}

const TILE = 'dc-tile flex items-center gap-2 border-2 border-dc-line bg-dc-panel px-2 min-h-11 text-left shadow-hard'

function Tile({ tile, selected, onSelect, onRemove }: { tile: TileModel; selected: boolean; onSelect: () => void; onRemove: () => void }) {
  if (tile.kind === 'asset') {
    const { asset, callSign, pips, state } = tile
    const tone = state === 'out' ? 'bg-dc-muted/40' : SQUARE[state]
    return (
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${callSign}, ${kindLabels[asset.kind]}, Tier ${asset.tier}, integrity ${asset.integrity}%${STATE_WORD[state]}`}
        onClick={onSelect}
        className={`${TILE} ${selected ? 'border-dc-go' : ''} ${state === 'out' ? 'opacity-70' : ''}`}
      >
        <span aria-hidden="true" className={`relative flex-none h-7 w-7 ${SQUARE[state]} flex items-center justify-center font-display text-sm`}>
          {state === 'out' ? 'X' : ''}
          {/* Tier A's gold chevron (brief 4.2), as a corner mark until R2. */}
          {asset.tier === 'A' && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-dc-warn" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[10px] text-dc-ink truncate">{callSign}</span>
          <span className="mt-0.5 block">
            <Pips lit={pips} tone={tone} />
          </span>
        </span>
      </button>
    )
  }
  if (tile.kind === 'transit') {
    const { pending, callSign } = tile
    return (
      <div className={`${TILE} border-dashed opacity-80`}>
        <span aria-hidden="true" className="flex-none h-7 w-7 border-2 border-dashed border-dc-friendly" />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[10px] text-dc-muted truncate">{callSign}</span>
          <span className="block font-mono text-[10px] uppercase text-dc-muted">
            {kindLabels[pending.kind]} {pending.tier} · in transit · ETA {pending.etaTurns}
          </span>
        </span>
      </div>
    )
  }
  const { buy, callSign } = tile
  return (
    <button
      type="button"
      aria-label={`Remove ${callSign}, ${kindLabels[buy.kind]} Tier ${buy.tier}, from the cart`}
      onClick={onRemove}
      className={`${TILE} border-dashed border-dc-friendly/60 ${tile.cue ?? ''}`}
    >
      <span aria-hidden="true" className="flex-none h-7 w-7 border-2 border-dashed border-dc-friendly bg-dc-friendly/10" />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[10px] text-dc-friendly truncate">{callSign}</span>
        <span className="block font-mono text-[10px] uppercase text-dc-muted">
          {kindLabels[buy.kind]} {buy.tier} · queued · tap to remove
        </span>
      </span>
    </button>
  )
}

export interface LayerPanelProps {
  layer: Layer
  tiles: TileModel[]
  chips: ChipModel[]
  defenses: DefenseIcon[]
  selectedKey: string | null
  onSelect: (key: string | null) => void
  onRemoveQueued: (index: number) => void
}

export default function LayerPanel({ layer, tiles, chips, defenses, selectedKey, onSelect, onRemoveQueued }: LayerPanelProps) {
  const selected = tiles.find((t) => t.key === selectedKey && t.kind === 'asset')
  const holding = tiles.filter((t) => t.kind === 'asset' && t.asset.integrity > 0).length
  return (
    <section aria-labelledby={`layer-${layer}`} className="border-2 border-dc-line bg-dc-panel/60 p-1.5 shadow-hard">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 id={`layer-${layer}`} className="font-display text-[10px] text-dc-ink leading-none">
          {layer}
        </h2>
        <span className="font-mono text-[10px] text-dc-muted">{holding} holding</span>
        {defenses.length > 0 && (
          <ul className="flex items-center gap-1" aria-label={`Deployed defenses on ${layer}`}>
            {defenses.map((d) => (
              <li key={d.id}>
                <img src={vectorIcons[d.vector]} alt={`${d.name} (${vectorLabels[d.vector]})`} className="h-5 w-5" />
              </li>
            ))}
          </ul>
        )}
        {chips.length > 0 && (
          <span className="flex flex-wrap gap-1 basis-full">
            {chips.map((chip) => (
              <ConditionBadge
                key={chip.condition.instanceId}
                condition={chip.condition}
                phase={chip.phase}
                elapsed={chip.elapsed}
                remainingEstimate={chip.remainingEstimate}
                queuedForSurge={chip.queuedForSurge}
              />
            ))}
          </span>
        )}
      </div>
      <div className={`mt-1.5 grid gap-1.5 ${layer === 'GROUND' ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {tiles.map((tile) => (
          <Tile
            key={tile.key}
            tile={tile}
            selected={tile.key === selectedKey}
            onSelect={() => onSelect(tile.key === selectedKey ? null : tile.key)}
            onRemove={() => (tile.kind === 'queued' ? onRemoveQueued(tile.index) : undefined)}
          />
        ))}
        {tiles.length === 0 && <p className="font-mono text-xs text-dc-muted">No assets on this layer.</p>}
      </div>
      {selected && selected.kind === 'asset' && (
        <p className="mt-2 font-mono text-xs text-dc-ink" data-tile-detail={selected.key}>
          {selected.callSign}: {kindLabels[selected.asset.kind]}, Tier {selected.asset.tier}, integrity {selected.asset.integrity}%
          {STATE_WORD[selected.state]}.
        </p>
      )}
    </section>
  )
}

export type { Vector }
