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
// - the hidden page: the night's cards wait for a tap, and its clocks (the
//   750ms overlay, the block moment and the FILED stamp since v1.7 R1,
//   where the strike before a hit card gave way to the response card) stop
//   while the tab is hidden and finish when it comes back (brief 8.3), so
//   what was on screen when the phone locked is what is on screen when it
//   wakes;
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
import { playNight } from '../src/engine/responses'
import { BLOCK_MS, LOCK_SHARE } from '../src/ui/board/strike'
import { FILED_BEAT_MS } from '../src/ui/night/cards'
import { nightOf } from '../src/ui/night/nightModel'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { sensible } from './policies'
import { NO_OP, WIN_SCRIPT, debrisTurnOf } from './scripts'

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
// v1.7 R1: the full-screen Dossier card is gone, so a stage is a card, the
// overlay, the block moment (the one strike left) or the board.
const stage = () => q('[data-night-card]')?.getAttribute('data-night-card') ?? (q('[data-moving]') ? 'moving' : q('[data-block-moment]') ? 'strike' : q('[data-dock]') ? 'board' : 'none')
// What is up, by name: the card's label, or the stage.
const onScreen = () => q('[data-night-card]')?.getAttribute('aria-label') ?? stage()
// The tap a stage asks for: an answer on the response card (v1.7 R1), the
// tap that ends a block moment, the call, FILE TO DOSSIER or CONTINUE,
// BEGIN. `answer` is how the response is met: ridden out, or the first
// answer the budget can meet, which is what the `sensible` responder of
// tests/policies.ts takes.
let callChoice: 'burn' | 'hold' = 'hold'
let answer: 'ride' | 'sensible' = 'ride'
const respondWay = () => (answer === 'sensible' ? q('[data-responses] button[data-effect]:not([disabled])') : null) ?? q('[data-responses] button[data-response="ride"]')
const way = () => respondWay() ?? q('[data-strike-tap]') ?? q(`[data-call="${callChoice}"]`) ?? q('[data-collect]') ?? q('[data-continue]') ?? q('[data-begin]')
// One step of a night under fake timers: the tap the stage asks for, or,
// with nothing to tap (the overlay, the FILED stamp), the time it takes.
async function onward() {
  const el = way()
  if (el) await tap(el)
  else await advance(FILED_BEAT_MS + 1)
}
async function order(ids: string[]) {
  if (!ids.length) return
  await tap(q('[data-action="procure"]'))
  for (const id of ids) await tap(q(`[data-procure-defense="${id}"]`))
  await tap(q('[data-confirm]'))
}

