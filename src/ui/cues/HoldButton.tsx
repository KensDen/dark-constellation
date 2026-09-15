// EXECUTE TURN's hold-to-confirm control (brief section 4: "EXECUTE TURN
// with hold-to-confirm ring; screen dims into the adversary phase"). The
// turn is the one irreversible action in the game, so committing it asks
// for a deliberate gesture rather than a tap that can land by accident on
// a phone.
//
// The gesture is for pointers, which have a ring to watch. A keyboard
// press and an assistive activation fire at once: holding a key is not the
// same gesture, and there is nothing to read while it happens. Reduced
// motion keeps the hold and drops the ring's animation, because the hold
// is a safety affordance rather than decoration; the label carries the
// state instead.
//
// The decision lives in a pure reducer rather than in the handlers. The
// first version of this control kept a ref saying "a pointer gesture is in
// flight" and cleared it on pointerup, which is dispatched BEFORE the
// click the browser synthesises from the same gesture: every real tap and
// every real mouse click therefore reached the click handler with the flag
// already false and committed the turn at once, so the hold gated nothing
// on any device that emits a click. Dispatched pointer events produce no
// click, which is why driving the page from script did not show it. The
// reducer makes that ordering testable without a DOM.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './motion'

export const HOLD_MS = 600

// A click carries detail 0 only when no pointer produced it: keyboard
// activation, assistive activation, and element.click() from script. A
// mouse click and a touch tap both carry at least 1, and both must hold.
export function isSyntheticActivation(detail: number): boolean {
  return detail === 0
}

export interface HoldState {
  // The pointer that owns the current gesture, so a second finger neither
  // restarts the hold nor cancels it by lifting.
  pointerId: number | null
  holding: boolean
  // One confirm per gesture, whatever order the events arrive in.
  confirmed: boolean
}

export const HOLD_IDLE: HoldState = { pointerId: null, holding: false, confirmed: false }

export type HoldEvent =
  | { type: 'pointerdown'; pointerId: number; primary: boolean }
  | { type: 'pointerup'; pointerId: number }
  | { type: 'pointerlost'; pointerId: number }
  | { type: 'keydown'; key: string; repeat: boolean }
  | { type: 'click'; detail: number }
  | { type: 'elapsed' }

export type HoldEffect = 'none' | 'start' | 'cancel' | 'confirm'

// Pure: what each event does to the gesture, and what the component should
// do about it. Every rule the control exists to enforce is here, so the
// battery can assert the rules rather than the spelling of the handlers.
export function holdReducer(
  state: HoldState,
  event: HoldEvent,
  { disabled = false }: { disabled?: boolean } = {},
): { state: HoldState; effect: HoldEffect } {
  if (disabled) return { state: HOLD_IDLE, effect: state.holding ? 'cancel' : 'none' }
  switch (event.type) {
    case 'pointerdown':
      // Secondary buttons open menus; they do not commit turns. A second
      // pointer while one is already down is ignored outright.
      if (!event.primary || state.pointerId !== null) return { state, effect: 'none' }
      return { state: { pointerId: event.pointerId, holding: true, confirmed: false }, effect: 'start' }
    case 'pointerup':
    case 'pointerlost':
      if (state.pointerId !== event.pointerId) return { state, effect: 'none' }
      // The gesture is over. Whether it confirmed or was released early,
      // the click that follows must not act: confirmed stays true so the
      // trailing click is swallowed, and is reset by the next pointerdown.
      return { state: { ...state, pointerId: null, holding: false }, effect: state.holding ? 'cancel' : 'none' }
    case 'elapsed':
      // No confirmed check here: a confirm clears holding, and only a
      // fresh pointerdown sets it again, so holding and confirmed are
      // never both true. A condition no sequence can reach is not a guard,
      // and a mutation removing it proved it changed nothing.
      if (!state.holding) return { state, effect: 'none' }
      return { state: { ...state, holding: false, confirmed: true }, effect: 'confirm' }
    case 'keydown':
      if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return { state, effect: 'none' }
      return { state: { ...HOLD_IDLE, confirmed: true }, effect: 'confirm' }
    case 'click':
      // A pointer gesture produced this click, or one just ended: either
      // way the hold decides, not the click.
      if (!isSyntheticActivation(event.detail) || state.pointerId !== null || state.confirmed) {
        return { state: HOLD_IDLE, effect: 'none' }
      }
      return { state: { ...HOLD_IDLE, confirmed: true }, effect: 'confirm' }
    default:
      return { state, effect: 'none' }
  }
}

