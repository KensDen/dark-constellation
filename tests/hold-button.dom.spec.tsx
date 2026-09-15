// @vitest-environment jsdom
//
// The press-and-hold test the Round 4b defect earned (brief v1.0 row 4c).
//
// EXECUTE TURN's guarantee is an ordering guarantee: a browser dispatches
// pointerdown, then pointerup, then the click it synthesises from the same
// gesture. The control committed the turn on that trailing click for every
// real tap, and nothing in a node suite could see it: a source pin asserts
// that text exists, and script-dispatched pointer events produce no click
// at all, so the browser check that had been trusted for three rounds was
// structurally blind to it (principle 13).
//
// These tests render the real control and deliver the real sequences. They
// cannot be satisfied by writing the code differently, which is what the
// six spelling-pinned guards they replace could not promise.
//
// Honest about the instrument: jsdom events carry isTrusted false, because
// only a browser can mint a trusted event. What matters here is the ORDER
// and the shape of the sequence, including the click's detail, which is
// what distinguishes a pointer gesture from a keyboard or assistive
// activation. The trusted-input checks stay a manual step on the dev
// server, and this suite is what makes them a confirmation rather than the
// only line of defence.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HoldButton, { HOLD_MS } from '../src/ui/cues/HoldButton'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
  // stubGlobal is not undone by restoreAllMocks, so the reduced-motion
  // matchMedia stub would otherwise apply to every test declared after it.
  vi.unstubAllGlobals()
})

interface Rendered {
  button: HTMLButtonElement
  confirms: () => number
}

function render(props: Partial<Parameters<typeof HoldButton>[0]> = {}): Rendered {
  const onConfirm = vi.fn()
  act(() => {
    root.render(
      <HoldButton
        label="4. Hold to resolve turn 1"
        holdingLabel="Hold... resolving turn 1"
        onConfirm={onConfirm}
        {...props}
      />,
    )
  })
  const button = container.querySelector('button')
  if (!button) throw new Error('the control did not render')
  return { button, confirms: () => onConfirm.mock.calls.length }
}

// The sequences a browser actually delivers, written out rather than taken
// from a helper library, because the ordering IS the thing under test.
//
// A MouseEvent carrying the fields the control reads stands in for a
// PointerEvent. jsdom 30 does define a PointerEvent constructor, but it
// implements none of the capture API and performs no implicit capture, so
// the stand-in loses nothing the control can observe and keeps the events
// explicit.
function pointerEvent(type: string, init: { pointerId?: number; button?: number } = {}): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: init.button ?? 0 })
  Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 })
  return event
}

function clickEvent(detail: number): Event {
  return new MouseEvent('click', { bubbles: true, cancelable: true, detail })
}

