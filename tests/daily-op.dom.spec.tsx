// @vitest-environment jsdom
//
// THE DAILY OP (v1.2 R5, brief 7.1), driven through the real App the way a
// player reaches it: the menu, the board, twelve turns, the score screen.
// What is asserted is what the device records (the ledger of official
// runs, 'dc-daily') and what the player sees and shares (the OFFICIAL or
// PRACTICE mark and the share text's first line).
//
// GUARD R5 (a), THE CENTRAL ONE: a Daily Op loaded from a pasted save code
// is never recorded as official, and its share text says practice. Also
// through a refresh, which is the laundering path: a pasted code is
// autosaved every turn and resumed from the autosave, and the autosave
// must carry the mark. Its positive control is the same campaign resumed
// from this device's own autosave, which IS official.
// GUARD R5 (b): a second completion on the same date is PRACTICE.
// GUARD R5 (c): a run started at 23:50 and finished after midnight
// belongs to its start date.
// Also: with an operation in progress, DAILY OP asks before it replaces
// it, and a menu left open over midnight offers the new day's number.
//
// Doubles, as game.dom.spec.tsx names them: the three.js frame is stubbed
// (it renders only on the start screen), storage is an in-memory map, and
// the clock is vitest's fake one, which is what lets (c) cross midnight.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import App from '../src/App'
import { dailySeed } from '../src/engine/daily'
import { resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { captureGame, decodeSaveCode, encodeSaveCode, type DailyOp } from '../src/persistence'
import { startDailyOp } from '../src/ui/dailyOp'
import { INTRO_SEEN_KEY } from '../src/ui/introSeen'
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

function setReducedMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
}

// 10:00 local on Daily Op #1's date, unless a test sets its own.
const MORNING = new Date(2026, 8, 27, 10, 0)

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.setSystemTime(MORNING)
  vi.stubGlobal('localStorage', memoryStorage())
  localStorage.setItem(INTRO_SEEN_KEY, '1')
  // Reduced motion keeps the score screen still, so what it shows is
  // there at once; the reveal has its own suite.
  setReducedMotion(true)
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// A fresh App each call, as a page load is.
function loadPage() {
  mounts += 1
  act(() => {
    root.render(<App key={`page${mounts}`} />)
  })
}
const buttons = () => [...container.querySelectorAll('button')]
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ''))
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
const settle = () =>
  act(async () => {
    await vi.dynamicImportSettled()
  })
// The menu entry's label is "DAILY OP", a drawn '#', and the number.
const dailyEntry = () => byText(/DAILY OP/)
const ledger = () => JSON.parse(localStorage.getItem('dc-daily') ?? '{}') as Record<string, { n: number; turns: number }>
const standing = () => container.querySelector('[data-standing]')?.textContent ?? null
const onBoard = () => container.querySelector('[aria-label^="Credits"]') !== null
const openSystem = () => click(container.querySelector('button[aria-label="System"]')!)
const press = (key: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })

