// @vitest-environment jsdom
//
// The sprites on the board (v1.2 R2, brief 4.2, 5.1 and 5.3): the round's
// guards (b), (c) and (d).
//
//   (b) The tiles render the sprite SPRITE_STATES picks, at the seven
//       integrities either side of each boundary, and the table picks the
//       brief's states there.
//   (c) The renderer merges runs: eight identical pixels are one rect.
//   (d) Under reduced motion, and with the board's hidden-tab class set,
//       nothing on the board has a running animation.
//
// WHAT JSDOM CAN SEE HONESTLY, for (d). jsdom runs the real cascade over
// a stylesheet (selectors, specificity, !important, inline styles), so the
// test hands it the real src/index.css and reads computed styles. Three
// things it cannot do, each answered here rather than papered over:
//   - It evaluates no media feature: every @media except `all` and
//     `screen` is dropped, so the idle rules would never apply and the
//     test would pass by seeing nothing. The test states the preference by
//     rewriting the two prefers-reduced-motion conditions to `all` or
//     `not all`, and fails if any other form of the query appears.
//   - It does not expand the `animation` shorthand into its longhands, so
//     the running name is read from the shorthand where no longhand is
//     set, by matching the sheet's own @keyframes names.
//   - It therefore cannot see a shorthand resetting animation-play-state
//     to running over the pause. That is why the pause rule is
//     !important, and the test pins that priority.
// And it runs no animation clock: "running" here means a keyframes name
// applies and the play state is not paused, which is what a browser runs.
// The round report records the same two cases checked in real Chrome.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame } from '../src/engine/reducer'
import type { GameState } from '../src/engine/types'
import { SPRITE_STATES, callSigns, spriteState } from '../src/ui/board/board'
import { ASSET_SPRITES } from '../src/ui/sprites/assets'
import { PANEL_FILL } from '../src/ui/sprites/scenery'
import PixelSprite from '../src/ui/sprites/PixelSprite'
import { runs, type Sprite } from '../src/ui/sprites/sprite'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const INDEX_CSS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css')

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
})

