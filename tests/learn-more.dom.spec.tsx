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
// card with it, and LEARN MORE moved to the night's full-screen Dossier
// card (a threat met for the first time was collected onto it). v1.7 R1
// retired that card: every result in the night now carries the move's
// Dossier row (NEW DOSSIER CARD on a first meeting, IN YOUR DOSSIER
// after), closed, and the row's body holds the button. From play, then,
// LEARN MORE is on the result's Dossier row and on the tile's intel card,
// under each condition's REAL WORLD line. The guards follow it there: the
// button's shape, that asking for the library neither moves the night on
// nor files the card, that every threat met for the first time, landed or
// held, offers it and no opportunity does, and the tile card's button per
// condition.
// The library itself is Game's (tests/field-library.dom.spec.tsx opens it
// for real over the night); here the provider is a stub, so what the
// button asks for and when is what is measured.

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { answered } from '../src/engine/responses'
import type { GameState, TurnActions } from '../src/engine/types'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import IntelCard from '../src/ui/board/IntelCard'
import { callIndex, shortName } from '../src/ui/board/boardModel'
import { LearnMore } from '../src/ui/learnMore'
import { BLOCK_MS } from '../src/ui/board/strike'
import { FILED_BEAT_MS } from '../src/ui/night/cards'
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
  // The night's own clocks (the block moment and the FILED stamp, v1.7
  // R1) run on the fake one, so a test says when they pass.
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', memoryStorage())
  // Reduced motion: the night's cards arrive at once, with no overlay to
  // wait out.
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const kindOf = (id: string) => DEFAULT_SCENARIO.events.find((e) => e.id === id)?.kind ?? 'threat'
const q = (sel: string) => container.querySelector(sel)
const buttons = () => [...container.querySelectorAll<HTMLButtonElement>('button[data-learn-more]')]
// Where the night is: a card by its label, the block moment by its move,
// or done.
const nightAt = () => q('[data-night-card]')?.getAttribute('aria-label') ?? q('[data-block-moment] [data-strike-name]')?.textContent ?? 'done'
// The result on screen and the threat its Dossier row is for.
const resultCard = () => q('section[data-night-card="hit"]')
const rowId = () => resultCard()?.querySelector('details[data-dossier-row]')?.getAttribute('data-dossier-row') ?? null

