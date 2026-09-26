// SURGE (brief 4.4): pick an active condition to clear, then spend one
// token on it. The reducer applies the clear before condition pressure,
// so a queued condition never presses again; the choice can be undone
// until the turn resolves.

import type { ActiveCondition, Layer } from '../../engine/types'
import Sheet, { SHEET_BUTTON, SHEET_PRIMARY } from './Sheet'

export const SURGE_STEPS = 2

export interface SurgeOption {
  condition: ActiveCondition
  layers: readonly Layer[]
  elapsed: number
}

export interface SurgeSheetProps {
  options: SurgeOption[]
  tokens: number
  queuedId?: string
  step: number
  pickedId?: string
  onPick: (instanceId: string) => void
  onConfirm: () => void
  onUndo: () => void
  onBack: () => void
  onClose: () => void
}

export default function SurgeSheet({ options, tokens, queuedId, step, pickedId, onPick, onConfirm, onUndo, onBack, onClose }: SurgeSheetProps) {
  const picked = options.find((o) => o.condition.instanceId === pickedId)
  const queued = options.find((o) => o.condition.instanceId === queuedId)
  return (
    <Sheet id="surge" title="SURGE" step={step} steps={SURGE_STEPS} onClose={onClose} onBack={step > 1 ? onBack : undefined}>
      <p className="font-mono text-xs text-dc-warn">
        {tokens} surge token{tokens === 1 ? '' : 's'} in hand.
      </p>
      {step === 1 && (
        <>
          {queued && (
            <div className="mt-2 border-2 border-dc-go/60 bg-dc-go/10 p-2">
              <p className="font-mono text-xs text-dc-go">Queued to clear: {queued.condition.name}</p>
              <button type="button" data-surge-undo className={`${SHEET_BUTTON} mt-2`} onClick={onUndo}>
                UNDO
              </button>
            </div>
          )}
          {options.length === 0 ? (
            <p className="mt-2 text-xs text-dc-muted">No active conditions to clear.</p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {options.map((o) => (
                <li key={o.condition.instanceId}>
                  <button
                    type="button"
                    data-surge-condition={o.condition.instanceId}
                    disabled={tokens === 0 && o.condition.instanceId !== queuedId}
                    className={`${SHEET_BUTTON} w-full flex items-center justify-between gap-2 py-2 border-dc-hostile/60`}
                    onClick={() => onPick(o.condition.instanceId)}
                  >
                    <span className="font-mono text-xs normal-case text-dc-hostile">{o.condition.name}</span>
                    <span className="font-mono text-[10px] text-dc-muted">
                      {o.layers.join(', ')} · T+{o.elapsed}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {step === 2 && picked && (
        <div className="mt-2">
          <div className="border-2 border-dc-hostile/60 bg-dc-ground p-2">
            <p className="font-mono text-sm text-dc-hostile">{picked.condition.name}</p>
            <p className="mt-1 font-mono text-[10px] text-dc-muted">
              {picked.layers.join(', ')} · pressing for {picked.elapsed} turn{picked.elapsed === 1 ? '' : 's'}
            </p>
          </div>
          <p className="mt-2 text-xs text-dc-muted">Cleared before this turn's pressure applies. One token.</p>
          <button type="button" data-surge-confirm className={`${SHEET_PRIMARY} mt-3 w-full min-h-12`} onClick={onConfirm}>
            CLEAR · 1 TOKEN
          </button>
        </div>
      )}
    </Sheet>
  )
}