describe('the night: the behaviour the source pins could only spell', () => {
  it('waits for the player on every card, hidden page or not, and stops its clocks while the page is hidden', async () => {
    // Until v1.3 Round 0 this case proved the hidden-page pause of the
    // director's dwell; until R3, that the beat on screen waited for a tap
    // with the page hidden or not. Through v1.6 the night's two clocks were
    // the overlay and the strike. Since v1.7 R1 no strike stands before a
    // hit card: three things run on their own, the overlay, the block
    // moment (a move a defense stops) and the FILED stamp, and they stop
    // while the page is hidden and finish their time when it comes back
    // (brief 8.3); every card waits for a tap. So the phone locks right
    // after EXECUTE, in the middle of the block moment, on the card, and on
    // the stamp; a minute passes each time, far past any clock. A clock
    // that ran on behind the hidden page fails its half, a card that moved
    // on its own fails the card's, and the tap is the control that shows
    // the night can move.
    //
    // Turn 3 of the prepared line on the anchor seed, with its order placed
    // through PROCURE: both of its moves are stopped by the defenses the
    // line owns by then, and neither is in the Dossier, so
    // the night is a block moment, its card to file, and another block
    // moment.
    reduced = false
    vi.useFakeTimers()
    const state = gameAt(3)
    const steps = nightOf(state, resolveTurn(state, WIN_SCRIPT[3], turnRng(state.seed, state.turn))).steps
    expect(
      steps.map((x) => x.kind === 'threat' && x.ev.effectiveSeverity === 0 && x.ev.room === undefined),
      'the fixture changed: turn 3 no longer opens on two moves that defenses stop',
    ).toEqual([true, true])
    render(state)
    await order(WIN_SCRIPT[3].buyCounters)
    await tap(q('[data-execute]'))
    expect(stage(), 'EXECUTE did not open COLDVEIL IS MOVING').toBe('moving')
    setHidden(true)
    await advance(60_000)
    expect(stage(), 'the overlay ran on behind a hidden page').toBe('moving')
    setHidden(false)
    await advance(751)
    expect(stage(), 'the overlay did not finish once the page came back').toBe('strike')
    expect(q('[data-block-moment] [data-strike-word="held"]')?.textContent, 'the block moment does not say BLOCKED').toBe('BLOCKED')

    // Mid lock-on, the page hides again.
    await advance(100)
    const locked = () => !!q('button[data-shield="lock"]')
    expect(locked(), 'the block moment is not locking on').toBe(true)
    setHidden(true)
    await advance(60_000)
    expect(stage(), 'the block moment ran on behind a hidden page').toBe('strike')
    expect(locked(), 'the shield landed behind a hidden page').toBe(true)
    setHidden(false)
    await advance(BLOCK_MS * LOCK_SHARE + 1)
    expect(locked(), 'the shield did not land once the page came back').toBe(false)
    expect(stage(), 'the block moment ended as it landed').toBe('strike')
    // Landed, the page hides once more: the rest of its time waits too.
    setHidden(true)
    await advance(60_000)
    expect(stage(), 'the landed block moment ran on behind a hidden page').toBe('strike')
    setHidden(false)
    await advance(BLOCK_MS * (1 - LOCK_SHARE) + 1)
    expect(stage(), 'the block moment did not give way to its card to file').toBe('hit')

    // The card waits, hidden or not.
    const opening = onScreen()
    expect(q('[data-collect]'), 'a threat met for the first time offers no FILE TO DOSSIER').not.toBeNull()
    setHidden(true)
    await advance(60_000)
    expect(onScreen(), 'the card moved on behind a hidden page').toBe(opening)
    setHidden(false)
    await advance(60_000)
    expect(onScreen(), 'the card moved on without the player once the page came back').toBe(opening)
    expect(q('[data-collect]'), 'the card filed itself').not.toBeNull()

    // FILE TO DOSSIER: the stamp, whose beat is the third clock.
    await tap(q('[data-collect]'))
    expect(q('[data-filed-stamp]')?.textContent, 'FILE TO DOSSIER did not stamp the card').toBe(`FILED · 1 / ${DEFAULT_SCENARIO.events.filter((e) => e.kind !== 'opportunity').length}`)
    expect(q('[data-collect]'), 'the button stayed beside its stamp').toBeNull()
    setHidden(true)
    await advance(60_000)
    expect(q('[data-filed-stamp]'), 'the FILED stamp ran on behind a hidden page').not.toBeNull()
    expect(onScreen()).toBe(opening)
    setHidden(false)
    await advance(FILED_BEAT_MS + 1)
    expect(q('[data-filed-stamp]'), 'the FILED stamp did not finish once the page came back').toBeNull()
    expect(stage(), 'the night did not go on by itself after the stamp').toBe('strike')
    expect(onScreen(), 'the night did not move on').not.toBe(opening)
  })

  it('waits on the response card until the player answers, hidden page or not (v1.7 R1)', async () => {
    // The response card replaced the strike's hold before a hit: nothing
    // advances until one of its buttons is clicked, and the answer turns
    // the same screen into the result. Turn 1 on the anchor seed, with no
    // orders: one move, which would land.
    reduced = false
    vi.useFakeTimers()
    render(gameAt(1))
    await tap(q('[data-execute]'))
    await advance(751)
    expect(stage(), 'a move that would land did not stop the night on THE RESPONSE').toBe('respond')
    const asked = onScreen()
    expect(q('[data-responses]')?.getAttribute('role')).toBe('group')
    expect(q('[data-responses] button[data-response="ride"]'), 'no RIDE IT OUT on the response card').not.toBeNull()
    expect(q('[data-responses] button[data-effect]'), 'the response card offers no answer').not.toBeNull()
    setHidden(true)
    await advance(60_000)
    expect(onScreen(), 'the response card moved on behind a hidden page').toBe(asked)
    setHidden(false)
    await advance(60_000)
    expect(onScreen(), 'the response card answered itself').toBe(asked)
    await tap(q('[data-responses] button[data-response="ride"]'))
    expect(stage(), 'the answer did not turn the screen into the result').toBe('hit')
    expect(q('[data-response-taken]')?.getAttribute('data-response-taken')).toBe('ride')
    // And the result waits in its turn.
    const result = onScreen()
    await advance(60_000)
    expect(onScreen(), 'the result moved on without the player').toBe(result)
    // FILE TO DOSSIER, its stamp's beat, and the night goes on by itself:
    // to END OF TURN, this being the night's one move.
    await tap(q('[data-collect]'))
    expect(q('[data-filed-stamp]'), 'FILE TO DOSSIER did not stamp the card').not.toBeNull()
    await advance(FILED_BEAT_MS + 1)
    expect(stage(), 'the night did not go on after the stamp').toBe('end')
  })

  it('gives every move a card of its own, so nothing opened on one is still open on the next', async () => {
    // The defect this replaces: the layer badge's pulse was a class on a
    // node that never remounted, so two consecutive beats on the same layer
    // at the same tone left a finished animation in place. The night's case
    // is two result cards in one night: one component, the same classes,
    // and a card the player can change (the IN YOUR DOSSIER row opens).
    // Without a card per move the row the player opened would arrive open
    // on a card about another threat. Since v1.7 R1 each of the two is
    // reached through its response card, ridden out here, and the result
    // takes the response's place on the same screen. Reduced motion, so no
    // overlay stands before them, and both threats filed, so each offers
    // CONTINUE.
    const turn = (() => {
      for (let t = 1; t <= DEFAULT_SCENARIO.totalTurns; t += 1) {
        const state = gameAt(t)
        if (state.status !== 'playing') break
        const steps = nightOf(state, resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))).steps
        const lands = (k: number) => steps[k].kind === 'threat' && steps[k].ev.room !== undefined
        if (steps.length >= 2 && lands(0) && lands(1) && steps[0].def.id !== steps[1].def.id) return { state, ids: [steps[0].def.id, steps[1].def.id] }
      }
      throw new Error('no night of the prepared line opens on two moves that would land')
    })()
    localStorage.setItem('dc-dossier', JSON.stringify(turn.ids))
    render(turn.state)
    await tap(q('[data-execute]'))
    const asked = q('section[data-night-card="respond"]')!
    expect(asked, 'the night did not open on the response card').not.toBeNull()
    await tap(q('[data-responses] button[data-response="ride"]'))
    const first = q('section[data-night-card="hit"]')!
    expect(first, 'the answer did not bring the result card').not.toBeNull()
    expect(asked.isConnected, 'the response card is still up under its result').toBe(false)
    const row = first.querySelector<HTMLDetailsElement>(`details[data-dossier-row="${turn.ids[0]}"]`)!
    expect(row, 'the first card has no dossier row').not.toBeNull()
    expect(row.hasAttribute('data-fresh'), 'a filed threat reads as a new Dossier card').toBe(false)
    row.open = true
    await tap(q('[data-continue]'))
    expect(first.isConnected, 'the first card survived the move change').toBe(false)
    expect(q('section[data-night-card="respond"]'), 'the second move did not stop the night on its response card').not.toBeNull()
    await tap(q('[data-responses] button[data-response="ride"]'))
    const second = q('section[data-night-card="hit"]')!
    expect(second, 'the second move has no hit card').not.toBeNull()
    expect(second, 'the second card is the same element as the first').not.toBe(first)
    const next = second.querySelector<HTMLDetailsElement>('details[data-dossier-row]')!
    expect(next.getAttribute('data-dossier-row')).toBe(turn.ids[1])
    expect(next.open, 'the row opened on the first card arrived open on the second').toBe(false)
  })

  it('ends the deciding turn on END OF TURN with its outcome, and DEBRIEF goes to the debrief', async () => {
    // This was "the deciding turn ends on an outcome beat" (MISSION
    // ASSURED) in the director battery. The night ends on END OF TURN,
    // whose last edition says how the operation ended and offers DEBRIEF
    // in place of BEGIN TURN (brief 5.5 item 6). Since v1.7 R1 nobody wins
    // with every move ridden out, so the prepared line gets here answering
    // each night with the first response its budget can meet (the
    // `sensible` responder), and answers the last night the same way on
    // the response card; that wins on the anchor seed. Its last night has
    // one defense left to place, which goes in through PROCURE as a player
    // places it.
    let state = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
    while (state.status === 'playing' && state.turn < DEFAULT_SCENARIO.totalTurns) state = playNight(state, WIN_SCRIPT[state.turn] ?? NO_OP, sensible)
    expect(state.status, 'the fixture ended before its last turn').toBe('playing')
    expect(playNight(state, WIN_SCRIPT[state.turn] ?? NO_OP, sensible).status, 'the fixture no longer wins').toBe('won')
    // The control: the same orders with every move ridden out lose, so the
    // win below is the answers' doing.
    expect(gameAt(DEFAULT_SCENARIO.totalTurns + 1).status, 'the prepared line wins unanswered, so the responses prove nothing').toBe('lost')
    vi.useFakeTimers()
    answer = 'sensible'
    try {
      render(state)
      await order(WIN_SCRIPT[state.turn]?.buyCounters ?? [])
      await tap(q('[data-execute]'))
      let answers = 0
      for (let i = 0; i < 40 && stage() !== 'end'; i += 1) {
        if (q('[data-responses] button[data-effect]:not([disabled])')) answers += 1
        await onward()
      }
      expect(answers, 'the deciding night offered no answer the budget could meet').toBeGreaterThan(0)
    } finally {
      answer = 'ride'
    }
    expect(stage(), 'the deciding night never reached END OF TURN').toBe('end')
    const ending = q('[data-night-card="end"] [data-ending]')
    expect(ending?.getAttribute('data-ending')).toBe('won')
    expect(ending!.textContent).toBe(`MISSION HELDThe architecture held through turn ${DEFAULT_SCENARIO.totalTurns}.`)
    // The one line of advice is for a next turn, and there is none.
    expect(q('[data-end-fix]'), 'the last END OF TURN still advises on a next turn').toBeNull()
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
  // The night of the call: turn 5 on this seed, which trades turns 4 and 5
  // (v1.6 R1).
  const callNight = () => gameAt(debrisTurnOf(20260712), 20260712, {})
  const budget = () => q('span[aria-label^="BUDGET"]') as HTMLElement
  const value = () => Number(/BUDGET (-?\d+)/.exec(budget().getAttribute('aria-label') ?? '')?.[1] ?? NaN)
  // The readout's valence, which its tick sounds: since v1.6 R1 the budget
  // is painted red only below zero, so the change is read off the readout,
  // not its colour.
  const tone = () => budget().getAttribute('data-tone')

  async function burnNight(orders: string[]) {
    callChoice = 'burn'
    try {
      render(callNight())
      await order(orders)
      const before = value()
      await tap(q('[data-execute]'))
      expect(stage(), 'the night did not open on the call').toBe('call')
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
