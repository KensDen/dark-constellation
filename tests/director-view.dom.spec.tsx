// @vitest-environment jsdom
//
// The night's view: guarantees that a source pin can only spell out. This
// file held the v1.1 director's playback view (DirectorView.tsx): the
// layer badge restarting on a repeated layer, and the beat on screen
// waiting for the player, hidden page or not. Both were pinned by reading
// DirectorView.tsx as text, which the Round 4c audit classified as
// unverified under the qualified principle 10: a text pin proves the
// spelling is present, not that the program behaves.
//
// v1.3 R3 (brief 5.5) retired the director and its view for THE NIGHT
// (src/ui/night/), and the guarantees went with the behaviour:
// - the hidden page: the night's cards wait for a tap, and its two clocks
//   (the 750ms overlay and the strike) stop while the tab is hidden and
//   finish when it comes back (brief 8.3), so what was on screen when the
//   phone locked is what is on screen when it wakes;
// - the badge restart, which was about a repeated element keeping what the
//   last beat left on it: each move now gets a card of its own, so nothing
//   the player opened on one card is still open on the next;
// and two of the director battery's (tests/director.spec.ts) that need the
// real screen: the deciding turn ends on its outcome, and the spend the
// player chose is declared once, so a cost later in the night reads as a
// loss.
//
// Rendering the real game over real play is what proves the behaviour,
// and none of these can be satisfied by writing the code differently.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { LOCK_SHARE, STRIKE_MS } from '../src/ui/board/strike'
import { nightOf } from '../src/ui/night/nightModel'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { NO_OP, WIN_SCRIPT } from './scripts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root
let unlisten: () => void
let reduced = true

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

// The night's chunks and the debrief, loaded once, so each renders from
// its loaded module at once.
beforeAll(async () => {
  await import('../src/ui/night/Night')
  await import('../src/ui/night/cards')
  await import('../src/ui/night/closeCards')
  await import('../src/ui/Debrief')
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  reduced = true
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? reduced : false,
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
  // The visibilityState spy would otherwise leak into the next test and
  // leave it running behind a hidden page.
  vi.restoreAllMocks()
})

function gameAt(turn: number, seed = 20260712, script: Record<number, TurnActions> = WIN_SCRIPT): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing' && state.turn < turn) state = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
  return state
}

let mounts = 0
function render(state: GameState) {
  mounts += 1
  act(() => {
    root.render(<Game key={`m${mounts}`} initial={{ state, phase: 'brief' }} onExit={() => {}} />)
  })
}
const q = (sel: string) => container.querySelector(sel)
// A tap, and the cards and effects it sets off, settled.
async function tap(el: Element | null) {
  if (!el) throw new Error('nothing to tap')
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
  await act(async () => {})
}
async function advance(ms: number) {
  await act(async () => void vi.advanceTimersByTime(ms))
  await act(async () => {})
}
// The page hiding or coming back, as the browser reports it: the state the
// policy reads, and the event it listens for.
function setHidden(hidden: boolean) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(hidden ? 'hidden' : 'visible')
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}
const stage = () =>
  q('[data-intel-file]') ? 'intel' : (q('[data-night-card]')?.getAttribute('data-night-card') ?? (q('[data-moving]') ? 'moving' : q('[data-strike-banner]') ? 'strike' : q('[data-dock]') ? 'board' : 'none'))
// What is up, by name: the card's label, the intel card's threat, or the
// stage.
const onScreen = () => (q('[data-intel-file]') ?? q('[data-night-card]'))?.getAttribute('aria-label') ?? q('[data-intel-file]')?.getAttribute('data-intel-file') ?? stage()
// The tap a card asks for: FILE IT, the call, COLLECT or CONTINUE, BEGIN.
let callChoice: 'burn' | 'hold' = 'hold'
const way = () => q('[data-file-it]') ?? q(`[data-call="${callChoice}"]`) ?? q('[data-collect]') ?? q('[data-continue]') ?? q('[data-begin]')
async function order(ids: string[]) {
  if (!ids.length) return
  await tap(q('[data-action="procure"]'))
  for (const id of ids) await tap(q(`[data-procure-defense="${id}"]`))
  await tap(q('[data-confirm]'))
}

