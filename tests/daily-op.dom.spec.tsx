// @vitest-environment jsdom
//
// THE DAILY OP (v1.2 R5, brief 7.1), driven through the real App the way a
// player reaches it: the title, the board, six turns, the debrief.
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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { FILED_BEAT_MS } from '../src/ui/night/cards'
import { playNight } from '../src/engine/responses'
import { sensible } from './policies'
import { NO_OP } from './scripts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root
let unlisten: () => void
let mounts = 0

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
  // Reduced motion keeps the debrief still, so what it shows is
  // there at once; the reveal has its own suite. It also skips the
  // night's overlay, so its first stage arrives at once.
  setReducedMotion(true)
  answer = 'ride'
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
// The title's DAILY OP: its label is "DAILY OP", a drawn '#', and the
// number, with today's line under it.
const dailyEntry = () => container.querySelector('[data-daily]') as HTMLButtonElement | null
const dailyLabel = () => dailyEntry()?.querySelector('span')?.textContent ?? ''
const titleSystem = () => click(buttons().find((b) => b.getAttribute('aria-haspopup') === 'dialog' && (b.textContent ?? '').trim() === 'SYSTEM')!)
const ledger = () => JSON.parse(localStorage.getItem('dc-daily') ?? '{}') as Record<string, { n: number; turns: number }>
// The run's standing as the debrief's eyebrow says it (v1.3 R4, brief
// 5.6): "DAILY OP #1" for the official run, "DAILY OP #1 · PRACTICE" otherwise.
const standing = () => {
  const eyebrow = container.querySelector('[data-debrief-eyebrow]')?.textContent
  if (!eyebrow) return null
  return / · PRACTICE$/.test(eyebrow) ? 'PRACTICE' : /DAILY OP #\d+$/.test(eyebrow) ? 'OFFICIAL' : eyebrow
}
// The deciding board, which the debrief is not.
const onBoard = () => container.querySelector('main[data-board]') !== null
const openSystem = () => click(container.querySelector('button[aria-label="System"]')!)

// One turn through the controls: tap EXECUTE, tap the night through to
// END OF TURN, and move on with BEGIN TURN n+1, or DEBRIEF on the last.
// Since v1.3 Round 0 EXECUTE is a plain button (a synthetic keydown does
// not click one in jsdom, so it is clicked). Since v1.7 R1 the night is a
// decision: a move that would land stops on THE RESPONSE until a button is
// clicked (`answer` says which: ride every move out, or take the first
// response the budget can meet, which is tests/policies.ts's `sensible`),
// a move a defense stops is the block moment, ended here by its tap, and
// FILE TO DOSSIER files at once and goes on by itself after its FILED
// stamp's beat, which the fake clock is advanced past. HOLD on the debris
// call, CONTINUE and BEGIN are as before. Each tap is settled, since the
// night and its cards are chunks of their own. The control is there only
// while the turn is undecided, so its absence is the end of the campaign.
const executeControl = () => container.querySelector('button[data-execute]')
let answer: 'ride' | 'take' = 'ride'
async function tap(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
  await act(async () => {})
  // The FILED stamp stands for its beat, then the night goes on by itself.
  if (container.querySelector('[data-filed-stamp]')) {
    await act(async () => {
      vi.advanceTimersByTime(FILED_BEAT_MS + 80)
    })
    expect(container.querySelector('[data-filed-stamp]'), 'the FILED stamp never let the night go on').toBeNull()
  }
}
const responseCard = () => container.querySelector('[data-night-card="respond"] [data-responses]')
const responseButton = () => {
  const group = responseCard()
  if (!group) return null
  const fitting = answer === 'take' ? group.querySelector('button[data-response]:not([disabled]):not([data-response="ride"])') : null
  return fitting ?? group.querySelector('button[data-response="ride"]')
}
const wayOn = () =>
  responseButton() ??
  container.querySelector('button[data-strike-tap]') ??
  container.querySelector('[data-call="hold"]') ??
  container.querySelector('[data-collect]') ??
  container.querySelector('[data-continue]') ??
  container.querySelector('[data-night-card="end"] button[data-begin]')
