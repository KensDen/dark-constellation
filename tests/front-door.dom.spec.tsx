// @vitest-environment jsdom
//
// The front door (v1.3 R1, brief 5.1, 5.2 and section 3). Two guards:
//   GUARD R1 (a), THE FIRST-VISIT FLOW: a first-ever visit lands on the
//   title, and its PLAY goes through the briefing to turn 1 with no menu in
//   between, on EASY. A later PLAY skips the briefing, every PLAY draws a
//   fresh seed, and a device that has finished a campaign starts on
//   STANDARD.
//   GUARD R1 (b), NO RETIRED WORD: nothing on an R1 screen (the title, its
//   SYSTEM, the briefing) says buy, purchase, money, MAI or RESOLVE (brief
//   section 4).
// The third R1 guard, that the briefing fits one phone screen with
// CONTINUE showing, needs a real layout engine and lives in the battery
// (scripts/briefing-fit.mjs).

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import App from '../src/App'
import { BEATS } from '../src/ui/coldOpenSlides'
import { INTRO_SEEN_KEY } from '../src/ui/introSeen'
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
    expect(container.querySelector('[data-difficulty-chip]')!.textContent).toBe('EASY')

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

    // A later PLAY goes straight to turn 1, on a fresh seed.
    click(container.querySelector('button[aria-label="System"]')!)
    click(byText(/^Back to title$/)!)
    expect(onTitle()).toBe(true)
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
    loadPage()
    expect(container.querySelector('[data-difficulty-chip]')!.textContent).toBe('STANDARD')
  })
})

describe('GUARD R1 (b): no retired word on an R1 screen', () => {
  const RETIRED: RegExp[] = [/\b(buy|buys|bought|purchas\w*|money|cart)\b/i, /\bMAI\b/, /\bRESOLVE\b/i]
  const offending = (text: string) => RETIRED.filter((re) => re.test(text)).map((re) => `${re} in "${text.match(re)![0]}"`)

  it('finds none on the title and its SYSTEM, or in any beat of the briefing', async () => {
    loadPage()
    const title = container.textContent ?? ''
    expect(title.length, 'the title rendered nothing, so this asserts nothing').toBeGreaterThan(100)
    expect(offending(title), 'a retired word on the title').toEqual([])
    click(buttons().find((b) => b.getAttribute('aria-haspopup') === 'dialog' && (b.textContent ?? '').trim() === 'SYSTEM')!)
    const system = container.querySelector('[role="dialog"]')!.textContent ?? ''
    expect(system).toMatch(/Replay a seed/i)
    expect(offending(system), "a retired word in the title's SYSTEM").toEqual([])

    act(() => root.unmount())
    root = createRoot(container)
    loadPage()
    click(container.querySelector('[data-play]')!)
    await settle()
    for (let i = 0; i < BEATS.length; i += 1) {
      const beat = container.querySelector('[data-briefing]')!.textContent ?? ''
      expect(beat).toContain(BEATS[i].caption[0])
      expect(offending(beat), `a retired word on briefing beat ${i + 1}`).toEqual([])
      click(container.querySelector('[data-briefing-next]')!)
    }
  })
})