export interface HoldButtonProps {
  label: string
  holdingLabel: string
  onConfirm: () => void
  disabled?: boolean
  className?: string
}

export default function HoldButton({
  label,
  holdingLabel,
  onConfirm,
  disabled,
  className,
}: HoldButtonProps) {
  const reduced = useReducedMotion()
  const timerRef = useRef(0)
  const stateRef = useRef<HoldState>(HOLD_IDLE)
  const confirmRef = useRef(onConfirm)
  confirmRef.current = onConfirm
  // Only the part of the state the button renders needs to be state; the
  // rest lives in a ref so an event never races a render.
  const [holding, setHolding] = useState(false)

  // The reducer stays pure and the effects happen here. They were briefly
  // inside a useReducer reducer, which React is free to double-invoke or
  // discard, and the keyboard path silently stopped committing.
  const sendRef = useRef<(event: HoldEvent) => void>(() => {})
  const send = useCallback(
    (event: HoldEvent) => {
      const { state, effect } = holdReducer(stateRef.current, event, { disabled })
      stateRef.current = state
      setHolding(state.holding)
      if (effect === 'start') {
        window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => sendRef.current({ type: 'elapsed' }), HOLD_MS)
      } else if (effect === 'cancel') {
        window.clearTimeout(timerRef.current)
      } else if (effect === 'confirm') {
        window.clearTimeout(timerRef.current)
        confirmRef.current()
      }
    },
    [disabled],
  )
  sendRef.current = send

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  return (
    <button
      type="button"
      disabled={disabled}
      // The hold is 600ms, which is long enough that iOS would otherwise
      // offer a callout and a selection on the control being held.
      style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}
      className={`dc-hold relative overflow-hidden ${className ?? ''}`}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        // A touch pointer is captured implicitly, which means no leave
        // event fires while the finger is down and a press slid off the
        // control would still commit. Releasing the capture gives touch
        // the same abort a mouse has.
        //
        // The capture belongs to the pointerdown's TARGET and to nothing
        // else, which for most taps is the label span inside the button
        // rather than the button itself: the first version of this
        // released from currentTarget, found no capture there, and did
        // nothing for the majority of real presses. The target covers both
        // cases, since a finger on the padding targets the button; a
        // currentTarget term alongside it was redundant by construction
        // and could never be exercised.
        const el = e.target as Element & {
          hasPointerCapture?: (id: number) => boolean
          releasePointerCapture?: (id: number) => void
        }
        if (typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(e.pointerId)) {
          el.releasePointerCapture?.(e.pointerId)
        }
        send({ type: 'pointerdown', pointerId: e.pointerId, primary: e.button === 0 })
      }}
      onPointerUp={(e) => send({ type: 'pointerup', pointerId: e.pointerId })}
      onPointerLeave={(e) => send({ type: 'pointerlost', pointerId: e.pointerId })}
      onPointerCancel={(e) => send({ type: 'pointerlost', pointerId: e.pointerId })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
        send({ type: 'keydown', key: e.key, repeat: e.repeat })
      }}
      onClick={(e) => send({ type: 'click', detail: e.detail })}
    >
      {/* The ring: a fill that sweeps the control while the press is held.
          Under reduced motion it is not rendered and the label carries the
          state. */}
      {holding && !reduced && (
        <span
          aria-hidden="true"
          className="dc-hold-fill absolute inset-0 bg-phosphor/25"
          style={{ animationDuration: `${HOLD_MS}ms` }}
        />
      )}
      <span className="relative">{holding ? holdingLabel : label}</span>
    </button>
  )
}