// One turn through the controls: hold to resolve (the keyboard path
// commits at once), run the playback out, and move on.
function playTurn(): boolean {
  const hold = byText(/Hold to resolve/i)
  if (!hold) return false
  act(() => {
    hold.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  act(() => {
    vi.advanceTimersByTime(60_000)
  })
  const next = byText(/^NEXT TURN|^FINAL REPORT/)
  if (next) click(next)
  return true
}
async function playToEnd() {
  for (let i = 0; i < 20 && playTurn(); i += 1);
  await settle()
  expect(container.querySelector('[data-score-screen]'), 'the campaign never reached the score screen').not.toBeNull()
}
// What the share control hands the clipboard (jsdom has no share sheet).
async function sharedText(): Promise<string> {
  let copied = ''
  vi.stubGlobal('navigator', { clipboard: { writeText: async (t: string) => void (copied = t) } })
  const share = byText(/copy result/i)
  expect(share, 'the score screen has no share control').toBeDefined()
  await act(async () => {
    share!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
  expect(copied, 'the share control copied nothing').not.toBe('')
  return copied
}
function paste(code: string) {
  const box = container.querySelector('textarea[aria-label="save code"]') as HTMLTextAreaElement | null
  expect(box, 'no paste box on the start screen').not.toBeNull()
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setValue.call(box!, code)
    box!.dispatchEvent(new Event('input', { bubbles: true }))
  })
  click(byText(/load from code/i)!)
  expect(onBoard(), 'the code did not load').toBe(true)
}
// Today's Daily Op, some turns in, as the engine plays it.
function dailyInProgress(turns: number): { state: GameState; daily: DailyOp } {
  const op = startDailyOp(new Date())
  let state = op.state
  while (state.turn <= turns) state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
  expect(state.status, 'the campaign ended before the code was made').toBe('playing')
  return { state, daily: op.daily! }
}

describe('the menu starts the Daily Op', () => {
  it('offers DAILY OP #n from the epoch date on, as FIRST LIGHT on Standard from that date\'s seed', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 12, 0))
    loadPage()
    expect(byText(/NEW OPERATION/), 'not on the menu').toBeDefined()
    expect(dailyEntry(), 'a Daily Op offered before the first one').toBeUndefined()

    vi.setSystemTime(new Date(2026, 8, 28, 12, 0))
    loadPage()
    const entry = dailyEntry()
    expect(entry?.textContent).toMatch(/DAILY OP\s*2$/)
    expect(entry!.querySelector('svg[aria-label="#"]'), 'the number sign is not drawn').not.toBeNull()
    click(entry!)
    expect(onBoard(), 'DAILY OP did not start a campaign').toBe(true)
    const saved = JSON.parse(localStorage.getItem('dc-autosave')!)
    expect(saved.scenarioId).toBe('first-light')
    expect(saved.state.difficulty).toBe('standard')
    expect(saved.state.seed).toBe(dailySeed(new Date(2026, 8, 28, 12, 0)))
    expect(saved.daily).toEqual({ dateKey: '20260928', n: 2 })
  })

  it('asks before a Daily Op replaces an operation in progress, by tap or by key', () => {
    // A free campaign in progress, behind RESUME.
    loadPage()
    click(byText(/NEW OPERATION/)!)
    click(byText(/start campaign/i)!)
    playTurn()
    const inProgress = localStorage.getItem('dc-autosave')
    expect(inProgress, 'nothing in progress, so nothing to protect').not.toBeNull()
    openSystem()
    click(byText(/^Back to menu$/)!)
    expect(byText(/RESUME OPERATION/), 'not on the menu with an operation in progress').toBeDefined()

    const confirm = () => container.querySelector('[data-confirm-daily]')
    click(dailyEntry()!)
    expect(confirm(), 'DAILY OP started over the operation in progress without asking').not.toBeNull()
    expect(onBoard()).toBe(false)
    expect(localStorage.getItem('dc-autosave')).toBe(inProgress)
    click(byText(/^KEEP IT$/)!)
    expect(confirm()).toBeNull()
    expect(localStorage.getItem('dc-autosave')).toBe(inProgress)

    // Its function key asks the same, and a second press is the answer.
    const key = dailyEntry()!.querySelector('span')!.textContent!
    press(key)
    expect(confirm(), `${key} started a Daily Op without asking`).not.toBeNull()
    expect(localStorage.getItem('dc-autosave')).toBe(inProgress)
    click(byText(/^START DAILY OP$/)!)
    expect(onBoard(), 'START DAILY OP did not start it').toBe(true)
    expect(JSON.parse(localStorage.getItem('dc-autosave')!).daily).toEqual({ dateKey: '20260927', n: 1 })
  })

  it('starts at once when nothing is in progress', () => {
    loadPage()
    expect(byText(/RESUME OPERATION/)).toBeUndefined()
    click(dailyEntry()!)
    expect(onBoard()).toBe(true)
  })

  it("offers the new day's number when the menu is left open over midnight", () => {
    vi.setSystemTime(new Date(2026, 8, 27, 23, 59, 58))
    loadPage()
    expect(dailyEntry()?.textContent).toMatch(/DAILY OP\s*1$/)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(dailyEntry()?.textContent, 'the menu still offers yesterday').toMatch(/DAILY OP\s*2$/)
    click(dailyEntry()!)
    expect(JSON.parse(localStorage.getItem('dc-autosave')!).daily).toEqual({ dateKey: '20260928', n: 2 })
  })

  it('never makes a Daily Op of a free campaign on the same seed', async () => {
    loadPage()
    click(byText(/NEW OPERATION/)!)
    const seed = container.querySelector('input[aria-label="game seed"]') as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(seed, String(dailySeed(new Date())))
      seed.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(byText(/start campaign/i)!)
    expect(JSON.parse(localStorage.getItem('dc-autosave')!).daily, 'a typed seed became a Daily Op').toBeUndefined()
    await playToEnd()
    expect(ledger()).toEqual({})
    expect(standing()).toBeNull()
    expect((await sharedText()).split('\n')[0]).toMatch(/^DARK CONSTELLATION: MISSION (ASSURED|FAILED)$/)
  })
})

