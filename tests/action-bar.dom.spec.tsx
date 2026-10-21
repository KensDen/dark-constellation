// @vitest-environment jsdom
//
// The action bar (brief 4.1 and 4.4). R1b made it read as steps and put
// the system controls behind the gear; R2b made it a turn stepper, with
// an objective line over the steps and the commit full width under them,
// and a guided first turn. v1.3 Round 0 cut it to two actions, PROCURE
// and EXECUTE, and made EXECUTE a tap. The guards, by round:
//   R1b (a) the numbers, hotkeys and sheets derive from the one action
//       array, so the rendered order follows the array's order;
//   R1b (b) a step's check appears when its sheet opens and is gone once
//       the next turn begins;
//   R1b (d) the SYSTEM sheet renders all five controls, pinned by count;
//   R2b (b) the glowing step and the objective sentence name the same
//       step, because they come from one call;
//   R2b (c) EXECUTE's label carries the turn number;
//   R2b (d) the walkthrough advances on an order of any kind or a skip,
//       ends on execute or "Skip tips", and never shows again once its
//       key is set;
//   R2b (e) EXECUTE keeps its accessible name, and one tap plays the turn
//       (the hold and its short-tap hint went in v1.3 Round 0).
// (tests/next-step.spec.ts holds R2b (a), the suggestion's table.)
// The fixture is the one tests/game.dom.spec.tsx documents; the same
// masking constants apply.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import ActionBar from '../src/ui/board/ActionBar'
import { ACTIONS, GUIDE, SKIP_TIPS, resolveLabel, type BoardAction, type Objective, type StepId } from '../src/ui/board/actions'
import { SYSTEM_CONTROLS } from '../src/ui/board/SystemSheet'
import { FIRST_TURN_DONE_KEY } from '../src/ui/firstTurn'
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

const bar = () => container.querySelector('nav[aria-label="Actions"]')!
const slots = () => [...bar().querySelectorAll('[data-action]')] as HTMLElement[]
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
const executeButton = () => bar().querySelector('button[data-execute]') as HTMLButtonElement
const objectiveTag = () => bar().querySelector('[data-objective-tag]')?.textContent ?? ''
const objectiveSentence = () => bar().querySelector('[data-objective-sentence]')?.textContent ?? ''
const glowing = () => [...bar().querySelectorAll('[data-glow]')].map((el) => el.getAttribute('data-action'))
const mark = (el: Element) => el.querySelector('[data-step]')!
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
// Tap the playback through to the aftermath: nothing advances on its own
// since v1.3 Round 0, so each beat waits for its Next. The timers run a
// strike's length between taps, as a player's look at the beat would.
const afterword = () => byText(/^(NEXT TURN|FINAL REPORT)$/)
const playOut = () => {
  for (let i = 0; i < 100 && !afterword(); i++) {
    const next = byText(/^Next$/)
    expect(next, 'the playback has no Next button').toBeDefined()
    click(next!)
    advance(STRIKE_MS)
  }
  expect(afterword(), 'tapping Next did not reach the aftermath').toBeDefined()
}

// What each slot shows, in DOM order: its visible label, number badge and
// hotkey. The label is read off the element that renders it, so a label
// spelled in the component rather than read from the array is caught.
function rendered(): { id: string; label: string; mark: string; hotkey: string }[] {
  return slots().map((slot) => ({
    id: slot.getAttribute('data-action')!,
    label: (slot.querySelector('[data-label]')?.textContent ?? '').trim(),
    mark: mark(slot).textContent ?? '',
    hotkey: slot.getAttribute('data-hotkey')!,
  }))
}

// The order the bar renders an array in: the steps in the array's order,
// then the action with no sheet, full width under them.
const barOrder = (actions: readonly BoardAction[]) => [...actions.filter((a) => a.sheet !== null), ...actions.filter((a) => a.sheet === null)]
const quietObjective: Objective = { tag: 'T', sentence: 'S', step: null }

