// INTEL (brief 4.4): the intel level step, then the IR retainer. Both are
// the existing controls with the existing gate; the refusal cue carries a
// colour channel as well as the shake, so it reads under reduced motion.

import type { ReactNode } from 'react'
import type { GameState, Scenario, TurnActions } from '../../engine/types'
import Sheet, { SHEET_PRIMARY } from './Sheet'

export const INTEL_STEPS = 2

export interface IntelSheetProps {
  scenario: Scenario
  state: GameState
  actions: TurnActions
  step: number
  onIntel: (checked: boolean) => void
  onRetainer: (checked: boolean) => void
  onNext: () => void
  onBack: () => void
  onClose: () => void
  intelClass: string
  retainerClass: string
  spendLine: ReactNode
}

export default function IntelSheet({ scenario, state, actions, step, onIntel, onRetainer, onNext, onBack, onClose, intelClass, retainerClass, spendLine }: IntelSheetProps) {
  const retainer = scenario.countermeasures.find((c) => c.id === 'irRetainer')
  const maxed = state.intelLevel === 3
  return (
    <Sheet id="intel" title="INTEL" step={step} steps={INTEL_STEPS} onClose={onClose} onBack={step > 1 ? onBack : undefined}>
      {spendLine}
      {step === 1 && (
        <>
          <p className={`mt-2 dc-tile p-1.5 border-2 ${intelClass}`}>
            <label className="flex items-start gap-2 min-h-11 text-sm">
              <input type="checkbox" className="mt-1" checked={actions.buyIntelLevel} disabled={maxed} onChange={(e) => onIntel(e.target.checked)} />
              <span>
                Raise intel to level {Math.min(3, state.intelLevel + 1)} ({state.intelLevel === 3 ? 'maxed' : scenario.prices.intelLevels[state.intelLevel]}) for a
                sharper forecast of the coming turn
              </span>
            </label>
          </p>
          <button type="button" data-intel-next className={`${SHEET_PRIMARY} mt-3 w-full`} onClick={onNext}>
            NEXT
          </button>
        </>
      )}
      {step === 2 && retainer && (
        <>
          <p className={`mt-2 dc-tile p-1.5 border-2 ${retainerClass}`}>
            <label className="flex items-start gap-2 min-h-11 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={state.irRetainer || actions.buyIrRetainer}
                disabled={state.irRetainer}
                onChange={(e) => onRetainer(e.target.checked)}
              />
              <span>
                Incident response retainer ({retainer.cost})
                {state.irRetainer && <span className="ml-1 font-mono text-[10px] text-dc-friendly">[ACTIVE]</span>}
              </span>
            </label>
          </p>
          <p className="mt-2 text-xs text-dc-muted">{retainer.blurb}</p>
          <p className="mt-1 text-xs text-dc-friendly">
            Every damaged meter recovers +{scenario.recovery.withIrRetainer} a turn instead of +{scenario.recovery.base}, and it grants one surge
            authority token on purchase.
          </p>
          <button type="button" data-intel-done className={`${SHEET_PRIMARY} mt-3 w-full`} onClick={onClose}>
            DONE
          </button>
        </>
      )}
    </Sheet>
  )
}
