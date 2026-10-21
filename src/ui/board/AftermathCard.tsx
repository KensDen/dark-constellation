// The turn's aftermath on the board (v1.2 R1). The playback was the
// report, so this opens on one verdict line with the engine's full ledger
// one tap away (brief v0.5 section 5). R3 replaces it with the event card
// that lands beats on tiles; until then it is the v1.1 aftermath section
// moved onto the board, with the next-turn control in the action bar.

import type { GameState, Scenario, TurnRecord } from '../../engine/types'
import { layerBadges, vectorIcons } from '../cues/icons'
import { techniqueLabel } from '../labels'
import RealWorld, { LearnMoreButton } from '../RealWorld'
import { realWorldFor } from '../realWorldLine'
import { verdictFor } from '../verdict'
import * as wouldHaveHelped from '../wouldHaveHelped'
import { callSigns, withCallSigns } from './board'

export interface AftermathCardProps {
  record: TurnRecord
  state: GameState
  scenario: Scenario
  reducedMotion: boolean
  // At instant speed there was no playback, so the ledger opens expanded.
  ledgerOpen: boolean
}

export default function AftermathCard({ record, state, scenario, reducedMotion, ledgerOpen }: AftermathCardProps) {
  const defOf = (id: string) => scenario.events.find((e) => e.id === id)
  const threats = record.events.filter((ev) => (defOf(ev.eventId)?.kind ?? 'threat') === 'threat')
  // On a turn something landed, the verdict's second line names what would
  // have helped against the first threat that did (critique row M3).
  const firstLanded = threats.find((ev) => ev.effectiveSeverity > 0)
  const helped = firstLanded ? wouldHaveHelped.short(firstLanded, state, scenario) : ''
  // Engine notes name assets by id; the player reads the board's call signs.
  const signs = callSigns(state)
  return (
    <section aria-label={`Aftermath, turn ${record.turn}`} className="border-2 border-dc-line bg-dc-panel p-2 shadow-hard">
      <p className="font-display text-[10px] text-dc-muted">END OF TURN {record.turn}</p>
      <p className="mt-1 text-sm text-dc-ink">{verdictFor(record, scenario)}</p>
      {helped && (
        <p data-would-have-helped className="mt-1 text-sm font-bold text-alert-amber">
          {helped}
        </p>
      )}
      {/* The defense streak (v1.3 brief 6.8), where the commendations'
          ribbon was: shown once it reaches two. */}
      {record.streak >= 2 && (
        <div className={`mt-2 border border-hero-blue/50 bg-hero-blue/5 p-2 ${reducedMotion ? '' : 'dc-ribbon-in'}`}>
          <p className="text-xs font-bold text-hero-blue uppercase tracking-widest">Defense streak ×{record.streak}</p>
        </div>
      )}
      {/* The turn's threats, each one tap from its Field Library entries
          (critique row M7), rather than three disclosures deep in the
          ledger. Opportunities have no entries and are not listed. */}
      {threats.length > 0 && (
        <ul data-aftermath-threats className="mt-2 font-mono text-xs">
          {threats.map((ev, i) => {
            const ref = defOf(ev.eventId)?.techniqueRefs[0]
            return (
              <li key={i} className="mt-2">
                <span className={ev.effectiveSeverity > 0 ? 'text-hero-magenta' : 'text-phosphor'}>{ev.name}</span>{' '}
                {ev.effectiveSeverity > 0 ? 'landed' : 'held'}
                {ref && <LearnMoreButton eventId={ev.eventId} technique={techniqueLabel(ref)} />}
              </li>
            )
          })}
        </ul>
      )}
      <details className="mt-2 border border-phosphor/20 bg-panel p-2" open={ledgerOpen}>
        <summary className="cursor-pointer font-mono text-xs text-phosphor">
          Details: turn ledger ({record.events.length} event{record.events.length === 1 ? '' : 's'}, {record.notes.length} note
          {record.notes.length === 1 ? '' : 's'})
        </summary>
        {/* Every line that made the budget (brief 5.5 item 6, rule 5):
            Round 3 gives this its own END OF TURN card. */}
        <p className="mt-1 font-mono text-sm" data-turn-ledger>
          Left after tonight's orders {record.ledger.afterNight}; repairs -{record.ledger.repairs}; keeping{' '}
          {record.ledger.defensesKept} defenses -{record.ledger.upkeep};{' '}
          {record.ledger.insolvent
            ? 'funding frozen'
            : `funding +${record.ledger.funding}; coverage bonus ${record.ledger.coverageBonus ? `+${record.ledger.coverageBonus}` : 'missed'}`}
          ; budget {record.ledger.after}.
        </p>
        {record.notes.map((n, i) => (
          <p key={i} className="mt-1 font-mono text-sm">
            {withCallSigns(n, signs)}
          </p>
        ))}
        {record.events.length === 0 && <p className="mt-2">No adversary activity this turn.</p>}
        {record.events.map((ev, i) => {
          const def = scenario.events.find((e) => e.id === ev.eventId)
          const isOpportunity = (def?.kind ?? 'threat') === 'opportunity'
          const landed = ev.effectiveSeverity > 0
          if (isOpportunity) {
            return (
              <div key={i} className="border p-3 mt-2 border-hero-blue/50 bg-hero-blue/5">
                <h3 className="font-bold font-mono text-hero-blue">Opportunity: {ev.name}</h3>
                {ev.notes.map((n, j) => (
                  <p key={j} className="text-sm mt-1 text-hero-blue">
                    {withCallSigns(n, signs)}
                  </p>
                ))}
                {def && <p className="text-sm mt-1 text-ink-dim">{def.blurb}</p>}
              </div>
            )
          }
          return (
            <div key={i} className={`border p-3 mt-2 ${landed ? 'border-hero-magenta/50 bg-hero-magenta/5' : 'border-phosphor/30 bg-panel'}`}>
              <h3 className="font-bold font-mono flex items-center gap-2">
                {def && <img src={vectorIcons[def.vector]} alt="" aria-hidden="true" className="w-6 h-6" />}
                <span className={landed ? 'text-hero-magenta' : 'text-phosphor'}>{ev.name}</span>
                <span className="ml-auto flex gap-2">
                  {def?.layers.map((layer) => (
                    <span key={layer} className="flex flex-col items-center">
                      <img src={layerBadges[layer]} alt="" className="h-7 w-auto" />
                      <span className="font-mono text-[10px] text-ink-dim leading-none mt-0.5">{layer}</span>
                    </span>
                  ))}
                </span>
              </h3>
              <p className={`text-sm font-mono mt-1 ${landed ? 'text-hero-magenta' : 'text-ink-dim'}`}>
                Strength {ev.baseSeverity}
                {ev.debris && !ev.debris.lost && ev.debris.assetId ? (ev.debris.choice === 'burn' ? ', burned clear' : ', missed') : ''}{' '}
                {ev.chainBonus > 0 ? `+ ${ev.chainBonus} chain ` : ''}
                {ev.mitigation > 0 ? `- ${ev.mitigation} blocked ` : ''}= {ev.effectiveSeverity} landed.
                {ev.repairCost > 0 ? ` Repairs, due at the turn close: ${ev.repairCost} CR.` : ''}
              </p>
              {ev.notes.map((n, j) => (
                <p key={j} className="text-sm mt-1">
                  {withCallSigns(n, signs)}
                </p>
              ))}
              {landed && <p className="text-sm mt-1 font-bold text-alert-amber">{wouldHaveHelped.full(ev, state, scenario)}</p>}
              {ev.firedTechniqueRefs.length > 0 && (
                <p className="text-sm mt-1">
                  Techniques:{' '}
                  {ev.firedTechniqueRefs.map((ref, j) => (
                    <span key={j}>
                      {j > 0 ? '; ' : ''}
                      <a className="underline text-ink" href={ref.url} target="_blank" rel="noreferrer">
                        {techniqueLabel(ref)}, {ref.name}
                      </a>{' '}
                      <span className="text-ink-dim font-mono text-xs">[{ref.status}]</span>
                    </span>
                  ))}
                </p>
              )}
              {/* The REAL WORLD line (v1.2 R3, brief 4.8), the same one the
                  playback card carries: at INSTANT this is the only event
                  card there is. */}
              {realWorldFor(def) && <RealWorld line={realWorldFor(def)!} />}
            </div>
          )
        })}
      </details>
    </section>
  )
}
