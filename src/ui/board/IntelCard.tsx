// The intel card (v1.2 R3, brief 4.8): tap a tile or the threat banner and
// the game says what it knows, from content it already carries and
// nothing unsourced. Loaded on first open, in its own chunk.
//
// A TILE: what the asset is and does, its exact integrity, and the
// conditions pressing on its layer, each with its REAL WORLD line
// (technique, source, the learn-more card and its links). A condition's
// turns left show with it, as on the chips (v1.3 brief 6.5).
//
// THE BANNER: only what the TONIGHT card already shows, from briefCopy,
// which is its own copy. Without the intel brief the card says the moves
// are unnamed and nothing more: not the posture lines (they name live
// conditions), not the chain line, and not a quiet turn's "no activity",
// which would itself be intel the player has not bought. Under the brief
// it names tonight's candidate moves (QC G-098), and the event the card
// confirms brings its REAL WORLD line.

import type { GameState } from '../../engine/types'
import { briefFree, candidatesTonight } from '../../engine/reducer'
import { FORECAST_DARK, briefCopy, forecastLead } from '../brief'
import { kindLabels } from '../labels'
import RealWorld from '../RealWorld'
import { realWorldFor } from '../realWorldLine'
import { STATE_WORD, callSigns, conditionsOn, spriteState } from './board'
import { assetRole } from './board'
import { shortName, turnsLeft } from './boardModel'

export type IntelSubject = { kind: 'tile'; assetId: string } | { kind: 'banner' }

export interface IntelCardProps {
  subject: IntelSubject
  // The state the board is showing, which during the night is the event's.
  state: GameState
  // The engine's turn, which a condition's age counts from, as the chips
  // on the layer headers do (the state a night shows keeps the turn it
  // started on).
  turn: number
  // A night's view before its close: turns left as the close leaves them
  // (G-103), as on the chips.
  preClose?: boolean
  // Whether tonight's moves are named, as the banner reads it: the brief
  // ordered in the cart, or the record of the night being played back.
  // Without it the card reads the free brief alone.
  briefed?: boolean
  onClose: () => void
}

const HEAD = 'font-display text-[10px] leading-none text-dc-go'
const LABEL = 'mt-3 font-display text-[9px] leading-none text-dc-muted'

function TileIntel({ state, turn, assetId, preClose }: { state: GameState; turn: number; assetId: string; preClose: boolean }) {
  const asset = state.assets.find((a) => a.id === assetId)
  if (!asset) return null
  const conditions = conditionsOn(asset.layer, state.conditions, state.scenario)
  return (
    <>
      <h2 id="intel-title" className={`${HEAD} uppercase`}>
        {callSigns(state).get(asset.id)} · {kindLabels[asset.kind]}
      </h2>
      {/* What it adds and does, while it still flies: a lost asset adds
          no coverage, and its integrity line says it is knocked out. */}
      {asset.integrity > 0 && <p className="mt-2">{assetRole(asset.kind)}.</p>}
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
                  {c.name} T+{turn - c.startedTurn} {turnsLeft(c, preClose)} left
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

function BannerIntel({ state, briefed = briefFree(state) }: { state: GameState; briefed?: boolean }) {
  const copy = briefed ? briefCopy(state, true) : FORECAST_DARK
  const lead = forecastLead(state, briefed)
  const line = lead ? realWorldFor(lead) : null
  return (
    <>
      <h2 id="intel-title" className={HEAD}>
        THREAT INTEL · {briefed ? 'BRIEFED' : 'NO BRIEF'}
      </h2>
      <p className="mt-2 text-phosphor">{copy.headline}</p>
      <p className="mt-1">{copy.vector}</p>
      {briefed && (
        <>
          <p className={LABEL}>CANDIDATE MOVES</p>
          <ul data-intel-candidates className="mt-1">
            {candidatesTonight(state).map((id) => {
              const ev = state.scenario.events.find((e) => e.id === id)
              return ev ? <li key={id}>{shortName(ev)}</li> : null
            })}
          </ul>
        </>
      )}
      {line && <RealWorld line={line} />}
    </>
  )
}

export default function IntelCard({ subject, state, turn, preClose = false, briefed, onClose }: IntelCardProps) {
  return (
    <section aria-labelledby="intel-title" data-intel-card={subject.kind} className="mx-auto max-w-[520px] px-4 py-4 font-mono text-sm text-dc-ink">
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={onClose} className="min-h-11 border-2 border-dc-line bg-dc-panel px-3 font-display text-[10px] text-dc-ink">
          CLOSE
        </button>
      </div>
      <div className="border-2 border-dc-line bg-dc-panel p-3 shadow-hard">
        {subject.kind === 'tile' ? <TileIntel state={state} turn={turn} assetId={subject.assetId} preClose={preClose} /> : <BannerIntel state={state} briefed={briefed} />}
      </div>
    </section>
  )
}
