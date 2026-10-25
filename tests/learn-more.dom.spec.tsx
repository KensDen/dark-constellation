// @vitest-environment jsdom
//
// A real door to the Field Library from play (critique row M7). The only
// route was 10px of underlined "learn more" beside a disclosure on a card
// that moved on by itself after a dwell, and three disclosures deep once
// the turn had played. Then:
// - LEARN MORE became a full-width 44px button on every REAL WORLD line;
// - tapping it during playback asked for the library without moving the
//   card on;
// - the aftermath listed the turn's threats, landed or held, each with the
//   same button. Opportunities had no entries.
// v1.3 R3 (brief 5.5) retired the director's playback and the aftermath
// card with it. From play, LEARN MORE is now on the night's intel card (a
// threat met for the first time offers COLLECT INTEL CARD, and the card it
// collects carries the button) and on the tile's intel card, under each
// condition's REAL WORLD line. The guards follow it there: the button's
// shape, that asking for the library does not move the night on, that
// every threat met for the first time, landed or held, offers it and no
// opportunity does, and the tile card's button per condition.
// The library itself is Game's (tests/field-library.dom.spec.tsx opens it
// for real over the night); here the provider is a stub, so what the
// button asks for and when is what is measured.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import IntelCard from '../src/ui/board/IntelCard'
import { callIndex, shortName } from '../src/ui/board/boardModel'
import { LearnMore } from '../src/ui/learnMore'
import Night, { type BoardView } from '../src/ui/night/Night'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

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

// The night's chunks, loaded once, so the night renders its cards from
// the loaded modules at once.
beforeAll(async () => {
  await import('../src/ui/night/Night')
  await import('../src/ui/night/cards')
  await import('../src/ui/night/closeCards')
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('localStorage', memoryStorage())
  // Reduced motion: the night's cards arrive at once, with no overlay and
  // no strike to wait out.
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

const kindOf = (id: string) => DEFAULT_SCENARIO.events.find((e) => e.id === id)?.kind ?? 'threat'
const q = (sel: string) => container.querySelector(sel)
const buttons = () => [...container.querySelectorAll<HTMLButtonElement>('button[data-learn-more]')]
// Where the night is: the intel card by its threat, a card by its label,
// or done.
const nightAt = () => q('[data-intel-file]')?.getAttribute('data-intel-file') ?? q('[data-night-card]')?.getAttribute('aria-label') ?? 'done'

// A turn of real play whose shape a test needs. The mixed line since v1.4:
// with one new defense a night the prepared script's nights are held
// outright or hit on every slot, and the mixed line's turn 3 blocks one
// move and lets the other through.
function find<T>(pick: (before: GameState, after: GameState) => T | undefined): T {
  for (const script of [WIN_SCRIPT, MIXED_SCRIPT, LOSS_SCRIPT]) {
    for (const seed of [20260712, 4041, ...Array.from({ length: 200 }, (_, i) => i + 1)]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const after = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
        const found = pick(state, after)
        if (found) return found
        state = after
      }
    }
  }
  throw new Error('no turn in the sweep has the shape this test needs')
}

// A tap, and the lazy cards and effects it sets off, settled.
async function tap(el: Element | null) {
  if (!el) throw new Error('nothing to tap')
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
  await act(async () => {})
}
// A key with nothing focused, which is where a playback listened for
// Space; Escape the library takes from anywhere.
const press = (key: string) =>
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })

// The night itself (src/ui/night/Night.tsx), as Game mounts it after
// EXECUTE, inside the stub provider. A night with no debris call, so the
// engine's resolution is the night's.
const onBoard = (_: BoardView) => {}
async function renderNight(turn: { before: GameState; after: GameState }, open: (id: string, from: HTMLElement) => void) {
  await act(async () => {
    root.render(
      <LearnMore.Provider value={open}>
        <Night before={turn.before} hold={turn.after} burn={null} choice={null} onCall={() => {}} onBoard={onBoard} onDone={() => {}} />
      </LearnMore.Provider>,
    )
  })
  await act(async () => {})
}
// On through the night to the next intel card: CONTINUE, COLLECT INTEL
// CARD, FILE IT on any intel card before it.
async function toIntelCard() {
  for (let guard = 0; guard < 20 && !q('[data-intel-file]'); guard += 1) await tap(q('[data-collect]') ?? q('[data-continue]'))
  expect(q('[data-intel-file]'), 'the night never reached an intel card').not.toBeNull()
}

