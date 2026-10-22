// @vitest-environment jsdom
//
// The front door (v1.3 R1, brief 5.1, 5.2 and section 3). Two guards:
//   GUARD R1 (a), THE FIRST-VISIT FLOW: a first-ever visit lands on the
//   title, and its PLAY goes through the briefing to turn 1 with no menu in
//   between, on EASY. A later PLAY skips the briefing, every PLAY draws a
//   fresh seed, and a device that has finished a campaign starts on
//   STANDARD. PLAY says which (its [data-play-mode] line), and SYSTEM is
//   the one place the difficulty changes: the title's difficulty chip
//   went in v1.3 R2 (Ken's ruling).
//   GUARD R1 (b), NO RETIRED WORD: nothing on an R1 screen (the title, its
//   SYSTEM, the briefing) says buy, purchase, money, MAI or RESOLVE (brief
//   section 4).
// The third R1 guard, that the briefing fits one phone screen with
// CONTINUE showing, needs a real layout engine and lives in the battery
// (scripts/phone-layout.mjs), with the R1 fixes' SYSTEM bounds, scroll
// reset and tagline checks. The fixes' flow checks are at the foot of
// this file.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import App from '../src/App'
import { BEATS } from '../src/ui/coldOpenSlides'
import { INTRO_SEEN_KEY } from '../src/ui/introSeen'
import { glossaryEntries } from '../src/ui/reference'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root
let unlisten: () => void
let mounts = 0

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
  vi.stubGlobal('localStorage', memoryStorage())
  // Reduced motion: each beat's line is whole at once, so the flow is
  // about the flow and not about typing.
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

function loadPage() {
  mounts += 1
  act(() => {
    root.render(<App key={`p${mounts}`} />)
  })
}
const settle = () =>
  act(async () => {
    await vi.dynamicImportSettled()
  })
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
const buttons = () => [...container.querySelectorAll('button')]
const byText = (re: RegExp) => buttons().find((b) => re.test((b.textContent ?? '').trim()))
const onTitle = () => container.querySelector('[data-title]') !== null
const onBriefing = () => container.querySelector('[data-briefing]') !== null
const onBoard = () => container.querySelector('[data-board]') !== null
const autosave = () => JSON.parse(localStorage.getItem('dc-autosave') ?? 'null') as { state: { turn: number; difficulty: string; seed: number } } | null

