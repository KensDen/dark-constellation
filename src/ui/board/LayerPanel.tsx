// One layer panel (v1.2 R1, brief 4.1 to 4.3): the layer name, the
// condition chips and deployed-defense icons on its header, and the asset
// tiles in a grid, two across for ORBIT and AIR and full width for GROUND.
//
// Each tile carries its kind's sprite in the state SPRITE_STATES picks
// for its integrity (v1.2 R2), with the Tier A chevron over it; the pips
// are ceil(integrity / 25), and the exact percent is in the tile's
// accessible name. A knocked-out tile stays on the board, greyed and
// crossed, so losses stay visible. Tap a tile for its intel card (v1.2 R3):
// what it is, its tier, its exact integrity and the conditions on its
// layer. Ghost tiles (in transit, queued) show the intact sprite faded,
// since the thing they stand for has not taken a hit yet.
//
// The panel sits over its layer's backdrop, and every piece of text on it
// sits on PANEL_FILL, so the art can be as bright as it likes around the
// tiles and the suite can check the text against the brightest of it.
// The sprite bobs inside its tile rather than the tile itself moving, so
// the press scale on .dc-tile keeps working: an animation on the button's
// own transform would override it.
//
// THE HIT (v1.2 R3, brief 4.3 and 4.5). Nothing marks a tile as targeted
// before RESOLVE: the engine picks the target at resolution, and the tile
// it picked is the one a playback beat names (`hit`, keyed by the asset id
// each tile carries as data-asset-id). While the beat locks on, magenta
// brackets close on the sprite; when it lands, the tile strobes, the burst
// plays over the sprite and the lost pips pop out. A held event flashes a
// shield and HELD on the header of each layer it touched. Every element is
// keyed on the beat, so a second hit restarts it, and the stylesheet
// decides what moves: under reduced motion the brackets and HELD stand
// still and the rest does not show.

import type { ActiveCondition, AssetKind, Layer, TrustTier, Vector } from '../../engine/types'
import ConditionBadge, { type BadgePhase } from '../cues/ConditionBadge'
import { vectorIcons } from '../cues/icons'
import { kindLabels, vectorLabels } from '../labels'
import { ASSET_SPRITES, TIER_A_CHEVRON } from '../sprites/assets'
import Backdrop from '../sprites/backdrops'
import { BACKDROP_BAND, PANEL_FILL } from '../sprites/scenery'
import PixelSprite from '../sprites/PixelSprite'
import { HIT_BURST, LOCK_ON, SHIELD_FLASH } from '../sprites/effects'
import { STATE_WORD, pipsFor, type DefenseIcon, type SpriteState, type TileModel } from './board'
import type { Strike } from './strike'

export interface ChipModel {
  condition: ActiveCondition
  phase: BadgePhase
  elapsed: number
  remainingEstimate?: number
  queuedForSurge: boolean
}

// The pips' colour by state.
const TONE: Record<SpriteState, string> = {
  intact: 'bg-dc-friendly',
  damaged: 'bg-dc-warn',
  critical: 'bg-dc-hostile',
  out: 'bg-dc-muted/40',
}

// The pips a hit just took pop out of the row: `popFrom` is how many were
// lit before it landed.
function Pips({ lit, tone, popFrom = 0, beat }: { lit: number; tone: string; popFrom?: number; beat?: string }) {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`relative h-1.5 w-3 ${i < lit ? tone : 'bg-dc-line'}`}>
          {i >= lit && i < popFrom && <span key={beat} data-pip-pop className="dc-pip-pop absolute inset-0 bg-dc-hostile" />}
        </span>
      ))}
    </span>
  )
}

const TILE = `dc-tile relative flex items-center gap-2 border-2 border-dc-line ${PANEL_FILL} px-2 min-h-11 text-left shadow-hard`

// A hit on one tile, as that tile sees it.
interface TileHit {
  id: string
  landed: boolean
  fromPips: number
}

// A tile's art: the kind's sprite in its state, the chevron over it at
// Tier A, bobbing out of phase with its neighbours while it still flies.
function TileArt({
  kind,
  tier,
  state,
  phase,
  ghost,
  hit,
}: {
  kind: AssetKind
  tier: TrustTier
  state: SpriteState
  phase: number
  ghost?: boolean
  hit?: TileHit | null
}) {
  const bob = !ghost && state !== 'out'
  return (
    <span
      aria-hidden="true"
      className={`relative flex-none ${bob ? 'dc-bob' : ''} ${ghost ? 'opacity-40' : ''}`}
      style={bob ? { animationDelay: `${-phase * 0.7}s` } : undefined}
    >
      <PixelSprite sprite={ASSET_SPRITES[kind][state]} name={`${kind}.${state}`} className="block" />
      {tier === 'A' && <PixelSprite sprite={TIER_A_CHEVRON} name="tier-a" className="absolute inset-0" />}
      {hit && <PixelSprite key={hit.id} sprite={LOCK_ON} name="lock-on" className="dc-lock-on absolute inset-0" />}
      {hit?.landed &&
        HIT_BURST.map((frame, i) => (
          <PixelSprite key={`${hit.id}-${i}`} sprite={frame} name={`hit-burst-${i}`} className={`dc-burst dc-burst-${i} absolute inset-0`} />
        ))}
    </span>
  )
}

