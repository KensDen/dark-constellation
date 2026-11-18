// @vitest-environment jsdom
//
// The front door (v1.3 R1, brief 5.1, 5.2 and section 3). Two guards:
//   GUARD R1 (a), THE FIRST-VISIT FLOW: a first-ever visit lands on the
//   title, and its PLAY opens the game on its briefing, on EASY. A later
//   PLAY skips the briefing, every PLAY draws a fresh seed, and a device
//   that has won a campaign starts on STANDARD. PLAY says which (its
//   [data-play-mode] line), and SYSTEM is the one place the difficulty
//   changes: the title's difficulty chip went in v1.3 R2 (Ken's ruling).
//   GUARD R1 (b), NO RETIRED WORD: nothing on an R1 screen (the title, its
//   SYSTEM, the briefing) says buy, purchase, money, MAI or RESOLVE (brief
//   section 4).
// The R1 fixes' SYSTEM bounds, scroll reset and tagline checks need a real
// layout engine and live in the battery (scripts/phone-layout.mjs). The
// fixes' flow checks are at the foot of this file.
//
// v2.0 R3: the game is the 3D game (the pixel board is retired). A test
// DOM has no WebGL, so past the title this file sees the 3D game's own
// fallback (tests/game3d.dom.spec.tsx holds it), and reads what an
// operation started with off its autosave, which the game writes as night
// 1's orders open and not while its briefing is still on. Walking the
// briefing itself needs the 3D world, so its words are read here as the
// data the opening prints (src/ui/three/copy3d.ts, OPENING).

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/TitleWorld', () => ({ default: () => null }))

import App from '../src/App'
import { DEFAULT_SCENARIO } from '../src/content'
import { INTRO_SEEN_KEY } from '../src/ui/introSeen'
import * as c3 from '../src/ui/three/copy3d'
import { MOVED_TO_STANDARD } from '../src/ui/session'
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
const inGame = () => container.querySelector('[data-game3d]') !== null
// The 3D game is a lazy chunk, and its rooms another: a few turns of the
// loop bring each in.
const settleFor = async (selector: string) => {
  for (let i = 0; i < 300 && !container.querySelector(selector); i += 1) await act(async () => new Promise((r) => setTimeout(r, 10)))
}
const settleGame = () => settleFor('[data-game3d]')
// The fallback's one way out.
const leaveGame = () => click([...container.querySelectorAll('[data-game3d] button')].find((b) => (b.textContent ?? '').trim() === c3.TITLE)!)
const autosave = () => JSON.parse(localStorage.getItem('dc-autosave') ?? 'null') as { state: { turn: number; difficulty: string; seed: number } } | null

