// @vitest-environment jsdom
//
// THE R2 BOARD'S GUARDS (v1.3 brief 5.3, 5.4 and section 4), each mutated
// once when it was written (files/*_v1.3_R2_Report_v1.0.md):
//   GUARD R2 (b), NO RETIRED WORD on the board or in PROCURE: buy,
//   purchase, money, cart, credits, MAI, Mission Assurance Index, RESOLVE,
//   forecast, aftermath and the other retired words of section 4's
//   vocabulary, over turn 1, a turn with the moves unnamed, PROCURE opened
//   from a move, the end of a turn and a Daily Op.
//   GUARD R2 (c), EVERY STATUS IS AN ICON AND A WORD (section 4 rule 8),
//   and none of them is a control (rule 2).
//   GUARD R2 (d), EXECUTE IS OFF BELOW ZERO, with the line that says why.
//   Since v1.5 R2 no tap reaches it (PROCURE refuses what the budget
//   cannot meet, and the brief, which TONIGHT's row once ordered without
//   refusing, is ordered there and locks), so it holds on a locked brief
//   over the balance, as a tampered save would carry.
//   GUARD R2 (e), PROCURE'S BADGE COUNTS QUEUED ORDERS: none before an
//   order (QC G-025), one per order, and fewer when one is cancelled.
// GUARD R2 (a), that the board fits 375x667 with no page scroll, needs a
// layout engine and lives in scripts/phone-layout.mjs.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { briefFree } from '../src/engine/rules'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { STATUS } from '../src/ui/board/boardModel'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { NO_OP, WIN_SCRIPT, debrisTurnOf } from './scripts'

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

