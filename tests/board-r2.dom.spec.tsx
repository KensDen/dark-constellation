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
//   GUARD R2 (d), EXECUTE IS OFF BELOW ZERO, with the line that says why,
//   and on again when the order that crossed zero is cancelled.
//   GUARD R2 (e), PROCURE'S BADGE COUNTS QUEUED ORDERS: none before an
//   order (QC G-025), one per order, and fewer when one is cancelled.
// GUARD R2 (a), that the board fits 375x667 with no page scroll, needs a
// layout engine and lives in scripts/phone-layout.mjs.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { NO_OP, WIN_SCRIPT } from './scripts'

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
const board = () => q('[data-board]')!.textContent ?? ''

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

  it('finds none on turn 1, on a turn whose moves are unnamed, in PROCURE, at the end of a turn and on a Daily Op', () => {
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

describe('GUARD R2 (d): EXECUTE is off while REMAINING is below zero', () => {
  it('turns EXECUTE off with the reason when an order crosses zero, and on again when it is cancelled', () => {
    // Turn 3 with 5 CR left: the 8 CR brief crosses zero.
    const state = { ...gameAt(3), credits: 5 }
    render(state)
    const execute = () => q('[data-execute]') as HTMLButtonElement
    expect(execute().disabled, 'EXECUTE is off before anything is ordered').toBe(false)
    expect(q('[data-over-budget]')).toBeNull()
    click(q('[data-brief-toggle]')!)
    expect(q('[data-remaining]')!.textContent).toBe('REMAINING -3')
    expect(execute().disabled, 'EXECUTE is on below zero').toBe(true)
    expect(q('[data-over-budget]')!.textContent).toBe('Over budget. Cancel an order in PROCURE.')
    click(q('[data-brief-toggle]')!)
    expect(execute().disabled, 'EXECUTE stayed off after the order was cancelled').toBe(false)
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
