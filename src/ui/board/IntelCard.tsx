// The intel card (v1.2 R3, brief 4.8): tap a tile or the threat banner and
// the game says what it knows, from content it already carries and
// nothing unsourced. Loaded on first open, in its own chunk.
//
// A TILE: what the asset is and does, what its tier means, its exact
// integrity, and the conditions pressing on its layer, each with its REAL
// WORLD line (technique, source, the learn-more card and its links). The
// remaining span of a condition shows only at top intel, as on the chips.
//
// THE BANNER: only what the forecast already shows at the current intel
// level, from briefCopy, which is the banner's own copy. At intel 0 the
// card says the forecast is dark and nothing more: not the posture lines
// (they name live conditions), not the chain line, and not a quiet turn's
// "no activity", which would itself be intel the player has not bought.
// At top intel, the event the banner names brings its REAL WORLD line.

import type { GameState } from '../../engine/types'
import { effectiveIntel } from '../../engine/reducer'
import { FORECAST_DARK, briefCopy, forecastLead } from '../brief'
import { TIER_NOTE, kindLabels } from '../labels'
import RealWorld from '../RealWorld'
import { realWorldFor } from '../realWorldLine'
import { STATE_WORD, callSigns, conditionsOn, spriteState } from './board'
import { assetRole } from './ProcureSheet'

export type IntelSubject = { kind: 'tile'; assetId: string } | { kind: 'banner' }

export interface IntelCardProps {
  subject: IntelSubject
  // The state the board is showing, which during playback is the beat's.
  state: GameState
  // The engine's turn, which a condition's age counts from, as the chips
  // on the layer headers do (the state a playback shows keeps the turn it
  // started on).
  turn: number
  onClose: () => void
}

const HEAD = 'font-display text-[10px] leading-none text-dc-go'
const LABEL = 'mt-3 font-display text-[9px] leading-none text-dc-muted'

function TileIntel({ state, turn, assetId }: { state: GameState; turn: number; assetId: string }) {
  const asset = state.assets.find((a) => a.id === assetId)
  if (!asset) return null
  const conditions = conditionsOn(asset.layer, state.conditions, state.scenario)
  const topIntel = effectiveIntel(state) >= 3
  return (
    <>
      <h2 id="intel-title" className={`${HEAD} uppercase`}>
        {callSigns(state).get(asset.id)} · {kindLabels[asset.kind]}
      </h2>
      {/* What it adds and does, while it still flies: a lost asset adds
          no coverage, and its integrity line says it is knocked out. */}
      {asset.integrity > 0 && <p className="mt-2">{assetRole(asset.kind)}.</p>}
      <p className={LABEL}>TIER {asset.tier}</p>
      <p className="mt-1 text-dc-muted">{TIER_NOTE}</p>
      <p className={LABEL}>INTEGRITY</p>
      <p className="mt-1">
        {asset.integrity}%{STATE_WORD[spriteState(asset.integrity)]}
      </p>
      <p className={LABEL}>CONDITIONS ON {asset.layer}</p>
      {conditions.length === 0 ? (
        <p className="mt-1 text-dc-muted">None.</p>
      ) : (
        <ul className="mt-1">
          {conditions.map((c) => {
            const line = realWorldFor(state.scenario.events.find((e) => e.id === c.eventId))
            return (
              <li key={c.instanceId} data-intel-condition={c.eventId} className="mt-2">
                <p>
                  {c.name} T+{turn - c.startedTurn}
                  {topIntel ? ` ~${c.remainingTurns} left` : ''}
                </p>
                {line && <RealWorld line={line} />}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function BannerIntel({ state }: { state: GameState }) {
  const intel = effectiveIntel(state)
  const copy = intel === 0 ? FORECAST_DARK : briefCopy(state)
  const lead = intel === 0 ? undefined : forecastLead(state)
  const line = lead ? realWorldFor(lead) : null
  return (
    <>
      <h2 id="intel-title" className={HEAD}>
        THREAT INTEL · INTEL {intel}
      </h2>
      <p className="mt-2 text-phosphor">{copy.headline}</p>
      <p className="mt-1">{copy.vector}</p>
      {line && <RealWorld line={line} />}
    </>
  )
}

export default function IntelCard({ subject, state, turn, onClose }: IntelCardProps) {
  return (
    <section aria-labelledby="intel-title" data-intel-card={subject.kind} className="mx-auto max-w-[560px] px-4 py-4 font-mono text-sm text-dc-ink">
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={onClose} className="min-h-11 border-2 border-dc-line bg-dc-panel px-3 font-display text-[10px] text-dc-ink">
          CLOSE
        </button>
      </div>
      <div className="border-2 border-dc-line bg-dc-panel p-3 shadow-hard">
        {subject.kind === 'tile' ? <TileIntel state={state} turn={turn} assetId={subject.assetId} /> : <BannerIntel state={state} />}
      </div>
    </section>
  )
}
