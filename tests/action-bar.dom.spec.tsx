// @vitest-environment jsdom
//
// The action bar (brief 4.1 and 4.4), the Dock since v1.3 R2 (brief 5.3
// item 5). R1b made it read as steps and put the system controls behind
// the gear; R2b made it a turn stepper with an objective line and a
// guided first turn; v1.3 Round 0 cut it to two actions, PROCURE and
// EXECUTE, and made EXECUTE a tap; R2 made it the Dock, with REMAINING and
// WORST CASE over the two buttons, and took the step numbers, the checks,
// the objective line, its glow and the walkthrough off it (FIRST ORDERS
// teaches the turn now). The guards, by round:
//   R1b (a) the dock renders the one action array's actions in its order,
//       and the digit hotkeys resolve through it;
//   R1b (b) rewritten per QC G-025: PROCURE shows no tick or badge until
//       an order is queued, and none again once the next turn begins (the
//       badge's count is GUARD R2 (e) in tests/board-r2.dom.spec.tsx);
//   R1b (d) the SYSTEM sheet renders all its controls, pinned by count;
//   R2b (c) and (e) EXECUTE's accessible name carries the turn number,
//       and one tap plays the turn (the hold and its short-tap hint went
//       in v1.3 Round 0), which since v1.3 R3 is THE NIGHT (brief 5.5): the
//       dock leaves for it, and END OF TURN's BEGIN TURN n+1 is the way on.
// (R2b (a), (b) and (d), the suggestion, the glow and the walkthrough,
// went with the objective line and src/ui/firstTurn.ts in v1.3 R2. The
// dock's NEXT TURN and its pulse went with the director in v1.3 R3.)
// The fixture is the one tests/game.dom.spec.tsx documents; the same
// masking constants apply.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import { ACTIONS, resolveLabel } from '../src/ui/board/actions'
import { SYSTEM_CONTROLS } from '../src/ui/board/SystemSheet'
import { STRIKE_MS } from '../src/ui/board/strike'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { chromeCopy } from '../src/ui/brief'
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

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', memoryStorage())
  setReducedMotion(false)
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
  vi.restoreAllMocks()
})

function gameAt(turn: number, seed = 20260712): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing' && state.turn < turn) {
    state = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
  }
  return state
}

let mounts = 0
function render(state: GameState, phase: 'brief' | 'procure' | 'aftermath' = 'brief') {
  mounts += 1
  act(() => {
    root.render(<Game key={`m${mounts}`} initial={{ state, phase }} onExit={() => {}} />)
  })
}

const bar = () => container.querySelector('nav[aria-label="Actions"][data-dock]')!
const slots = () => [...bar().querySelectorAll('button[data-action]')] as HTMLButtonElement[]
const buttons = () => [...container.querySelectorAll('button')]
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ''))
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
const key = (k: string, target: EventTarget = window) => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  })
}
// The dock is the deciding board's: it leaves for the night (v1.3 R3).
const procureButton = () => container.querySelector('[data-dock] button[data-action="procure"]') as HTMLButtonElement
const executeButton = () => container.querySelector('[data-dock] button[data-execute]') as HTMLButtonElement | null
const procureSheet = () => container.querySelector('[data-sheet="procure"]')
// A tap, and the lazy cards and effects it sets off, settled.
async function tap(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
  await act(async () => {})
}
// END OF TURN's way on: BEGIN TURN n+1, or DEBRIEF on the last.
const begin = () => container.querySelector('[data-night-card="end"] button[data-begin]') as HTMLButtonElement | null
// Play the night out to END OF TURN (v1.3 R3, brief 5.5): only the
// 750ms overlay and the strikes play on their own, so the timers run a
// strike's length whenever no card is up, and every card is tapped on, as
// a player does (FILE IT, HOLD on the debris call, COLLECT or CONTINUE).
async function playOut() {
  for (let i = 0; i < 100 && !begin(); i++) {
    const way = container.querySelector('[data-file-it]') ?? container.querySelector('[data-call="hold"]') ?? container.querySelector('[data-collect]') ?? container.querySelector('[data-continue]')
    if (way) await tap(way)
    else
      await act(async () => {
        vi.advanceTimersByTime(STRIKE_MS)
      })
  }
  expect(begin(), 'the night did not reach END OF TURN').not.toBeNull()
}
// A tick or a badge on PROCURE: the v1.2 check mark, its done marker, or
// the order count.
const procureMarks = () => {
  const b = procureButton()
  return [b.querySelector('[data-order-badge]'), b.querySelector('[data-step-done]'), /✓/.test(b.textContent ?? '') ? b : null].filter(Boolean)
}