describe('GUARD R1 (a): the first-visit flow', () => {
  it('goes title, briefing, turn 1, with no menu in between, on EASY, and remembers the briefing', async () => {
    loadPage()
    expect(onTitle(), 'a first visit did not land on the title').toBe(true)
    expect(onBoard()).toBe(false)
    expect(container.querySelector('[data-play-mode]')!.textContent).toBe('EASY')

    click(container.querySelector('[data-play]')!)
    await settle()
    expect(onBriefing(), "a first device's PLAY did not go through the briefing").toBe(true)
    expect(onTitle()).toBe(false)
    for (let i = 0; i < BEATS.length; i += 1) {
      const next = container.querySelector('[data-briefing-next]')!
      expect(next.textContent!.trim()).toBe(i === BEATS.length - 1 ? 'BEGIN TURN 1' : 'CONTINUE')
      click(next)
    }
    await settle()
    expect(onBoard(), 'BEGIN TURN 1 did not reach the board').toBe(true)
    expect(onTitle(), 'a menu or the title came between the briefing and the board').toBe(false)
    const saved = autosave()!
    expect(saved.state.turn).toBe(1)
    expect(saved.state.difficulty, 'a first device did not start on EASY').toBe('easy')
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBe('1')

    // Back to title from a game in progress asks first (v1.3 R1 fixes,
    // item 10): STAY keeps the board, LEAVE goes to the title.
    click(container.querySelector('button[aria-label="System"]')!)
    click(byText(/^Back to title$/)!)
    const ask = container.querySelector('[data-confirm-leave]')
    expect(ask, 'Back to title left a game in progress without asking').not.toBeNull()
    expect(ask!.textContent).toContain('Leave this operation? It is saved; CONTINUE picks it up.')
    click(byText(/^STAY$/)!)
    expect(onBoard()).toBe(true)
    expect(container.querySelector('[data-confirm-leave]')).toBeNull()
    click(byText(/^Back to title$/)!)
    click(byText(/^LEAVE$/)!)
    expect(onTitle()).toBe(true)

    // A later PLAY goes straight to turn 1, on a fresh seed.
    click(container.querySelector('[data-play]')!)
    await settle()
    expect(onBriefing(), 'a later PLAY replayed the briefing').toBe(false)
    expect(onBoard()).toBe(true)
    expect(autosave()!.state.seed, 'two PLAYs drew the same seed').not.toBe(saved.state.seed)
  })

  it('starts on STANDARD once this device has finished a campaign', () => {
    localStorage.setItem(
      'dc-scores',
      JSON.stringify([{ outcome: 'won', mai: 80, seed: 1, turnsSurvived: 6, totalTurns: 6, scenarioId: 'first-light', difficulty: 'easy', recordedAt: '2026-10-20T00:00:00Z' }]),
    )
    localStorage.setItem(INTRO_SEEN_KEY, '1')
    loadPage()
    expect(container.querySelector('[data-play-mode]')!.textContent).toBe('STANDARD')
    click(container.querySelector('[data-play]')!)
    expect(onBoard()).toBe(true)
    expect(autosave()!.state.difficulty, 'PLAY started another mode than it showed').toBe('standard')
  })

  it('shows the mode PLAY starts, and changes it in SYSTEM only', async () => {
    loadPage()
    // No chip, and no difficulty control anywhere on the title outside
    // SYSTEM: the one place a difficulty word shows is PLAY's mode line.
    expect(container.querySelector('[data-difficulty-chip]'), 'the difficulty chip is back on the title').toBeNull()
    expect(container.querySelector('[data-system-control="difficulty"]'), 'a difficulty control outside SYSTEM').toBeNull()
    const modeWords = () =>
      [...container.querySelectorAll('[data-title] *')].filter((el) => el.children.length === 0 && /^(EASY|STANDARD)$/i.test((el.textContent ?? '').trim()))
    expect(modeWords()).toEqual([container.querySelector('[data-play-mode]')])
    expect(modeWords()[0].closest('button')!.hasAttribute('data-play'), 'the mode line is not on PLAY').toBe(true)
    expect(container.querySelector('[data-play-mode]')!.textContent).toBe('EASY')

    // SYSTEM changes it, for the next operation, and PLAY says so.
    const system = buttons().find((b) => b.getAttribute('aria-haspopup') === 'dialog' && (b.textContent ?? '').trim() === 'SYSTEM')!
    click(system)
    const dialog = container.querySelector('[role="dialog"]')!
    const selected = () => [...dialog.querySelectorAll('[data-system-control="difficulty"] [data-selected]')].map((b) => b.textContent)
    expect(selected()).toEqual(['EASY'])
    click([...dialog.querySelectorAll('[data-system-control="difficulty"] button')].find((b) => b.textContent === 'STANDARD')!)
    expect(selected()).toEqual(['STANDARD'])
    click(byText(/^DONE$/)!)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('[data-play-mode]')!.textContent).toBe('STANDARD')

    // And PLAY starts the mode it shows: through the briefing, a first
    // device's PLAY lands on turn 1 on STANDARD.
    click(container.querySelector('[data-play]')!)
    await settle()
    for (let i = 0; i < BEATS.length; i += 1) click(container.querySelector('[data-briefing-next]')!)
    await settle()
    expect(onBoard()).toBe(true)
    expect(autosave()!.state.difficulty, 'PLAY started another mode than it showed').toBe('standard')
  })
})

