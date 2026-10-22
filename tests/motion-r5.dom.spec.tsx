// @vitest-environment jsdom
//
// The motion rules for every screen (v1.3 brief 8.3, Round 5): all of it
// off under reduced motion, and paused while the tab is hidden. The board
// has paused itself since v1.2 R2 (tests/sprites.dom.spec.tsx); since R5
// the whole page does, through one class on the root that App sets from
// visibilitychange, which src/index.css turns into a pause for every
// animation on every screen. scripts/phone-layout.mjs reads the reduced
// half in a real browser, on every screen.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import App from '../src/App'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css'), 'utf8')

let container: HTMLDivElement
let root: Root
let unlisten: () => void

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
  resetAudioEngineForTests()
  installFakeAudioContext()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  unlisten = installGestureUnlock()
})

afterEach(() => {
  unlisten()
  act(() => root.unmount())
  container.remove()
  delete (document as { visibilityState?: string }).visibilityState
  document.documentElement.classList.remove('dc-page-hidden')
  resetAudioEngineForTests()
  removeFakeAudioContext()
  vi.unstubAllGlobals()
})

const hide = (hidden: boolean) =>
  act(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
    document.dispatchEvent(new Event('visibilitychange'))
  })

describe('every screen pauses while the tab is hidden (brief 8.3)', () => {
  it('sets one class on the root from visibilitychange, on the title as on the board, and takes it off again', () => {
    act(() => {
      root.render(<App />)
    })
    expect(container.querySelector('[data-title]'), 'not on the title').not.toBeNull()
    const root_ = document.documentElement
    expect(root_.classList.contains('dc-page-hidden')).toBe(false)
    hide(true)
    expect(root_.classList.contains('dc-page-hidden'), 'a hidden tab did not pause the page').toBe(true)
    hide(false)
    expect(root_.classList.contains('dc-page-hidden'), 'the page stayed paused once visible').toBe(false)
  })

  it('turns the class into a pause for every animation, and reduced motion into none at all', () => {
    const pause = /\.dc-page-hidden \*,\s*\.dc-page-hidden \*::before,\s*\.dc-page-hidden \*::after\s*\{\s*animation-play-state: paused !important;\s*\}/
    expect(CSS, 'the page-hidden pause is gone from index.css').toMatch(pause)
    const reduce = /@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*\*::before,\s*\*::after\s*\{\s*animation: none !important;\s*transition: none !important;\s*\}\s*\}/
    expect(CSS, 'the reduced-motion rule for every element is gone from index.css').toMatch(reduce)
  })
})
