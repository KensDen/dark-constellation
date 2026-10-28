// @vitest-environment jsdom
//
// GUARD v1.6 R4 (x): THE COACH SHOWS ONCE PER DEVICE (Ken's ruling of 27
// October 2026, like TONIGHT's "?"). FIRST ORDERS walks a device's first
// operation, turn 1's steps and turn 2's one, and no operation after it;
// SYSTEM's HOW TO PLAY keeps the job for a returning player. The PROCURE,
// one-exit and cut-text guards need a layout and are v1.6 R4 (t) to (v)
// in scripts/phone-layout.mjs; END OF TURN's fit is (w) there.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { COACH_SEEN_KEY } from '../src/ui/board/Orders'
import { howToLines } from '../src/ui/systemControls'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root
let unlisten: () => void

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(String(k), String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage
}

beforeAll(async () => {
  await import('../src/ui/night/Night')
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
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
  resetAudioEngineForTests()
  removeFakeAudioContext()
  vi.unstubAllGlobals()
})

// Seed 2, which plays the campaign as written (v1.6 R1: uplink jamming
// against GNSS spoofing on turn 1); seed 3 until then.

let mounts = 0
function render(state: GameState) {
  mounts += 1
  act(() => {
    root.render(<Game key={`m${mounts}`} initial={{ state, phase: 'brief' }} onExit={() => {}} />)
  })
}
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
const coach = () => container.querySelector('[data-orders]')

describe('GUARD v1.6 R4 (x): the coach shows once per device', () => {
  it('walks the first operation, turns 1 and 2, and no operation after it', () => {
    const first = newGame(DEFAULT_SCENARIO, 2, 'standard')
    render(first)
    expect(coach(), 'a device\'s first board has no coach').not.toBeNull()
    expect(coach()!.textContent).toContain('FIRST ORDERS')
    expect(localStorage.getItem(COACH_SEEN_KEY)).toBe('2')
    // The same operation's turn 2 keeps its one step.
    const second = resolveTurn(first, { buyAssets: [], buyCounters: ['antiJam'], intelBrief: false }, turnRng(first.seed, first.turn))
    render(second)
    expect(coach()?.textContent, 'the first operation lost its turn-2 step').toContain('SECOND ORDERS')
    // A new operation on the same device: no coach on its turn 1 or 2.
    const next = newGame(DEFAULT_SCENARIO, 32, 'standard')
    render(next)
    expect(coach(), 'the coach came back on a later operation').toBeNull()
    render(resolveTurn(next, { buyAssets: [], buyCounters: [], intelBrief: false }, turnRng(next.seed, next.turn)))
    expect(coach(), 'the coach came back on a later operation\'s turn 2').toBeNull()
    // SYSTEM's HOW TO PLAY keeps the job.
    click(container.querySelector('button[aria-label="System"]')!)
    click(container.querySelector('[data-system-control="howto"]')!)
    expect(container.querySelector('[data-how-to]')!.textContent).toContain(howToLines()[0])
  })

  it('still coaches a device that refuses storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    render(newGame(DEFAULT_SCENARIO, 2, 'standard'))
    expect(coach()).not.toBeNull()
  })
})