function Tile({
  tile,
  phase,
  selected,
  hit,
  onSelect,
  onRemove,
}: {
  tile: TileModel
  phase: number
  selected: boolean
  hit?: TileHit | null
  onSelect: () => void
  onRemove: () => void
}) {
  if (tile.kind === 'asset') {
    const { asset, callSign, pips, state } = tile
    return (
      <button
        type="button"
        data-asset-id={asset.id}
        data-struck={hit ? (hit.landed ? 'hit' : 'lock') : undefined}
        aria-haspopup="dialog"
        aria-label={`${callSign}, ${kindLabels[asset.kind]}, Tier ${asset.tier}, integrity ${asset.integrity}%${STATE_WORD[state]}`}
        onClick={onSelect}
        className={`${TILE} ${selected ? 'border-dc-go' : ''}`}
      >
        {hit?.landed && <span key={hit.id} aria-hidden="true" data-strobe className="dc-hit-strobe pointer-events-none absolute inset-0 bg-dc-hostile/45" />}
        <TileArt kind={asset.kind} tier={asset.tier} state={state} phase={phase} hit={hit} />
        <span className="min-w-0 flex-1">
          {/* A lost asset's name dims by colour, not by opacity: opacity
              would thin the tile's fill and let the backdrop under the text. */}
          <span className={`block font-display text-[10px] truncate ${state === 'out' ? 'text-dc-muted' : 'text-dc-ink'}`}>{callSign}</span>
          <span className="mt-0.5 block">
            <Pips lit={pips} tone={TONE[state]} popFrom={hit?.landed ? hit.fromPips : 0} beat={hit?.id} />
          </span>
        </span>
      </button>
    )
  }
  if (tile.kind === 'transit') {
    const { pending, callSign } = tile
    return (
      <div className={`${TILE} border-dashed`}>
        <TileArt kind={pending.kind} tier={pending.tier} state="intact" phase={phase} ghost />
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
      <TileArt kind={buy.kind} tier={buy.tier} state="intact" phase={phase} ghost />
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
  // The playback beat's hit, when it lands on this layer, and the beat id
  // when an event this layer was exposed to was held.
  hit?: Extract<Strike, { kind: 'hit' }> | null
  held?: string | null
}

export default function LayerPanel({ layer, tiles, chips, defenses, selectedKey, onSelect, onRemoveQueued, hit, held }: LayerPanelProps) {
  const struck = hit ? hit.before.assets.find((a) => a.id === hit.assetId) : undefined
  const tileHit: TileHit | null = hit && struck ? { id: hit.id, landed: hit.landed, fromPips: pipsFor(struck.integrity) } : null
  const holding = tiles.filter((t) => t.kind === 'asset' && t.asset.integrity > 0).length
  return (
    <section
      aria-labelledby={`layer-${layer}`}
      // flex-none: overflow-hidden (which clips the backdrop) would
      // otherwise let the board's scroll column shrink the panel to fit
      // rather than scroll.
      className="relative flex-none overflow-hidden border-2 border-dc-line bg-dc-panel/60 p-1.5 shadow-hard"
      style={BACKDROP_BAND[layer] ? { paddingBottom: BACKDROP_BAND[layer] } : undefined}
    >
      <Backdrop layer={layer} />
      <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 id={`layer-${layer}`} className={`${PANEL_FILL} px-1 py-0.5 font-display text-[10px] text-dc-ink leading-none`}>
          {layer}
        </h2>
        <span className={`${PANEL_FILL} px-1 font-mono text-[10px] text-dc-muted`}>{holding} holding</span>
        {held && (
          <span key={held} data-held className={`dc-shield-flash inline-flex items-center gap-1 ${PANEL_FILL} px-1 font-display text-[9px] text-dc-go`}>
            <PixelSprite sprite={SHIELD_FLASH} scale={1} name="shield-flash" />
            HELD
          </span>
        )}
        {defenses.length > 0 && (
          <ul className={`flex items-center gap-1 ${PANEL_FILL}`} aria-label={`Deployed defenses on ${layer}`}>
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
              // The stamp (v1.2 R3): the chip lands on the header as its
              // condition applies, timed from the beat like the hit and
              // moving only by transform and opacity. It replaces the
              // badge's own attach animation here, which glows by
              // box-shadow and does not follow the speed.
              <span key={chip.condition.instanceId} data-stamp={chip.phase === 'applying' ? 'true' : undefined} className={`inline-flex ${PANEL_FILL} ${chip.phase === 'applying' ? 'dc-stamp' : ''}`}>
                <ConditionBadge
                  condition={chip.condition}
                  phase={chip.phase === 'applying' ? 'attached' : chip.phase}
                  elapsed={chip.elapsed}
                  remainingEstimate={chip.remainingEstimate}
                  queuedForSurge={chip.queuedForSurge}
                />
              </span>
            ))}
          </span>
        )}
      </div>
      <div className={`relative mt-1.5 grid gap-1.5 ${layer === 'GROUND' ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {tiles.map((tile, i) => (
          <Tile
            key={tile.key}
            tile={tile}
            phase={i}
            selected={tile.key === selectedKey}
            hit={tile.kind === 'asset' && tile.key === hit?.assetId ? tileHit : null}
            onSelect={() => onSelect(tile.key === selectedKey ? null : tile.key)}
            onRemove={() => (tile.kind === 'queued' ? onRemoveQueued(tile.index) : undefined)}
          />
        ))}
        {tiles.length === 0 && <p className={`${PANEL_FILL} px-1 font-mono text-xs text-dc-muted`}>No assets on this layer.</p>}
      </div>
    </section>
  )
}

export type { Vector }
