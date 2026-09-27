// The action bar as a turn stepper (v1.2 R2b, brief 4.1; the design Ken
// approved on the v1.2 canvas, screen 9). Top to bottom:
//
//   - THE OBJECTIVE LINE: a small tag and one plain sentence that always
//     say what to do next. It is a polite live region, plain text, and
//     it never blocks input.
//   - THE STEPS: every action with a sheet, in one row in the array's
//     order, a chevron between each. A step's number badge turns into a
//     filled green check once its sheet has been opened this turn; a step
//     that cannot be used is dashed and dimmed.
//   - RESOLVE, full width under the row, its label the instruction and
//     its number badge on the left. Outlined until the player has done
//     anything this turn, solid go with the hard shadow after. In the
//     aftermath the same slot is NEXT TURN or FINAL REPORT.
//
// THE GLOW. One step glows: the one the objective names. Both come from
// the single `objective` value Game builds with one call (suggestNextStep,
// or the walkthrough on a device's first turn), so the light and the
// sentence cannot point at different steps. RESOLVE's glow is its solid
// fill.
//
// The RESOLVE slot is handed in by Game as a render function, because it
// is the HoldButton Game wires to resolve() and the source pin on that
// wiring reads Game.tsx; the bar decides only how it looks.

import { Fragment, type ReactNode } from 'react'
import PixelSprite from '../sprites/PixelSprite'
import { BOLT, EYE } from '../sprites/icons'
import { sprite } from '../sprites/sprite'
import { SKIP_TIPS, type BoardAction, type Objective, type StepSheet } from './actions'

export type BarPhase = 'deciding' | 'playback' | 'aftermath'

export interface ResolveLook {
  className: string
  fillClassName: string
}

export interface ActionBarProps {
  actions: readonly BoardAction[]
  phase: BarPhase
  openSheet: StepSheet | null
  // Actions whose sheet was opened this turn.
  done: ReadonlySet<string>
  // What to do next, and the step that glows, as one value.
  objective: Objective
  // The short-tap hint, which takes the sentence's place for a moment.
  hint?: string
  // The walkthrough's way out, while it shows.
  onSkipTips?: () => void
  onToggle: (sheet: StepSheet) => void
  // A step's disabled state and the caption under its label.
  disabledFor: (action: BoardAction) => boolean
  captionFor: (action: BoardAction) => string
  resolve: (look: ResolveLook) => ReactNode
  nextLabel: string
  onNext: () => void
  pulseNext: boolean
  // A line under the buttons, such as the cart warning.
  note?: ReactNode
}

const ICONS = { eye: EYE, bolt: BOLT }
const CHEVRON = sprite({ c: { token: 'muted' } }, 'c.. .c. ..c .c. c..')

const STEP =
  'dc-tile relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 min-h-14 pt-3 font-display text-[9px] border-2 shadow-press active:shadow-none disabled:cursor-not-allowed'
const WIDE = 'dc-tile relative flex w-full items-center justify-center min-h-12 px-8 font-display text-[10px] border-2'
// RESOLVE and the way on, outlined and solid, and the fill that sweeps
// each while the hold runs.
export const RESOLVE_OUTLINE = `${WIDE} border-dc-go bg-dc-go/5 text-dc-go shadow-press disabled:opacity-40`
export const RESOLVE_SOLID = `${WIDE} border-dc-go bg-dc-go text-dc-ground shadow-hard disabled:opacity-40`
const FILL_OUTLINE = 'inset-0 bg-dc-go/35'
const FILL_SOLID = 'inset-0 bg-dc-ink/35'

