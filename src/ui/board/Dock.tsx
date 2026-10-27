// THE DOCK (v1.3 brief 5.3 item 5), pinned at the bottom, replacing the
// v1.2 action bar. A line with REMAINING and WORST CASE: WORST CASE is a
// button that shows its sum ("n remaining - n repairs if hit - n defense
// upkeep"), and the sum shows by itself below zero with "Below zero ends
// the operation." Then PROCURE and EXECUTE at equal width; EXECUTE takes
// the emphasis once an order is queued, and PROCURE carries the count of
// queued orders (QC G-025: nothing ticks until an order is queued).
// EXECUTE is off while REMAINING is below zero, with "Over budget. Cancel
// an order in PROCURE."
//
// The dock is the deciding board's. Since v1.3 Round 3 the night's cards
// carry their own way on, under the thumb, and END OF TURN its BEGIN
// TURN n+1 or DEBRIEF (brief 5.5), so the dock leaves while they play.

import type { RefObject } from 'react'
import { useCueClass, useReducedMotion } from '../cues/motion'
import { ACTIONS } from './actions'
import { BELOW_ZERO, OVER_BUDGET, REMAINING, WORST_CASE, worstSum, type WorstCase } from './boardModel'

const BIG = 'dc-tile relative flex min-h-12 flex-1 items-center justify-center gap-2 border-2 font-display text-xs disabled:cursor-not-allowed disabled:opacity-40'
const SOLID = `${BIG} border-dc-go bg-dc-go text-dc-ground shadow-hard`
const OUTLINE = `${BIG} border-dc-line bg-dc-panel text-dc-ink shadow-press`

export interface DockProps {
  worst: WorstCase
  orders: number
  procureOpen: boolean
  onProcure: () => void
  // EXECUTE's accessible name, "Execute turn n".
  executeName: string
  executeRef: RefObject<HTMLButtonElement | null>
  onExecute: () => void
  showWorst: boolean
  onWorst: () => void
  // A nonce: the FIRST ORDERS line pulses the WORST CASE line.
  pulseWorst: number
  // PROCURE is open over the board on a phone, with CONFIRM N ORDERS its
  // green primary: EXECUTE and PROCURE step back to their outline until
  // the sheet closes, so at most one green primary shows (v1.6 R1; with
  // nothing queued, none: the dock's PROCURE would open what is open).
  // Both still act, and the money line stays, so WORST CASE reads while
  // ordering.
  quiet?: boolean
}

export default function Dock(p: DockProps) {
  const reduced = useReducedMotion()
  const pulse = useCueClass(p.pulseWorst || null, 'dc-pulse-friendly', reduced)
  const { worst } = p
  const over = worst.remaining < 0
  const below = worst.value < 0
  return (
    <nav aria-label="Actions" data-dock className="flex-none border-t-2 border-dc-line bg-dc-chrome px-safe pb-safe">
      <div className="px-3 pt-0.5 pb-1.5">
        <div data-dockline className={`flex items-center justify-between font-mono text-[11px] tracking-wider text-dc-muted ${pulse}`}>
          <span data-remaining>
            {REMAINING} <b className={over ? 'text-dc-hostile' : 'text-dc-ink'}>{worst.remaining}</b> CR
          </span>
          <button type="button" data-worst aria-expanded={p.showWorst || below} onClick={p.onWorst} className="-my-2 min-h-11 tracking-wider">
            {WORST_CASE} <b className={below ? 'text-dc-hostile' : 'text-dc-ink'}>{worst.value}</b> CR
          </button>
        </div>
        {(p.showWorst || below) && (
          <p data-worst-sum className={`font-mono text-[10px] ${below ? 'text-dc-hostile' : 'text-dc-muted'}`}>
            {worstSum(worst)}
            {below ? `. ${BELOW_ZERO}` : ''}
          </p>
        )}
        {/* PROCURE and EXECUTE, in the order and with the labels the one
            actions array gives them (principle 17). */}
        <div className="mt-1.5 flex gap-2">
          {ACTIONS.map((a) =>
            a.sheet ? (
              <button key={a.id} type="button" data-action={a.id} aria-expanded={p.procureOpen} onClick={p.onProcure} className={p.orders > 0 || p.quiet ? OUTLINE : SOLID}>
                {a.label}
                {p.orders > 0 && (
                  <span
                    data-order-badge
                    aria-label={`${p.orders} ${p.orders === 1 ? 'order' : 'orders'} queued`}
                    className="flex h-5 min-w-5 items-center justify-center bg-dc-friendly px-1 font-mono text-[11px] text-dc-ground"
                  >
                    {p.orders}
                  </span>
                )}
              </button>
            ) : (
              <button
                key={a.id}
                ref={p.executeRef}
                type="button"
                data-execute
                data-action={a.id}
                aria-label={p.executeName}
                disabled={over}
                onClick={p.onExecute}
                className={p.orders > 0 && !p.quiet ? SOLID : OUTLINE}
              >
                {a.label}
              </button>
            ),
          )}
        </div>
        {over && (
          <p data-over-budget role="status" className="mt-1 font-mono text-[10px] text-dc-hostile">
            {OVER_BUDGET}
          </p>
        )}
      </div>
    </nav>
  )
}
