// @vitest-environment jsdom
//
// THE DAILY OP (v1.2 R5, brief 7.1), driven through the real App the way a
// player reaches it: the title, the game, six nights. What is asserted is
// what the device records: the ledger of official runs ('dc-daily'), the
// practice scores ('dc-scores') and the autosave's own mark.
//
// GUARD R5 (a), THE CENTRAL ONE: a Daily Op loaded from a pasted save code
// is never recorded as official. Also through a refresh, which is the
// laundering path: a pasted code is autosaved every night and resumed from
// the autosave, and the autosave must carry the mark. Its positive control
// is the same campaign resumed from this device's own autosave, which IS
// official.
// GUARD R5 (b): a second completion on the same date is PRACTICE.
// GUARD R5 (c): a run started at 23:50 and finished after midnight
// belongs to its start date.
// Also: with an operation in progress, DAILY OP asks before it replaces
// it, and a menu left open over midnight offers the new day's number.
//
// v2.0 R3: the game is the 3D game, and a test DOM has no WebGL, so its
// world never draws here and no control of a night can be tapped. A night
// is played the one way the 3D game plays one without its world: a night
// left in the middle is closed when the page loads again, with the answers
// given so far and the rest ridden out (src/ui/three/Game3D.tsx, on the
// mark src/ui/three/store3d.ts keeps). So each night here is that mark and
// a reload, and the game's own commit and finish do the recording. What
// only the debrief showed (the OFFICIAL or PRACTICE eyebrow, the share
// control, the outcome's save code) cannot be read here; the share text's
// first line is held by tests/share-text.spec.ts.
//
// Doubles: the three.js frame is stubbed (it renders only on the title),
// storage is an in-memory map, and the clock is vitest's fake one, which
// is what lets (c) cross midnight.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/TitleWorld', () => ({ default: () => null }))

import App from '../src/App'
import { dailySeed } from '../src/engine/daily'
import { resolveTurn } from '../src/engine/reducer'
import { playNight } from '../src/engine/responses'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { LocalStorageStore, captureGame, encodeSaveCode, runKey, type DailyOp } from '../src/persistence'
import { startDailyOp } from '../src/ui/dailyOp'
import { INTRO_SEEN_KEY } from '../src/ui/introSeen'
import { NO_INPUTS, NO_ORDERS, type NightInputs } from '../src/ui/three/gameModel'
import * as c3 from '../src/ui/three/copy3d'
import { markNight, progress } from '../src/ui/three/store3d'
import { DAILY_OPEN_LINE } from '../src/ui/titleStatus'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
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