describe('the night: the behaviour the source pins could only spell', () => {
  it('waits for the player on every card, hidden page or not, and stops its two clocks while the page is hidden', async () => {
    // Until v1.3 Round 0 this case proved the hidden-page pause of the
    // director's dwell; until R3, that the beat on screen waited for a tap
    // with the page hidden or not. In the night two things still run on
    // their own, the overlay and the strike, and they stop while the page
    // is hidden and finish their time when it comes back (brief 8.3); every
    // card waits for a tap. So the phone locks right after EXECUTE, in the
    // middle of the strike, and on the card; a minute passes each time, far
    // past either clock. A clock that ran on behind the hidden page fails
    // the first two halves, a card that moved on its own the third, and
    // the tap at the end is the control that shows the night can move.
    reduced = false
    vi.useFakeTimers()
    render(gameAt(1))
    await tap(q('[data-execute]'))
    expect(stage(), 'EXECUTE did not open COLDVEIL IS MOVING').toBe('moving')
    setHidden(true)
    await advance(60_000)
    expect(stage(), 'the overlay ran on behind a hidden page').toBe('moving')
    setHidden(false)
    await advance(751)
    expect(stage(), 'the overlay did not finish once the page came back').toBe('strike')

    // Mid lock-on, the page hides again.
    await advance(100)
    const locked = () => !!q('button[data-struck="lock"], button[data-shield="lock"]')
    expect(locked(), 'the strike is not locking on').toBe(true)
    setHidden(true)
    await advance(60_000)
    expect(stage(), 'the strike ran on behind a hidden page').toBe('strike')
    expect(locked(), 'the strike landed behind a hidden page').toBe(true)
    setHidden(false)
    await advance(STRIKE_MS * LOCK_SHARE + 1)
    expect(locked(), 'the strike did not land once the page came back').toBe(false)
    await advance(STRIKE_MS * (1 - LOCK_SHARE) + 1)
    expect(stage(), 'the strike did not give way to its card').toBe('hit')

    // The card waits, hidden or not.
    const opening = onScreen()
    setHidden(true)
    await advance(60_000)
    expect(onScreen(), 'the card moved on behind a hidden page').toBe(opening)
    setHidden(false)
    await advance(60_000)
    expect(onScreen(), 'the card moved on without the player once the page came back').toBe(opening)
    await tap(way())
    expect(onScreen(), 'a tap on the way on did not move the night on').not.toBe(opening)
  })

  it('gives every move a card of its own, so nothing opened on one is still open on the next', async () => {
    // The defect this replaces: the layer badge's pulse was a class on a
    // node that never remounted, so two consecutive beats on the same layer
    // at the same tone left a finished animation in place. The night's case
    // is two hit cards in a row: one component, the same classes, and a
    // card the player can change (the IN YOUR DOSSIER row opens). Without a
    // card per move React would reconcile the second into the first's
    // nodes, and the row the player opened would arrive open on a card
    // about another threat. Reduced motion, so no strike stands between
    // the two, and both threats filed, so no intel card does.
    const turn = (() => {
      for (let t = 1; t <= DEFAULT_SCENARIO.totalTurns; t += 1) {
        const state = gameAt(t)
        if (state.status !== 'playing') break
        const steps = nightOf(state, resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))).steps
        if (steps.length >= 2 && steps[0].kind === 'threat' && steps[1].kind === 'threat' && steps[0].def.id !== steps[1].def.id) return { state, ids: [steps[0].def.id, steps[1].def.id] }
      }
      throw new Error('no night of the prepared line opens on two hit cards in a row')
    })()
    localStorage.setItem('dc-dossier', JSON.stringify(turn.ids))
    render(turn.state)
    await tap(q('[data-execute]'))
    const first = q('section[data-night-card="hit"]')!
    expect(first, 'the night did not open on a hit card').not.toBeNull()
    const row = first.querySelector<HTMLDetailsElement>(`details[data-dossier-row="${turn.ids[0]}"]`)!
    expect(row, 'the first card has no dossier row').not.toBeNull()
    row.open = true
    await tap(q('[data-continue]'))
    const second = q('section[data-night-card="hit"]')!
    expect(second, 'the second move has no hit card').not.toBeNull()
    expect(first.isConnected, 'the first card survived the move change').toBe(false)
    expect(second, 'the second card is the same element as the first').not.toBe(first)
    const next = second.querySelector<HTMLDetailsElement>('details[data-dossier-row]')!
    expect(next.getAttribute('data-dossier-row')).toBe(turn.ids[1])
    expect(next.open, 'the row opened on the first card arrived open on the second').toBe(false)
  })

  it('ends the deciding turn on END OF TURN with its outcome, and DEBRIEF goes to the debrief', async () => {
    // This was "the deciding turn ends on an outcome beat" (MISSION
    // ASSURED) in the director battery. The night ends on END OF TURN,
    // whose last edition says how the operation ended and offers DEBRIEF
    // in place of BEGIN TURN (brief 5.5 item 6). The prepared line wins on
    // the anchor seed. Its last night ordered nothing until v1.4; with one
    // new defense a night it has one left to place, which goes in through
    // PROCURE as a player places it.
    const state = gameAt(DEFAULT_SCENARIO.totalTurns)
    expect(resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn)).status, 'the fixture no longer wins').toBe('won')
    render(state)
    const last = WIN_SCRIPT[state.turn]?.buyCounters ?? []
    if (last.length > 0) {
      await tap(q('[data-action="procure"]'))
      for (const id of last) await tap(q(`[data-procure-defense="${id}"]`))
      await tap(q('[data-confirm]'))
    }
    await tap(q('[data-execute]'))
    for (let i = 0; i < 20 && stage() !== 'end'; i += 1) await tap(way())
    expect(stage(), 'the deciding night never reached END OF TURN').toBe('end')
    const ending = q('[data-night-card="end"] [data-ending]')
    expect(ending?.getAttribute('data-ending')).toBe('won')
    expect(ending!.textContent).toBe(`MISSION HELDThe architecture held through turn ${DEFAULT_SCENARIO.totalTurns}.`)
    expect(q('button[data-begin]')!.textContent).toBe('DEBRIEF')
    await tap(q('button[data-begin]'))
    await act(async () => {})
    expect(q('[data-night-card]'), 'a card followed END OF TURN').toBeNull()
    expect(q('[data-debrief]'), 'DEBRIEF did not open the debrief').not.toBeNull()
  })
})

