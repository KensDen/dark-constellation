// The turn's aftermath on the board (v1.2 R1). The playback was the
// report, so this opens on one verdict line with the engine's full ledger
// one tap away (brief v0.5 section 5). R3 replaces it with the event card
// that lands beats on tiles; until then it is the v1.1 aftermath section
// moved onto the board, with the next-turn control in the action bar.

import {
  CHAIN_BONUS,
  MITIGATION_PER_COUNTER,
  SSA_MITIGATION_BONUS,
  TIER_A_FLEET_SHARE,
} from '../../engine/reducer'
import type { CountermeasureId, GameState, ResolvedEvent, Scenario, TurnRecord } from '../../engine/types'
import { layerBadges, vectorIcons } from '../cues/icons'
import { techniqueLabel } from '../labels'
import { verdictFor } from '../verdict'

// Say in plain words why damage landed and what was missing, with each
// counter's real worth. When everything applicable was owned, name the
// gate that made an owned defense inert rather than blaming base
// severity. state.counters after resolution reflects what was active.
export function whatWouldHaveHelped(ev: ResolvedEvent, state: GameState, scenario: Scenario): string {
  const def = scenario.events.find((e) => e.id === ev.eventId)
  if (!def) return ''
  const missing = def.counters.filter((c) => !state.counters.includes(c))
  if (missing.length > 0) {
    const worth = (c: CountermeasureId): string => {
      if (c === 'ssaManeuver' && def.effect.special === 'debrisStrike') {
        return `cuts severity by ${MITIGATION_PER_COUNTER + SSA_MITIGATION_BONUS} when the maneuver budget is funded`
      }
      if (c === 'sensorFusion' && ev.chainBonus > 0) {
        return `cuts severity by ${MITIGATION_PER_COUNTER} and removes the +${CHAIN_BONUS} chain bonus`
      }
      if (c === 'tierAAttestation') {
        return `cuts severity by ${MITIGATION_PER_COUNTER} once at least a third of the sensored fleet flies Tier A`
      }
      return `cuts severity by ${MITIGATION_PER_COUNTER}`
    }
    const names = missing.map((c) => `${scenario.countermeasures.find((x) => x.id === c)?.name ?? c} (${worth(c)})`)
    return `What would have helped: ${names.join('; ')}.`
  }
  const sensored = state.assets.filter((a) => a.integrity > 0 && a.kind !== 'groundStation')
  const tierAShare = sensored.length > 0 ? sensored.filter((a) => a.tier === 'A').length / sensored.length : 0
  if (def.counters.includes('tierAAttestation') && tierAShare < TIER_A_FLEET_SHARE) {
    return 'Firmware attestation was owned but inert: it bites once at least a third of the sensored fleet flies Tier A.'
  }
  if (def.effect.special === 'debrisStrike' && ev.mitigation < MITIGATION_PER_COUNTER + SSA_MITIGATION_BONUS) {
    return 'SSA was owned but the maneuver budget could not cover the avoidance burn.'
  }
  return 'Every applicable defense was active. What landed is what the attack buys through them.'
}

export interface AftermathCardProps {
  record: TurnRecord
  state: GameState
  scenario: Scenario
  reducedMotion: boolean
  // At instant speed there was no playback, so the ledger opens expanded.
  ledgerOpen: boolean
}

export default function AftermathCard({ record, state, scenario, reducedMotion, ledgerOpen }: AftermathCardProps) {
  return (
    <section aria-label={`Aftermath, turn ${record.turn}`} className="border-2 border-dc-line bg-dc-panel p-2 shadow-hard">
      <p className="font-display text-[10px] text-dc-muted">AFTERMATH · TURN {record.turn}</p>
      <p className="mt-1 text-sm text-dc-ink">{verdictFor(record, scenario)}</p>
      {record.commendations.length > 0 && (
        <div className={`mt-2 border border-hero-blue/50 bg-hero-blue/5 p-2 ${reducedMotion ? '' : 'dc-ribbon-in'}`}>
          <p className="text-xs font-bold text-hero-blue uppercase tracking-widest">Commendations</p>
          {record.commendations.map((c, i) => (
            <p key={i} className="text-sm mt-1 text-hero-blue">
              {c}
            </p>
          ))}
        </div>
      )}
      <details className="mt-2 border border-phosphor/20 bg-panel p-2" open={ledgerOpen}>
        <summary className="cursor-pointer font-mono text-xs text-phosphor">
          Details: turn ledger ({record.events.length} event{record.events.length === 1 ? '' : 's'}, {record.notes.length} note
          {record.notes.length === 1 ? '' : 's'})
        </summary>
        {record.notes.map((n, i) => (
          <p key={i} className="mt-1 font-mono text-sm">
            {n}
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
                    {n}
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
                Severity {ev.baseSeverity} base {ev.chainBonus > 0 ? `+ ${ev.chainBonus} chain ` : ''}
                {ev.mitigation > 0 ? `- ${ev.mitigation} mitigated ` : ''}= {ev.effectiveSeverity} effective.
                {ev.repairCost > 0 ? ` Repairs: ${ev.repairCost} credits.` : ''}
              </p>
              {ev.notes.map((n, j) => (
                <p key={j} className="text-sm mt-1">
                  {n}
                </p>
              ))}
              {landed && <p className="text-sm mt-1 font-bold text-alert-amber">{whatWouldHaveHelped(ev, state, scenario)}</p>}
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
              {(def?.learnMoreCards ?? []).map((card, j) => (
                <details key={j} className="mt-2 border border-phosphor/20 bg-panel p-2">
                  <summary className="cursor-pointer text-sm font-mono text-phosphor">Learn more: {card.title}</summary>
                  <p className="text-sm mt-2">{card.body}</p>
                  <ul className="list-disc ml-6 mt-2 text-sm">
                    {card.sources.map((src, k) => (
                      <li key={k}>
                        <a className="underline text-ink" href={src.url} target="_blank" rel="noreferrer">
                          {src.title}
                        </a>{' '}
                        <span className="text-ink-dim font-mono text-xs">
                          [{src.type}] [{src.status}]
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          )
        })}
      </details>
    </section>
  )
}
