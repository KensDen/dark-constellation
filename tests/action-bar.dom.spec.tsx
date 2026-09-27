// @vitest-environment jsdom
//
// The action bar (brief 4.1 and 4.4). R1b made it read as steps and put
// the system controls behind the gear; R2b made it a turn stepper, with
// an objective line over four steps and RESOLVE full width under them,
// and a guided first turn. The guards, by round:
//   R1b (a) the numbers, hotkeys and sheets derive from the one action
//       array, so the rendered order follows the array's order;
//   R1b (b) a step's check appears when its sheet opens and is gone once
//       the next turn begins;
//   R1b (d) the SYSTEM sheet renders all six controls, pinned by count;
//   R2b (b) the glowing step and the objective sentence name the same
//       step, because they come from one call;
//   R2b (c) RESOLVE's label carries the turn number and flips to
//       RESOLVING while held;
//   R2b (d) the walkthrough advances on a purchase and on a hardening or
//       a skip, ends on resolve or "Skip tips", and never shows again once
//       its key is set;
//   R2b (e) the hold keeps its accessible name and its short-tap hint,
//       which now sits on the objective line.
// (tests/next-step.spec.ts holds R2b (a), the suggestion's table.)
// The fixture is the one tests/game.dom.spec.tsx documents; the same
// masking constants apply.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import ActionBar from '../src/ui/board/ActionBar'
import { ACTIONS, GUIDE, SKIP_TIPS, resolveLabel, type BoardAction, type Objective } from '../src/ui/board/actions'
import { SYSTEM_CONTROLS } from '../src/ui/board/SystemSheet'
import { FIRST_TURN_DONE_KEY } from '../src/ui/firstTurn'
import { HOLD_MS } from '../src/ui/cues/HoldButton'
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
function render(state: GameState, phase: 'brief' | 'procure' | 'harden' | 'aftermath' = 'brief') {
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
const holdButton = () => bar().querySelector('button.dc-hold') as HTMLButtonElement
const objectiveTag = () => bar().querySelector('[data-objective-tag]')?.textContent ?? ''
const objectiveSentence = () => bar().querySelector('[data-objective-sentence]')?.textContent ?? ''
const glowing = () => [...bar().querySelectorAll('[data-glow]')].map((el) => el.getAttribute('data-action'))
const mark = (el: Element) => el.querySelector('[data-step]')!
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

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
    // shows up as a slot that did not move with its action.
    const rotated: BoardAction[] = [...ACTIONS.slice(1), ACTIONS[0]]
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
              <span data-label>RESOLVE</span>
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

  it('opens each step by its digit, through the array, and moves focus to the hold on the last', () => {
    render(gameAt(2), 'brief')
    for (const a of ACTIONS) {
      key(a.hotkey)
      if (a.sheet) {
        expect(container.querySelector(`[data-sheet="${a.sheet}"]`), `${a.hotkey} did not open ${a.sheet}`).not.toBeNull()
        key(a.hotkey)
        expect(container.querySelector(`[data-sheet="${a.sheet}"]`), `${a.hotkey} again did not close ${a.sheet}`).toBeNull()
      } else {
        expect(document.activeElement, `${a.hotkey} did not focus the hold control`).toBe(holdButton())
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
    // A skipped step stays numbered.
    expect(mark(slots()[1]).textContent).toBe('2')
    // Resolve, run the playback out, and the aftermath keeps the record,
    // with the resolved turn on the objective line.
    act(() => {
      holdButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    advance(60_000)
    expect(objectiveTag()).toMatch(/^TURN \d+ RESOLVED$/)
    expect(mark(slots()[0]).textContent, 'the aftermath lost the record of the step').toBe('✓')
    click(byText(/^NEXT TURN/)!)
    expect(mark(slots()[0]).textContent, "the next turn began with last turn's check").toBe('1')
    expect(bar().textContent).not.toMatch(/RESOLVED/)
  })

  it('pulses NEXT TURN in the aftermath, full width where RESOLVE was, and not under reduced motion', () => {
    render(gameAt(2), 'aftermath')
    const next = byText(/^NEXT TURN/)!
    expect(next.className).toMatch(/dc-next-pulse/)
    expect(next.closest('[data-action="resolve"]'), 'NEXT TURN is not in the RESOLVE slot').not.toBeNull()
    expect(next.className).toMatch(/w-full/)
    setReducedMotion(true)
    render(gameAt(2), 'aftermath')
    expect(byText(/^NEXT TURN/)!.className).not.toMatch(/dc-next-pulse/)
  })

  it('draws RESOLVE outlined until the player has done anything, and solid after', () => {
    localStorage.setItem(FIRST_TURN_DONE_KEY, '1')
    render(gameAt(2), 'brief')
    expect(glowing(), 'the fixture should start on another step').not.toContain('resolve')
    expect(holdButton().className).toMatch(/bg-dc-go\/5/)
    click(slots()[0])
    expect(holdButton().className).toMatch(/bg-dc-go /)
    expect(holdButton().className).toMatch(/shadow-hard/)
  })

  it('dashes and dims SURGE when it cannot be used', () => {
    localStorage.setItem(FIRST_TURN_DONE_KEY, '1')
    const state = gameAt(2)
    render(state, 'brief')
    const surge = bar().querySelector('[data-action="surge"]') as HTMLButtonElement
    expect(state.conditions.length === 0 || state.surgeTokens === 0, 'the fixture can surge').toBe(true)
    expect(surge.disabled).toBe(true)
    expect(surge.className).toMatch(/border-dashed/)
    expect(surge.className).toMatch(/opacity-40/)
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
    // The walkthrough, turn 1 on a fresh device.
    render(gameAt(1), 'brief')
    agree('walkthrough, start')
    click(slots()[0])
    click(container.querySelector('button[data-procure-kind="sat"]')!)
    click(container.querySelector('button[data-procure-tier="B"]')!)
    click(container.querySelector('button[data-procure-buy]')!)
    agree('walkthrough, after a buy')
    click(bar().querySelector('[data-action="harden"]')!)
    click(bar().querySelector('[data-action="harden"]')!)
    agree('walkthrough, after a skip')
    // The suggestion, on a later turn: it moves as steps are opened.
    localStorage.setItem(FIRST_TURN_DONE_KEY, '1')
    render(gameAt(2), 'brief')
    agree('turn 2, first screen')
    for (const id of ['procure', 'harden', 'intel']) {
      click(bar().querySelector(`[data-action="${id}"]`)!)
      click(bar().querySelector(`[data-action="${id}"]`)!)
      agree(`turn 2, ${id} opened`)
    }
    // Four different steps were pointed at along the way, so the check
    // is not passing on one hard-coded answer.
    expect([...seen].sort()).toEqual(['harden', 'intel', 'procure', 'resolve'])
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

describe('RESOLVE says what it does (v1.2 R2b)', () => {
  const press = (ms: number) => {
    const b = holdButton()
    act(() => {
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0, isPrimary: true }))
    })
    advance(ms)
    act(() => {
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))
    })
  }

  it('GUARD R2b (c): the label carries the turn number, and reads RESOLVING while held', () => {
    for (const turn of [2, 5]) {
      const state = gameAt(turn)
      render(state, 'brief')
      const b = holdButton()
      expect(b.textContent, `turn ${state.turn}`).toContain(`Hold to resolve turn ${state.turn}`)
      expect(b.querySelector('[data-label]')?.className, 'the label is not set in capitals').toMatch(/uppercase/)
      act(() => {
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0, isPrimary: true }))
      })
      expect(b.textContent).toContain(`Resolving turn ${state.turn} ...`)
      expect(b.textContent).not.toContain('Hold to resolve')
      act(() => {
        b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))
      })
      expect(b.textContent).toContain(`Hold to resolve turn ${state.turn}`)
    }
  })

  it('GUARD R2b (e): keeps "Hold to resolve turn n" as the accessible name, and a short tap puts the hint on the objective line', () => {
    localStorage.setItem(FIRST_TURN_DONE_KEY, '1')
    const state = gameAt(2)
    render(state, 'brief')
    // The name is the visible text: nothing hidden repeats it.
    expect(holdButton().textContent).toBe(`Hold to resolve turn ${state.turn}`)
    expect(container.querySelector('[data-hold-hint]'), 'the hint is up before any tap').toBeNull()
    const before = objectiveSentence()
    press(HOLD_MS / 4)
    const hint = container.querySelector('[data-hold-hint]')
    expect(hint, 'a short tap showed no hint').not.toBeNull()
    expect(hint!.textContent).toBe('Keep holding to resolve')
    expect(hint!.closest('[data-objective]'), 'the hint is not on the objective line').not.toBeNull()
    expect(hint!.closest('[role="status"]'), 'the hint is not in the live region').not.toBeNull()
    // Nothing resolved: no playback, and the hold control is still there.
    expect(container.textContent).not.toMatch(/beat \d+ of \d+/)
    expect(holdButton()).not.toBeNull()
    advance(2_100)
    expect(container.querySelector('[data-hold-hint]'), 'the hint did not lift').toBeNull()
    expect(objectiveSentence()).toBe(before)
  })
})