describe('GUARD R1 (b): no retired word on an R1 screen', () => {
  // An element's words, each text node apart: textContent runs one
  // element's last word into the next one's first, where a word-boundary
  // check finds nothing (found by GUARD R3 (f)'s mutation, v1.3 R3).
  const words = (el: Element) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const out: string[] = []
    while (walk.nextNode()) out.push(walk.currentNode.textContent ?? '')
    return out.join(' ')
  }
  const RETIRED: RegExp[] = [/\b(buy|buys|bought|purchas\w*|money|cart)\b/i, /\bMAI\b/, /\bRESOLVE\b/i]
  const offending = (text: string) => RETIRED.filter((re) => re.test(text)).map((re) => `${re} in "${text.match(re)![0]}"`)

  it('finds none on the title and its SYSTEM, or in any beat of the briefing', async () => {
    loadPage()
    const title = words(container)
    expect(title.length, 'the title rendered nothing, so this asserts nothing').toBeGreaterThan(100)
    expect(offending(title), 'a retired word on the title').toEqual([])
    click(buttons().find((b) => b.getAttribute('aria-haspopup') === 'dialog' && (b.textContent ?? '').trim() === 'SYSTEM')!)
    const system = words(container.querySelector('[role="dialog"]')!)
    expect(system).toMatch(/Replay a seed/i)
    expect(offending(system), "a retired word in the title's SYSTEM").toEqual([])

    act(() => root.unmount())
    root = createRoot(container)
    loadPage()
    click(container.querySelector('[data-play]')!)
    await settle()
    for (let i = 0; i < BEATS.length; i += 1) {
      const beat = words(container.querySelector('[data-briefing]')!)
      expect(beat).toContain(BEATS[i].caption[0])
      expect(offending(beat), `a retired word on briefing beat ${i + 1}`).toEqual([])
      click(container.querySelector('[data-briefing-next]')!)
    }
  })
})

describe("the title's menu (Ken's R2 notes, 22 October 2026)", () => {
  it('has no top bar: the ripple band leads, and SYSTEM is the last row of the menu, under READ', () => {
    loadPage()
    const title = container.querySelector('[data-title]')!
    // The ripple band is the title's first element; nothing sits above it.
    expect(title.firstElementChild!.className, 'something sits above the ripple band').toMatch(/\bh-28\b/)
    const system = buttons().filter((b) => (b.textContent ?? '').trim() === 'SYSTEM')
    expect(system, 'the title shows SYSTEM more than once, or not at all').toHaveLength(1)
    expect(system[0].hasAttribute('data-title-system')).toBe(true)
    expect(system[0].getAttribute('aria-haspopup')).toBe('dialog')
    // Under READ, and the last control before the key art.
    const read = container.querySelector('section[aria-label="Read"]')!
    expect(read.compareDocumentPosition(system[0]) & Node.DOCUMENT_POSITION_FOLLOWING, 'SYSTEM is not under READ').toBeTruthy()
    const controls = [...title.querySelectorAll('button')].filter((b) => !b.closest('section[aria-label="Key art"]'))
    expect(controls.at(-1), 'SYSTEM is not the last row of the menu').toBe(system[0])
  })

  it('keeps the board its own SYSTEM button', async () => {
    localStorage.setItem('dc-intro-seen', '1')
    loadPage()
    click(container.querySelector('[data-play]')!)
    await settle()
    expect(container.querySelector('[data-board] button[aria-label="System"]'), 'the board lost its SYSTEM').not.toBeNull()
  })
})

describe('the R1 fixes (Ken, iPhone, 21 October 2026)', () => {
  it('opens every screen at its top, Back to title included', async () => {
    // jsdom does not scroll, so the page's scroll offset is a value this
    // test sets and reads back.
    let top = 0
    Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => void (top = v) })
    try {
      loadPage()
      top = 900
      click(container.querySelector('[data-read="dossier"]')!)
      await settle()
      expect(container.querySelector('[data-screen="glossary"]')).not.toBeNull()
      expect(top, 'DOSSIER opened at the title scroll position').toBe(0)
      top = 700
      click(byText(/^Back to title$/)!)
      expect(onTitle()).toBe(true)
      expect(top, 'Back to title opened at the Glossary scroll position').toBe(0)
    } finally {
      delete (document.documentElement as unknown as Record<string, unknown>).scrollTop
    }
  })

  it('says CREDITS AND LICENSE, US spelling', () => {
    loadPage()
    click(buttons().find((b) => b.getAttribute('aria-haspopup') === 'dialog' && (b.textContent ?? '').trim() === 'SYSTEM')!)
    const text = container.querySelector('[role="dialog"]')!.textContent ?? ''
    expect(text).toMatch(/Credits and license/i)
    expect(text).not.toMatch(/licence/i)
  })

  it('opens the Glossary on its counted intro (G-065)', async () => {
    loadPage()
    click(container.querySelector('[data-read="dossier"]')!)
    await settle()
    const n = glossaryEntries().length
    expect(n).toBe(51)
    expect(container.textContent).toContain(
      `${n} entries: framework techniques, countermeasures with their SPARTA controls and tiers, and each threat and opportunity event.`,
    )
  })
})