// `each` is called on every stage of the night before its tap.
async function playTurn(each?: () => void): Promise<boolean> {
  const execute = executeControl()
  if (!execute) return false
  await tap(execute)
  for (let cards = 0; cards < 40; cards += 1) {
    const way = wayOn()
    expect(way, 'a card of the night has no way on').not.toBeNull()
    each?.()
    const last = way!.hasAttribute('data-begin')
    await tap(way!)
    if (last) break
  }
  return true
}
async function playToEnd() {
  for (let i = 0; i < 20 && (await playTurn()); i += 1);
  await settle()
  expect(container.querySelector('[data-debrief]'), 'the campaign never reached the debrief').not.toBeNull()
}
// What the share control hands the clipboard (jsdom has no share sheet).
async function sharedText(): Promise<string> {
  let copied = ''
  vi.stubGlobal('navigator', { clipboard: { writeText: async (t: string) => void (copied = t) } })
  const share = byText(/copy result/i)
  expect(share, 'the debrief has no share control').toBeDefined()
  await act(async () => {
    share!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
  expect(copied, 'the share control copied nothing').not.toBe('')
  return copied
}
// Paste a code through the title's SYSTEM (v1.3 R1: the start screen and
// its paste box are retired).
function paste(code: string) {
  titleSystem()
  const box = container.querySelector('textarea[aria-label="save code"]') as HTMLTextAreaElement | null
  expect(box, 'no paste box in SYSTEM').not.toBeNull()
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setValue.call(box!, code)
    box!.dispatchEvent(new Event('input', { bubbles: true }))
  })
  click(byText(/^load save code$/i)!)
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

describe('the title starts the Daily Op (v1.3 R1)', () => {
  it('offers DAILY OP #n from the epoch date on, as FIRST LIGHT on Standard from that date\'s seed', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 12, 0))
    loadPage()
    expect(container.querySelector('[data-title]'), 'not on the title').not.toBeNull()
    expect(dailyEntry(), 'a Daily Op offered before the first one').toBeNull()

    vi.setSystemTime(new Date(2026, 8, 28, 12, 0))
    loadPage()
    const entry = dailyEntry()
    expect(dailyLabel()).toMatch(/DAILY OP\s*2$/)
    expect(entry!.querySelector('svg[aria-label="#"]'), 'the number sign is not drawn').not.toBeNull()
    click(entry!)
    expect(onBoard(), 'DAILY OP did not start a campaign').toBe(true)
    const saved = JSON.parse(localStorage.getItem('dc-autosave')!)
    expect(saved.scenarioId).toBe('first-light')
    expect(saved.state.difficulty).toBe('standard')
    expect(saved.state.seed).toBe(dailySeed(new Date(2026, 8, 28, 12, 0)))
    expect(saved.daily).toEqual({ dateKey: '20260928', n: 2 })
  })

  it('asks before a Daily Op replaces an operation in progress', async () => {
    // A free campaign in progress, behind CONTINUE.
    loadPage()
    click(container.querySelector('[data-play]')!)
    await playTurn()
    const inProgress = localStorage.getItem('dc-autosave')
    expect(inProgress, 'nothing in progress, so nothing to protect').not.toBeNull()
    openSystem()
    click(byText(/^Back to title$/)!)
    click(byText(/^LEAVE$/)!)
    expect(container.querySelector('[data-continue]'), 'not on the title with an operation in progress').not.toBeNull()

    const confirm = () => container.querySelector('[data-confirm-daily]')
    click(dailyEntry()!)
    expect(confirm(), 'DAILY OP started over the operation in progress without asking').not.toBeNull()
    expect(onBoard()).toBe(false)
    expect(localStorage.getItem('dc-autosave')).toBe(inProgress)
    click(byText(/^KEEP IT$/)!)
    expect(confirm()).toBeNull()
    expect(localStorage.getItem('dc-autosave')).toBe(inProgress)

    // Asked again, and this time the answer is yes. (The menu's function
    // keys left with the menu in v1.3 R1.)
    click(dailyEntry()!)
    expect(confirm(), 'DAILY OP started without asking the second time').not.toBeNull()
    expect(localStorage.getItem('dc-autosave')).toBe(inProgress)
    click(byText(/^START DAILY OP$/)!)
    expect(onBoard(), 'START DAILY OP did not start it').toBe(true)
    expect(JSON.parse(localStorage.getItem('dc-autosave')!).daily).toEqual({ dateKey: '20260927', n: 1 })
  })

  it('starts at once when nothing is in progress', () => {
    loadPage()
    expect(container.querySelector('[data-continue]')).toBeNull()
    click(dailyEntry()!)
    expect(onBoard()).toBe(true)
  })

  it("offers the new day's number when the menu is left open over midnight", () => {
    vi.setSystemTime(new Date(2026, 8, 27, 23, 59, 58))
    loadPage()
    expect(dailyLabel()).toMatch(/DAILY OP\s*1$/)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(dailyLabel(), 'the title still offers yesterday').toMatch(/DAILY OP\s*2$/)
    click(dailyEntry()!)
    expect(JSON.parse(localStorage.getItem('dc-autosave')!).daily).toEqual({ dateKey: '20260928', n: 2 })
  })

  it('never makes a Daily Op of a free campaign on the same seed', async () => {
    loadPage()
    // SYSTEM's Replay a seed, where the seed field lives since v1.3 R1.
    titleSystem()
    const seed = container.querySelector('input[aria-label="seed"]') as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(seed, String(dailySeed(new Date())))
      seed.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(byText(/^PLAY THIS SEED$/)!)
    expect(JSON.parse(localStorage.getItem('dc-autosave')!).daily, 'a typed seed became a Daily Op').toBeUndefined()
    await playToEnd()
    expect(ledger()).toEqual({})
    // Free play's eyebrow names no Daily Op, and its share text is practice
    // on the device's difficulty (EASY, a first device's, R2).
    expect(container.querySelector('[data-debrief-eyebrow]')?.textContent).toBe('DEBRIEF · OP FIRST LIGHT · PRACTICE')
    expect((await sharedText()).split('\n')[0]).toBe('DARK CONSTELLATION · Practice · Easy')
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
    paste(code)
    await playTurn()
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

  // The slot path left with the named slots in v1.3 R1 (brief 5.8, M21: a
  // game is the autosave plus one code), so a pasted Daily Op has only the
  // two ways back that the guards above hold: the refresh and the code.

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

    // Back to the title, and the same date's Daily Op again.
    click(byText(/^BACK TO TITLE$/)!)
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
    expect(dailyLabel()).toMatch(/DAILY OP\s*1$/)
    click(dailyEntry()!)
    // Two turns before midnight, then the clock runs past it.
    await playTurn()
    await playTurn()
    vi.setSystemTime(new Date(2026, 8, 28, 0, 30))
    // Still in play past midnight, with nothing filed yet: the claim below
    // is made after it.
    expect(executeControl(), 'the run ended before midnight').not.toBeNull()
    expect(ledger()).toEqual({})
    await playToEnd()

    expect(Object.keys(ledger()), 'the run was filed under the date it finished on').toEqual(['20260927'])
    expect(ledger()['20260927'].n).toBe(1)
    expect(standing()).toBe('OFFICIAL')
    expect((await sharedText()).split('\n')[0]).toBe('DARK CONSTELLATION · Daily Op #1')
    // It was the 27th's mission, and the 28th's is open now.
    const code = (container.querySelector('[data-outcome-save-code]') as HTMLTextAreaElement).value
    expect(decodeSaveCode(code).state.seed).toBe(dailySeed(new Date(2026, 8, 27, 12)))
    expect(container.querySelector('[data-countdown]')?.textContent).toBe('DAILY OP #2 IS OPEN NOW')
  })
})