describe('the dock carries the one action array (v1.2 R1b, the Dock since v1.3 R2)', () => {
  it('GUARD R1b (a): renders the actions in the order of the one action array, PROCURE by its label and EXECUTE named for the turn', () => {
    const state = gameAt(2)
    render(state, 'brief')
    expect(slots().map((b) => b.getAttribute('data-action')), 'the dock does not follow ACTIONS').toEqual(ACTIONS.map((a) => a.id))
    for (const a of ACTIONS) {
      const b = bar().querySelector(`button[data-action="${a.id}"]`)!
      // The visible label is the array's; EXECUTE's accessible name is the
      // instruction for this turn.
      expect((b.childNodes[0]?.textContent ?? '').trim(), `${a.id} does not print its label`).toBe(a.label)
      if (!a.sheet) expect(b.getAttribute('aria-label')).toBe(resolveLabel(state.turn))
    }
    // The step numbers, checks and F-key chips left the bar in R2.
    expect(bar().querySelector('[data-step], [data-hotkey]'), 'a step number or key chip is back on the dock').toBeNull()
    // And the chrome mirror counts the same labels, from the same array,
    // so it cannot disagree with the dock.
    const chrome = chromeCopy(state)
    for (const a of ACTIONS) expect(chrome).toContain(a.label)
  })

  it('opens each step by its digit, through the array, and moves focus to EXECUTE on the last', () => {
    render(gameAt(2), 'brief')
    for (const a of ACTIONS) {
      key(a.hotkey)
      if (a.sheet) {
        expect(container.querySelector(`[data-sheet="${a.sheet}"]`), `${a.hotkey} did not open ${a.sheet}`).not.toBeNull()
        key(a.hotkey)
        expect(container.querySelector(`[data-sheet="${a.sheet}"]`), `${a.hotkey} again did not close ${a.sheet}`).toBeNull()
      } else {
        expect(document.activeElement, `${a.hotkey} did not focus EXECUTE`).toBe(executeButton())
        // Focus, not a commit: the turn is still being decided, so the
        // dock, which leaves for the night, is still up.
        expect(container.querySelector('[data-dock]'), `${a.hotkey} committed the turn`).not.toBeNull()
      }
    }
  })

  it('GUARD R1b (b): PROCURE shows no tick or badge until an order is queued, and none again on the next turn (QC G-025)', async () => {
    // v1.2 ticked a step the moment its sheet opened, which told the
    // player they had done something when they had only looked. G-025: a
    // mark on PROCURE means an order. How many is GUARD R2 (e) in
    // tests/board-r2.dom.spec.tsx; this holds the looking, and the turn.
    render(gameAt(2), 'brief')
    expect(procureMarks(), 'PROCURE is marked before anything was done').toEqual([])
    click(procureButton())
    expect(procureSheet(), 'PROCURE did not open').not.toBeNull()
    expect(procureMarks(), 'opening PROCURE marked it').toEqual([])
    click(procureSheet()!.querySelector('button[data-confirm]')!)
    expect(procureSheet()).toBeNull()
    expect(procureMarks(), 'opening and closing PROCURE with nothing queued marked it').toEqual([])
    expect(procureButton().textContent).toBe('PROCURE')
    // The positive control: an order does mark it, so the empty checks
    // above are not blind.
    click(procureButton())
    click(procureSheet()!.querySelector('button[data-procure-kind="drone"]')!)
    click(procureSheet()!.querySelector('button[data-confirm]')!)
    expect(procureMarks().length, 'a queued order left PROCURE unmarked').toBeGreaterThan(0)
    // Execute, tap the night out, BEGIN TURN 3, and the next turn starts
    // unmarked.
    await tap(executeButton()!)
    await playOut()
    expect(begin()!.textContent).toBe('BEGIN TURN 3')
    await tap(begin()!)
    expect(procureButton(), 'BEGIN TURN 3 did not bring the dock back').not.toBeNull()
    expect(procureMarks(), "the next turn began with last turn's mark").toEqual([])
  })

  it('ends the turn on END OF TURN, its BEGIN TURN n+1 full width with the dock gone, rising in only with motion on', async () => {
    // NEXT TURN and its pulse left the dock with the director in v1.3 R3:
    // the turn ends on END OF TURN, whose BEGIN TURN n+1 is the way on.
    render(gameAt(2), 'aftermath')
    await act(async () => {})
    const end = container.querySelector('section[data-night-card="end"]')!
    expect(end, 'no END OF TURN after the turn').not.toBeNull()
    expect(begin()!.textContent).toBe('BEGIN TURN 2')
    expect(begin()!.className).toMatch(/w-full/)
    expect(container.querySelector('[data-dock]'), 'the dock, PROCURE or EXECUTE is still up after the turn').toBeNull()
    expect(end.className).toMatch(/dc-card-rise/)
    setReducedMotion(true)
    render(gameAt(2), 'aftermath')
    await act(async () => {})
    expect(container.querySelector('section[data-night-card="end"]')!.className).not.toMatch(/dc-card-rise/)
  })

  it('draws EXECUTE outlined until an order is queued, and solid after', () => {
    // With nothing queued PROCURE is the way in and takes the emphasis;
    // once an order is queued EXECUTE takes it (brief 5.3 item 5).
    render(gameAt(2), 'brief')
    expect(executeButton()!.className).toMatch(/shadow-press/)
    expect(executeButton()!.className).not.toMatch(/bg-dc-go /)
    expect(procureButton().className).toMatch(/bg-dc-go /)
    // Looking is not an order.
    click(procureButton())
    click(procureButton())
    expect(executeButton()!.className, 'opening PROCURE made EXECUTE solid').toMatch(/shadow-press/)
    click(procureButton())
    click(procureSheet()!.querySelector('button[data-procure-kind="drone"]')!)
    expect(executeButton()!.className).toMatch(/bg-dc-go /)
    expect(executeButton()!.className).toMatch(/shadow-hard/)
    expect(procureButton().className).toMatch(/shadow-press/)
  })
})