describe('the action bar reads as steps (v1.2 R1b, a stepper since R2b)', () => {
  it('GUARD R1b (a): renders numbers, hotkeys and labels in the order of the one action array', () => {
    const state = gameAt(2)
    render(state, 'brief')
    expect(rendered()).toEqual(
      barOrder(ACTIONS).map((a) => ({
        id: a.id,
        label: a.sheet ? a.label : resolveLabel(state.turn),
        mark: String(a.number),
        hotkey: a.hotkey,
      })),
    )
    // And the chrome mirror counts the same numbers and labels, from the
    // same array, so it cannot disagree with the bar.
    const chrome = chromeCopy(state)
    for (const a of ACTIONS) {
      expect(chrome).toContain(a.sheet ? a.label : resolveLabel(state.turn))
      expect(chrome).toContain(String(a.number))
    }
  })

  it('GUARD R1b (a), the other half: a reordered array reorders the bar', () => {
    // The bar is rendered standalone with the array rotated, so a number
    // or a key spelled in the component rather than read from the array
    // shows up as a slot that did not move with its action. Two actions
    // since v1.3 Round 0: one step, and the commit always under the row,
    // so rotating ACTIONS alone would move nothing. A second step goes in
    // ahead of PROCURE, and every action takes a number and key that is
    // neither its own, nor its index in the array, nor its place on the
    // bar, so a component that counted positions instead of reading the
    // array would render a badge this test does not expect.
    const probe: BoardAction = { ...ACTIONS[0], id: 'probe' as string as StepId, label: 'PROBE' }
    const rotated: BoardAction[] = [...ACTIONS.slice(1), probe, ACTIONS[0]].map((a, i) => ({ ...a, number: i + 4, hotkey: String(i + 4) }))
    expect(
      rotated.filter((a) => a.id !== 'probe').every((a) => ACTIONS.find((b) => b.id === a.id)!.number !== a.number),
      'the reordered array left an action on its own number',
    ).toBe(true)
    expect(
      rotated.every((a, i) => a.number !== i + 1 && a.number !== barOrder(rotated).indexOf(a) + 1),
      'a badge equals a position, so counting positions would pass',
    ).toBe(true)
    act(() => {
      root.render(
        <ActionBar
          actions={rotated}
          phase="deciding"
          openSheet={null}
          done={new Set()}
          objective={quietObjective}
          onToggle={() => {}}
          disabledFor={() => false}
          captionFor={() => ''}
          resolve={() => (
            <button type="button">
              <span data-label>EXECUTE</span>
            </button>
          )}
          nextLabel="NEXT TURN"
          onNext={() => {}}
          pulseNext={false}
        />,
      )
    })
    expect(rendered()).toEqual(barOrder(rotated).map((a) => ({ id: a.id, label: a.label, mark: String(a.number), hotkey: a.hotkey })))
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
        // Focus, not a commit: the turn is still being decided.
        expect(container.textContent).not.toMatch(/beat \d+ of \d+/)
      }
    }
  })

  it('GUARD R1b (b): a step shows its check once its sheet opens, and is numbered again on the next turn', () => {
    localStorage.setItem(FIRST_TURN_DONE_KEY, '1')
    render(gameAt(2), 'brief')
    const procure = slots()[0]
    expect(mark(procure).textContent).toBe('1')
    click(procure)
    expect(mark(slots()[0]).textContent, 'opening PROCURE left it numbered').toBe('✓')
    expect(slots()[0].querySelector('[data-step-done]')).not.toBeNull()
    // EXECUTE, not yet pressed, stays numbered.
    expect(mark(slots()[1]).textContent).toBe('2')
    // Execute, tap the playback out, and the aftermath keeps the record,
    // with the executed turn on the objective line.
    click(executeButton())
    playOut()
    expect(objectiveTag()).toMatch(/^TURN \d+ RESOLVED$/)
    expect(mark(slots()[0]).textContent, 'the aftermath lost the record of the step').toBe('✓')
    click(byText(/^NEXT TURN/)!)
    expect(mark(slots()[0]).textContent, "the next turn began with last turn's check").toBe('1')
    expect(bar().textContent).not.toMatch(/RESOLVED/)
  })

  it('pulses NEXT TURN in the aftermath, full width where EXECUTE was, and not under reduced motion', () => {
    render(gameAt(2), 'aftermath')
    const next = byText(/^NEXT TURN/)!
    expect(next.className).toMatch(/dc-next-pulse/)
    expect(next.closest('[data-action="resolve"]'), 'NEXT TURN is not in the EXECUTE slot').not.toBeNull()
    expect(next.className).toMatch(/w-full/)
    setReducedMotion(true)
    render(gameAt(2), 'aftermath')
    expect(byText(/^NEXT TURN/)!.className).not.toMatch(/dc-next-pulse/)
  })

  it('draws EXECUTE outlined until the player has done anything, and solid after', () => {
    localStorage.setItem(FIRST_TURN_DONE_KEY, '1')
    render(gameAt(2), 'brief')
    expect(glowing(), 'the fixture should start on another step').not.toContain('resolve')
    expect(executeButton().className).toMatch(/bg-dc-go\/5/)
    click(slots()[0])
    expect(executeButton().className).toMatch(/bg-dc-go /)
    expect(executeButton().className).toMatch(/shadow-hard/)
  })
})