// THE RESPONSE AND THE OFFICIAL RESULT (v1.7 R1). EXECUTE commits the last
// turn with every move ridden out, which on this date is a lost operation;
// the player's answers on that night make it a won one. The Daily's result
// is the one the player finished with, claimed once every choice is made,
// never the ridden-out one claimed while a response is still on screen.
describe('the Daily Op and the night\'s responses (v1.7 R1)', () => {
  // The same Daily as the engine plays it: no orders, and each night's
  // moves answered by `sensible` or ridden out.
  const enginePlay = (respond: Parameters<typeof playNight>[2]): GameState => {
    let state = startDailyOp(new Date()).state
    while (state.status === 'playing') state = playNight(state, NO_OP, respond)
    return state
  }
  const claims = () => vi.mocked(localStorage.setItem).mock.calls.filter(([key]) => key === 'dc-daily').length
  const outcomeState = () => decodeSaveCode((container.querySelector('[data-outcome-save-code]') as HTMLTextAreaElement).value).state

  it('claims nothing while a response is open on the last night, and claims the answered result once after it', async () => {
    const answeredRun = enginePlay(sensible)
    const ridden = enginePlay(() => null)
    const lastTurn = answeredRun.history.length
    const lastNight = answeredRun.history[lastTurn - 1]
    // What makes this date a test of it: the last night's answer changes the
    // result, so a claim made at EXECUTE would be seen to be the wrong one.
    expect(lastNight.events.some((e) => e.response), 'no response is taken on the last night of this date').toBe(true)
    expect(ridden.history[ridden.history.length - 1].maiScore).not.toBe(lastNight.maiScore)

    vi.spyOn(localStorage, 'setItem')
    answer = 'take'
    loadPage()
    click(dailyEntry()!)
    let turn = 0
    let askedOnLastNight = 0
    let resultsOnLastNight = 0
    for (; turn < 20; turn += 1) {
      const played = await playTurn(() => {
        if (turn + 1 !== lastTurn) return
        if (responseCard()) {
          askedOnLastNight += 1
          expect(ledger(), 'the Daily was claimed while a response was still open on the last night').toEqual({})
          expect(claims()).toBe(0)
        } else if (askedOnLastNight === lastNight.events.filter((e) => e.room !== undefined).length) {
          // Every choice of the last night is made: the result is in, before
          // END OF TURN and before DEBRIEF is tapped.
          resultsOnLastNight += 1
          expect(ledger()['20260927'], 'the Daily was not claimed once the last response was answered').toBeDefined()
        }
      })
      if (!played) break
    }
    await settle()
    expect(turn, 'the board played another number of turns than the engine').toBe(lastTurn)
    expect(askedOnLastNight, 'the last night never asked for a response').toBe(lastNight.events.filter((e) => e.room !== undefined).length)
    expect(resultsOnLastNight, 'nothing was looked at after the last answer').toBeGreaterThan(0)

    expect(container.querySelector('[data-debrief]'), 'the campaign never reached the debrief').not.toBeNull()
    expect(claims(), 'the Daily result was not claimed exactly once').toBe(1)
    const entry = ledger()['20260927'] as unknown as { outcome: string; mai: number; turns: number }
    expect(entry.outcome).toBe(answeredRun.status)
    expect(entry.mai).toBe(lastNight.maiScore)
    expect(entry.turns).toBe(lastTurn)
    expect(standing()).toBe('OFFICIAL')
  })

  it('ends the same Daily the same way twice: same orders and same responses, the engine\'s own result', async () => {
    const expected = enginePlay(sensible)
    answer = 'take'
    loadPage()
    click(dailyEntry()!)
    await playToEnd()
    const first = outcomeState()
    const official = ledger()['20260927']
    expect(first.status).toBe(expected.status)
    expect(first.history).toEqual(JSON.parse(JSON.stringify(expected.history)))

    // Again on the same date: the Dossier now holds every card, so the
    // night shows other cards (CONTINUE, no FILE TO DOSSIER), and the
    // engine's result may not move for it.
    click(byText(/^BACK TO TITLE$/)!)
    click(dailyEntry()!)
    await playToEnd()
    expect(outcomeState().history, 'the same Daily with the same answers ended another way').toEqual(first.history)
    expect(standing()).toBe('PRACTICE')
    expect(ledger()['20260927'], 'the replay replaced the official result').toEqual(official)

    // And the answers are part of it: ridden out, this date ends otherwise.
    answer = 'ride'
    click(byText(/^BACK TO TITLE$/)!)
    click(dailyEntry()!)
    await playToEnd()
    const ridden = enginePlay(() => null)
    expect(outcomeState().history.at(-1)!.maiScore).toBe(ridden.history.at(-1)!.maiScore)
    expect(outcomeState().history.at(-1)!.maiScore).not.toBe(first.history.at(-1)!.maiScore)
  })
})