describe('the declared spend through the night', () => {
  // From the director battery: "declares a spend only where a purchase was
  // folded in, and never for damage". The orders land as the night opens
  // (brief 5.5), and the HUD's budget must not read the player's own spend
  // as damage there (tests/game.dom.spec.tsx drives that half). This is
  // the other half: once the orders have landed, the declaration is spent,
  // so a cost later in the same night (a burn's unbudgeted fuel) reads as
  // the loss it is. A declaration left standing would add the orders back
  // onto every later change and paint the fuel as a gain.
  //
  // Turn 4 of the anchor seed, played with no orders before it, makes the
  // debris call first (GUARD R3 (e) in tests/night-r3.dom.spec.tsx), with
  // no SSA service, so BURN costs fuel. The order is ground zero trust,
  // which costs more than the fuel, so the two cannot be told apart by
  // sign alone.
  const callNight = () => gameAt(4, 20260712, {})
  const budget = () => q('span[aria-label^="BUDGET"]') as HTMLElement
  const value = () => Number(/BUDGET (-?\d+)/.exec(budget().getAttribute('aria-label') ?? '')?.[1] ?? NaN)
  const tone = () => (/dc-flash-bad/.test(budget().className) ? 'bad' : /dc-flash-good/.test(budget().className) ? 'good' : 'neutral')

  async function burnNight(orders: string[]) {
    callChoice = 'burn'
    try {
      render(callNight())
      await order(orders)
      const before = value()
      await tap(q('[data-execute]'))
      expect(stage(), 'turn 4 did not open on the call').toBe('call')
      const opened = { delta: value() - before, tone: tone() }
      await tap(q('[data-call="burn"]'))
      expect(stage(), 'BURN did not show the result').toBe('debris')
      const fuel = { delta: value() - (before + opened.delta), tone: tone() }
      return { opened, fuel }
    } finally {
      callChoice = 'hold'
    }
  }

  it('reads the fuel as a loss with no orders (the control)', async () => {
    const { opened, fuel } = await burnNight([])
    expect(opened.delta).toBe(0)
    expect(fuel.delta, 'BURN cost no fuel, so the fixture proves nothing').toBeLessThan(0)
    expect(fuel.tone).toBe('bad')
  })

  it('declares the orders once, as they land, and reads the fuel after them as a loss', async () => {
    const zeroTrust = DEFAULT_SCENARIO.countermeasures.find((c) => c.id === 'groundZeroTrust')!
    const { opened, fuel } = await burnNight([zeroTrust.id])
    // The orders land as the night opens, and read as neither damage nor
    // gain.
    expect(opened.delta).toBe(-zeroTrust.cost)
    expect(opened.tone, "the player's own orders read as damage or gain").toBe('neutral')
    // The fuel, later in the same night, is a cost nobody declared.
    expect(fuel.delta, 'BURN cost no fuel, so the fixture proves nothing').toBeLessThan(0)
    expect(-fuel.delta, 'the fuel costs as much as the orders, so a standing declaration would not show').toBeLessThan(zeroTrust.cost)
    expect(fuel.tone, `the ${-fuel.delta} CR of fuel was read with the ${zeroTrust.cost} CR of orders still declared`).toBe('bad')
  })
})
