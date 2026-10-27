// @vitest-environment jsdom
//
// Render counts on the board (v1.2 R2 fix, after CI run #19). The run
// timed out because every director tick and every HUD change re-rendered
// every sprite and backdrop rect on the board: R2 took it from 214
// elements to 832. The fix makes a sprite render when its own props
// change; this suite holds it on the v1.3 AssetStrip, through a HUD change
// and through the night that replaced the director in v1.3 R3. (It also
// held each backdrop to one render per board mount, until v1.3 R2 took the
// backdrops off the board.)
//
// HOW A RENDER IS COUNTED. PixelSprite looks its geometry up on every
// render by calling spriteRects(sprite), a cached lookup, so it is the
// cheapest honest probe there is: the module is mocked with its own real
// function wrapped in a spy, and nothing else about it changes. A render
// that the memo skips never reaches the lookup.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { STRIKE_HOLD_MS } from '../src/ui/board/strike'
import { ASSET_MAPS, assetSprite } from '../src/ui/sprites/assets'
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

// The night's chunks, loaded once, so React.lazy resolves on a microtask.
beforeAll(async () => {
  await import('../src/ui/night/Night')
  await import('../src/ui/night/cards')
  await import('../src/ui/night/closeCards')
})

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
// A tap, and the lazy cards and effects it sets off, settled.
async function tap(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
  await act(async () => {})
}

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

  it('renders no tile sprite through a quiet night: the overlay, a held strike per move, and its cards', async () => {
    // The fixture: a turn that touches no asset, so every tile's sprite
    // should hold still for the whole night. v1.2's turn 1 scripted no
    // move and was that turn for free; v1.3's turn 1 scripts one, so the
    // fleet here already owns both of its candidates' primary defenses
    // (anti-jam and PNT authentication: the prepared script ordered both
    // on turn 1 until v1.4's one new defense a night) and the night is
    // held outright. Owned rather than ordered, so nothing arrives at the
    // close and the EXECUTE below needs no order queued.
    const state: GameState = { ...newGame(DEFAULT_SCENARIO, 20260712, 'standard'), counters: ['antiJam', 'pntAuth'] }
    const after = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
    const record = after.history[after.history.length - 1]
    expect(record.events.map((e) => e.outcome), 'turn 1 is no longer held outright by these defenses').toEqual(record.events.map(() => 'held'))
    expect(after.assets.map((a) => a.integrity), 'turn 1 is no longer quiet on this seed').toEqual(state.assets.map((a) => a.integrity))
    mount(state)
    expect(tileSpriteRenders(), 'tile sprite renders at mount').toBe(state.assets.length)
    vi.mocked(spriteRects).mockClear()

    const execute = container.querySelector('button[data-execute]')
    expect(execute, 'the commit control is not on screen').not.toBeNull()
    await tap(execute!)
    // Only the overlay and the strikes play on their own (v1.3 R3), so the
    // timers run a strike's length whenever no card is up; every card
    // waits for its tap. A strike re-renders the strip (the reticle and
    // the shield go on the tile the move was aimed at) and that tile's
    // sprite must hold still through it.
    //
    // A held move's card draws its target with the very sprite the tile
    // does (the "before" picture), once as the card arrives. Those are the
    // only tile-sprite renders a quiet night may make, so they are counted
    // off each card as it comes, and any render in the strip on top of
    // them fails the equality below.
    const strikes = new Set<string>()
    const cards = new Set<string>()
    let shielded = 0
    let cardSprites = 0
    for (let i = 0; i < 60 && !container.querySelector('button[data-begin]'); i += 1) {
      const banner = container.querySelector('[data-strike-banner]')
      if (banner) strikes.add(`${banner.getAttribute('data-strike-banner')} ${banner.textContent}`)
      if (container.querySelector('[data-strip] [data-shield="held"]')) shielded += 1
      const card = container.querySelector('[data-night-card]')
      const label = card?.getAttribute('aria-label')
      if (card && label && !cards.has(label)) {
        cards.add(label)
        // The card's result tiles, sprites the probe counts too (v1.6 R3:
        // the card no longer draws its target, whose integrity change the
        // strip's tile carries).
        cardSprites += card.querySelectorAll('[data-result-tiles] svg').length
      }
      const way = container.querySelector('[data-file-it]') ?? container.querySelector('[data-collect]') ?? container.querySelector('[data-continue]')
      if (way) await tap(way)
      else
        await act(async () => {
          vi.advanceTimersByTime(STRIKE_HOLD_MS)
        })
    }
    expect(container.querySelector('button[data-begin]'), 'the night never reached END OF TURN').not.toBeNull()
    expect([...strikes].every((s) => s.startsWith('held')), `a strike landed on a quiet night: ${[...strikes]}`).toBe(true)
    expect(strikes.size, 'no strike played, so the strip was never re-rendered').toBe(record.events.length)
    expect(shielded, 'no tile took the shield').toBeGreaterThan(0)
    expect(cards.size, 'the night showed no card per move').toBeGreaterThanOrEqual(record.events.length)

    expect(container.querySelector('[data-strip]'), 'the strip left the board during the night').not.toBeNull()
    // The positive control: the probe sees the night's renders at all.
    expect(cardSprites, 'no card drew its result tiles, so the probe saw nothing of the night').toBeGreaterThan(0)
    expect(vi.mocked(spriteRects).mock.calls.length, 'the probe counted no sprite through the night').toBeGreaterThan(0)
    expect(tileSpriteRenders(), 'tile sprites re-rendered in the strip during a night that touched no asset').toBe(0)
  })
})
