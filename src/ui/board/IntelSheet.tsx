// INTEL (brief 4.4): the intel level, one step. The IR retainer was its
// second step until critique row M8 moved it onto HARDEN. The control
// keeps the existing gate; the refusal cue carries a colour channel as
// well as the shake, so it reads under reduced motion.

import type { ReactNode } from 'react'
import type { GameState, Scenario, TurnActions } from '../../engine/types'
import Sheet, { SHEET_PRIMARY } from './Sheet'

export interface IntelSheetProps {
  scenario: Scenario
  state: GameState
  actions: TurnActions
  onIntel: (checked: boolean) => void
  onClose: () => void
  intelClass: string
  spendLine: ReactNode
}

export default function IntelSheet({ scenario, state, actions, onIntel, onClose, intelClass, spendLine }: IntelSheetProps) {
  const maxed = state.intelLevel === 3
  return (
    <Sheet id="intel" title="INTEL" onClose={onClose}>
      {spendLine}
      <p className={`mt-2 dc-tile p-1.5 border-2 ${intelClass}`}>
        <label className="flex items-start gap-2 min-h-11 text-sm">
          <input type="checkbox" className="mt-1" checked={actions.buyIntelLevel} disabled={maxed} onChange={(e) => onIntel(e.target.checked)} />
          <span>
            Raise intel to level {Math.min(3, state.intelLevel + 1)} ({state.intelLevel === 3 ? 'maxed' : scenario.prices.intelLevels[state.intelLevel]}) for a
            sharper forecast of the coming turn
          </span>
        </label>
      </p>
      <button type="button" data-intel-done className={`${SHEET_PRIMARY} mt-3 w-full`} onClick={onClose}>
        DONE
      </button>
    </Sheet>
  )
}