// The game's chunk, loaded once, so React.lazy resolves on a microtask
// under the fake clock.
beforeAll(async () => {
  await import('../src/ui/three/Game3D')
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
  // Past the briefing, so an operation opens on night 1's orders, which
  // is where the game writes its autosave.
  localStorage.setItem(INTRO_SEEN_KEY, '1')
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
// The title's DAILY OP: its label is "DAILY OP", a drawn '#', and the
// number, with today's line under it.
const dailyEntry = () => container.querySelector('[data-daily]') as HTMLButtonElement | null
const dailyLabel = () => dailyEntry()?.querySelector('span')?.textContent ?? ''
const titleSystem = () => click(buttons().find((b) => b.getAttribute('aria-haspopup') === 'dialog' && (b.textContent ?? '').trim() === 'SYSTEM')!)
const ledger = () => JSON.parse(localStorage.getItem('dc-daily') ?? '{}') as Record<string, { n: number; seed: number; outcome: string; mai: number; turns: number; recordedAt: string }>
const onTitle = () => container.querySelector('[data-title]') !== null
// The 3D game, which here is its fallback: the world cannot start.
const inGame = () => container.querySelector('[data-game3d]') !== null
const settleGame = async () => {
  for (let i = 0; i < 20 && !inGame(); i += 1) await settle()
}
const leaveGame = () => click([...container.querySelectorAll('[data-game3d] button')].find((b) => (b.textContent ?? '').trim() === c3.TITLE)!)
// The operation in progress, as the device holds it.
const store = new LocalStorageStore()
const saved = () => store.loadAutosave()
const savedRaw = () => JSON.parse(localStorage.getItem('dc-autosave') ?? 'null')

// ONE NIGHT, AS A RELOAD CLOSES IT. The night of the operation in progress
// is marked as begun with no orders and these answers (none: every move
// ridden out, HOLD on the debris call, the policy engine's block left to
// stand), and the page is loaded again: the game resumes from the
// autosave, closes the night and either saves the next one or records the
// finished run. False when no operation is in progress.
async function closeNight(inputs: NightInputs = NO_INPUTS): Promise<boolean> {
  const op = saved()
  if (!op || op.state.status !== 'playing') return false
  const turn = op.state.turn
  markNight({ run: runKey(op.state.seed, op.state.difficulty, op.daily?.dateKey), turn, orders: NO_ORDERS, inputs })
  loadPage()
  await settleGame()
  expect(inGame(), 'the reload did not resume the operation').toBe(true)
  const next = saved()
  expect(next === null || next.state.turn === turn + 1, `night ${turn} was not closed by the reload`).toBe(true)
  return true
}
// To the end of the operation: nothing is left in progress, and the game
// counted a finish.
async function playToEnd(answers?: (string | null)[][]) {
  const finishedBefore = progress().finished
  for (let i = 0; i < 20; i += 1) {
    const op = saved()
    if (!op) break
    const responses = answers?.[op.state.turn - 1]
    await closeNight(responses ? { ...NO_INPUTS, responses } : NO_INPUTS)
  }
  expect(saved(), 'the operation never ended').toBeNull()
  expect(progress().finished, 'the game did not record a finish').toBe(finishedBefore + 1)
}
// Back on the title, as a page load after a finished run lands.
function toTitle() {
  loadPage()
  expect(onTitle(), 'a finished run did not leave the title free').toBe(true)
}
// Paste a code through the title's SYSTEM (v1.3 R1: the start screen and
// its paste box are retired).
async function paste(code: string) {
  titleSystem()
  const box = container.querySelector('textarea[aria-label="save code"]') as HTMLTextAreaElement | null
  expect(box, 'no paste box in SYSTEM').not.toBeNull()
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setValue.call(box!, code)
    box!.dispatchEvent(new Event('input', { bubbles: true }))
  })
  click(byText(/^load save code$/i)!)
  await settleGame()
  expect(inGame(), 'the code did not load').toBe(true)
}
// Today's Daily Op, some nights in, as the engine plays it.
function dailyInProgress(turns: number): { state: GameState; daily: DailyOp } {
  const op = startDailyOp(new Date())
  let state = op.state
  while (state.turn <= turns) state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
  expect(state.status, 'the campaign ended before the code was made').toBe('playing')
  return { state, daily: op.daily! }
}

describe('the title starts the Daily Op (v1.3 R1)', () => {
  it('offers DAILY OP #n from the epoch date on, as FIRST LIGHT on Standard from that date\'s seed', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 12, 0))
    loadPage()
    expect(onTitle(), 'not on the title').toBe(true)
    expect(dailyEntry(), 'a Daily Op offered before the first one').toBeNull()

    vi.setSystemTime(new Date(2026, 8, 28, 12, 0))
    loadPage()
    const entry = dailyEntry()
    expect(dailyLabel()).toBe('DAILY OP #2')
    click(entry!)
    await settleGame()
    expect(inGame(), 'DAILY OP did not start a campaign').toBe(true)
    const op = savedRaw()
    expect(op.scenarioId).toBe('first-light')
    expect(op.state.difficulty).toBe('standard')
    expect(op.state.seed).toBe(dailySeed(new Date(2026, 8, 28, 12, 0)))
    expect(op.daily).toEqual({ dateKey: '20260928', n: 2 })
  })

  it('asks before a Daily Op replaces an operation in progress', async () => {
    // A free campaign in progress, a night in, behind CONTINUE.
    loadPage()
    click(container.querySelector('[data-play]')!)
    await settleGame()
    await closeNight()
    const inProgress = localStorage.getItem('dc-autosave')
    expect(inProgress, 'nothing in progress, so nothing to protect').not.toBeNull()
    expect(JSON.parse(inProgress!).state.turn).toBe(2)
    leaveGame()
    expect(container.querySelector('[data-continue]'), 'not on the title with an operation in progress').not.toBeNull()

    const confirm = () => container.querySelector('[data-confirm-daily]')
    click(dailyEntry()!)
    expect(confirm(), 'DAILY OP started over the operation in progress without asking').not.toBeNull()
    await settle()
    expect(inGame()).toBe(false)
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
    await settleGame()
    expect(inGame(), 'START DAILY OP did not start it').toBe(true)
    expect(savedRaw().daily).toEqual({ dateKey: '20260927', n: 1 })
  })

  it('starts at once when nothing is in progress', async () => {
    loadPage()
    expect(container.querySelector('[data-continue]')).toBeNull()
    click(dailyEntry()!)
    await settleGame()
    expect(inGame()).toBe(true)
    expect(savedRaw().daily).toEqual({ dateKey: '20260927', n: 1 })
  })

  it("offers the new day's number when the menu is left open over midnight", async () => {
    vi.setSystemTime(new Date(2026, 8, 27, 23, 59, 58))
    loadPage()
    expect(dailyLabel()).toBe('DAILY OP #1')
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(dailyLabel(), 'the title still offers yesterday').toBe('DAILY OP #2')
    click(dailyEntry()!)
    await settleGame()
    expect(savedRaw().daily).toEqual({ dateKey: '20260928', n: 2 })
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
    await settleGame()
    expect(savedRaw().state.seed).toBe(dailySeed(new Date()))
    expect(savedRaw().daily, 'a typed seed became a Daily Op').toBeUndefined()
    await playToEnd()
    expect(ledger()).toEqual({})
    // It is a practice run, on the device's difficulty (EASY, a first
    // device's, R2), and the scoreboard's practice half has it.
    const scores = JSON.parse(localStorage.getItem('dc-scores') ?? '[]') as { seed: number; difficulty: string }[]
    expect(scores.map((e) => [e.seed, e.difficulty])).toEqual([[dailySeed(new Date()), 'easy']])
  })
})

