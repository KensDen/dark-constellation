// @vitest-environment jsdom
//
// The action bar as steps, the hold that teaches itself, and the SYSTEM
// sheet (v1.2 R1b, brief 4.1 and 4.4), with the round's four guards:
//   (a) the numbers, hotkeys and sheets all derive from the one action
//       array, so the rendered order follows the array's order;
//   (b) a step's check appears when its sheet opens and is gone once the
//       next turn begins;
//   (c) a short tap on RESOLVE shows the hint and resolves nothing;
//   (d) the SYSTEM sheet renders all six controls, pinned by count.
// The fixture is the one tests/game.dom.spec.tsx documents; the same
// masking constants apply.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import ActionBar from '../src/ui/board/ActionBar'
import { ACTIONS, HOLD_CAPTION, type BoardAction } from '../src/ui/board/actions'
import { SYSTEM_CONTROLS } from '../src/ui/board/SystemSheet'
import { HOLD_HINT_SEEN_KEY } from '../src/ui/holdHint'
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
const mark = (el: Element) => el.querySelector('[data-step]')!
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

// What each slot shows, in DOM order: its visible label, corner mark and
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

describe('the action bar reads as steps (v1.2 R1b)', () => {
  it('GUARD (a): renders numbers, hotkeys and labels in the order of the one action array', () => {
    render(gameAt(2), 'brief')
    expect(rendered()).toEqual(
      ACTIONS.map((a) => ({ id: a.id, label: a.label, mark: String(a.number), hotkey: a.hotkey })),
    )
    // And the chrome mirror counts the same numbers and labels, from the
    // same array, so it cannot disagree with the bar.
    const chrome = chromeCopy(gameAt(2))
    for (const a of ACTIONS) {
      expect(chrome).toContain(a.label)
      expect(chrome).toContain(String(a.number))
    }
    expect(chrome).toContain(HOLD_CAPTION)
  })

  it('GUARD (a), the other half: a reordered array reorders the bar', () => {
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
          onToggle={() => {}}
          disabledFor={() => false}
          captionFor={() => ''}
          resolve={
            <button type="button">
              <span data-label>RESOLVE</span>
            </button>
          }
          nextLabel="NEXT TURN"
          onNext={() => {}}
          pulseNext={false}
        />,
      )
    })
    expect(rendered()).toEqual(rotated.map((a) => ({ id: a.id, label: a.label, mark: String(a.number), hotkey: a.hotkey })))
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

  it('GUARD (b): a step shows its check once its sheet opens, and is numbered again on the next turn', () => {
    render(gameAt(2), 'brief')
    const procure = slots()[0]
    expect(mark(procure).textContent).toBe('1')
    click(procure.closest('button') ?? procure)
    expect(mark(slots()[0]).textContent, 'opening PROCURE left it numbered').toBe('✓')
    expect(slots()[0].querySelector('[data-step-done]')).not.toBeNull()
    // A skipped step stays numbered.
    expect(mark(slots()[1]).textContent).toBe('2')
    // Resolve, run the playback out, and the aftermath keeps the record.
    act(() => {
      holdButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    advance(60_000)
    expect(bar().textContent).toMatch(/TURN \d+ RESOLVED/)
    expect(mark(slots()[0]).textContent, 'the aftermath lost the record of the step').toBe('✓')
    click(byText(/^NEXT TURN/)!)
    expect(mark(slots()[0]).textContent, 'the next turn began with last turn\'s check').toBe('1')
    expect(bar().textContent).not.toMatch(/RESOLVED/)
  })

  it('pulses NEXT TURN in the aftermath, and not under reduced motion', () => {
    render(gameAt(2), 'aftermath')
    expect(byText(/^NEXT TURN/)!.className).toMatch(/dc-next-pulse/)
    setReducedMotion(true)
    render(gameAt(2), 'aftermath')
    expect(byText(/^NEXT TURN/)!.className).not.toMatch(/dc-next-pulse/)
  })
})

describe('the hold teaches itself (v1.2 R1b)', () => {
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

  it('says HOLD under RESOLVE and keeps the accessible name', () => {
    localStorage.setItem(HOLD_HINT_SEEN_KEY, '1')
    render(gameAt(2), 'brief')
    const b = holdButton()
    expect(b.textContent).toContain(HOLD_CAPTION)
    expect(b.textContent).toMatch(/Hold to resolve turn \d+/)
  })

  it('GUARD (c): a short tap shows the hint for two seconds and resolves nothing', () => {
    localStorage.setItem(HOLD_HINT_SEEN_KEY, '1')
    render(gameAt(2), 'brief')
    expect(container.querySelector('[data-hold-hint]'), 'the hint is up before any tap').toBeNull()
    press(HOLD_MS / 4)
    const hint = container.querySelector('[data-hold-hint]')
    expect(hint, 'a short tap showed no hint').not.toBeNull()
    expect(hint!.textContent).toBe('Hold to resolve')
    expect(hint!.getAttribute('role')).toBe('status')
    // Nothing resolved: no playback, and the hold control is still there.
    expect(container.textContent).not.toMatch(/beat \d+ of \d+/)
    expect(holdButton()).not.toBeNull()
    advance(2_100)
    expect(container.querySelector('[data-hold-hint]'), 'the hint did not lift').toBeNull()
  })

  it('shows the bubble on the first turn ever on this device, and never again after a completed hold', () => {
    render(gameAt(2), 'brief')
    const bubble = container.querySelector('[data-hold-bubble]')
    expect(bubble, 'no bubble on a fresh device').not.toBeNull()
    expect(bubble!.textContent).toBe('Hold to resolve the turn')
    expect(bubble!.getAttribute('role')).toBe('status')
    expect(bubble!.getAttribute('aria-modal')).toBeNull()
    // It is not in the way: the hold control still takes the press.
    expect(holdButton().disabled).toBe(false)
    act(() => {
      holdButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(container.querySelector('[data-hold-bubble]'), 'the completed hold did not dismiss the bubble').toBeNull()
    expect(localStorage.getItem(HOLD_HINT_SEEN_KEY)).toBe('1')
    render(gameAt(3), 'brief')
    expect(container.querySelector('[data-hold-bubble]'), 'the bubble came back on a device that has seen it').toBeNull()
  })

  it('dismisses the bubble by a tap on it, for good', () => {
    render(gameAt(2), 'brief')
    click(container.querySelector('[data-hold-bubble]')!)
    expect(container.querySelector('[data-hold-bubble]')).toBeNull()
    expect(localStorage.getItem(HOLD_HINT_SEEN_KEY)).toBe('1')
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