describe("LEARN MORE on the night's intel card (critique row M7)", () => {
  // A night with a threat that landed, one that was held, and an
  // opportunity, so every branch is on screen; and no debris call, so the
  // resolution EXECUTE gives is the night's.
  const turn = find((before, after) => {
    if (callIndex(after) >= 0) return undefined
    const events = after.history.at(-1)!.events
    const threats = events.filter((ev) => kindOf(ev.eventId) === 'threat')
    const shape =
      threats.some((ev) => ev.effectiveSeverity > 0) &&
      threats.some((ev) => ev.effectiveSeverity === 0) &&
      events.some((ev) => kindOf(ev.eventId) === 'opportunity')
    return shape ? { before, after, threats } : undefined
  })

  it('is a full-width 44px button in the go colour, keeping its words for a screen reader', async () => {
    await renderNight(turn, () => {})
    await toIntelCard()
    const [button] = buttons()
    expect(button, 'the intel card has no LEARN MORE').toBeDefined()
    const id = q('[data-intel-file]')!.getAttribute('data-intel-file')!
    const def = DEFAULT_SCENARIO.events.find((e) => e.id === id)!
    expect(button.getAttribute('data-learn-more')).toBe(def.id)
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    expect(button.textContent).toBe(`LEARN MORE in the Field Library: ${shortName(def)}`)
    expect(button.querySelector('.sr-only')?.textContent).toBe(` in the Field Library: ${shortName(def)}`)
    // In the display face, as FILE IT beside it is (v1.3 R3 fresh-eyes
    // review: a thin mono LEARN MORE over a pixel FILE IT).
    for (const cls of ['w-full', 'min-h-11', 'font-display', 'text-[11px]', 'border-dc-go', 'bg-dc-go/10']) expect(button.className.split(' ')).toContain(cls)
    expect(button.className, 'still the old underlined link').not.toMatch(/underline|text-\[10px\]/)
  })

  it('asks for the library without moving the night on, and the intel card waits until it is filed', async () => {
    // This case proved PAUSE ON INTENT, then that the tap and a key meant
    // for the library left the playback's card alone. What it was for still
    // stands in the night: the card the player asked about is the card on
    // screen when they come back. Two things could take it away: the tap,
    // which lands inside the card and would step the night if the card's
    // own click took it, and a key meant for the library, which the night
    // must leave alone (it has no keys of its own; its cards are tapped).
    const asked: string[] = []
    const from: HTMLElement[] = []
    await renderNight(turn, (id, el) => {
      asked.push(id)
      from.push(el)
    })
    await toIntelCard()
    const held = nightAt()
    const [button] = buttons()
    await tap(button)
    expect(asked, 'LEARN MORE did not ask for the library about this card').toEqual([held])
    expect(from, 'LEARN MORE did not say which link asked, so focus could not come back to it').toEqual([button])
    expect(nightAt(), 'the tap on LEARN MORE moved the night on').toBe(held)
    expect(JSON.parse(localStorage.getItem('dc-dossier') ?? '[]'), 'the tap on LEARN MORE filed the card').not.toContain(held)
    // The library's keys are its own.
    press(' ')
    press('Escape')
    press('Enter')
    expect(nightAt(), 'a key meant for the library moved the night on behind it').toBe(held)
    // The positive control: FILE IT files the card and the night goes on.
    await tap(q('[data-file-it]'))
    expect(JSON.parse(localStorage.getItem('dc-dossier') ?? '[]')).toContain(held)
    expect(nightAt(), 'FILE IT did not move the night on').not.toBe(held)
  })

  it('offers it for every threat met for the first time, landed or held, and for no opportunity', async () => {
    // The aftermath's list (one tap from the end of the turn, every threat,
    // landed or held, and no opportunity) has its place in the night: each
    // threat met for the first time is collected onto an intel card with
    // LEARN MORE. Walked to the end of the night, collecting every one.
    const asked: string[] = []
    await renderNight(turn, (id) => asked.push(id))
    const offered: string[] = []
    let opportunities = 0
    for (let guard = 0; guard < 30 && nightAt() !== 'done' && !q('[data-night-card="end"]'); guard += 1) {
      if (q('[data-night-card="opportunity"]')) {
        opportunities += 1
        expect(buttons(), 'an opportunity card offers LEARN MORE').toEqual([])
      }
      const intel = q('[data-intel-file]')
      if (intel) {
        const [button] = buttons()
        expect(button, `${intel.getAttribute('data-intel-file')}'s intel card has no LEARN MORE`).toBeDefined()
        offered.push(button.getAttribute('data-learn-more')!)
        // One tap from the card.
        await tap(button)
        await tap(q('[data-file-it]'))
        continue
      }
      await tap(q('[data-collect]') ?? q('[data-continue]'))
    }
    expect(q('[data-night-card="end"]'), 'the night never reached END OF TURN').not.toBeNull()
    expect(opportunities, 'no opportunity card was seen, so its branch is untested').toBeGreaterThan(0)
    const threats = [...new Set(turn.threats.map((ev) => ev.eventId))]
    expect(offered.sort(), 'not every threat met, landed or held, offered LEARN MORE').toEqual([...threats].sort())
    expect(asked.sort()).toEqual([...threats].sort())
    // END OF TURN lists the budget, not the threats: it carries no link.
    expect(buttons()).toEqual([])
  })
})