describe('GUARD R5 (a): a Daily Op from a pasted save code is never official', () => {
  it('records nothing for a pasted Daily Op played to its end, through every refresh on the way', async () => {
    const { state, daily } = dailyInProgress(3)
    // Exported the ordinary way, on a device that played it: nothing in
    // the code says practice.
    const code = encodeSaveCode(captureGame(state, 'brief', new Date().toISOString(), daily))
    expect(JSON.parse(atob(code.slice('DC1-'.length))).daily).toEqual(daily)

    loadPage()
    await paste(code)
    // The autosave carries the mark, so a refresh cannot launder it: each
    // night from here is a refresh that resumes from that autosave.
    expect(savedRaw().daily).toEqual({ ...daily, pasted: true })
    expect(await closeNight()).toBe(true)
    expect(savedRaw().daily, 'a refresh dropped the pasted mark').toEqual({ ...daily, pasted: true })
    await playToEnd()

    expect(ledger()[daily.dateKey], 'a pasted save code was recorded as the official run').toBeUndefined()
    expect(ledger()).toEqual({})
    // And not as a practice score either: a Daily Op's result is the
    // ledger's or nobody's.
    expect(localStorage.getItem('dc-scores')).toBeNull()
  })

  // The slot path left with the named slots in v1.3 R1 (brief 5.8, M21: a
  // game is the autosave plus one code), so a pasted Daily Op has only the
  // two ways back that the guard above holds: the refresh and the code.

  it('(positive control) records the same campaign as official when it resumes from this device', async () => {
    const { state, daily } = dailyInProgress(3)
    localStorage.setItem('dc-autosave', JSON.stringify(captureGame(state, 'brief', new Date().toISOString(), daily)))
    loadPage()
    await settleGame()
    expect(inGame(), 'the autosave did not resume').toBe(true)
    await playToEnd()

    expect(ledger()[daily.dateKey]?.n, 'the ledger records nothing, so the guard above proves nothing').toBe(1)
  })
})

describe('GUARD R5 (b): the first finish of a date is official, and a second is practice', () => {
  it('records the first, keeps it, and does not record the replay', async () => {
    loadPage()
    click(dailyEntry()!)
    await settleGame()
    await playToEnd()
    const first = ledger()['20260927']
    expect(first?.n).toBe(1)

    // Back to the title, an hour on, and the same date's Daily Op again:
    // the title says today's is done and offers it as practice.
    vi.setSystemTime(new Date(MORNING.getTime() + 3_600_000))
    toTitle()
    expect(container.querySelector('[data-daily-line]')!.textContent).toMatch(/^DONE · /)
    expect(dailyEntry()!.textContent).toContain('REPLAY AS PRACTICE')
    click(dailyEntry()!)
    await settleGame()
    expect(inGame()).toBe(true)
    await playToEnd()
    expect(ledger()['20260927'], 'the replay replaced the official result').toEqual(first)
    expect(Object.keys(ledger())).toEqual(['20260927'])
  })
})