describe('GUARD R5 (a): a Daily Op from a pasted save code is never official', () => {
  it('records nothing for a pasted Daily Op played to its end, and shares it as practice', async () => {
    const { state, daily } = dailyInProgress(3)
    // Exported the ordinary way, on a device that played it: nothing in
    // the code says practice.
    const code = encodeSaveCode(captureGame(state, 'brief', new Date().toISOString(), daily))
    expect(JSON.parse(atob(code.slice('DC1-'.length))).daily).toEqual(daily)

    loadPage()
    click(byText(/NEW OPERATION/)!)
    paste(code)
    await playToEnd()

    expect(ledger()[daily.dateKey], 'a pasted save code was recorded as the official run').toBeUndefined()
    expect(standing()).toBe('PRACTICE')
    expect((await sharedText()).split('\n')[0]).toBe('DARK CONSTELLATION · Daily Op #1 (practice)')
    // And the code it hands on is marked too.
    const box = container.querySelector('[data-outcome-save-code]') as HTMLTextAreaElement
    expect(JSON.parse(atob(box.value.slice('DC1-'.length))).daily).toEqual({ ...daily, pasted: true })
  })

  it('records nothing for a pasted Daily Op resumed after a refresh', async () => {
    const { state, daily } = dailyInProgress(3)
    const code = encodeSaveCode(captureGame(state, 'brief', new Date().toISOString(), daily))
    loadPage()
    click(byText(/NEW OPERATION/)!)
    paste(code)
    playTurn()
    // A refresh: the page loads again and resumes from the autosave.
    act(() => root.unmount())
    root = createRoot(container)
    loadPage()
    expect(onBoard(), 'the refresh did not resume the campaign').toBe(true)
    await playToEnd()

    expect(ledger()[daily.dateKey], 'a refresh laundered a pasted code into the official run').toBeUndefined()
    expect(standing()).toBe('PRACTICE')
    expect((await sharedText()).split('\n')[0]).toBe('DARK CONSTELLATION · Daily Op #1 (practice)')
  })

  it('records nothing for a pasted Daily Op saved to a slot and loaded from it', async () => {
    const { state, daily } = dailyInProgress(3)
    const code = encodeSaveCode(captureGame(state, 'brief', new Date().toISOString(), daily))
    loadPage()
    click(byText(/NEW OPERATION/)!)
    paste(code)
    openSystem()
    click(byText(/^Save$/)!)
    click(byText(/^Back to menu$/)!)
    // Somewhere else first, so the slot is what brings it back.
    localStorage.removeItem('dc-autosave')
    loadPage()
    click(byText(/NEW OPERATION/)!)
    const load = byText(/^load$/)
    expect(load, 'no slot to load').toBeDefined()
    click(load!)
    expect(onBoard(), 'the slot did not load').toBe(true)
    await playToEnd()

    expect(ledger()[daily.dateKey], 'a slot laundered a pasted code into the official run').toBeUndefined()
    expect(standing()).toBe('PRACTICE')
    expect((await sharedText()).split('\n')[0]).toBe('DARK CONSTELLATION · Daily Op #1 (practice)')
  })

  it('(positive control) records the same campaign as official when it resumes from this device', async () => {
    const { state, daily } = dailyInProgress(3)
    localStorage.setItem('dc-autosave', JSON.stringify(captureGame(state, 'brief', new Date().toISOString(), daily)))
    loadPage()
    expect(onBoard(), 'the autosave did not resume').toBe(true)
    await playToEnd()

    expect(ledger()[daily.dateKey]?.n, 'the ledger records nothing, so the guards above prove nothing').toBe(1)
    expect(standing()).toBe('OFFICIAL')
    expect((await sharedText()).split('\n')[0]).toBe('DARK CONSTELLATION · Daily Op #1')
  })
})

describe('GUARD R5 (b): the first finish of a date is official, and a second is practice', () => {
  it('records the first, keeps it, and marks the replay PRACTICE', async () => {
    loadPage()
    click(dailyEntry()!)
    await playToEnd()
    expect(standing()).toBe('OFFICIAL')
    const first = ledger()['20260927']
    expect(first?.n).toBe(1)
    expect((await sharedText()).split('\n')[0]).toBe('DARK CONSTELLATION · Daily Op #1')

    // Back to the menu, and the same date's Daily Op again.
    click(byText(/^BACK TO MENU$/)!)
    click(dailyEntry()!)
    expect(onBoard()).toBe(true)
    await playToEnd()
    expect(standing(), 'a second finish on the same date was marked official').toBe('PRACTICE')
    expect(ledger()['20260927'], 'the replay replaced the official result').toEqual(first)
    expect((await sharedText()).split('\n')[0]).toBe('DARK CONSTELLATION · Daily Op #1 (practice)')
  })
})

describe('GUARD R5 (c): a run belongs to the date it started', () => {
  it('files a run started at 23:50 under that date when it finishes after midnight', async () => {
    vi.setSystemTime(new Date(2026, 8, 27, 23, 50))
    loadPage()
    expect(dailyEntry()?.textContent).toMatch(/DAILY OP\s*1$/)
    click(dailyEntry()!)
    // Two turns before midnight, then the clock runs past it.
    playTurn()
    playTurn()
    vi.setSystemTime(new Date(2026, 8, 28, 0, 30))
    // Still in play past midnight, with nothing filed yet: the claim below
    // is made after it.
    expect(byText(/Hold to resolve/i), 'the run ended before midnight').toBeDefined()
    expect(ledger()).toEqual({})
    await playToEnd()

    expect(Object.keys(ledger()), 'the run was filed under the date it finished on').toEqual(['20260927'])
    expect(ledger()['20260927'].n).toBe(1)
    expect(standing()).toBe('OFFICIAL')
    expect((await sharedText()).split('\n')[0]).toBe('DARK CONSTELLATION · Daily Op #1')
    // It was the 27th's mission, and the 28th's is open now.
    const code = (container.querySelector('[data-outcome-save-code]') as HTMLTextAreaElement).value
    expect(decodeSaveCode(code).state.seed).toBe(dailySeed(new Date(2026, 8, 27, 12)))
    expect(container.querySelector('[data-countdown]')?.textContent).toMatch(/DAILY OP\s*2 IS OPEN NOW/)
  })
})