describe('the objective line and the glow (v1.2 R2b)', () => {
  // The step a sentence names, by its label in capitals.
  const named = (sentence: string) => ACTIONS.filter((a) => sentence.includes(a.label)).map((a) => a.id)

  it('GUARD R2b (b): the glowing step and the objective sentence name the same step, in every state', () => {
    const seen = new Set<string>()
    const agree = (where: string) => {
      const sentence = objectiveSentence()
      expect(named(sentence), `${where}: the sentence names no single step: ${sentence}`).toHaveLength(1)
      expect(glowing(), `${where}: "${sentence}"`).toEqual(named(sentence))
      seen.add(named(sentence)[0])
    }
    // The walkthrough, turn 1 on a fresh device: once after a buy, and
    // once, on a fresh mount, after a skip.
    render(gameAt(1), 'brief')
    agree('walkthrough, start')
    click(slots()[0])
    click(container.querySelector('button[data-procure-kind="sat"]')!)
    click(container.querySelector('button[data-procure-buy]')!)
    agree('walkthrough, after a buy')
    render(gameAt(1), 'brief')
    click(bar().querySelector('[data-action="procure"]')!)
    click(bar().querySelector('[data-action="procure"]')!)
    agree('walkthrough, after a skip')
    // The suggestion, on a later turn: it moves as steps are opened.
    localStorage.setItem(FIRST_TURN_DONE_KEY, '1')
    render(gameAt(2), 'brief')
    agree('turn 2, first screen')
    for (const a of ACTIONS.filter((x) => x.sheet !== null)) {
      click(bar().querySelector(`[data-action="${a.id}"]`)!)
      click(bar().querySelector(`[data-action="${a.id}"]`)!)
      agree(`turn 2, ${a.id} opened`)
    }
    // Both steps were pointed at along the way, so the check is not
    // passing on one hard-coded answer.
    expect([...seen].sort()).toEqual(['procure', 'resolve'])
  })

  it('shows the credits the HUD shows, as "n CR LEFT", in a polite live region', () => {
    localStorage.setItem(FIRST_TURN_DONE_KEY, '1')
    render(gameAt(2), 'brief')
    const hud = container.querySelector('[aria-label^="Credits"]')!.getAttribute('aria-label')!
    const credits = /(-?\d+)/.exec(hud)![1]
    expect(objectiveTag()).toBe(`${credits} CR LEFT`)
    expect(bar().querySelector('[data-objective] [role="status"]')?.getAttribute('aria-live')).toBe('polite')
  })
})

describe('EXECUTE says what it does (v1.2 R2b, a tap since v1.3 Round 0)', () => {
  it('GUARD R2b (c): the label carries the turn number', () => {
    for (const turn of [2, 5]) {
      const state = gameAt(turn)
      render(state, 'brief')
      const b = executeButton()
      expect(b.textContent, `turn ${state.turn}`).toContain(`Execute turn ${state.turn}`)
      expect(b.querySelector('[data-label]')?.className, 'the label is not set in capitals').toMatch(/uppercase/)
    }
  })

  it('GUARD R2b (e): keeps "Execute turn n" as the accessible name, and one tap plays the turn', () => {
    localStorage.setItem(FIRST_TURN_DONE_KEY, '1')
    const state = gameAt(2)
    render(state, 'brief')
    // The name is the visible text: nothing hidden repeats it, and no
    // label stands in for it.
    expect(executeButton().textContent).toBe(`Execute turn ${state.turn}`)
    expect(executeButton().hasAttribute('aria-label'), 'an aria-label overrides the visible name').toBe(false)
    expect(container.textContent, 'the turn is playing before EXECUTE was pressed').not.toMatch(/beat \d+ of \d+/)
    // A tap, not a hold: one click resolves the turn and its playback is up.
    click(executeButton())
    expect(container.textContent, 'one tap on EXECUTE did not play the turn').toMatch(/beat \d+ of \d+/)
    expect(objectiveTag()).toBe(`TURN ${state.turn}`)
  })
})