describe('GUARD R1 (a): the first-visit flow', () => {
  it('goes from the title into the game on its briefing, with no menu in between, and a later PLAY goes straight to night 1 on EASY, on a fresh seed', async () => {
    loadPage()
    expect(onTitle(), 'a first visit did not land on the title').toBe(true)
    expect(inGame()).toBe(false)
    expect(container.querySelector('[data-play-mode]')!.textContent).toBe('EASY')

    click(container.querySelector('[data-play]')!)
    await settleGame()
    expect(inGame(), "a first device's PLAY did not open the game").toBe(true)
    expect(onTitle(), 'a menu or the title came between PLAY and the game').toBe(false)
    // On its briefing: night 1's orders, which write the autosave, have
    // not opened, and the briefing is not yet marked seen.
    expect(autosave(), "a first device's PLAY skipped the briefing").toBeNull()
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBeNull()
    leaveGame()
    expect(onTitle()).toBe(true)

    // A device that has been through the briefing: PLAY goes straight to
    // night 1.
    localStorage.setItem(INTRO_SEEN_KEY, '1')
    click(container.querySelector('[data-play]')!)
    await settleGame()
    expect(inGame()).toBe(true)
    const saved = autosave()
    expect(saved, 'a later PLAY replayed the briefing').not.toBeNull()
    expect(saved!.state.turn).toBe(1)
    expect(saved!.state.difficulty, 'a first device did not start on EASY').toBe('easy')
    leaveGame()
    expect(onTitle()).toBe(true)

    // And again, on a fresh seed. An operation is in progress now, so PLAY
    // asks first (v2.0 R5: it used to begin a new one at a tap, and the
    // night in progress was gone): KEEP IT leaves it, START NEW replaces it.
    click(container.querySelector('[data-play]')!)
    await settleGame()
    expect(inGame(), 'PLAY replaced an operation in progress without asking').toBe(false)
    const ask = () => container.querySelector('[data-confirm-play]')
    expect(ask()!.textContent).toContain('A new operation replaces the one in progress, on night 1.')
    click([...ask()!.querySelectorAll('button')].find((b) => b.textContent === 'KEEP IT')!)
    expect(ask()).toBeNull()
    expect(autosave()!.state.seed, 'KEEP IT did not keep it').toBe(saved!.state.seed)
    click(container.querySelector('[data-play]')!)
    click([...ask()!.querySelectorAll('button')].find((b) => b.textContent === 'START NEW')!)
    await settleGame()
    expect(inGame()).toBe(true)
    expect(autosave()!.state.seed, 'two PLAYs drew the same seed').not.toBe(saved!.state.seed)
  })

  it('starts on STANDARD once this device has finished a campaign', async () => {
    localStorage.setItem(
      'dc-scores',
      JSON.stringify([{ outcome: 'won', mai: 80, seed: 1, turnsSurvived: 6, totalTurns: 6, scenarioId: 'first-light', difficulty: 'easy', recordedAt: '2026-10-20T00:00:00Z' }]),
    )
    localStorage.setItem(INTRO_SEEN_KEY, '1')
    loadPage()
    expect(container.querySelector('[data-play-mode]')!.textContent).toBe('STANDARD')
    click(container.querySelector('[data-play]')!)
    await settleGame()
    expect(inGame()).toBe(true)
    expect(autosave()!.state.difficulty, 'PLAY started another mode than it showed').toBe('standard')
  })

  it('keeps EASY after a first campaign that was lost, and moves to STANDARD on a first win, saying so once (v1.5 R1)', () => {
    const entry = (outcome: 'won' | 'lost') => ({ outcome, mai: outcome === 'won' ? 80 : 60, seed: 1, turnsSurvived: 6, totalTurns: 6, scenarioId: 'first-light', difficulty: 'easy', recordedAt: '2026-10-20T00:00:00Z' })
    localStorage.setItem(INTRO_SEEN_KEY, '1')
    // A lost first Daily, and a lost free game: still EASY, and nothing said.
    localStorage.setItem('dc-daily', JSON.stringify({ '20261020': { n: 1, outcome: 'lost', lossReason: 'belowThreshold', mai: 64.3, turns: 6, recordedAt: '2026-10-20T00:00:00Z' } }))
    localStorage.setItem('dc-scores', JSON.stringify([entry('lost')]))
    loadPage()
    expect(container.querySelector('[data-play-mode]')!.textContent).toBe('EASY')
    expect(container.querySelector('[data-moved-to-standard]')).toBeNull()
    // A first win: STANDARD, and the title says why, once.
    localStorage.setItem('dc-scores', JSON.stringify([entry('won'), entry('lost')]))
    loadPage()
    expect(container.querySelector('[data-play-mode]')!.textContent).toBe('STANDARD')
    expect(container.querySelector('[data-moved-to-standard]')?.textContent).toBe(MOVED_TO_STANDARD)
    loadPage()
    expect(container.querySelector('[data-play-mode]')!.textContent).toBe('STANDARD')
    expect(container.querySelector('[data-moved-to-standard]'), 'the move to STANDARD was said twice').toBeNull()
  })

  it('offers STANDARD on the title the first time it shows after a first won campaign, with no reload (R6 question 14)', async () => {
    localStorage.setItem(INTRO_SEEN_KEY, '1')
    loadPage()
    expect(container.querySelector('[data-play-mode]')!.textContent).toBe('EASY')
    // A campaign finishes while the page stays loaded; then the title shows again.
    localStorage.setItem(
      'dc-scores',
      JSON.stringify([{ outcome: 'won', mai: 80, seed: 1, turnsSurvived: 6, totalTurns: 6, scenarioId: 'first-light', difficulty: 'easy', recordedAt: '2026-10-20T00:00:00Z' }]),
    )
    click(container.querySelector('[data-read="library"]')!)
    await settle()
    click(byText(/^BACK TO TITLE$/)!)
    await settle()
    expect(container.querySelector('[data-play-mode]')!.textContent).toBe('STANDARD')
  })

  it("says GOAL 1 is the last night's score, not every night's (v1.5 R1)", () => {
    // R6b's fresh eyes, item 9: "Keep the score at 70+" read as every turn,
    // where only the score at the end of the last one counts.
    loadPage()
    const goal = container.querySelector('[data-goal="1"]')!.textContent!.replace(/\u00a0/g, ' ')
    // "Finish": "End turn" is retired. The 3D game counts nights.
    expect(goal).toContain(`Finish night ${DEFAULT_SCENARIO.totalTurns} at ${DEFAULT_SCENARIO.winThreshold}+`)
    expect(goal).not.toMatch(/keep/i)
  })

  it('shows the mode PLAY starts, and changes it in SYSTEM only', async () => {
    // Past the briefing, so PLAY opens night 1 and the autosave says what
    // it started.
    localStorage.setItem(INTRO_SEEN_KEY, '1')
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

    // And PLAY starts the mode it shows.
    click(container.querySelector('[data-play]')!)
    await settleGame()
    expect(inGame()).toBe(true)
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

  it('finds none on the title and its SYSTEM, or in any beat of the briefing', () => {
    loadPage()
    const title = words(container)
    expect(title.length, 'the title rendered nothing, so this asserts nothing').toBeGreaterThan(100)
    expect(offending(title), 'a retired word on the title').toEqual([])
    click(buttons().find((b) => b.getAttribute('aria-haspopup') === 'dialog' && (b.textContent ?? '').trim() === 'SYSTEM')!)
    const system = words(container.querySelector('[role="dialog"]')!)
    expect(system).toMatch(/Replay a seed/i)
    expect(offending(system), "a retired word in the title's SYSTEM").toEqual([])

    // The briefing is the 3D game's opening, which a test DOM cannot
    // draw: its beats are read as the lines the opening prints, with its
    // speaker and its buttons.
    expect(c3.OPENING.length, 'the briefing has no beats, so this asserts nothing').toBeGreaterThan(2)
    c3.OPENING.forEach((beat, i) => {
      expect(beat.line.length, `briefing beat ${i + 1} says nothing`).toBeGreaterThan(20)
      expect(offending(`${beat.clock} ${beat.line}`), `a retired word on briefing beat ${i + 1}`).toEqual([])
    })
    expect(offending([c3.OPENING_SPEAKER, c3.OPENING_NEXT, c3.OPENING_GO, c3.OPENING_SKIP, c3.PHASE.opening].join(' · ')), "a retired word on the briefing's chrome").toEqual([])
  })
})

describe("the title's menu (Ken's R2 notes, 22 October 2026)", () => {
  it('has no top bar: the hero leads, and SYSTEM is the last row of the menu, under READ', () => {
    loadPage()
    const title = container.querySelector('[data-title]')!
    // The hero, with the title over it, is the title's first element
    // (v1.5 R2, where the ripple band was); nothing sits above it. Since
    // the desktop recomposition (29 October 2026) it leads the first
    // screen's wrapper, which leads the title. How the wrapper lays out
    // on a phone is the stylesheet's since v2.0 R3 (src/index.css), which
    // a test DOM does not load.
    const screen = title.firstElementChild!
    expect(screen.hasAttribute('data-title-screen'), 'something sits above the first screen').toBe(true)
    const lead = screen.firstElementChild!
    expect(lead.hasAttribute('data-key-art'), 'something sits above the hero').toBe(true)
    expect(lead.querySelector('h1'), 'the title is not over the hero').not.toBeNull()
    const system = buttons().filter((b) => (b.textContent ?? '').trim() === 'SYSTEM')
    expect(system, 'the title shows SYSTEM more than once, or not at all').toHaveLength(1)
    expect(system[0].hasAttribute('data-title-system')).toBe(true)
    expect(system[0].getAttribute('aria-haspopup')).toBe('dialog')
    // Under READ, and the title's last control.
    const read = container.querySelector('section[aria-label="Read"]')!
    expect(read.compareDocumentPosition(system[0]) & Node.DOCUMENT_POSITION_FOLLOWING, 'SYSTEM is not under READ').toBeTruthy()
    const controls = [...title.querySelectorAll('button')]
    expect(controls.at(-1), 'SYSTEM is not the last row of the menu').toBe(system[0])
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
      await settleFor('[data-t3-room="dossier"]')
      expect(container.querySelector('[data-t3-room="dossier"]')).not.toBeNull()
      expect(top, 'DOSSIER opened at the title scroll position').toBe(0)
      top = 700
      click(container.querySelector('[data-t3-room-back]')!)
      expect(onTitle()).toBe(true)
      expect(top, 'Back to title opened at the Dossier scroll position').toBe(0)
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
    // LIBRARY's second tab since v1.3 R4.
    loadPage()
    click(container.querySelector('[data-read="library"]')!)
    await settle()
    click(container.querySelector('[data-tab="glossary"]')!)
    await settle()
    const n = glossaryEntries().length
    expect(n).toBe(51)
    expect(container.textContent).toContain(
      `${n} entries: framework techniques, an NSA advisory, countermeasures with their SPARTA controls and tiers, and each threat and opportunity event.`,
    )
  })
})