// END OF TURN is the night's card since v1.3 R3, in the night's chunks:
// loaded once here, so the card is up a microtask after it is asked for.
beforeAll(async () => {
  await import('../src/ui/night/Night')
  await import('../src/ui/night/closeCards')
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('localStorage', memoryStorage())
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

function gameAt(turn: number, seed = 20260712): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing' && state.turn < turn) state = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
  return state
}

let mounts = 0
function render(state: GameState, phase: 'brief' | 'aftermath' = 'brief', daily?: { dateKey: string; n: number }) {
  mounts += 1
  act(() => {
    root.render(<Game key={`m${mounts}`} initial={{ state, phase, daily }} onExit={() => {}} />)
  })
}
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
const q = (sel: string) => container.querySelector(sel)
// The board's words, each text node apart: textContent runs one
// element's last word into the next one's first, where a word-boundary
// check finds nothing (found by GUARD R3 (f)'s mutation, v1.3 R3).
function board(): string {
  const walk = document.createTreeWalker(q('[data-board]')!, NodeFilter.SHOW_TEXT)
  const out: string[] = []
  while (walk.nextNode()) out.push(walk.currentNode.textContent ?? '')
  return out.join(' ')
}

describe('GUARD R2 (b): no retired word on the board or in PROCURE', () => {
  const RETIRED: [string, RegExp][] = [
    ['buy', /\b(buy|buys|bought)\b/i],
    ['purchase', /\bpurchas\w*/i],
    ['money', /\bmoney\b/i],
    ['cart', /\bcart\b/i],
    ['credits', /\bcredits?\b/i],
    ['MAI', /\bMAI\b/],
    ['Mission Assurance Index', /Mission Assurance Index/i],
    ['RESOLVE', /\bRESOLVE\b/],
    ['END TURN', /\bEND TURN\b/i],
    ['Hold to resolve', /Hold to resolve/i],
    ['forecast', /\bforecast\b/i],
    ['available', /\bavailable\b/i],
    ['mitigated', /\bmitigated\b/i],
    ['aftermath', /\baftermath\b/i],
    ['verdict', /\bverdict\b/i],
    ['INTEL ARCHIVE', /INTEL ARCHIVE/i],
    ['seed', /\bseed\b/i],
    ['slot', /\bslot\b/i],
    ['in this build', /in this build/i],
  ]
  const offending = (text: string) => RETIRED.filter(([, re]) => re.test(text)).map(([w, re]) => `${w} in "${text.match(re)![0]}"`)

  it('finds none on turn 1, on a turn whose moves are unnamed, in PROCURE, at the end of a turn and on a Daily Op', async () => {
    const seen: string[] = []
    const check = (where: string) => {
      const text = board()
      expect(text.length, `${where} rendered nothing`).toBeGreaterThan(200)
      seen.push(where)
      expect(offending(text), `a retired word on ${where}: ${text.slice(0, 4000)}`).toEqual([])
    }
    render(gameAt(1))
    check('turn 1')
    click(q('[data-move]')!)
    expect(q('[data-sheet="procure"]'), 'a move did not open PROCURE').not.toBeNull()
    check('PROCURE opened from a move')
    const unnamed = gameAt(3)
    expect(briefFree(unnamed), 'turn 3 has a free brief, so its moves are named').toBe(false)
    render(unnamed)
    expect(q('[data-move-unknown]'), 'no unnamed move on turn 3').not.toBeNull()
    check('turn 3, moves unnamed')
    render(gameAt(2), 'aftermath')
    await act(async () => {})
    await act(async () => {})
    check('the end of turn 1')
    render(gameAt(1), 'brief', { dateKey: '20261021', n: 25 })
    expect(q('[data-daily-tag]')?.textContent).toBe('DAILY OP #25')
    check('a Daily Op')
    expect(seen).toHaveLength(5)
  })
})

describe('GUARD R2 (c): every status is an icon and a word, and none is a control', () => {
  it('pairs every status on the board with its icon sprite and its word, outside any button border', () => {
    render(gameAt(1))
    // The key line and the move cards: at least EXPOSED and BLOCKED.
    const tags = [...container.querySelectorAll('[data-status]')]
    expect(tags.length, 'no status on the board').toBeGreaterThanOrEqual(4)
    for (const tag of tags) {
      const status = tag.getAttribute('data-status') as keyof typeof STATUS
      expect(STATUS[status], `an unknown status ${status}`).toBeDefined()
      expect(tag.querySelector(`svg[data-sprite="status-${status}"]`), `${status} has no icon`).not.toBeNull()
      expect(tag.textContent?.trim(), `${status} has no word`).toBe(STATUS[status].word)
      // Status never looks like a control: no border on the tag itself.
      expect(tag.className, `${status} is drawn like a control`).not.toMatch(/\bborder\b/)
      expect(tag.tagName, `${status} is a control`).not.toBe('BUTTON')
    }
    // Order a defense, so a third status (BLOCKED on a card) shows too.
    click(q('[data-move]')!)
    click(q('[data-procure-defense][data-match]')!)
    click(q('[data-confirm]')!)
    expect([...container.querySelectorAll('[data-move] [data-status]')].map((t) => t.getAttribute('data-status'))).toContain('blocked')
  })
})

// GUARD R7 (a), Ken's ruling on R6b's fresh eyes (item 11): with SSA owned
// the debris call is ANSWERED, its own icon and word, and says the burn is
// free; never BLOCKED or "is safe", since HOLD can still lose the
// satellite (src/engine/reducer.ts, the debris strike).
describe('GUARD R7 (a): the debris tile with SSA owned reads ANSWERED, never BLOCKED', () => {
  // The night of the call: turn 5 on this seed, which trades turns 4 and
  // 5 (v1.6 R1); turn 4 as written.
  const debrisTurn = () => {
    const at = debrisTurnOf(20260712)
    const state = gameAt(at)
    expect(state.turn, 'the run did not reach the debris turn').toBe(at)
    return state
  }
  const tile = () => q('[data-move="debris-conjunction"]')
  it('reads ANSWERED with its icon and says burn fuel is free when SSA is owned', () => {
    const state = debrisTurn()
    render({ ...state, counters: [...state.counters.filter((c) => c !== 'ssaManeuver'), 'ssaManeuver'] })
    const tag = tile()?.querySelector('[data-status]')
    expect(tag?.getAttribute('data-status')).toBe('answered')
    expect(tag?.textContent?.trim()).toBe(STATUS.answered.word)
    expect(tag?.querySelector('svg[data-sprite="status-answered"]'), 'ANSWERED has no icon').not.toBeNull()
    expect(tile()?.textContent).not.toMatch(/BLOCKED|is safe/)
    expect(q('[data-slot="fixed"]')?.textContent).toContain('burn fuel is free')
  })
  it('reads YOUR CALL without SSA, never EXPOSED or "defend ›", and shows no strength (v1.5 R1)', () => {
    const state = debrisTurn()
    render({ ...state, counters: state.counters.filter((c) => c !== 'ssaManeuver') })
    const status = tile()?.querySelector('[data-status]')
    expect(status?.getAttribute('data-status')).toBe('call')
    expect(status?.textContent?.trim()).toBe(STATUS.call.word)
    expect(tile()?.textContent, 'the debris tile offers a defense').not.toContain('defend ›')
    expect(tile()?.textContent, 'the debris tile shows a strength').not.toContain('STRENGTH')
    expect(q('[data-slot="fixed"]')?.textContent).toContain('your call when it arrives')
  })
})

describe('GUARD R2 (d): EXECUTE is off while REMAINING is below zero', () => {
  it('turns EXECUTE off with the reason when the orders cross zero, and leaves it on when they do not', () => {
    // Turn 3 with 5 CR left and the 8 CR brief locked on it: below zero.
    const price = DEFAULT_SCENARIO.prices.intelBrief
    render({ ...gameAt(3), credits: price - 3, briefRevealed: 3 })
    const execute = () => q('[data-execute]') as HTMLButtonElement
    expect(q('[data-remaining]')!.textContent).toBe('REMAINING -3 CR')
    expect(execute().disabled, 'EXECUTE is on below zero').toBe(true)
    expect(q('[data-over-budget]')!.textContent).toBe('Over budget. Cancel an order in PROCURE.')
    // The same brief with the budget to meet it.
    render({ ...gameAt(3), credits: price, briefRevealed: 3 })
    expect(q('[data-remaining]')!.textContent).toBe('REMAINING 0 CR')
    expect(execute().disabled, 'EXECUTE is off at zero').toBe(false)
    expect(q('[data-over-budget]')).toBeNull()
  })
})

describe('the hidden moves (R6 question 14)', () => {
  it('opens PROCURE at the intel brief from "reveal ›", from a hidden move, and from SECOND ORDERS, and says what to do', () => {
    // Turn 2, no free brief: SECOND ORDERS asks for the brief before any move.
    const second = gameAt(2)
    expect(briefFree(second), 'turn 2 has a free brief, so its moves are named').toBe(false)
    render(second)
    const order = q('[data-order="intel"]')
    expect(order, 'SECOND ORDERS does not ask for the intel brief while the moves are hidden').not.toBeNull()
    expect(order!.textContent).toContain(`Order an intel brief (${second.scenario.prices.intelBrief} CR) to name tonight's moves`)
    click(order!)
    const note = () => q('[data-sheet="procure"] [data-match-note]')?.textContent
    expect(note()).toBe(`Order an intel brief (${second.scenario.prices.intelBrief} CR) to name tonight's moves, then tap one to see what answers it.`)
    expect(q('[data-procure-intel]')!.hasAttribute('data-match'), 'the intel brief is not the highlighted order').toBe(true)
    // Ordered, the brief locks (v1.5 R2), and the note and the footer stop
    // asking for it or promising its cancel (the R2 review, finding 29).
    click(q('[data-sheet="procure"] button[data-procure-intel]')!)
    expect(q('[data-sheet="procure"] [data-match-note]'), 'the note still asks for the brief it locked').toBeNull()
    expect(q('[data-confirm] + p')!.textContent).toBe(`${second.scenario.prices.intelBrief} CR committed. The intel brief stays ordered.`)
    // A tap on a hidden move does the same.
    render(gameAt(3))
    click(q('[data-move-unknown]')!)
    expect(q('[data-sheet="procure"]'), 'a hidden move did not open PROCURE').not.toBeNull()
    expect(note()).toContain('Order an intel brief')
  })
})

describe("GUARD R2 (e): PROCURE's badge counts queued orders", () => {
  it('shows nothing until an order is queued (QC G-025), one per order, and fewer when one is cancelled', () => {
    render(gameAt(3))
    const badge = () => q('[data-order-badge]')
    expect(badge(), 'a badge before any order').toBeNull()
    // Opening PROCURE and closing it with nothing queued ticks nothing.
    click(q('[data-action="procure"]')!)
    click(q('[data-confirm]')!)
    expect(badge(), 'PROCURE opened and closed counted as an order').toBeNull()
    click(q('[data-action="procure"]')!)
    click(q('[data-procure-kind="drone"]')!)
    expect(badge()!.textContent).toBe('1')
    click(q('[data-procure-defense]:not([disabled])')!)
    expect(badge()!.textContent).toBe('2')
    click(q('[data-procure-intel]')!)
    expect(badge()!.textContent).toBe('3')
    expect(q('[data-confirm]')!.textContent).toBe('CONFIRM 3 ORDERS')
    click(q('[data-procure-kind="drone"]')!)
    expect(badge()!.textContent).toBe('2')
  })
})