describe('the guided first turn (v1.2 R2b)', () => {
  const procure = () => bar().querySelector('[data-action="procure"]')!
  const procureSheet = () => container.querySelector('[data-sheet="procure"]')
  // The kinds of order PROCURE takes on turn 1, one from each section that
  // sells anything that night, and whether placing it closes the sheet. A
  // buy does; a checkbox leaves the sheet open, so the walkthrough moving
  // on there is the order and not a skip. INTEL sells nothing on turn 1
  // since v1.3 Round 0: the intel brief is free that night (brief D2 a,
  // src/ui/board/ProcureSheet.tsx ticks and locks its row), and the
  // walkthrough runs on turn 1 only, so the brief is never an order it
  // could move on. The test below pins that the free brief does not count.
  const ORDERS: [string, () => void, boolean][] = [
    [
      'an asset',
      () => {
        click(procure())
        click(container.querySelector('button[data-procure-kind="sat"]')!)
        click(container.querySelector('button[data-procure-buy]')!)
      },
      true,
    ],
    [
      'a defense',
      () => {
        click(procure())
        const box = [...container.querySelectorAll<HTMLInputElement>('[data-procure-defenses] input[type="checkbox"]')].find((b) => !b.disabled)
        expect(box, 'turn 1 offers no defense to order').toBeDefined()
        click(box!)
      },
      false,
    ],
  ]
  const line = () => [objectiveTag(), objectiveSentence()]
  const skipTips = () => byText(new RegExp(`^${SKIP_TIPS}$`))

  it('GUARD R2b (d): advances on an order of any kind, ends on execute, and never shows again', () => {
    // The free brief first: ticked and locked on turn 1, and not an order,
    // so tapping its row leaves the walkthrough where it was.
    render(gameAt(1), 'brief')
    expect(line(), 'the walkthrough did not start').toEqual([GUIDE.start.tag, GUIDE.start.sentence])
    click(procure())
    const intelRow = container.querySelector('[data-procure-intel]')
    expect(intelRow, 'PROCURE has no INTEL row').not.toBeNull()
    expect(intelRow!.textContent, 'the INTEL row does not say the brief is free tonight').toMatch(/free tonight/)
    const brief = intelRow!.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect([brief.checked, brief.disabled], 'the free brief is not ticked and locked on turn 1').toEqual([true, true])
    click(brief)
    expect(brief.checked, 'tapping the free brief unticked it').toBe(true)
    expect(procureSheet(), 'tapping the free brief closed the sheet').not.toBeNull()
    expect(line(), 'the free brief moved the walkthrough on as if it were an order').toEqual([GUIDE.start.tag, GUIDE.start.sentence])
    for (const [what, order, closes] of ORDERS) {
      render(gameAt(1), 'brief')
      expect(line(), `${what}: the walkthrough did not start`).toEqual([GUIDE.start.tag, GUIDE.start.sentence])
      expect(skipTips(), 'no way out of the tips').toBeDefined()
      order()
      expect(procureSheet() === null, `${what}: the sheet ${closes ? 'stayed open' : 'closed'}`).toBe(closes)
      expect(line(), `${what} did not move the walkthrough on`).toEqual([GUIDE.last.tag, GUIDE.last.sentence])
    }
    // Nothing blocks: EXECUTE takes the tap.
    expect(executeButton().disabled).toBe(false)
    expect(localStorage.getItem(FIRST_TURN_DONE_KEY), 'the key was set before any execute').toBeNull()
    click(executeButton())
    expect(localStorage.getItem(FIRST_TURN_DONE_KEY), 'the first execute did not set the key').toBe('1')
    playOut()
    expect(objectiveTag()).not.toBe(GUIDE.last.tag)
    // A new campaign on the same device starts without it.
    render(gameAt(1), 'brief')
    expect(objectiveTag(), 'the walkthrough came back on a device that has executed a turn').not.toBe(GUIDE.start.tag)
    expect(skipTips()).toBeUndefined()
  })

  it('advances on a skip: PROCURE opened and closed with nothing queued', () => {
    render(gameAt(1), 'brief')
    expect(objectiveTag()).toBe(GUIDE.start.tag)
    click(procure())
    expect(objectiveTag(), 'opening PROCURE alone counted as a skip').toBe(GUIDE.start.tag)
    click(procure())
    expect(line()).toEqual([GUIDE.last.tag, GUIDE.last.sentence])
  })

  it('ends at "Skip tips", and shows only on turn 1', () => {
    render(gameAt(1), 'brief')
    click(skipTips()!)
    expect(objectiveTag()).toMatch(/CR LEFT$/)
    expect(skipTips()).toBeUndefined()
    // A fresh device on a later turn (a loaded code) gets the suggestion.
    render(gameAt(3), 'brief')
    expect(objectiveTag()).toMatch(/CR LEFT$/)
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
      (el.children.length === 0 ? (el.textContent ?? '') : '').trim().toLowerCase(),
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
    expect(byText(/^Sound$/)).toBeDefined()
    expect(byText(/^Save$/)).toBeUndefined()
  })
})