// The number badge: the step's number, or a filled green check once its
// sheet has been opened this turn. Decoration for sighted players; the
// button's name is its label, and the check is announced through the
// caption.
export function StepMark({ number, done, className = 'absolute top-1 left-1' }: { number: number; done: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-step={number}
      data-step-done={done ? 'true' : undefined}
      className={`${className} pointer-events-none flex h-4 min-w-4 items-center justify-center border px-0.5 leading-none ${
        done ? 'border-dc-go bg-dc-go font-mono text-[10px] text-dc-ground' : 'border-dc-line bg-dc-chrome font-display text-[8px] text-dc-muted'
      }`}
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
  objective,
  hint,
  onSkipTips,
  onToggle,
  disabledFor,
  captionFor,
  resolve,
  nextLabel,
  onNext,
  pulseNext,
  note,
}: ActionBarProps) {
  // In the array's order, whatever it is: the bar has no order of its own
  // (principle 17, and the guard that rotates the array).
  const steps = actions.filter((a) => a.sheet !== null)
  const commit = actions.find((a) => a.sheet === null)
  const deciding = phase === 'deciding'
  const solid = done.size > 0 || objective.step === commit?.id
  const glows = (action: BoardAction, disabled: boolean) => deciding && objective.step === action.id && !disabled
  const stepClass = (action: BoardAction, sheet: StepSheet, disabled: boolean) => {
    const border = openSheet === sheet ? 'border-dc-friendly' : done.has(action.id) ? 'border-dc-go' : 'border-dc-line'
    const face = openSheet === sheet ? 'bg-dc-friendly/10 text-dc-friendly' : 'bg-dc-panel text-dc-ink'
    const off = disabled ? (deciding ? 'border-dashed opacity-40' : 'opacity-40') : ''
    return `${STEP} ${border} ${face} ${off} ${glows(action, disabled) ? 'dc-glow' : ''}`
  }
  return (
    <nav aria-label="Actions" className="flex-none border-t-2 border-dc-line bg-dc-chrome px-safe pb-safe">
      {/* The objective line. The live region holds the tag and the
          sentence; the skip button sits outside it. */}
      <div data-objective className="flex items-center gap-2 px-2 pt-1.5">
        {/* Not live during playback: the line carries the beat's title
            then, which the event card's own live region announces. */}
        <p role="status" aria-live={phase === 'playback' ? 'off' : 'polite'} className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap">
          <span data-objective-tag className="flex-none border border-dc-go px-1 py-0.5 font-display text-[8px] leading-none text-dc-go">
            {objective.tag}
          </span>
          {hint ? (
            <span data-hold-hint className="min-w-0 truncate font-mono text-[10px] text-dc-warn">
              {hint}
            </span>
          ) : (
            <span data-objective-sentence className="min-w-0 truncate font-mono text-[10px] text-dc-ink">
              {objective.sentence}
            </span>
          )}
        </p>
        {onSkipTips && (
          // A 44px target pulled into a line half that height, so the bar
          // does not grow while the walkthrough shows.
          <button type="button" data-skip-tips onClick={onSkipTips} className="-my-4 flex-none min-h-11 px-1 font-mono text-[10px] text-dc-muted underline">
            {SKIP_TIPS}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 px-1 pt-1.5">
        {steps.map((action, i) => {
          const sheet = action.sheet!
          const disabled = disabledFor(action)
          return (
            <Fragment key={action.id}>
              {i > 0 && <PixelSprite sprite={CHEVRON} className="flex-none" />}
              <button
                type="button"
                data-action={action.id}
                data-hotkey={action.hotkey}
                data-glow={glows(action, disabled) ? 'true' : undefined}
                className={stepClass(action, sheet, disabled)}
                aria-expanded={openSheet === sheet}
                disabled={disabled}
                onClick={() => onToggle(sheet)}
              >
                <span className="flex items-center gap-1">
                  {action.icon && <PixelSprite sprite={ICONS[action.icon]} scale={1} name={action.icon} />}
                  <span data-label>{action.label}</span>
                </span>
                <span className="font-mono text-[9px] text-dc-muted">{captionFor(action) || (done.has(action.id) ? 'done' : '')}</span>
                <StepMark number={action.number} done={done.has(action.id)} />
              </button>
            </Fragment>
          )
        })}
      </div>
      {commit && (
        <div
          className="relative px-1 pt-1.5 pb-1"
          data-action={commit.id}
          data-hotkey={commit.hotkey}
          data-glow={deciding && objective.step === commit.id ? 'true' : undefined}
        >
          {deciding ? (
            resolve({ className: solid ? RESOLVE_SOLID : RESOLVE_OUTLINE, fillClassName: solid ? FILL_SOLID : FILL_OUTLINE })
          ) : (
            <button type="button" className={`${RESOLVE_SOLID} ${pulseNext ? 'dc-next-pulse' : ''}`} disabled={phase === 'playback'} onClick={onNext}>
              <span data-label>{nextLabel}</span>
            </button>
          )}
          <StepMark number={commit.number} done={phase === 'aftermath'} className="absolute left-3.5 top-1/2 mt-0.5 -translate-y-1/2" />
        </div>
      )}
      {note}
    </nav>
  )
}