describe('EXECUTE TURN: the ordering a source pin cannot assert', () => {
  it('holds for long enough to be deliberate and not so long as to feel stuck', () => {
    // Every other test here is written in terms of HOLD_MS, so they all
    // pass at any value: shorten it to 40ms and the control becomes the
    // tap it exists to prevent, with the suite green. This bound was
    // asserted by the test retired with firesImmediately in Round 4c and
    // nothing replaced it until the pass caught the gap.
    expect(HOLD_MS).toBeGreaterThanOrEqual(400)
    expect(HOLD_MS).toBeLessThanOrEqual(900)
  })

  it('does not commit the turn on an ordinary tap, however fast the release', () => {
    // The exact sequence a browser sends for one tap or click. The defect
    // this replaces committed the turn on the third event of these three.
    const { button, confirms } = render()
    act(() => {
      button.dispatchEvent(pointerEvent('pointerdown'))
      button.dispatchEvent(pointerEvent('pointerup'))
      button.dispatchEvent(clickEvent(1))
    })
    expect(confirms(), 'a tap committed the turn').toBe(0)
    // And the abandoned hold does not fire later either.
    act(() => vi.advanceTimersByTime(HOLD_MS * 3))
    expect(confirms(), 'the abandoned hold fired after the fact').toBe(0)
  })

  it('commits once when the press is held, and the trailing click adds nothing', () => {
    const { button, confirms } = render()
    act(() => {
      button.dispatchEvent(pointerEvent('pointerdown'))
    })
    act(() => vi.advanceTimersByTime(HOLD_MS - 20))
    expect(confirms(), 'the hold committed before its time').toBe(0)
    act(() => vi.advanceTimersByTime(40))
    expect(confirms(), 'the held press did not commit').toBe(1)
    // The release and the click the browser sends after it must not
    // commit a second time.
    act(() => {
      button.dispatchEvent(pointerEvent('pointerup'))
      button.dispatchEvent(clickEvent(1))
    })
    expect(confirms(), 'the turn committed twice from one gesture').toBe(1)
  })

  it('shows the ring and the holding label only while the press is live', () => {
    const { button } = render()
    expect(button.querySelector('.dc-hold-fill'), 'the ring is showing before any press').toBeNull()
    act(() => {
      button.dispatchEvent(pointerEvent('pointerdown'))
    })
    const ring = button.querySelector('.dc-hold-fill')
    expect(ring, 'the ring did not appear during the press').not.toBeNull()
    // The ring sweeps for exactly as long as the hold, from the same
    // constant the timer uses.
    expect((ring as HTMLElement).style.animationDuration).toBe(`${HOLD_MS}ms`)
    expect(button.textContent).toContain('Hold...')
    act(() => {
      button.dispatchEvent(pointerEvent('pointerup'))
    })
    expect(button.querySelector('.dc-hold-fill'), 'the ring outlived the press').toBeNull()
    expect(button.textContent).toContain('Hold to resolve')
  })

  it('commits at once from the keyboard, and only once', () => {
    // The regression this covers is not the ordering but the fix for it:
    // the effects were briefly run inside a useReducer reducer, which
    // React may double-invoke or discard, and the keyboard path silently
    // stopped committing. Nothing in the node suite noticed.
    const { button, confirms } = render()
    act(() => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    expect(confirms(), 'Enter did not commit the turn').toBe(1)
    // A browser may follow Enter with a click; it must not commit again.
    act(() => {
      button.dispatchEvent(clickEvent(0))
    })
    expect(confirms(), 'Enter committed the turn twice').toBe(1)
  })

  it('commits at once for an assistive activation, which arrives as a click with no pointer', () => {
    const { button, confirms } = render()
    act(() => {
      button.dispatchEvent(clickEvent(0))
    })
    expect(confirms(), 'an assistive activation could not commit the turn').toBe(1)
  })

  it('cancels when the press leaves the control', () => {
    // React synthesises pointerleave from pointerout with a relatedTarget
    // outside the element, which is what a browser sends when the finger
    // or cursor slides off. Dispatching the synthetic name directly would
    // test the test rather than the control.
    const { button, confirms } = render()
    act(() => {
      button.dispatchEvent(pointerEvent('pointerdown'))
      const out = pointerEvent('pointerout')
      Object.defineProperty(out, 'relatedTarget', { value: document.body })
      button.dispatchEvent(out)
    })
    act(() => vi.advanceTimersByTime(HOLD_MS * 2))
    expect(confirms(), 'a press dragged off the control still committed').toBe(0)
    expect(button.querySelector('.dc-hold-fill')).toBeNull()
  })

  it('releases the implicit capture a touch press leaves on whatever it landed on', () => {
    // The round's only runtime change, and the environment brought forward
    // to guard it cannot see it: jsdom implements no pointer capture API
    // and performs no implicit capture, so the fixed and unfixed controls
    // run identical paths here. Deleting the fix left the whole suite,
    // typecheck, lint and battery green.
    //
    // So the capture is modelled rather than assumed. A press captures its
    // target the way a touch pointer does, and the test asserts that the
    // capture is gone afterwards.
    //
    // Honest about which half discriminates: the release assertion is the
    // one that fails when the fix is removed. The abort that follows it
    // would pass either way here, because jsdom has no capture to block
    // the leave in the first place; it is kept as a statement of what the
    // release is FOR, not as the proof. On a real phone the two are the
    // same fact, and that end is checked by hand.
    const { button, confirms } = render()
    const label = button.querySelector('span.relative') as HTMLElement
    expect(label, 'the label span the finger actually lands on is gone').not.toBeNull()

    // Capture belongs to ONE element, so each gets its own set: sharing a
    // set between the button and the label let a release from the button
    // stand in for a release from the label, and the original defect
    // passed this test.
    const capturedBy = new Map<Element, Set<number>>([
      [button, new Set<number>()],
      [label, new Set<number>()],
    ])
    for (const node of [button, label]) {
      Object.assign(node, {
        hasPointerCapture: (id: number) => capturedBy.get(node)!.has(id),
        releasePointerCapture: (id: number) => capturedBy.get(node)!.delete(id),
      })
    }
    // The browser captures the pointerdown's target, which for a finger on
    // the words is the label span rather than the button.
    capturedBy.get(label)!.add(7)
    const down = pointerEvent('pointerdown', { pointerId: 7 })
    Object.defineProperty(down, 'target', { value: label })
    act(() => {
      label.dispatchEvent(down)
    })
    expect(
      capturedBy.get(label)!.has(7),
      'the capture the browser set on the element the finger hit was never released',
    ).toBe(false)

    // With the capture gone the leave arrives, and the press aborts.
    act(() => {
      const out = pointerEvent('pointerout', { pointerId: 7 })
      Object.defineProperty(out, 'relatedTarget', { value: document.body })
      button.dispatchEvent(out)
    })
    act(() => vi.advanceTimersByTime(HOLD_MS * 2))
    expect(confirms(), 'a touch press dragged off the control still committed').toBe(0)
  })

  it('releases the capture of a press that lands on the padding, where the target is the button', () => {
    // The other element a finger can land on. Implicit capture follows the
    // pointerdown target, so on the padding the button itself holds it;
    // this pins that the release follows the target rather than assuming
    // the label.
    const { button, confirms } = render()
    const captured = new Set<number>([9])
    Object.assign(button, {
      hasPointerCapture: (id: number) => captured.has(id),
      releasePointerCapture: (id: number) => captured.delete(id),
    })
    act(() => {
      button.dispatchEvent(pointerEvent('pointerdown', { pointerId: 9 }))
    })
    expect(captured.has(9), 'a press on the padding kept its capture').toBe(false)
    act(() => {
      const out = pointerEvent('pointerout', { pointerId: 9 })
      Object.defineProperty(out, 'relatedTarget', { value: document.body })
      button.dispatchEvent(out)
    })
    act(() => vi.advanceTimersByTime(HOLD_MS * 2))
    expect(confirms(), 'a padding press dragged off still committed').toBe(0)
  })

  it('still commits a captured press that is held rather than dragged off', () => {
    // The other half of the capture branch. A handler that released the
    // capture and then returned, never reaching the rules, would pass the
    // abort test above while killing EXECUTE TURN outright for touch.
    const { button, confirms } = render()
    const label = button.querySelector('span.relative') as HTMLElement
    const capturedBy = new Map<Element, Set<number>>([
      [button, new Set<number>()],
      [label, new Set<number>()],
    ])
    for (const node of [button, label]) {
      Object.assign(node, {
        hasPointerCapture: (id: number) => capturedBy.get(node)!.has(id),
        releasePointerCapture: (id: number) => capturedBy.get(node)!.delete(id),
      })
    }
    capturedBy.get(label)!.add(3)
    const down = pointerEvent('pointerdown', { pointerId: 3 })
    Object.defineProperty(down, 'target', { value: label })
    act(() => {
      label.dispatchEvent(down)
    })
    expect(button.textContent, 'the press never started the hold').toContain('Hold...')
    act(() => vi.advanceTimersByTime(HOLD_MS + 20))
    expect(confirms(), 'a captured press that was held never committed').toBe(1)
  })

  it('ignores a second finger, and keeps holding when it lifts', () => {
    const { button, confirms } = render()
    act(() => {
      button.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1 }))
      button.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2 }))
      button.dispatchEvent(pointerEvent('pointerup', { pointerId: 2 }))
    })
    act(() => vi.advanceTimersByTime(HOLD_MS + 20))
    expect(confirms(), 'the second finger broke the hold').toBe(1)
  })

  it('ignores a secondary button, which opens menus rather than committing turns', () => {
    const { button, confirms } = render()
    act(() => {
      button.dispatchEvent(pointerEvent('pointerdown', { button: 2 }))
    })
    act(() => vi.advanceTimersByTime(HOLD_MS * 2))
    expect(confirms()).toBe(0)
  })

  it('commits nothing at all while disabled', () => {
    const { button, confirms } = render({ disabled: true })
    act(() => {
      button.dispatchEvent(pointerEvent('pointerdown'))
      button.dispatchEvent(clickEvent(0))
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    act(() => vi.advanceTimersByTime(HOLD_MS * 2))
    expect(confirms()).toBe(0)
  })

  it('keeps the hold and drops the ring under reduced motion', () => {
    // Reduced motion removes the animation, not the safety gesture: the
    // label carries the state instead.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }))
    const { button, confirms } = render()
    act(() => {
      button.dispatchEvent(pointerEvent('pointerdown'))
    })
    expect(button.querySelector('.dc-hold-fill'), 'the ring animated under reduced motion').toBeNull()
    expect(button.textContent, 'the label did not carry the state').toContain('Hold...')
    act(() => vi.advanceTimersByTime(HOLD_MS + 20))
    expect(confirms(), 'reduced motion lost the hold as well as the ring').toBe(1)
  })
})