// A turn of real play whose shape a test needs. The mixed line since v1.4:
// with one new defense a night the prepared script's nights are held
// outright or hit on every slot, and the mixed line's turn 3 blocks one
// move and lets the other through.
function find<T>(pick: (before: GameState, after: GameState, orders: TurnActions) => T | undefined): T {
  for (const script of [WIN_SCRIPT, MIXED_SCRIPT, LOSS_SCRIPT]) {
    for (const seed of [20260712, 4041, ...Array.from({ length: 200 }, (_, i) => i + 1)]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const orders = script[state.turn] ?? NO_OP
        const after = resolveTurn(state, orders, turnRng(state.seed, state.turn))
        const found = pick(state, after, orders)
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
// engine's resolution is the night's. Since v1.7 R1 the night asks for a
// response to each move that would land and Game resolves the turn again
// with each answer (src/ui/Game.tsx, onRespond); this stands in for Game
// the same way, through the engine's own resolver.
const onBoard = (_: BoardView) => {}
interface Turn {
  before: GameState
  after: GameState
  orders: TurnActions
}
function NightUnderTest({ turn }: { turn: Turn }) {
  const [responses, setResponses] = useState<(string | null)[]>([])
  const resolve = (r: readonly (string | null)[]) => resolveTurn(turn.before, { ...turn.orders, responses: [...r] }, turnRng(turn.before.seed, turn.before.turn))
  return (
    <Night
      before={turn.before}
      hold={resolve(responses)}
      burn={null}
      choice={null}
      responses={responses}
      preview={(i, id) => resolve(answered(responses, i, id))}
      onRespond={(i, id) => setResponses((r) => (r[i] === undefined ? answered(r, i, id) : r))}
      onCall={() => {}}
      onBoard={onBoard}
      onDone={() => {}}
    />
  )
}
async function renderNight(turn: Turn, open: (id: string, from: HTMLElement) => void) {
  await act(async () => {
    root.render(
      <LearnMore.Provider value={open}>
        <NightUnderTest turn={turn} />
      </LearnMore.Provider>,
    )
  })
  await act(async () => {})
}
const pass = async (ms: number) => {
  await act(async () => void vi.advanceTimersByTime(ms))
  await act(async () => {})
}
// One step on through the night (v1.7 R1): a move that would land is
// ridden out, the block moment is left to its own clock, FILE TO DOSSIER
// is tapped and its FILED stamp waited out, CONTINUE is tapped.
async function onward() {
  const ride = q('button[data-response="ride"]')
  if (ride) return tap(ride)
  if (q('[data-block-moment]')) return pass(BLOCK_MS + 1)
  const file = q('[data-collect]')
  if (!file) return tap(q('[data-continue]'))
  await tap(file)
  await pass(FILED_BEAT_MS + 1)
}
// On through the night to the next result card of a threat met for the
// first time: the one that offers FILE TO DOSSIER.
async function toFirstMeeting() {
  for (let guard = 0; guard < 20 && !(resultCard() && q('[data-collect]')); guard += 1) await onward()
  expect(resultCard() && q('[data-collect]'), 'the night never reached the result of a first meeting').not.toBeNull()
}

describe("LEARN MORE on the night's Dossier row (critique row M7; the intel card until v1.7 R1)", () => {
  // A night with a threat that landed, one that was held, and an
  // opportunity, so every branch is on screen; and no debris call, so the
  // resolution EXECUTE gives is the night's.
  const turn = find((before, after, orders) => {
    if (callIndex(after) >= 0) return undefined
    const events = after.history.at(-1)!.events
    const threats = events.filter((ev) => kindOf(ev.eventId) === 'threat')
    const shape =
      threats.some((ev) => ev.effectiveSeverity > 0) &&
      threats.some((ev) => ev.effectiveSeverity === 0) &&
      events.some((ev) => kindOf(ev.eventId) === 'opportunity')
    return shape ? { before, after, orders, threats } : undefined
  })

  it('is a full-width 44px button in the go colour, keeping its words for a screen reader', async () => {
    await renderNight(turn, () => {})
    await toFirstMeeting()
    const [button] = buttons()
    expect(button, 'the result has no LEARN MORE').toBeDefined()
    const def = DEFAULT_SCENARIO.events.find((e) => e.id === rowId())!
    // One tap from the card: in the body of the move's own Dossier row,
    // which arrives closed and says the card is new.
    const row = button.closest('details') as HTMLDetailsElement
    expect(row.getAttribute('data-dossier-row')).toBe(def.id)
    expect(row.open, 'the dossier row arrived open').toBe(false)
    expect(row.hasAttribute('data-fresh'), 'a first meeting does not say NEW DOSSIER CARD').toBe(true)
    expect(resultCard()!.querySelector('[data-move-name]')!.textContent).toBe(shortName(def))
    expect(button.getAttribute('data-learn-more')).toBe(def.id)
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    expect(button.textContent).toBe(`LEARN MORE in the Field Library: ${shortName(def)}`)
    expect(button.querySelector('.sr-only')?.textContent).toBe(` in the Field Library: ${shortName(def)}`)
    // In the display face, as CONTINUE beside it is (v1.3 R3 fresh-eyes
    // review: a thin mono LEARN MORE over a pixel FILE IT).
    for (const cls of ['w-full', 'min-h-11', 'font-display', 'text-[11px]', 'border-dc-go', 'bg-dc-go/10']) expect(button.className.split(' ')).toContain(cls)
    expect(button.className, 'still the old underlined link').not.toMatch(/underline|text-\[10px\]/)
  })

  it('asks for the library without moving the night on or filing the card, which waits for FILE TO DOSSIER', async () => {
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
    await toFirstMeeting()
    const held = nightAt()
    const id = rowId()!
    const filed = () => JSON.parse(localStorage.getItem('dc-dossier') ?? '[]') as string[]
    const [button] = buttons()
    await tap(button)
    expect(asked, 'LEARN MORE did not ask for the library about this card').toEqual([id])
    expect(from, 'LEARN MORE did not say which link asked, so focus could not come back to it').toEqual([button])
    expect(nightAt(), 'the tap on LEARN MORE moved the night on').toBe(held)
    // Reading about a threat is not filing it (v1.7 R1: the button is on
    // the result now, above FILE TO DOSSIER, where until then it was on
    // the card that arrived already filed).
    expect(filed(), 'LEARN MORE filed the card').not.toContain(id)
    expect(q('[data-collect]'), 'LEARN MORE took FILE TO DOSSIER away').not.toBeNull()
    // The library's keys are its own.
    press(' ')
    press('Escape')
    press('Enter')
    expect(nightAt(), 'a key meant for the library moved the night on behind it').toBe(held)
    expect(filed()).not.toContain(id)
    // And however long the player reads, the card is still there.
    await pass(60_000)
    expect(nightAt(), 'the night moved on while the player read').toBe(held)
    // The positive control: FILE TO DOSSIER files it at the tap, stamps
    // it, and the night goes on by itself a beat later.
    await tap(q('[data-collect]'))
    expect(filed(), 'the card was not filed at FILE TO DOSSIER').toContain(id)
    expect(q('[data-filed-stamp]'), 'no FILED stamp').not.toBeNull()
    expect(nightAt()).toBe(held)
    await pass(FILED_BEAT_MS + 1)
    expect(nightAt(), 'the night did not go on after the FILED stamp').not.toBe(held)
  })

  it('offers it for every threat met for the first time, landed or held, and for no opportunity', async () => {
    // The aftermath's list (one tap from the end of the turn, every threat,
    // landed or held, and no opportunity) has its place in the night: each
    // threat met for the first time has a result with its Dossier row, a
    // held one after its block moment, and the row carries LEARN MORE.
    // Walked to the end of the night, asking about and filing every one.
    const asked: string[] = []
    await renderNight(turn, (id) => asked.push(id))
    const offered: string[] = []
    let opportunities = 0
    let blocks = 0
    for (let guard = 0; guard < 40 && nightAt() !== 'done' && !q('[data-night-card="end"]'); guard += 1) {
      if (q('[data-night-card="opportunity"]')) {
        opportunities += 1
        expect(buttons(), 'an opportunity card offers LEARN MORE').toEqual([])
      }
      // Neither the response card nor the block moment is the card: the
      // button comes with the result.
      if (q('[data-night-card="respond"]') || q('[data-block-moment]')) expect(buttons(), 'LEARN MORE before the result').toEqual([])
      if (q('[data-block-moment]')) blocks += 1
      if (resultCard()) {
        const [button] = buttons()
        expect(button, `${rowId()}'s result has no LEARN MORE`).toBeDefined()
        expect(button.getAttribute('data-learn-more')).toBe(rowId())
        offered.push(button.getAttribute('data-learn-more')!)
        // One tap from the card.
        await tap(button)
      }
      await onward()
    }
    expect(q('[data-night-card="end"]'), 'the night never reached END OF TURN').not.toBeNull()
    expect(opportunities, 'no opportunity card was seen, so its branch is untested').toBeGreaterThan(0)
    expect(blocks, 'no block moment was seen, so the held branch is untested').toBeGreaterThan(0)
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