describe('the guided first turn (v1.2 R2b)', () => {
  const buySat = () => {
    click(bar().querySelector('[data-action="procure"]')!)
    click(container.querySelector('button[data-procure-kind="sat"]')!)
    click(container.querySelector('button[data-procure-tier="B"]')!)
    click(container.querySelector('button[data-procure-buy]')!)
  }
  const line = () => [objectiveTag(), objectiveSentence()]
  const skipTips = () => byText(new RegExp(`^${SKIP_TIPS}$`))

  it('GUARD R2b (d): advances on a purchase, then on a hardening, ends on resolve, and never shows again', () => {
    render(gameAt(1), 'brief')
    expect(line()).toEqual([GUIDE.start.tag, GUIDE.start.sentence])
    expect(skipTips(), 'no way out of the tips').toBeDefined()
    buySat()
    expect(line(), 'a purchase did not move the walkthrough on').toEqual([GUIDE.harden.tag, GUIDE.harden.sentence])
    click(bar().querySelector('[data-action="harden"]')!)
    const box = [...container.querySelectorAll<HTMLInputElement>('[data-sheet="harden"] input[type="checkbox"]')].find((b) => !b.disabled)
    click(box!)
    expect(line(), 'a hardening did not move the walkthrough on').toEqual([GUIDE.last.tag, GUIDE.last.sentence])
    // Nothing blocks: the hold control takes the press.
    expect(holdButton().disabled).toBe(false)
    expect(localStorage.getItem(FIRST_TURN_DONE_KEY), 'the key was set before any resolve').toBeNull()
    act(() => {
      holdButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(localStorage.getItem(FIRST_TURN_DONE_KEY), 'the first resolve did not set the key').toBe('1')
    advance(60_000)
    expect(objectiveTag()).not.toBe(GUIDE.last.tag)
    // A new campaign on the same device starts without it.
    render(gameAt(1), 'brief')
    expect(objectiveTag(), 'the walkthrough came back on a device that has resolved a turn').not.toBe(GUIDE.start.tag)
    expect(skipTips()).toBeUndefined()
  })

  it('advances past HARDEN on a skip: opened and closed with nothing queued', () => {
    render(gameAt(1), 'brief')
    buySat()
    expect(objectiveTag()).toBe(GUIDE.harden.tag)
    click(bar().querySelector('[data-action="harden"]')!)
    expect(objectiveTag(), 'opening HARDEN alone counted as a skip').toBe(GUIDE.harden.tag)
    click(bar().querySelector('[data-action="harden"]')!)
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

describe('the SYSTEM sheet (v1.2 R1b)', () => {
  it('GUARD (d): renders all six controls, derived from its list', () => {
    // Pinned, not merely iterated: a control dropped from the list would
    // drop from both the sheet and a derived expectation at once.
    expect(SYSTEM_CONTROLS.length, 'the SYSTEM list changed size; say why').toBe(6)
    render(gameAt(2), 'brief')
    expect(container.querySelector('[data-sheet="system"]'), 'the sheet is open before the gear was pressed').toBeNull()
    const gear = container.querySelector('button[aria-label="System"]')
    expect(gear, 'no gear on the HUD').not.toBeNull()
    click(gear!)
    const sheet = container.querySelector('[data-sheet="system"]')
    expect(sheet, 'the gear opened no sheet').not.toBeNull()
    for (const control of SYSTEM_CONTROLS) {
      const found = [...sheet!.querySelectorAll('button, span')].some((el) => (el.textContent ?? '').trim() === control.name)
      expect(found, `the SYSTEM sheet has no "${control.name}"`).toBe(true)
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
