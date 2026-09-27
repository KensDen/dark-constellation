// @vitest-environment jsdom
//
// Render counts on the board (v1.2 R2 fix, after CI run #19). The run
// timed out because every director tick and every HUD change re-rendered
// every sprite and backdrop rect on the board: R2 took it from 214
// elements to 832. The fix makes a sprite render when its own props
// change and a backdrop render once per board mount; this suite holds
// both.
//
// HOW A RENDER IS COUNTED. Each renderer looks its geometry up on every
// render: PixelSprite calls spriteRects(sprite) and Backdrop calls
// sceneFor(layer). Both are cached lookups, so they are the cheapest
// honest probe there is: the modules are mocked with their own real
// functions wrapped in a spy, and nothing else about them changes. A
// render that the memo skips never reaches the lookup.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))
vi.mock('../src/ui/sprites/sprite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ui/sprites/sprite')>()
  return { ...actual, spriteRects: vi.fn(actual.spriteRects) }
})
vi.mock('../src/ui/sprites/scenery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ui/sprites/scenery')>()
  return { ...actual, sceneFor: vi.fn(actual.sceneFor) }
})

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { LAYERS, type GameState } from '../src/engine/types'
import { ASSET_SPRITES } from '../src/ui/sprites/assets'
import { sceneFor } from '../src/ui/sprites/scenery'
import { spriteRects, type Sprite } from '../src/ui/sprites/sprite'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { NO_OP } from './scripts'

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

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', memoryStorage())
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
  vi.mocked(spriteRects).mockClear()
  vi.mocked(sceneFor).mockClear()
})

afterEach(() => {
  unlisten()
  act(() => root.unmount())
  container.remove()
  resetAudioEngineForTests()
  removeFakeAudioContext()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
const byText = (re: RegExp) => [...container.querySelectorAll('button')].find((b) => re.test(b.textContent ?? ''))

// Every sprite a tile can draw.
const TILE_SPRITES = new Set<Sprite>(Object.values(ASSET_SPRITES).flatMap((states) => Object.values(states)))
const tileSpriteRenders = () => vi.mocked(spriteRects).mock.calls.filter(([sprite]) => TILE_SPRITES.has(sprite)).length
const backdropRenders = () => vi.mocked(sceneFor).mock.calls.length

function mount(state: GameState) {
  act(() => {
    root.render(<Game initial={{ state, phase: 'brief' }} onExit={() => {}} />)
  })
}

describe('render counts on the board (v1.2 R2 fix)', () => {
  it("GUARD: a tile's sprite does not re-render when an unrelated HUD value changes", () => {
    const state = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
    mount(state)
    // The positive control: the probe sees renders at all, one per tile.
    expect(tileSpriteRenders(), 'tile sprite renders at mount').toBe(state.assets.length)
    vi.mocked(spriteRects).mockClear()
    vi.mocked(sceneFor).mockClear()

    // Change the credits on the HUD without touching the fleet: queue a
    // defense on the HARDEN sheet. Opening the sheet re-renders the board
    // too, which is the point.
    const credits = () => container.querySelector('[aria-label^="Credits"]')?.getAttribute('aria-label')
    const before = credits()
    click(container.querySelector('nav[aria-label="Actions"] [data-action="harden"]')!)
    const box = [...container.querySelectorAll<HTMLInputElement>('[data-sheet="harden"] input[type="checkbox"]')].find((b) => !b.disabled)
    expect(box, 'no defense to queue').toBeDefined()
    click(box!)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(credits(), 'the HUD credits did not change, so nothing was tested').not.toBe(before)

    expect(tileSpriteRenders(), 'tile sprites re-rendered for a HUD change').toBe(0)
    expect(backdropRenders(), 'backdrops re-rendered for a HUD change').toBe(0)
  })

  it('renders each backdrop once per board mount, and no tile sprite through a quiet turn of director ticks', () => {
    const state = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
    // The fixture: turn 1 of the opening touches no asset, so every tile's
    // sprite should hold still for the whole playback.
    const after = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
    expect(after.assets.map((a) => a.integrity), 'turn 1 is no longer quiet on this seed').toEqual(state.assets.map((a) => a.integrity))
    mount(state)
    expect(backdropRenders(), 'backdrop renders at mount').toBe(LAYERS.length)
    vi.mocked(spriteRects).mockClear()
    vi.mocked(sceneFor).mockClear()

    const hold = byText(/Hold to resolve/i)
    expect(hold, 'the commit control is not on screen').toBeDefined()
    act(() => {
      hold!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    let ticks = 0
    while (!byText(/^NEXT TURN/) && ticks < 60) {
      act(() => {
        vi.advanceTimersByTime(300)
      })
      ticks += 1
    }
    expect(byText(/^NEXT TURN/), 'the playback never reached the aftermath').toBeDefined()
    expect(ticks, 'no director ticks ran').toBeGreaterThan(1)

    expect(backdropRenders(), 'backdrops re-rendered during playback').toBe(0)
    expect(tileSpriteRenders(), 'tile sprites re-rendered during a turn that touched no asset').toBe(0)
  })
})
