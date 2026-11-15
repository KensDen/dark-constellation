// @vitest-environment jsdom
//
// THE TITLE'S WORLD (v2.0 R3, Ken's ruling of 15 November 2026: the title
// in 3D). The title's hero is the game's own theater, live, in a chunk of
// its own (src/ui/TitleWorld.tsx). It is decoration, so the one thing a
// test DOM can hold it to is the thing that matters most: the title is
// whole without it. Every other DOM suite replaces the world with nothing;
// this one mounts the real one, where there is no WebGL to draw it with.
//
//   - With no WebGL 2 at all (a test DOM, a hardened browser) the world
//     renders nothing and builds nothing, and the title keeps its words,
//     its hero box and its menu.
//   - With WebGL 2 named but no context to be had (a blocked GPU), the
//     world's build throws inside three.js; the title catches it, leaves
//     no canvas behind, and stays whole.
//   - The title's words since this round: CONTINUE NIGHT n, and GOAL 1's
//     night line whatever the address says (the pixel board's "turn"
//     branch went with the board).
//   - The world gives its WebGL context back as it unmounts, and the
//     theater only does that when asked (the game's canvas is React's).
//
// What it looks like, at four screen sizes, with WebGL, is captured from a
// real browser in files/20261115-v2.0-r3/title/.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { GAME_TITLE } from '../src/config'
import Title, { type TitleProps } from '../src/ui/Title'
import { TITLE_TAGLINE } from '../src/ui/titleStatus'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

let container: HTMLDivElement
let root: Root

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

const props = (over: Partial<TitleProps> = {}): TitleProps => ({
  difficulty: 'easy',
  onDifficulty: () => {},
  resumeTurn: null,
  onContinue: () => {},
  onPlay: () => {},
  onDaily: () => {},
  onBriefing: () => {},
  onDossier: () => {},
  onLibrary: () => {},
  soundPrefs: { effects: true, music: true },
  onSoundPrefs: () => {},
  onImport: () => {},
  onReplaySeed: () => {},
  onScoreboard: () => {},
  onCredits: () => {},
  ...over,
})

const mount = (over: Partial<TitleProps> = {}) => act(() => root.render(<Title {...props(over)} />))
// The world is a lazy chunk with three.js under it: a few turns of the
// loop bring it in, mount it and let its effect run.
const settle = async () => {
  await act(async () => {
    await vi.dynamicImportSettled()
  })
  for (let i = 0; i < 5; i += 1) await act(async () => new Promise((r) => setTimeout(r, 10)))
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  history.replaceState(null, '', location.pathname)
})

const whole = () => {
  const hero = container.querySelector('[data-key-art]')
  expect(hero, 'the title lost its hero box').not.toBeNull()
  expect(hero!.querySelector('h1 [role="img"]')!.getAttribute('aria-label')).toBe(GAME_TITLE)
  expect(container.querySelector('[data-tagline]')!.textContent).toBe(TITLE_TAGLINE)
  expect(container.querySelector('[data-play]'), 'the title lost PLAY').not.toBeNull()
  expect(container.querySelector('[data-title-system]'), 'the title lost SYSTEM').not.toBeNull()
  expect(container.querySelector('[data-key-art] canvas'), 'a canvas was left in the hero with nothing to draw it').toBeNull()
  expect(container.querySelector('.tt-world'), 'the world left its box behind').toBeNull()
}

describe("the title's world, where there is no WebGL", () => {
  it('renders nothing and builds nothing with no WebGL 2, and the title is whole without it', async () => {
    expect(typeof WebGL2RenderingContext, 'this DOM has WebGL 2, so the test proves nothing').toBe('undefined')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    await mount()
    // The words and the menu are there before the world's chunk is.
    expect(container.querySelector('[data-play]')).not.toBeNull()
    await settle()
    whole()
    expect(errors.mock.calls.map((c) => String(c[0])), 'the fallback was not quiet').toEqual([])
  })

  it('catches a world that cannot be built (WebGL 2 named, no context to be had), and leaves no canvas', async () => {
    vi.stubGlobal('WebGL2RenderingContext', class {})
    // three.js says why on the console, and the test DOM says it has no canvas.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    await mount()
    await settle()
    whole()
    expect(errors.mock.calls.length, 'the world was never tried, so the catch was not exercised').toBeGreaterThan(0)
    // And SYSTEM still opens over a title whose world is gone.
    await act(async () => (container.querySelector('[data-title-system]') as HTMLElement).click())
    expect(container.querySelector('[role="dialog"] [data-system-control="difficulty"]')).not.toBeNull()
  })
})

describe("the title's words (v2.0 R3)", () => {
  it('says CONTINUE NIGHT n for a game in progress, and nothing without one', async () => {
    await mount()
    expect(container.querySelector('[data-continue]')).toBeNull()
    await mount({ resumeTurn: 4 })
    expect(container.querySelector('[data-continue]')!.textContent!.trim()).toBe('CONTINUE NIGHT 4')
    expect(container.textContent).not.toMatch(/CONTINUE TURN/)
  })

  it("counts nights in GOAL 1 whatever the address says: the pixel board's branch is gone", async () => {
    history.replaceState(null, '', '?view=classic')
    await mount()
    const goal = container.querySelector('[data-goal="1"]')!.textContent!.replace(/ /g, ' ')
    expect(goal).toContain(`Finish night ${DEFAULT_SCENARIO.totalTurns} at ${DEFAULT_SCENARIO.winThreshold}+`)
    expect(goal).not.toMatch(/turn/i)
  })

  it('draws no pixel sprite: the number sign is text, and a held goal carries a mark and a word', async () => {
    localStorage.setItem('dc-scores', JSON.stringify([{ outcome: 'won', mai: 81.5, seed: 1, turnsSurvived: 6, totalTurns: 6, scenarioId: 'first-light', difficulty: 'easy', recordedAt: '2026-11-15T00:00:00Z' }]))
    await mount()
    expect(container.querySelector('svg[data-sprite], svg[shape-rendering="crispEdges"]'), 'a pixel sprite is back on the title').toBeNull()
    const daily = container.querySelector('[data-daily]')
    if (daily) expect(daily.querySelector('span')!.textContent).toMatch(/^DAILY OP #\d+$/)
    const status = container.querySelector('[data-goal-status]')!
    expect(status.textContent).toBe('HELD · BEST 81.5')
    expect(status.querySelector('svg[aria-hidden="true"]'), 'HELD lost its mark').not.toBeNull()
  })
})

describe('the world gives its WebGL context back (the game builds its own right after PLAY)', () => {
  const world = readFileSync(join(SRC, 'ui', 'TitleWorld.tsx'), 'utf8')
  const theater = readFileSync(join(SRC, 'ui', 'three', 'theater.ts'), 'utf8')

  it('asks the theater to release it as it unmounts, on a canvas of its own', () => {
    expect(world, "the title's world no longer releases its context").toMatch(/\.dispose\(true\)/)
    expect(world, "the title's world draws on a canvas React owns, which a lost context would poison").toMatch(/document\.createElement\('canvas'\)/)
    expect(world).not.toMatch(/<canvas/)
  })

  it('and the theater releases only when asked, after its renderer is disposed', () => {
    expect(theater).toMatch(/dispose\(release = false\): void \{/)
    expect(theater).toMatch(/this\.renderer\.dispose\(\)\s*if \(release\) this\.renderer\.forceContextLoss\(\)/)
  })
})