describe("LEARN MORE in the tile's intel card (critique row M7)", () => {
  // A board of real play with a condition pressing and a live asset on its
  // layer, so the tile's card lists at least one condition with its REAL
  // WORLD line.
  const { state, assetId } = find((_, after) => {
    if (after.status !== 'playing') return undefined
    const c = after.conditions[0]
    if (!c) return undefined
    const def = DEFAULT_SCENARIO.events.find((e) => e.id === c.eventId)!
    const asset = after.assets.find((a) => def.layers.includes(a.layer) && a.integrity > 0)
    return asset ? { state: after, assetId: asset.id } : undefined
  })

  it("gives each condition on the tile's layer the same button, asking for that condition's threat", () => {
    const asked: string[] = []
    act(() => {
      root.render(
        <LearnMore.Provider value={(id) => asked.push(id)}>
          <IntelCard subject={{ kind: 'tile', assetId }} state={state} turn={state.turn} onClose={() => {}} />
        </LearnMore.Provider>,
      )
    })
    const items = [...container.querySelectorAll('li[data-intel-condition]')]
    expect(items.length, 'the tile card lists no condition').toBeGreaterThan(0)
    for (const li of items) {
      const id = li.getAttribute('data-intel-condition')!
      const def = DEFAULT_SCENARIO.events.find((e) => e.id === id)!
      const button = li.querySelector<HTMLButtonElement>('button[data-learn-more]')
      expect(button, `${id} has no LEARN MORE on the tile card`).not.toBeNull()
      expect(button!.getAttribute('data-learn-more')).toBe(id)
      expect(button!.textContent).toBe(`LEARN MORE in the Field Library: ${shortName(def)}`)
      for (const cls of ['w-full', 'min-h-11', 'font-mono', 'text-xs', 'border-dc-go', 'bg-dc-go/10']) expect(button!.className.split(' ')).toContain(cls)
      act(() => button!.click())
    }
    expect(asked).toEqual(items.map((li) => li.getAttribute('data-intel-condition')))
    // With no way to the library provided, the card shows no button rather
    // than one that does nothing.
    act(() => {
      root.render(<IntelCard subject={{ kind: 'tile', assetId }} state={state} turn={state.turn} onClose={() => {}} />)
    })
    expect(buttons()).toEqual([])
    expect(container.querySelector('li[data-intel-condition] [data-real-world-line]'), 'the control: the REAL WORLD line is gone too').not.toBeNull()
  })
})
