// @vitest-environment jsdom
//
// Render counts on the board (v1.2 R2 fix, after CI run #19). The run
// timed out because every director tick and every HUD change re-rendered
// every sprite and backdrop rect on the board: R2 took it from 214
// elements to 832. The fix makes a sprite render when its own props
// change; this suite holds it on the v1.3 AssetStrip. (It also held each
// backdrop to one render per board mount, until v1.3 R2 took the backdrops
// off the board.)
//
// HOW A RENDER IS COUNTED. PixelSprite looks its geometry up on every
// render by calling spriteRects(sprite), a cached lookup, so it is the
// cheapest honest probe there is: the module is mocked with its own real
// function wrapped in a spy, and nothing else about it changes. A render
// that the memo skips never reaches the lookup.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))
vi.mock('../src/ui/sprites/sprite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ui/sprites/sprite')>()
  return { ...actual, spriteRects: vi.fn(actual.spriteRects) }
})

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { AssetKind, GameState } from '../src/engine/types'
import { STRIKE_MS } from '../src/ui/board/strike'
import { ASSET_MAPS, assetSprite } from '../src/ui/sprites/assets'
import { spriteRects, type Sprite } from '../src/ui/sprites/sprite'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { NO_OP, WIN_SCRIPT } from './scripts'

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

// Every sprite a tile can draw: each kind at every integrity, and in
// transit. assetSprite hands out one object per picture, so the set holds
// the very objects the tiles pass PixelSprite.
const TILE_SPRITES = new Set<Sprite>(
  (Object.keys(ASSET_MAPS) as AssetKind[]).flatMap((kind) => [
    ...Array.from({ length: 101 }, (_, integrity) => assetSprite(kind, integrity)),
    assetSprite(kind, 100, 'transit'),
  ]),
)
const tileSpriteRenders = () => vi.mocked(spriteRects).mock.calls.filter(([sprite]) => TILE_SPRITES.has(sprite)).length

function mount(state: GameState) {
  act(() => {
    root.render(<Game initial={{ state, phase: 'brief' }} onExit={() => {}} />)
  })
}

describe('render counts on the board (v1.2 R2 fix, v1.3 R2 strip)', () => {
  it("GUARD: a tile's sprite does not re-render when an unrelated HUD value changes", () => {
    const state = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
    mount(state)
    // The positive control: the probe sees renders at all, one per tile.
    expect(container.querySelectorAll('[data-strip] [data-asset-id]').length, 'the strip has no tiles').toBe(state.assets.length)
    expect(tileSpriteRenders(), 'tile sprite renders at mount').toBe(state.assets.length)
    vi.mocked(spriteRects).mockClear()

    // Change the money on screen without touching the fleet: queue a
    // defense in PROCURE. Since v1.3 R2 the HUD's BUDGET is the engine
    // balance and the cart shows as the Dock's REMAINING, so that is the
    // value that moves. Opening the sheet re-renders the board too, which
    // is the point.
    const remaining = () => container.querySelector('[data-dock] [data-remaining]')?.textContent
    const before = remaining()
    expect(before, 'no REMAINING on the Dock').toMatch(/REMAINING/)
    click(container.querySelector('[data-dock] button[data-action="procure"]')!)
    const defense = [...container.querySelectorAll<HTMLButtonElement>('[data-sheet="procure"] button[data-procure-defense]')].find((b) => !b.disabled)
    expect(defense, 'no defense to queue').toBeDefined()
    click(defense!)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(remaining(), 'REMAINING did not change, so nothing was tested').not.toBe(before)

    expect(tileSpriteRenders(), 'tile sprites re-rendered for a HUD change').toBe(0)
  })

  it('renders no tile sprite through a quiet turn of director steps', () => {
    // The fixture: a turn that touches no asset, so every tile's sprite
    // should hold still for the whole playback. v1.2's turn 1 scripted no
    // move and was that turn for free; v1.3's turn 1 scripts one, so the
    // fleet here already owns both of its candidates' primary defenses (the
    // two the prepared script orders on turn 1) and the night is held
    // outright. Owned rather than ordered, so nothing arrives at the close
    // and the EXECUTE below needs no order queued.
    const state: GameState = { ...newGame(DEFAULT_SCENARIO, 20260712, 'standard'), counters: [...WIN_SCRIPT[1].buyCounters] }
    const after = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
    const record = after.history[after.history.length - 1]
    expect(record.events.map((e) => e.outcome), 'turn 1 is no longer held outright by these defenses').toEqual(record.events.map(() => 'held'))
    expect(after.assets.map((a) => a.integrity), 'turn 1 is no longer quiet on this seed').toEqual(state.assets.map((a) => a.integrity))
    mount(state)
    expect(tileSpriteRenders(), 'tile sprite renders at mount').toBe(state.assets.length)
    vi.mocked(spriteRects).mockClear()

    const execute = container.querySelector('button[data-execute]')
    expect(execute, 'the commit control is not on screen').not.toBeNull()
    click(execute!)
    // The director is tap-through since v1.3 Round 0: each beat waits for
    // Next. The timers still run what plays inside a beat, so each step
    // lets them run a strike's length before tapping on.
    let taps = 0
    while (!byText(/^NEXT TURN/) && taps < 60) {
      act(() => {
        vi.advanceTimersByTime(STRIKE_MS)
      })
      const next = byText(/^Next$/)
      if (!next) break
      click(next)
      taps += 1
    }
    expect(byText(/^NEXT TURN/), 'the playback never reached the aftermath').toBeDefined()
    expect(taps, 'no director steps ran').toBeGreaterThan(1)

    expect(container.querySelector('[data-strip]'), 'the strip left the board during playback').not.toBeNull()
    expect(tileSpriteRenders(), 'tile sprites re-rendered during a turn that touched no asset').toBe(0)
  })
})