describe('EXECUTE says what it does (v1.2 R2b, a tap since v1.3 Round 0)', () => {
  it('GUARD R2b (c) and (e): the accessible name carries the turn number, and one tap plays the turn', async () => {
    for (const turn of [2, 5]) {
      const state = gameAt(turn)
      render(state, 'brief')
      // Since R2 the dock prints EXECUTE and the name is the instruction,
      // resolveLabel's "Execute turn n".
      expect(executeButton()!.textContent, `turn ${state.turn}`).toBe('EXECUTE')
      expect(executeButton()!.getAttribute('aria-label'), `turn ${state.turn}`).toBe(`Execute turn ${state.turn}`)
    }
    const state = gameAt(2)
    render(state, 'brief')
    const night = () => container.querySelector('[data-moving], [data-strike-banner], [data-night-card], [data-intel-file]')
    expect(night(), 'the turn is playing before EXECUTE was pressed').toBeNull()
    // A tap, not a hold: one click resolves the turn and the night is up,
    // COLDVEIL IS MOVING first.
    await tap(executeButton()!)
    expect(container.querySelector('[data-moving]'), 'one tap on EXECUTE did not play the turn').not.toBeNull()
    expect(executeButton(), 'EXECUTE stayed on the dock during the night').toBeNull()
  })
})

describe('the SYSTEM sheet (v1.2 R1b; v1.3 R1, brief 5.8)', () => {
  it('GUARD (d): renders all ten controls, derived from its list', () => {
    // Pinned, not merely iterated: a control dropped from the list would
    // drop from both the sheet and a derived expectation at once. Ten
    // since v1.3 R1 (brief 5.8): Save left with the named slots (M21), Back
    // to menu became Back to title with the menu's retirement (M1), and
    // difficulty, motion, Load save code, Replay a seed, the scoreboard and
    // credits arrived from the retired menu and start screen.
    expect(SYSTEM_CONTROLS.length, 'the SYSTEM list changed size; say why').toBe(10)
    render(gameAt(2), 'brief')
    expect(container.querySelector('[data-sheet="system"]'), 'the sheet is open before the gear was pressed').toBeNull()
    const gear = container.querySelector('button[aria-label="System"]')
    expect(gear, 'no gear on the HUD').not.toBeNull()
    click(gear!)
    const sheet = container.querySelector('[data-sheet="system"]')
    expect(sheet, 'the gear opened no sheet').not.toBeNull()
    // A control is there by its name: as a button's text, or as the label
    // of the group that holds it (DIFFICULTY, REPLAY A SEED), in any case.
    const names = [...sheet!.querySelectorAll('button, p, span, section')].flatMap((el) => [
      (el.children.length === 0 ? (el.textContent ?? '') : '').trim().toLowerCase().replace(/ (on|off)$/, ''),
      (el.getAttribute('aria-label') ?? '').toLowerCase(),
    ])
    for (const control of SYSTEM_CONTROLS) {
      expect(names.includes(control.name.toLowerCase()), `the SYSTEM sheet has no "${control.name}"`).toBe(true)
    }
    // And they left the board: nothing outside the sheet carries them.
    const outside = [...container.querySelectorAll('button')].filter((b) => !sheet!.contains(b))
    for (const control of SYSTEM_CONTROLS) {
      expect(outside.some((b) => (b.textContent ?? '').trim() === control.name), `"${control.name}" is still on the board`).toBe(false)
    }
  })

  it('keeps the toggles once the campaign is decided, and drops Save', () => {
    let state = gameAt(1)
    while (state.status === 'playing') state = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    render(state, 'aftermath')
    click(container.querySelector('button[aria-label="System"]')!)
    expect(byText(/^Sound (ON|OFF)$/)).toBeDefined()
    expect(byText(/^Save$/)).toBeUndefined()
  })
})
