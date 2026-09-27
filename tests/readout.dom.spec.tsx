// @vitest-environment jsdom
//
// The count-up's half of the hidden-page policy, which Round 4c recorded
// as text layer on the grounds that no render could show it. The Round 4c
// pass proved that wrong: a jsdom probe watches the number itself, and the
// difference between easing and snapping is visible in the DOM. The claim
// was the mistake, not the guard, so the guard is behavioural now.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Readout, { COUNT_MS_FOR_TESTS } from '../src/ui/cues/Meter'

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
  vi.unstubAllGlobals()
})

const shown = () => container.querySelector('span.tabular-nums')?.textContent ?? ''

function renderAt(value: number) {
  act(() => {
    root.render(<Readout label="Link" value={value} max={100} />)
  })
}

describe('the count-up under the hidden-page policy', () => {
  it('eases toward a new value while the page is visible', () => {
    renderAt(100)
    expect(shown()).toBe('100')
    renderAt(60)
    // Part way through the count, the number on screen is between the two.
    act(() => vi.advanceTimersByTime(COUNT_MS_FOR_TESTS / 3))
    const midway = Number(shown())
    expect(midway, 'the number jumped instead of counting').toBeLessThan(100)
    expect(midway, 'the number arrived before the count finished').toBeGreaterThan(60)
    act(() => vi.advanceTimersByTime(COUNT_MS_FOR_TESTS))
    expect(shown()).toBe('60')
  })

  it('snaps a count already in flight when the page goes away', () => {
    // The live subscription, not just the state at mount: a count started
    // while visible has to land on the truth when the player locks the
    // phone half way through it.
    renderAt(100)
    renderAt(60)
    act(() => vi.advanceTimersByTime(COUNT_MS_FOR_TESTS / 4))
    expect(Number(shown()), 'the count had not started').toBeLessThan(100)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(shown(), 'a count in flight kept easing behind a hidden page').toBe('60')
  })

  it('shows the number at once under reduced motion, page visible', () => {
    // The half the retired text pin covered: the policy folds the
    // preference and the page state into one decision, and losing either
    // input would leave a reduced-motion player watching numbers count.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }))
    renderAt(100)
    renderAt(60)
    act(() => {})
    expect(shown(), 'reduced motion still animated the number').toBe('60')
  })

  it('shows the number at once while the page is hidden', () => {
    // An animation nobody can see is not an animation, and a hidden page
    // stops delivering frames anyway. The policy says snap; this watches
    // the number to prove it does.
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    renderAt(100)
    renderAt(60)
    act(() => {})
    expect(shown(), 'a hidden page still animated the number').toBe('60')
  })
})