afterEach(() => {
  unlisten()
  act(() => root.unmount())
  container.remove()
  document.head.querySelectorAll('style[data-test-css]').forEach((s) => s.remove())
  delete (document as { visibilityState?: string }).visibilityState
  resetAudioEngineForTests()
  removeFakeAudioContext()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

let mounts = 0
function render(state: GameState) {
  mounts += 1
  act(() => {
    root.render(<Game key={`m${mounts}`} initial={{ state, phase: 'brief' }} onExit={() => {}} />)
  })
}

// The starter fleet with every integrity set to one value.
function fleetAt(integrity: number): GameState {
  const state = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
  return { ...state, assets: state.assets.map((a) => ({ ...a, integrity })) }
}

// A fleet in every state at once, one Tier A, and a buy in transit: the
// board with the most kinds of idle life on it.
function mixedFleet(): GameState {
  const state = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
  const integrity = [100, 50, 20, 0, 60, 10]
  return {
    ...state,
    assets: state.assets.map((a, i) => ({ ...a, integrity: integrity[i] ?? a.integrity, tier: i === 0 ? 'A' : a.tier })),
    pipeline: [{ id: 't1-groundStation-0', kind: 'groundStation', tier: 'A', etaTurns: 2 }],
  }
}

const rectsOf = (svg: Element) =>
  [...svg.querySelectorAll('rect')].map((r) => `${r.getAttribute('x')},${r.getAttribute('y')},${r.getAttribute('width')}`).sort()
const runsOf = (sprite: Sprite) => runs(sprite.rows).map((r) => `${r.x},${r.y},${r.width}`).sort()

describe('the sprites on the board (v1.2 R2)', () => {
  it('GUARD (b): tiles render the sprite SPRITE_STATES picks at 100, 67, 66, 34, 33, 1 and 0', () => {
    // The brief's boundaries (4.2): intact 67 to 100, damaged 34 to 66,
    // critical 1 to 33, knocked out at 0. The table must pick these; the
    // tiles must draw what the table picks, rect for rect.
    const points = [100, 67, 66, 34, 33, 1, 0]
    const brief = ['intact', 'intact', 'damaged', 'damaged', 'critical', 'critical', 'out']
    expect(points.map(spriteState), 'SPRITE_STATES no longer picks the brief states at its boundaries').toEqual(brief)
    expect(SPRITE_STATES.length).toBe(4)
    for (const integrity of points) {
      const state = fleetAt(integrity)
      render(state)
      const signs = callSigns(state)
      const expected = spriteState(integrity)
      for (const asset of state.assets) {
        const tile = [...container.querySelectorAll('button[data-asset-id]')].find((b) =>
          (b.getAttribute('aria-label') ?? '').startsWith(`${signs.get(asset.id)},`),
        )
        expect(tile, `no tile for ${asset.id} at ${integrity}`).toBeDefined()
        const svg = tile!.querySelector('svg[data-sprite]:not([data-sprite="tier-a"])')!
        expect(svg.getAttribute('data-sprite'), `${asset.id} at ${integrity}`).toBe(`${asset.kind}.${expected}`)
        expect(rectsOf(svg), `${asset.id} at ${integrity} draws other art`).toEqual(runsOf(ASSET_SPRITES[asset.kind][expected]))
      }
    }
  })

  it('GUARD (c): the renderer merges a horizontal run into one rect, at an integer scale, with crisp edges', () => {
    const sprite: Sprite = {
      rows: ['aaaaaaaa', 'ab.bbaa.'],
      palette: { a: { token: 'ink' }, b: { token: 'go' } },
    }
    act(() => {
      root.render(<PixelSprite sprite={sprite} scale={3} />)
    })
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges')
    expect([svg.getAttribute('width'), svg.getAttribute('height'), svg.getAttribute('viewBox')]).toEqual(['24', '6', '0 0 8 2'])
    const row = (y: number) =>
      [...svg.querySelectorAll(`rect[y="${y}"]`)].map((r) => [Number(r.getAttribute('x')), Number(r.getAttribute('width'))]).sort((p, q) => p[0] - q[0])
    // Eight identical pixels: one rect, eight wide.
    expect(row(0)).toEqual([[0, 8]])
    // A mixed row: a run per colour change, none across a gap.
    expect(row(1)).toEqual([
      [0, 1],
      [1, 1],
      [3, 2],
      [5, 2],
    ])
  })

  it('puts every piece of panel text on PANEL_FILL, so the backdrop never sits directly under a letter', () => {
    render(mixedFleet())
    // Open a tile's detail line too, so it is checked.
    act(() => {
      container.querySelector('button[data-asset-id]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const panels = [...container.querySelectorAll('section[aria-labelledby^="layer-"]')]
    expect(panels.length).toBe(3)
    const bare: string[] = []
    let checked = 0
    for (const panel of panels) {
      const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue
        const el = node.parentElement!
        if (el.closest('.sr-only')) continue
        checked += 1
        let onFill = false
        for (let a: Element | null = el; a && a !== panel; a = a.parentElement) {
          if ((a.getAttribute('class') ?? '').split(/\s+/).includes(PANEL_FILL)) onFill = true
        }
        if (!onFill) bare.push(`"${node.textContent.trim()}"`)
      }
    }
    expect(checked, 'no panel text found').toBeGreaterThan(10)
    expect(bare, 'panel text sitting directly on the backdrop').toEqual([])
  })

  describe('GUARD (d): the idle life stops under reduced motion and while the tab is hidden', () => {
    const CSS = readFileSync(INDEX_CSS, 'utf8')

    // The stylesheet as a browser with this preference would apply it.
    function applyCss(reduced: boolean) {
      document.head.querySelectorAll('style[data-test-css]').forEach((s) => s.remove())
      const noPreference = '(prefers-reduced-motion: no-preference)'
      const reduce = '(prefers-reduced-motion: reduce)'
      expect(CSS.includes(noPreference), 'index.css has no no-preference guard').toBe(true)
      // Comments out first: they mention the query in prose.
      const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/@import[^;]*;/g, '')
        .replaceAll(noPreference, reduced ? 'not all' : 'all')
        .replaceAll(reduce, reduced ? 'all' : 'not all')
      expect(css.includes('prefers-reduced-motion'), 'a form of the reduced-motion query this test does not state').toBe(false)
      const style = document.createElement('style')
      style.setAttribute('data-test-css', '')
      style.textContent = css
      document.head.appendChild(style)
      return style.sheet!
    }

    const keyframeNames = (sheet: CSSStyleSheet) =>
      new Set([...sheet.cssRules].filter((r): r is CSSKeyframesRule => r instanceof CSSKeyframesRule).map((r) => r.name))

    // What is running on the board: element, and the keyframes it runs.
    function runningOn(board: Element, names: Set<string>) {
      const out: { el: Element; name: string }[] = []
      for (const el of [board, ...board.querySelectorAll('*')]) {
        const cs = getComputedStyle(el)
        let name = cs.getPropertyValue('animation-name').trim()
        if (!name || name === 'none') name = cs.getPropertyValue('animation').split(/[\s,]+/).find((t) => names.has(t)) ?? 'none'
        if (name === 'none') continue
        if (cs.getPropertyValue('animation-play-state').includes('paused')) continue
        out.push({ el, name })
      }
      return out
    }

    const describeEl = (el: Element) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`

    it('runs the idle life with no preference and the tab visible (the positive control)', () => {
      render(mixedFleet())
      const board = container.querySelector('[data-board]')!
      const sheet = applyCss(false)
      const running = runningOn(board, keyframeNames(sheet))
      const classes = new Set(running.flatMap(({ el }) => (el.getAttribute('class') ?? '').split(/\s+/)))
      // Every piece brief 5.3 and the round name, present and moving.
      for (const idle of ['dc-twinkle', 'dc-beacon', 'dc-bob', 'dc-rotor', 'dc-drift', 'dc-orbit', 'dc-spark', 'dc-smoke']) {
        expect(classes.has(idle), `${idle} is not running on the board`).toBe(true)
      }
      // And every animation running on the idle board moves transform or
      // opacity, nothing that lays out.
      const frames = [...sheet.cssRules].filter((r): r is CSSKeyframesRule => r instanceof CSSKeyframesRule)
      const touched = new Set<string>()
      for (const name of new Set(running.map((r) => r.name))) {
        const rule = frames.find((f) => f.name === name)
        expect(rule, `no @keyframes ${name}`).toBeDefined()
        for (const frame of [...rule!.cssRules] as CSSKeyframeRule[]) {
          for (let i = 0; i < frame.style.length; i += 1) touched.add(`${name}: ${frame.style.item(i)}`)
        }
      }
      const layout = [...touched].filter((t) => !/: (transform|opacity)$/.test(t))
      expect(layout, 'idle animations on a property other than transform or opacity').toEqual([])
    })

    it('runs nothing on the board under reduced motion', () => {
      render(mixedFleet())
      const board = container.querySelector('[data-board]')!
      const running = runningOn(board, keyframeNames(applyCss(true)))
      expect(running.map(({ el, name }) => `${name} on ${describeEl(el)}`)).toEqual([])
    })

    it('runs nothing on the board while the tab is hidden, through one class set from visibilitychange', () => {
      render(mixedFleet())
      const board = container.querySelector('[data-board]')!
      const sheet = applyCss(false)
      expect(board.classList.contains('dc-board-hidden')).toBe(false)
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(board.classList.contains('dc-board-hidden'), 'the hidden tab did not set the class').toBe(true)
      const running = runningOn(board, keyframeNames(sheet))
      expect(running.map(({ el, name }) => `${name} on ${describeEl(el)}`)).toEqual([])
      // The pause has to beat any animation shorthand, which resets the
      // play state to running; jsdom cannot see that reset, so the
      // priority that makes it hold in a browser is pinned instead.
      const pause = [...sheet.cssRules].find((r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText.includes('.dc-board-hidden'))
      expect(pause?.style.getPropertyPriority('animation-play-state')).toBe('important')
      // And back: the class lifts when the tab returns.
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(board.classList.contains('dc-board-hidden')).toBe(false)
    })
  })
})