describe('GUARD R5 (c): a run belongs to the date it started', () => {
  it('files a run started at 23:50 under that date when it finishes after midnight', async () => {
    vi.setSystemTime(new Date(2026, 8, 27, 23, 50))
    loadPage()
    expect(dailyLabel()).toBe('DAILY OP #1')
    click(dailyEntry()!)
    await settleGame()
    // Two nights before midnight, then the clock runs past it.
    await closeNight()
    await closeNight()
    vi.setSystemTime(new Date(2026, 8, 28, 0, 30))
    // Still in play past midnight, with nothing filed yet: the claim below
    // is made after it.
    expect(saved()?.state.status, 'the run ended before midnight').toBe('playing')
    expect(ledger()).toEqual({})
    await playToEnd()

    expect(Object.keys(ledger()), 'the run was filed under the date it finished on').toEqual(['20260927'])
    expect(ledger()['20260927'].n).toBe(1)
    // It was the 27th's mission, and the 28th's is open now.
    expect(ledger()['20260927'].seed).toBe(dailySeed(new Date(2026, 8, 27, 12)))
    toTitle()
    expect(dailyLabel()).toBe('DAILY OP #2')
    expect(container.querySelector('[data-daily-line]')!.textContent).toBe(DAILY_OPEN_LINE)
  })
})

// THE ANSWERS AND THE OFFICIAL RESULT (v1.7 R1). A night's answers are
// part of the game: on this date the operation ridden out and the one
// answered end on different scores. The Daily's result is the one the
// player finished with, claimed once, when the last night is over.
describe("the Daily Op and the night's answers (v1.7 R1)", () => {
  // The same Daily as the engine plays it: no orders, and each night's
  // moves answered by `respond` or ridden out.
  const enginePlay = (respond: Parameters<typeof playNight>[2]): GameState => {
    let state = startDailyOp(new Date()).state
    while (state.status === 'playing') state = playNight(state, NO_OP, respond)
    return state
  }
  // Each night's answers as that game gave them, a move at a time.
  const answersOf = (played: GameState) => played.history.map((rec) => rec.events.map((e) => e.response?.id ?? null))
  const claims = () => vi.mocked(localStorage.setItem).mock.calls.filter(([key]) => key === 'dc-daily').length

  it('claims the answered result, once, at the end of the last night, and a replay with the same answers neither moves nor replaces it', async () => {
    const answered = enginePlay(sensible)
    const ridden = enginePlay(() => null)
    const last = answered.history[answered.history.length - 1]
    // What makes this date a test of it: the answers change the result, so
    // a result recorded without them would be seen to be the wrong one.
    expect(answersOf(answered).flat().some((id) => id !== null), 'no answer is taken on this date').toBe(true)
    expect(ridden.history[ridden.history.length - 1].maiScore).not.toBe(last.maiScore)

    vi.spyOn(localStorage, 'setItem')
    loadPage()
    click(dailyEntry()!)
    await settleGame()
    // Every night but the last: nothing is claimed while the operation is
    // still in play.
    for (let n = 0; n < answered.history.length - 1; n += 1) {
      expect(await closeNight({ ...NO_INPUTS, responses: answersOf(answered)[n] })).toBe(true)
      expect(claims(), `the Daily was claimed after night ${n + 1} of ${answered.history.length}`).toBe(0)
      expect(ledger()).toEqual({})
    }
    await playToEnd(answersOf(answered))
    expect(claims(), 'the Daily result was not claimed exactly once').toBe(1)
    const official = ledger()['20260927']
    expect(official.outcome).toBe(answered.status)
    expect(official.mai).toBe(last.maiScore)
    expect(official.turns).toBe(answered.history.length)

    // Again on the same date, an hour on, with the same answers: the
    // Dossier and the device's records have moved, and the result may not
    // move for it. It is practice, so the ledger keeps the first.
    vi.setSystemTime(new Date(MORNING.getTime() + 3_600_000))
    toTitle()
    click(dailyEntry()!)
    await settleGame()
    await playToEnd(answersOf(answered))
    expect(claims(), 'the replay claimed the date again').toBe(1)
    expect(ledger()['20260927'], 'the replay replaced the official result').toEqual(official)
  })
})
