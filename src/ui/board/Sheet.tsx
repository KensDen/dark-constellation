// The bottom sheet frame (v1.2 R1, brief 4.4): a panel that rises over
// the dimmed board with a STEP n OF m header, the way the reference
// game's purchases are short step-by-step pop-ups. The action bar stays
// live beneath it, so PROCURE, HARDEN and RESOLVE are one tap away from
// inside any sheet. A sheet with no steps (SYSTEM, R1b) shows its title
// alone.
//
// Rendered inside the play screen's <main>, not portalled, so the
// glossary's inert covers it and the suite's container queries see it.

import type { ReactNode } from 'react'
import type { SheetId } from './actions'

export type { SheetId }

export interface SheetProps {
  id: SheetId
  title: string
  step?: number
  steps?: number
  onClose: () => void
  onBack?: () => void
  children: ReactNode
}

export const SHEET_BUTTON =
  'dc-tile font-display uppercase text-[10px] border-2 border-dc-line bg-dc-panel text-dc-ink px-3 min-h-11 shadow-press active:shadow-none disabled:opacity-40 disabled:cursor-not-allowed'
export const SHEET_PRIMARY = `${SHEET_BUTTON} border-dc-go text-dc-go`

export default function Sheet({ id, title, step, steps, onClose, onBack, children }: SheetProps) {
  const stepped = step !== undefined && steps !== undefined
  return (
    <section
      aria-label={stepped ? `${title}, step ${step} of ${steps}` : title}
      data-sheet={id}
      className="dc-sheet-in absolute inset-x-0 bottom-0 z-30 max-h-4/5 overflow-y-auto border-t-2 border-dc-line bg-dc-panel text-dc-ink px-safe"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-dc-line bg-dc-panel px-3 py-2">
        {onBack && (
          <button type="button" className={`${SHEET_BUTTON} px-2`} onClick={onBack} aria-label="Back a step">
            &lt;
          </button>
        )}
        <div className="min-w-0 flex-1">
          {stepped && (
            <p className="font-mono text-[10px] tracking-widest text-dc-muted">
              STEP {step} OF {steps}
            </p>
          )}
          <h2 className="font-display text-[10px] text-dc-ink leading-tight">{title}</h2>
        </div>
        <button type="button" className={`${SHEET_BUTTON} px-2`} onClick={onClose} aria-label={`Close ${title}`}>
          X
        </button>
      </div>
      <div className="px-3 py-3">{children}</div>
    </section>
  )
}
