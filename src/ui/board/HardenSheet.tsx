// HARDEN (brief 4.4): the countermeasures with their cost, each shown by
// its vector icons and its blurb and NOT by the threats it answers. That
// mapping is the answer key, and it stays in the Glossary and in the
// ledger after a turn, where a defense that held says what it stopped.
// The board suite renders this sheet and checks no countered event's name
// appears in it; the vectors come from board.ts's vectorsOf, which reads
// nothing but the vector values.

import type { ReactNode } from 'react'
import type { CountermeasureId, GameState, Scenario } from '../../engine/types'
import { vectorIcons } from '../cues/icons'
import { vectorLabels } from '../labels'
import { vectorsOf } from './board'
import Sheet, { SHEET_PRIMARY } from './Sheet'

export const HARDEN_STEPS = 2

export interface HardenSheetProps {
  scenario: Scenario
  state: GameState
  queued: CountermeasureId[]
  step: number
  onToggle: (id: CountermeasureId) => void
  onNext: () => void
  onBack: () => void
  onClose: () => void
  // Class for a refused tile, keyed by countermeasure id.
  deniedClassFor: (id: CountermeasureId) => string
  spendLine: ReactNode
}

export default function HardenSheet({ scenario, state, queued, step, onToggle, onNext, onBack, onClose, deniedClassFor, spendLine }: HardenSheetProps) {
  const offered = scenario.countermeasures.filter((cm) => cm.id !== 'intelInvestment' && cm.id !== 'irRetainer')
  const chosen = offered.filter((cm) => queued.includes(cm.id))
  return (
    <Sheet id="harden" title="HARDEN" step={step} steps={HARDEN_STEPS} onClose={onClose} onBack={step > 1 ? onBack : undefined}>
      {spendLine}
      {step === 1 && (
        <>
          <ul className="mt-1">
            {offered.map((cm) => {
              const active = state.counters.includes(cm.id)
              return (
                <li
                  key={cm.id}
                  className={`dc-tile mt-2 border-2 border-transparent p-1.5 ${deniedClassFor(cm.id)} ${
                    queued.includes(cm.id) ? 'border-dc-friendly/60 bg-dc-friendly/10' : ''
                  }`}
                >
                  <label className="flex items-start gap-2 min-h-11">
                    <input type="checkbox" className="mt-1" checked={active || queued.includes(cm.id)} disabled={active} onChange={() => onToggle(cm.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm">
                        {cm.name} <span className="font-mono text-dc-warn">({cm.cost})</span>
                        {active && <span className="ml-1 font-mono text-[10px] text-dc-friendly">[ACTIVE]</span>}
                      </span>
                      <span className="mt-1 flex items-center gap-1">
                        {vectorsOf(cm, scenario).map((v) => (
                          <img key={v} src={vectorIcons[v]} alt={vectorLabels[v]} className="h-4 w-4" />
                        ))}
                      </span>
                      <span className="mt-1 block text-xs text-dc-muted">{cm.blurb}</span>
                      {cm.spartaCms.length > 0 && (
                        <span className="mt-1 block font-mono text-[10px] text-dc-muted">
                          SPARTA:{' '}
                          {cm.spartaCms.map((ref, j) => (
                            <span key={ref.id}>
                              {j > 0 ? '; ' : ''}
                              <a className="underline" href={ref.url} target="_blank" rel="noreferrer">
                                {ref.id} {ref.name}
                              </a>{' '}
                              ({ref.tier})
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <button type="button" data-harden-next className={`${SHEET_PRIMARY} mt-3 w-full`} onClick={onNext}>
            NEXT
          </button>
        </>
      )}
      {step === 2 && (
        <div className="mt-2">
          <p className="font-mono text-xs text-dc-ink">
            {chosen.length === 0 ? 'No new defenses queued.' : `${chosen.length} defense${chosen.length === 1 ? '' : 's'} queued for this turn:`}
          </p>
          {chosen.length > 0 && (
            <ul className="mt-1 list-disc ml-5 text-xs text-dc-friendly">
              {chosen.map((cm) => (
                <li key={cm.id}>
                  {cm.name} ({cm.cost})
                </li>
              ))}
            </ul>
          )}
          <button type="button" data-harden-done className={`${SHEET_PRIMARY} mt-3 w-full`} onClick={onClose}>
            DONE
          </button>
        </div>
      )}
    </Sheet>
  )
}
