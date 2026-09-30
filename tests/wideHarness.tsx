// The wide board's test harness (v1.2 R6), shared by its three DOM specs.
// Not a spec itself (vitest collects only *.spec files). Each spec keeps
// its own vi.mock calls, which vitest hoists per file above these imports,
// so a spec that mocks the WideBoard module or the action array gets its
// mock inside the Game rendered here.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, vi } from 'vitest'

import Game from '../src/ui/Game'
import { WIDE_QUERY } from '../src/ui/cues/motion'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { FIRST_TURN_DONE_KEY } from '../src/ui/firstTurn'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { NO_OP, WIN_SCRIPT } from './scripts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

export let container: HTMLDivElement
export let root: Root
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

// THE DOUBLE. A live media list: `matches` is read at call time, so a
// change event re-reads it, and only the exact WIDE_QUERY can match width.
// Every other suite's stub answers false to it, which is why they all stay
// on the phone board.
const media = { wide: false, listeners: [] as { query: string; fn: () => void }[] }
function installMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === WIDE_QUERY && media.wide
    },
    media: query,
    addEventListener: (_: string, fn: () => void) => media.listeners.push({ query, fn }),
    removeEventListener: (_: string, fn: () => void) => {
      media.listeners = media.listeners.filter((l) => l.fn !== fn)
    },
    addListener: (fn: () => void) => media.listeners.push({ query, fn }),
    removeListener: (fn: () => void) => {
      media.listeners = media.listeners.filter((l) => l.fn !== fn)
    },
  }))
}
export function setWide(wide: boolean) {
  media.wide = wide
  act(() => {
    for (const l of [...media.listeners]) if (l.query === WIDE_QUERY) l.fn()
  })
}

// Call once at the top of a spec.
export function installWideBoardHarness() {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', memoryStorage())
    localStorage.setItem(FIRST_TURN_DONE_KEY, '1')
    media.wide = false
    media.listeners = []
    installMedia()
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
    document.head.querySelectorAll('style[data-test-css]').forEach((s) => s.remove())
    resetAudioEngineForTests()
    removeFakeAudioContext()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
}

export function gameAt(turn: number, seed = 20260712, script = WIN_SCRIPT): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing' && state.turn < turn) {
    state = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
  }
  return state
}

// The prepared line's first turn from 2 on with a condition up, and a
// working asset on that condition's layer: a tile whose inspector has a
// condition to show. Bounded, so a deck without one fails here by name
// rather than looping.
export function conditionFixture() {
  for (let turn = 2; turn <= DEFAULT_SCENARIO.totalTurns; turn += 1) {
    const base = gameAt(turn)
    if (base.status !== 'playing' || base.conditions.length === 0) continue
    const def = DEFAULT_SCENARIO.events.find((e) => e.id === base.conditions[0].eventId)!
    const assets = base.assets.filter((a) => def.layers.includes(a.layer) && a.integrity > 0)
    if (assets.length > 0) return { base, asset: assets[0], assets }
  }
  throw new Error('no turn of the prepared line has a condition on a layer with a working asset')
}

let mounts = 0
export function render(state: GameState, phase: 'brief' | 'aftermath' = 'brief') {
  mounts += 1
  act(() => {
    root.render(<Game key={`m${mounts}`} initial={{ state, phase }} onExit={() => {}} />)
  })
}

// A lazy chunk behind a mocked module can take more than one round to
// arrive under a loaded runner, so settle a bounded number of rounds, the
// same number whether or not anything is expected: the phone case waits
// exactly as long as the wide case needed.
const SETTLE_ROUNDS = 20
export async function settle() {
  for (let i = 0; i < SETTLE_ROUNDS; i += 1) {
    await act(async () => {
      await vi.dynamicImportSettled()
    })
  }
}
export const step = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
export const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
// Cancelable, so defaultPrevented says whether the board took the key.
export function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window): boolean {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  act(() => {
    target.dispatchEvent(e)
  })
  return e.defaultPrevented
}
export const bar = () => container.querySelector('nav[aria-label="Actions"]')!
export const hold = () => bar().querySelector('button.dc-hold') as HTMLButtonElement
export const sheetOpen = (id: string) => container.querySelector(`[data-sheet="${id}"]`) !== null
// A keyboard activation of the focused hold commits at once (HoldButton).
export const resolveNow = () => {
  act(() => {
    hold().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}
export const beatText = () => container.textContent?.match(/beat (\d+) of (\d+)/)?.[0] ?? null
export const chips = () => [...bar().querySelectorAll('[data-step]')].map((m) => m.textContent)
