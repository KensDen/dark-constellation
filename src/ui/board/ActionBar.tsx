// The action bar (v1.2 R1b, brief 4.1): five buttons that read as steps.
// Each carries its number from the one action array in the top-left
// corner, a thin rail runs across the top, and a step whose sheet was
// opened this turn shows a check in place of its number. Skipped steps
// stay numbered, because every step is optional and RESOLVE is always
// there. In the aftermath the rail says the turn resolved and the four
// step buttons keep their check or number as the turn's record, until
// the next turn begins.
//
// The fifth slot is handed in by Game as a node while the turn is being
// decided, because it is the HoldButton Game wires to resolve() and the
// source pin on that wiring reads Game.tsx.

import type { ReactNode } from 'react'
import type { BoardAction, StepSheet } from './actions'

export type BarPhase = 'deciding' | 'playback' | 'aftermath'

export interface ActionBarProps {
  actions: readonly BoardAction[]
  phase: BarPhase
  openSheet: StepSheet | null
  // Actions whose sheet was opened this turn.
  done: ReadonlySet<string>
  // The turn the aftermath is reporting on.
  resolvedTurn?: number
  onToggle: (sheet: StepSheet) => void
  // A step's disabled state and the caption under its label.
  disabledFor: (action: BoardAction) => boolean
  captionFor: (action: BoardAction) => string
  resolve: ReactNode
  nextLabel: string
  onNext: () => void
  pulseNext: boolean
  // A line under the buttons, such as the cart warning.
  note?: ReactNode
}

export const BAR_BUTTON =
  'dc-tile relative flex flex-col items-center justify-center gap-0.5 min-h-16 pt-3 font-display text-[9px] border-2 border-dc-line bg-dc-panel text-dc-ink shadow-press active:shadow-none disabled:opacity-40 disabled:cursor-not-allowed'
export const BAR_BUTTON_OPEN = `${BAR_BUTTON} border-dc-friendly text-dc-friendly bg-dc-friendly/10`
export const BAR_PRIMARY = `${BAR_BUTTON} border-dc-go bg-dc-go/10 text-dc-go`

// The corner mark: the step's number, or a check once its sheet has been
// opened this turn. Decoration for sighted players; the button's name is
// its label, and the check is announced through the caption.
export function StepMark({ number, done }: { number: number; done: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-step={number}
      data-step-done={done ? 'true' : undefined}
      className={`absolute top-1 left-1.5 leading-none ${done ? 'font-mono text-xs text-dc-go' : 'font-display text-[10px] text-dc-muted'}`}
    >
      {done ? '✓' : number}
    </span>
  )
}

export default function ActionBar({
  actions,
  phase,
  openSheet,
  done,
  resolvedTurn,
  onToggle,
  disabledFor,
  captionFor,
  resolve,
  nextLabel,
  onNext,
  pulseNext,
  note,
}: ActionBarProps) {
  // The slot for the action that opens no sheet: the hold control Game
  // hands in while the turn is being decided, the way on afterwards.
  const commitSlot = (action: BoardAction) =>
    phase === 'deciding' ? (
      <div key={action.id} className="relative" data-action={action.id} data-hotkey={action.hotkey}>
        {resolve}
        <StepMark number={action.number} done={false} />
      </div>
    ) : (
      <button
        key={action.id}
        type="button"
        data-action={action.id}
        data-hotkey={action.hotkey}
        className={`${BAR_PRIMARY} ${pulseNext ? 'dc-next-pulse' : ''}`}
        disabled={phase === 'playback'}
        onClick={onNext}
      >
        <span data-label>{nextLabel}</span>
        <StepMark number={action.number} done={phase === 'aftermath'} />
      </button>
    )
  return (
    <nav aria-label="Actions" className="flex-none border-t-2 border-dc-line bg-dc-chrome px-safe pb-safe">
      {/* The rail: a line in the decision phase, the turn's verdict line in
          the aftermath. */}
      <div data-rail className="mx-1 mt-1 border-t-2 border-dc-line text-center">
        {phase === 'aftermath' && resolvedTurn !== undefined && (
          <p className="font-display text-[10px] text-dc-muted leading-none pt-1">TURN {resolvedTurn} RESOLVED</p>
        )}
      </div>
      {/* In the array's order, whatever it is: the bar has no order of
          its own (principle 17, and the guard that rotates the array). */}
      <div className="grid grid-cols-5 gap-1 p-1">
        {actions.map((action) => {
          const sheet = action.sheet
          return sheet === null ? (
            commitSlot(action)
          ) : (
            <button
              key={action.id}
              type="button"
              data-action={action.id}
              data-hotkey={action.hotkey}
              className={openSheet === sheet ? BAR_BUTTON_OPEN : BAR_BUTTON}
              aria-expanded={openSheet === sheet}
              disabled={disabledFor(action)}
              onClick={() => onToggle(sheet)}
            >
              <span data-label>{action.label}</span>
              <span className="font-mono text-[10px] text-dc-muted">{captionFor(action) || (done.has(action.id) ? 'done' : '')}</span>
              <StepMark number={action.number} done={done.has(action.id)} />
            </button>
          )
        })}
      </div>
      {note}
    </nav>
  )
}
