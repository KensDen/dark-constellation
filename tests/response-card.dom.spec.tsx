// @vitest-environment jsdom
//
// THE RESPONSE AND THE BLOCK MOMENT (v1.7 R1, Ken's rulings of 9 November
// 2026: a decision in the night, and blocks that land). This file stands
// where tests/strike-card.dom.spec.tsx stood: the phone's strike card it
// held (StrikeCard, v1.6 R1 and R2) is removed, since a hit has no strike
// before its card any more. What replaced it is held here, in the real
// game over real play:
//   (a) every response is a real button whose accessible name carries its
//       words, its cost in CR and what it does, and riding it out is
//       always offered, free;
//   (b) a response the budget cannot meet is shown, disabled, and says why
//       in its name;
//   (c) one response a night: after one, the next move's paid responses
//       are disabled and say so, and riding it out is still there;
//   (d) the answer's result is the same screen: BLOCKED, HALVED or HIT,
//       what the player did, the Dossier row and FILE TO DOSSIER on a
//       first meeting, and the answer that was passed up when one fitted;
//   (e) a move a defense stops plays the block moment on its own: BLOCKED,
//       the move's name, the streak and a line for a screen reader, for
//       BLOCK_MS (also with motion off) or until a tap;
//   (f) the figure on each button is what the engine then does when that
//       button is taken: the score's change, the cost, and the turn the
//       game commits.
// The oracle throughout is the engine's own resolver, called here with the
// answers the test has given so far, never the night's model or the
// figures Game hands the card.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { RESPONSE_TEXT } from '../src/content/responseText'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { answered, openChoice, playNight, responseOptions, type ResponseOption, type Responder } from '../src/engine/responses'
import { turnRng } from '../src/engine/rng'
import { RESPONSES_PER_NIGHT, RESPONSE_COST_PER_POINT, RESPONSE_DAMAGE_SHARE, billAfter, exposedOf } from '../src/engine/rules'
import type { GameState, ResolvedEvent, ThreatEvent, TurnActions } from '../src/engine/types'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { callIndex, shortName } from '../src/ui/board/boardModel'
import { BLOCK_MS } from '../src/ui/board/strike'
import { FILED_BEAT_MS } from '../src/ui/night/cards'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { POLICIES, ride, sensible } from './policies'
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

// The night's chunks, loaded once, so the night renders its cards from
// the loaded modules at once.
beforeAll(async () => {
  await import('../src/ui/night/Night')
  await import('../src/ui/night/cards')
  await import('../src/ui/night/closeCards')
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // Reduced motion unless a test says otherwise: no overlay to wait out.
  // The block moment and the FILED stamp keep their clocks either way, on
  // the fake one.
  reduced = true
  vi.useFakeTimers()
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
})

// THE ORACLE: the engine's resolution of a night from the orders and the
// answers given so far, every other move ridden out, with HOLD on a debris
// call (which is the call these tests make).
const defOf = (id: string): ThreatEvent => DEFAULT_SCENARIO.events.find((e) => e.id === id)!
const isThreat = (ev: ResolvedEvent) => !ev.debris && (defOf(ev.eventId).kind ?? 'threat') === 'threat'
const resolve = (state: GameState, responses: readonly (string | null)[] = [], orders: TurnActions = NO_OP): GameState =>
  resolveTurn(state, { ...orders, debris: 'hold', responses: [...responses] }, turnRng(state.seed, state.turn))
const eventsOf = (after: GameState) => after.history.at(-1)!.events
// The score's change across move `i` were it answered with `id`, to one
// decimal, as the engine records it.
const changeOf = (state: GameState, responses: readonly (string | null)[], i: number, id: string | null) => {
  const ev = eventsOf(resolve(state, answered(responses, i, id)))[i]
  return Math.round((ev.scoreAfter - ev.scoreBefore) * 10) / 10
}
// What is on screen to answer: the first move with no answer yet, as the
// engine has it ridden out, and its options.
function offerOf(state: GameState, responses: readonly (string | null)[]) {
  const events = eventsOf(resolve(state, responses))
  const i = openChoice(events, responses)
  if (i < 0) return null
  const ev = events[i]
  const def = defOf(ev.eventId)
  return { i, ev, def, options: responseOptions(def, ev, state.difficulty) }
}
type Shown = NonNullable<ReturnType<typeof offerOf>>

// The words the card must say, written out here rather than read from the
// night's copy, so a change to them is a change to this file too.
const figure = (d: number) => (d < -0.05 ? `score ${d.toFixed(1)}` : 'no loss')
// The repair bill the answer leaves, from the engine's resolution with it
// taken, and the figure as the button says it: the score's change, then
// the bill when there is one (v1.7 R1's fresh eyes: FREE hid the bill).
const billOf = (state: GameState, responses: readonly (string | null)[], i: number, id: string | null) => eventsOf(resolve(state, answered(responses, i, id)))[i].repairCost
const withBill = (d: number, bill: number) => `${figure(d)}${bill > 0 ? `, repair ${bill} CR` : ''}`
const EFFECT = { block: 'Blocks it', halve: 'Half damage' } as const
// `free` is what the budget has for the option: the move's room less what
// is left of its own repair bill once the option is taken (freeFor).
const reasonFor = (o: ResponseOption, free: number) => (o.fits ? '' : o.why === 'used' ? 'Your one response tonight is used' : `Not enough budget: ${Math.max(0, free)} CR free after bills`)
const freeFor = (def: ThreatEvent, ev: ResolvedEvent, o: ResponseOption, state: GameState) => ev.room! - billAfter(def, exposedOf(ev), RESPONSE_DAMAGE_SHARE[o.effect], state.difficulty)
const wordsOf = (def: ThreatEvent, id: string) => RESPONSE_TEXT[def.id]?.[id] ?? ''
// An option that can be taken states its figure. One that cannot states
// what it would do and why it cannot, with no figure: the engine rides
// such a move out, so there is no resolution of it to read one from (the
// card took the ridden-out figure for it until this file found a disabled
// "Blocks it: score -4.5").
const spoken = (def: ThreatEvent, o: ResponseOption, d: number, free: number, bill = 0) =>
  o.fits ? `${wordsOf(def, o.id)}. ${o.cost} CR. ${EFFECT[o.effect]}: ${withBill(d, bill)}.` : `${wordsOf(def, o.id)}. ${o.cost} CR. ${EFFECT[o.effect]}. ${reasonFor(o, free)}.`

// Boards of real play, each a night away from what a test needs: lines
// over a run of seeds, the prepared script answered sensibly and not at
// all, nothing ordered and nothing answered, and then the sweep gate's
// policies with their own responders (tests/policies.ts), which is where
// a budget too thin for a response is met. The night the tests then play
// from the board they find is the empty cart's.
const LINES: { orders: (s: GameState) => TurnActions; respond: Responder }[] = [
  { orders: (s) => WIN_SCRIPT[s.turn] ?? NO_OP, respond: sensible },
  { orders: (s) => WIN_SCRIPT[s.turn] ?? NO_OP, respond: ride },
  { orders: () => NO_OP, respond: ride },
  ...POLICIES.map((p) => ({ orders: p.policy, respond: p.respond })),
]
function boards(seeds: readonly number[]): GameState[] {
  const out: GameState[] = []
  for (const line of LINES) {
    for (const seed of seeds) {
      let s = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (s.status === 'playing') {
        out.push(s)
        s = playNight(s, line.orders(s), line.respond)
      }
    }
  }
  return out
}
const SEEDS = Array.from({ length: 60 }, (_, k) => k + 1)
function find<T>(pick: (state: GameState, events: ResolvedEvent[]) => T | undefined | false): T {
  for (const state of boards(SEEDS)) {
    const found = pick(state, eventsOf(resolve(state)))
    if (found) return found
  }
  throw new Error('no board of real play has the shape this test needs')
}

let mounts = 0
function render(state: GameState) {
  mounts += 1
  act(() => {
    root.render(<Game key={`m${mounts}`} initial={{ state, phase: 'brief' }} onExit={() => {}} />)
  })
}
const q = (sel: string) => container.querySelector(sel)
const all = (sel: string) => [...container.querySelectorAll(sel)]
async function tap(el: Element | null) {
  if (!el) throw new Error('nothing to tap')
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
  await act(async () => {})
}
// The clock, in steps short enough that a stage's second timer starts when
// its first ends, and what it sets off, settled.
async function pass(ms: number, every = 10) {
  for (let left = ms; left > 0; left -= every) await act(async () => void vi.advanceTimersByTime(Math.min(every, left)))
  await act(async () => {})
}
// Where the night is: a card by its kind, the overlay, the block moment,
// or back on the board.
const stage = () => q('[data-night-card]')?.getAttribute('data-night-card') ?? (q('[data-moving]') ? 'moving' : q('[data-block-moment]') ? 'block' : q('[data-dock]') ? 'board' : 'none')
const label = () => q('[data-night-card]')?.getAttribute('aria-label') ?? null
const responseButton = (id: string | null) => q(`[data-responses] button[data-response="${id ?? 'ride'}"]`) as HTMLButtonElement | null
const execute = () => tap(q('[data-execute]'))
// One step on through the night between responses: the block moment by its
// tap, HOLD on the call, FILE TO DOSSIER and its stamp's beat, CONTINUE.
// It never answers a response, and never leaves END OF TURN.
async function onward() {
  if (q('[data-block-moment]')) return tap(q('[data-strike-tap]'))
  const el = q('[data-call="hold"]') ?? q('[data-collect]') ?? q('[data-continue]')
  const filing = !!el?.hasAttribute('data-collect')
  await tap(el)
  if (filing) await pass(FILED_BEAT_MS + 1, FILED_BEAT_MS + 1)
}
async function toNext(wanted: string) {
  for (let guard = 0; guard < 30 && stage() !== wanted && stage() !== 'end'; guard += 1) await onward()
  expect(stage(), `the night never reached ${wanted}`).toBe(wanted)
}
const saved = (): GameState | null => {
  const raw = JSON.parse(localStorage.getItem('dc-autosave') ?? 'null')
  return raw ? (raw.state as GameState) : null
}

// THE RESPONSE CARD AGAINST THE ENGINE, whichever night it is on: the move
// it names, one real button an option with its name, its words, its cost,
// its effect and its figure, the disabled ones and why, and riding it out.
// Returns what was on offer and each button's figure.
function checkOffer(state: GameState, responses: readonly (string | null)[], where: string): Shown & { figures: Map<string | null, number> } {
  const offer = offerOf(state, responses)
  expect(offer, `${where}: the night asks for a response the engine does not offer`).not.toBeNull()
  const { i, ev, def, options } = offer!
  const card = q('section[data-night-card="respond"]')!
  expect(card, `${where}: no response card`).not.toBeNull()
  expect(card.getAttribute('aria-label'), where).toBe(`${shortName(def)}: YOUR RESPONSE`)
  expect(card.querySelector('[data-card-head]')!.textContent, where).toBe(`INCOMING · TURN ${state.turn}`)
  expect(card.querySelector('[data-move-name]')!.textContent, where).toBe(shortName(def))
  expect(card.querySelector('[data-exposed]')!.textContent, where).toContain(`Strength ${ev.baseSeverity + ev.chainBonus}.`)
  expect(card.querySelector('[data-response-budget]')!.textContent, where).toMatch(/^Budget -?\d+ CR$/)
  // Nothing else to tap: the night waits for the answer.
  expect(card.querySelector('[data-collect], [data-continue], [data-begin], [data-call]'), `${where}: the response card has a way past the answer`).toBeNull()

  const group = card.querySelector('[data-responses]')!
  expect(group.getAttribute('role'), where).toBe('group')
  expect(group.getAttribute('aria-label'), where).toBe('YOUR RESPONSE')
  const buttons = [...group.children] as HTMLButtonElement[]
  expect(buttons.map((b) => b.getAttribute('data-response')), `${where}: the buttons are not the threat's responses, then riding it out`).toEqual([...(def.responses ?? []).map((r) => r.id), 'ride'])
  for (const b of buttons) {
    expect(b.tagName, `${where}: ${b.getAttribute('data-response')} is not a button`).toBe('BUTTON')
    expect(b.getAttribute('type'), where).toBe('button')
  }
  expect(options.length, `${where}: a move that would land offers no response`).toBeGreaterThan(0)

  const exposed = exposedOf(ev)
  const figures = new Map<string | null, number>()
  options.forEach((o, k) => {
    const b = buttons[k]
    const at = `${where}, ${o.id}`
    const room = freeFor(def, ev, o, state)
    const said = b.getAttribute('aria-label')!
    const words = wordsOf(def, o.id)
    expect(words.length, `${at}: no words for the response`).toBeGreaterThan(8)
    expect(b.getAttribute('data-effect'), at).toBe(o.effect)
    expect(o.cost, `${at}: the cost is not the rule's`).toBe(RESPONSE_COST_PER_POINT[o.effect] * exposed)
    expect(b.disabled, `${at}: ${o.fits ? 'a response that fits is disabled' : 'a response that does not fit can be taken'}`).toBe(!o.fits)
    if (o.fits) {
      // What taking it does, from the engine's resolution with it taken.
      const d = changeOf(state, responses, i, o.id)
      const bill = billOf(state, responses, i, o.id)
      expect(said, at).toBe(spoken(def, o, d, room, bill))
      figures.set(o.id, d)
      expect(b.textContent, at).toContain(`${EFFECT[o.effect]}: ${withBill(d, bill)}`)
      // A block leaves no bill either.
      if (o.effect === 'block') expect(bill, `${at}: a block that leaves a repair bill`).toBe(0)
      // A block lets nothing through, so it never costs score.
      if (o.effect === 'block') expect(figure(d), `${at}: a block that costs score`).toBe('no loss')
    } else {
      expect(said, at).toBe(spoken(def, o, 0, room))
      expect(said, `${at}: a response that cannot be taken promises a figure`).not.toMatch(/score|no loss/)
      // The sentence is true: what is free is less than the price. (The
      // card said the room before the move's own bill, which could be
      // more than the price of the option it refused.)
      if (o.why === 'budget') expect(o.cost, `${at}: refused for the budget with ${room} CR free`).toBeGreaterThan(room)
      // The reason stands where the effect would, in words on the face.
      expect(b.textContent, at).toContain(reasonFor(o, room))
      expect(b.textContent, at).not.toMatch(/score -/)
    }
    // On the face too: the words and the cost.
    expect(b.textContent, at).toContain(words)
    expect(b.textContent, at).toContain(`${o.cost} CR`)
  })
  const rideButton = buttons[buttons.length - 1]
  const rode = changeOf(state, responses, i, null)
  figures.set(null, rode)
  expect(rideButton.disabled, `${where}: riding it out is disabled`).toBe(false)
  expect(rideButton.getAttribute('aria-label'), where).toBe(`Ride it out. FREE. Full hit: ${withBill(rode, billOf(state, responses, i, null))}.`)
  expect(rideButton.textContent, where).toContain('Ride it out')
  expect(rideButton.textContent, where).toContain('FREE')
  return { ...offer!, figures }
}

// The result of an answer against the engine's resolution with it: the
// verdict, what the player did, the figure the button promised, and, where
// the game has committed the turn (no call still to make, and the
// operation still on), the turn it committed.
function checkResult(state: GameState, responses: readonly (string | null)[], shown: Shown & { figures: Map<string | null, number> }, id: string | null, where: string) {
  const { i, def } = shown
  const after = resolve(state, responses)
  const ev = eventsOf(after)[i]
  const card = q('section[data-night-card="hit"]')!
  expect(card, `${where}: the answer did not bring up the result`).not.toBeNull()
  const strength = ev.baseSeverity + ev.chainBonus
  const verdict = ev.effectiveSeverity === 0 ? 'BLOCKED' : ev.response?.effect === 'halve' ? 'HALVED' : ev.effectiveSeverity < strength ? 'PARTIAL' : 'HIT'
  expect(card.getAttribute('aria-label'), where).toBe(`${shortName(def)}: ${verdict}`)
  expect(card.querySelector('[data-result]')!.getAttribute('data-result'), where).toBe(verdict.toLowerCase())
  expect(card.querySelector('[data-verdict]')!.textContent, where).toBe(verdict)
  expect(card.querySelector('[data-response-taken]')?.getAttribute('data-response-taken'), where).toBe(id ?? 'ride')
  // The engine did what was asked, at the price on the button.
  const option = shown.options.find((o) => o.id === id)
  expect(ev.response, `${where}: the engine's record of the answer`).toEqual(id === null ? undefined : { id, effect: option!.effect, cost: option!.cost })
  // And the score moved by the figure on the button.
  const promised = shown.figures.get(id)!
  const d = Math.round((ev.scoreAfter - ev.scoreBefore) * 10) / 10
  expect(d, `${where}: the engine's change is not the button's figure`).toBe(promised)
  const big = card.querySelector('[data-result-score]')!.textContent!
  if (ev.effectiveSeverity === 0) expect(big, where).toBe('NO LOSS')
  else expect(Number(big), `${where}: the result's figure is not the button's`).toBe(promised)
  const committed = saved()
  if (after.status === 'playing' && (callIndex(after) < 0 || !!q('[data-call]') === false) && committed && committed.history.length === after.history.length) {
    const kept = committed.history.at(-1)!.events[i]
    expect({ response: kept.response, before: kept.scoreBefore, after: kept.scoreAfter, through: kept.effectiveSeverity }, `${where}: the turn the game committed`).toEqual({
      response: ev.response,
      before: ev.scoreBefore,
      after: ev.scoreAfter,
      through: ev.effectiveSeverity,
    })
    return true
  }
  return false
}

describe('THE RESPONSE: the options, as buttons (v1.7 R1)', () => {
  it('(a) (b) (f) says each option in its accessible name and on its face, disables what does not fit, and does what its figure says, over three dozen nights of real play', async () => {
    // Boards of four seeds over every line above, each played for one
    // night with the empty cart through the real game. Each night takes the first response of one
    // effect in turn (a block, a halving, riding it out) when the budget
    // meets it, and then tries the same on the moves after it, which one
    // response a night refuses.
    const seen = { nights: 0, offers: 0, block: 0, halve: 0, ride: 0, budget: 0, used: 0, committed: 0 }
    const pool = boards([2, 7, 20260712, 32]).filter((s) => eventsOf(resolve(s)).some((e) => e.room !== undefined))
    // Thirty of them evenly through the pool, and the first six whose
    // budget is too thin for one of the responses on offer.
    const thin = pool.filter((s) => offerOf(s, [])!.options.some((o) => o.why === 'budget')).slice(0, 6)
    const nights = [...pool.filter((s, k) => !thin.includes(s) && k % Math.max(1, Math.floor(pool.length / 30)) === 0).slice(0, 30), ...thin]
    expect(nights.length, 'too few nights with a move that would land').toBeGreaterThanOrEqual(24)
    for (const [n, state] of nights.entries()) {
      const where = `seed ${state.seed}, turn ${state.turn}, night ${n}`
      const want = (['block', 'halve', 'ride'] as const)[n % 3]
      let responses: (string | null)[] = []
      render(state)
      await execute()
      seen.nights += 1
      for (let guard = 0; guard < 40 && stage() !== 'end'; guard += 1) {
        if (stage() !== 'respond') {
          await onward()
          continue
        }
        const shown = checkOffer(state, responses, where)
        seen.offers += 1
        seen.budget += shown.options.filter((o) => o.why === 'budget').length
        seen.used += shown.options.filter((o) => o.why === 'used').length
        const pick = want === 'ride' ? undefined : shown.options.find((o) => o.effect === want && o.fits)
        const id = pick?.id ?? null
        await tap(responseButton(id))
        responses = answered(responses, shown.i, id)
        seen[pick ? pick.effect : 'ride'] += 1
        if (checkResult(state, responses, shown, id, `${where}, move ${shown.i}`)) seen.committed += 1
      }
      expect(stage(), `${where}: the night never reached END OF TURN`).toBe('end')
      // The night the player played is the night the engine resolves from
      // the same answers: the budget END OF TURN states, and what the
      // responses cost.
      const after = resolve(state, responses)
      expect(openChoice(eventsOf(after), responses), `${where}: END OF TURN with a move still to answer`).toBe(-1)
      expect(Number(q('[data-ledger-row="total"]')!.getAttribute('data-value')), `${where}: the budget at the close`).toBe(after.credits)
      const spent = eventsOf(after).reduce((sum, e) => sum + (e.response?.cost ?? 0), 0)
      expect(after.history.at(-1)!.ledger.responses ?? 0, where).toBe(spent)
      expect(Number(q('[data-ledger-row="responses"]')?.getAttribute('data-value') ?? 0) + spent, `${where}: what the responses cost`).toBe(0)
      expect(eventsOf(after).filter((e) => e.response).length, `${where}: more than one response in a night`).toBeLessThanOrEqual(RESPONSES_PER_NIGHT)
    }
    // Not vacuous: each answer was taken, a response was refused for the
    // budget and for the night's one being used, and the game's own
    // committed turn was read.
    for (const key of ['block', 'halve', 'ride', 'budget', 'used', 'committed'] as const) expect(seen[key], `no night met: ${key} (${JSON.stringify(seen)})`).toBeGreaterThan(0)
    expect(seen.offers).toBeGreaterThan(seen.nights)
  }, 60_000)

  it('(b) shows a response the budget cannot meet, disabled, with the reason in its name, and takes no tap on it', async () => {
    const state = find((s) => {
      const offer = offerOf(s, [])
      return offer && offer.options.some((o) => o.why === 'budget') && s
    })
    render(state)
    await execute()
    await toNext('respond')
    const shown = checkOffer(state, [], `seed ${state.seed}, turn ${state.turn}`)
    const short = shown.options.find((o) => o.why === 'budget')!
    const b = responseButton(short.id)!
    expect(b.disabled).toBe(true)
    // The price is more than what the night's bills leave free for it,
    // which is why (the engine's rule, not the card's), and the name says
    // that figure.
    const free = freeFor(shown.def, shown.ev, short, state)
    expect(short.cost, 'the fixture: the response fits').toBeGreaterThan(free)
    expect(b.getAttribute('aria-label')).toBe(`${wordsOf(shown.def, short.id)}. ${short.cost} CR. ${EFFECT[short.effect]}. Not enough budget: ${Math.max(0, free)} CR free after bills.`)
    expect(b.textContent).toContain(`Not enough budget: ${Math.max(0, free)} CR free after bills`)
    const before = label()
    await tap(b)
    expect(stage(), 'a disabled response answered the move').toBe('respond')
    expect(label()).toBe(before)
    // Riding it out is the way on, and the engine rides it out.
    await tap(responseButton(null))
    checkResult(state, [...answered([], shown.i, null)], shown, null, 'ridden out')
    expect(q('[data-could-have]') !== null, 'the result names an answer the budget could not meet').toBe(shown.options.some((o) => o.fits))
  })

  it('(c) one response a night: after one, the next move offers only riding it out, and says why', async () => {
    // A night with two moves that would land, each with a response the
    // budget meets when it is the first, and no debris call between.
    const state = find((s, events) => {
      if (callIndex({ history: [{ events }] } as unknown as GameState) >= 0) return false
      const first = offerOf(s, [])
      if (!first || !first.options[0].fits) return false
      const second = offerOf(s, answered([], first.i, null))
      return second && second.options.some((o) => o.fits) && offerOf(s, answered([], first.i, first.options[0].id)) && s
    })
    const where = `seed ${state.seed}, turn ${state.turn}`
    // The control: with the first move ridden out, the second's responses
    // are open, so it is the response that closes them and not the move.
    render(state)
    await execute()
    await toNext('respond')
    let first = checkOffer(state, [], where)
    await tap(responseButton(null))
    let responses = answered([], first.i, null)
    await onward()
    await toNext('respond')
    let second = checkOffer(state, responses, `${where}, second move after riding out the first`)
    expect(second.i).toBeGreaterThan(first.i)
    expect(second.options.some((o) => o.fits), 'the control: nothing fits the second move even with no response used').toBe(true)
    expect(all('[data-responses] button:disabled').length).toBe(second.options.filter((o) => !o.fits).length)

    // The same night, the first move answered.
    render(state)
    await execute()
    await toNext('respond')
    first = checkOffer(state, [], where)
    const taken = first.options[0]
    await tap(responseButton(taken.id))
    responses = answered([], first.i, taken.id)
    checkResult(state, responses, first, taken.id, `${where}, first move`)
    await onward()
    await toNext('respond')
    second = checkOffer(state, responses, `${where}, second move after a response`)
    expect(second.options.map((o) => o.why), 'a paid response is still open after tonight\'s one').toEqual(second.options.map(() => 'used'))
    for (const o of second.options) {
      const b = responseButton(o.id)!
      expect(b.disabled, `${o.id} can still be taken`).toBe(true)
      expect(b.getAttribute('aria-label')).toMatch(/ Your one response tonight is used\.$/)
      expect(b.textContent).toContain('Your one response tonight is used')
      // A tap on it does nothing.
      await tap(b)
      expect(stage()).toBe('respond')
    }
    // The card says the rule, and riding it out is there and free.
    expect(q('[data-night-card="respond"]')!.textContent).toContain('ONE A NIGHT')
    expect(responseButton(null)!.disabled).toBe(false)
    await tap(responseButton(null))
    responses = answered(responses, second.i, null)
    checkResult(state, responses, second, null, `${where}, second move`)
    // Nothing was passed up: no answer was open to take.
    expect(q('[data-could-have]'), 'the result names an answer that was not open').toBeNull()
    const after = resolve(state, responses)
    expect(eventsOf(after).filter((e) => e.response).map((e) => e.response!.id)).toEqual([taken.id])
  })
})

describe('THE RESULT, on the same screen (v1.7 R1)', () => {
  // A first night's move nothing owned blunts, which the budget can block
  // or halve: turn 1 of a seed, met for the first time on this device.
  const plain = () =>
    find((s) => {
      const offer = offerOf(s, [])
      return offer && offer.ev.mitigation === 0 && offer.ev.targetAssetId !== undefined && offer.options.some((o) => o.effect === 'block' && o.fits) && offer.options.some((o) => o.effect === 'halve' && o.fits) && s
    })
  async function answer(state: GameState, effect: 'block' | 'halve' | null) {
    render(state)
    await execute()
    await toNext('respond')
    const shown = checkOffer(state, [], `seed ${state.seed}, turn ${state.turn}`)
    const asked = label()
    const option = effect ? shown.options.find((o) => o.effect === effect)! : null
    await tap(responseButton(option?.id ?? null))
    // The same screen: no stage between the answer and its result, and no
    // clock to wait out.
    expect(stage(), 'the answer did not bring up the result at once').toBe('hit')
    expect(label()).not.toBe(asked)
    const responses = answered([], shown.i, option?.id ?? null)
    checkResult(state, responses, shown, option?.id ?? null, String(effect))
    return { shown, option, ev: eventsOf(resolve(state, responses))[shown.i], card: q('section[data-night-card="hit"]')! }
  }
  const firstMeeting = (card: Element, def: ThreatEvent) => {
    const row = card.querySelector('details[data-dossier-row]') as HTMLDetailsElement
    expect(row, 'the result has no Dossier row').not.toBeNull()
    expect(row.getAttribute('data-dossier-row')).toBe(def.id)
    expect(row.hasAttribute('data-fresh'), 'a first meeting is not a NEW DOSSIER CARD').toBe(true)
    expect(row.open).toBe(false)
    expect(row.querySelector('summary')!.textContent).toContain('NEW DOSSIER CARD')
    expect(row.querySelector(`button[data-learn-more="${def.id}"]`), 'the row has no LEARN MORE').not.toBeNull()
    expect(card.querySelector('[data-collect]')?.textContent).toBe('FILE TO DOSSIER')
    expect(card.querySelector('[data-continue]')).toBeNull()
  }

  it('(d) a block: BLOCKED, what the player did and paid, no loss, and the Dossier row with FILE TO DOSSIER', async () => {
    const state = plain()
    const { shown, option, ev, card } = await answer(state, 'block')
    expect(card.querySelector('[data-result]')!.getAttribute('data-result')).toBe('blocked')
    expect(card.querySelector('[data-verdict]')!.textContent).toBe('BLOCKED')
    const did = card.querySelector('[data-response-taken]')!
    expect(did.getAttribute('data-response-taken')).toBe(option!.id)
    expect(did.textContent).toContain(wordsOf(shown.def, option!.id))
    expect(did.textContent).toContain(`-${option!.cost} CR`)
    // Every point stopped, and the engine holds it as held.
    expect(all('[data-result-tiles] [data-tile]').map((t) => t.getAttribute('data-tile'))).toEqual(Array(ev.baseSeverity + ev.chainBonus).fill('blocked'))
    expect([ev.effectiveSeverity, ev.outcome]).toEqual([0, 'held'])
    expect(card.querySelector('[data-result-score]')!.textContent).toBe('NO LOSS')
    // A response blocked it, not a defense: no watch officer's report of a
    // loss, no "you can now say it", and the lasting answer named.
    expect(card.querySelector('[data-officer]')).toBeNull()
    expect(card.querySelector('[data-undefended]')).toBeNull()
    expect(card.querySelector('[data-outcome]')!.getAttribute('data-outcome')).toBe('responded')
    expect(card.querySelector('[data-can-say]')).toBeNull()
    expect(card.querySelector('[data-could-have]')).toBeNull()
    firstMeeting(card, shown.def)
    // The budget paid for it, there and then.
    expect(state.credits - resolve(state, answered([], shown.i, option!.id)).history.at(-1)!.ledger.start, 'the fixture ordered something').toBe(0)
    // FILE TO DOSSIER files it and the night goes on by itself.
    await tap(q('[data-collect]'))
    expect(JSON.parse(localStorage.getItem('dc-dossier') ?? '[]')).toContain(shown.def.id)
    expect(q('[data-filed-stamp]')?.getAttribute('role')).toBe('status')
    expect(q('[data-filed-stamp]')!.textContent).toMatch(/^FILED · \d+ \/ \d+$/)
    await pass(FILED_BEAT_MS + 1)
    expect(q('[data-filed-stamp]'), 'the night stood on the FILED stamp').toBeNull()
  })

  it('(d) a halving: HALVED, every point that got through shown at half, and half the damage in the engine', async () => {
    const state = plain()
    const { shown, option, ev, card } = await answer(state, 'halve')
    expect(card.querySelector('[data-result]')!.getAttribute('data-result')).toBe('halved')
    expect(card.querySelector('[data-verdict]')!.textContent).toBe('HALVED')
    expect(card.querySelector('[data-response-taken]')!.getAttribute('data-response-taken')).toBe(option!.id)
    const tiles = all('[data-result-tiles] [data-tile]').map((t) => t.getAttribute('data-tile'))
    expect(tiles.length).toBe(ev.baseSeverity + ev.chainBonus)
    expect(tiles.filter((t) => t === 'halved').length, 'the points that got through are not shown halved').toBe(ev.effectiveSeverity)
    expect(tiles).not.toContain('through')
    expect(all('[data-tile="halved"]').length).toBeGreaterThan(0)
    expect(card.querySelector('[data-outcome]')!.getAttribute('data-outcome')).toBe('responded')
    // Half of what riding it out costs, in the engine: the strength that
    // lands is unchanged, and the score and the repair bill take half.
    const rode = eventsOf(resolve(state, answered([], shown.i, null)))[shown.i]
    expect(ev.effectiveSeverity).toBe(rode.effectiveSeverity)
    expect(ev.outcome).toBe('reduced')
    expect(ev.repairCost).toBe(Math.round(rode.repairCost * 0.5))
    expect(shown.figures.get(option!.id)!).toBeGreaterThan(shown.figures.get(null)!)
    expect(shown.figures.get(option!.id)!).toBeLessThan(0)
    firstMeeting(card, shown.def)
  })

  it('(d) riding it out: HIT, said as ridden out, with the answer the budget could have met', async () => {
    const state = plain()
    const { shown, ev, card } = await answer(state, null)
    expect(card.querySelector('[data-result]')!.getAttribute('data-result')).toBe('hit')
    expect(card.querySelector('[data-verdict]')!.textContent).toBe('HIT')
    const did = card.querySelector('[data-response-taken]')!
    expect(did.getAttribute('data-response-taken')).toBe('ride')
    expect(did.textContent).toContain('RODE IT OUT')
    expect(all('[data-result-tiles] [data-tile]').map((t) => t.getAttribute('data-tile'))).toEqual(Array(ev.effectiveSeverity).fill('through'))
    expect(card.querySelector('[data-officer]'), 'a hit has no watch officer line').not.toBeNull()
    // The answer passed up: the first the budget could meet, with its
    // price, on the open move's block.
    const could = shown.options.find((o) => o.fits)!
    const line = card.querySelector('[data-could-have]')
    expect(line, 'a move ridden out with a response in reach says nothing of it').not.toBeNull()
    expect(line!.closest('[data-outcome]')!.getAttribute('data-outcome')).toBe('open')
    expect(line!.textContent).toContain(wordsOf(shown.def, could.id))
    expect(line!.textContent).toContain(`${could.cost} CR`)
    firstMeeting(card, shown.def)
  })
})

describe('THE BLOCK MOMENT (v1.7 R1)', () => {
  // A night whose first event is a move a defense owned stops outright,
  // with something after it, so the streak it extends is the board's plus
  // one and what comes next can be told apart from it.
  const blocked = () =>
    find((s, events) => {
      const ev = events[0]
      return isThreat(ev) && ev.effectiveSeverity === 0 && ev.room === undefined && ev.mitigation > 0 && events.length > 1 && events[1].eventId !== ev.eventId && s
    })
  const moment = () => q('[data-block-moment]')
  function checkMoment(state: GameState) {
    const ev = eventsOf(resolve(state))[0]
    const def = defOf(ev.eventId)
    const streak = state.streak + 1
    const el = moment()!
    expect(el, 'a move a defense stops has no block moment').not.toBeNull()
    expect(el.getAttribute('data-strike-banner')).toBe('held')
    expect(el.querySelector('[data-strike-word="held"]')!.textContent).toBe('BLOCKED')
    expect(el.querySelector('[data-strike-name]')!.textContent).toBe(shortName(def))
    expect(el.querySelector('[data-block-streak]')!.textContent).toBe(`×${streak} DEFENSE STREAK`)
    // For a screen reader: one status line, the only part not hidden.
    const status = el.querySelector('[role="status"]')!
    expect(status.textContent).toBe(`Blocked: ${shortName(def)}.${streak >= 2 ? ` Defense streak ${streak}.` : ''}`)
    expect(el.querySelector('[data-strike-word]')!.closest('[aria-hidden="true"]'), 'the banner is read twice').not.toBeNull()
    // The whole screen takes the tap, and no card is up with it.
    expect(q('button[data-strike-tap]'), 'nothing takes the tap that ends the block moment').not.toBeNull()
    expect(q('[data-night-card]')).toBeNull()
    return { ev, def }
  }
  // What follows the moment for a threat not yet filed: its result, said
  // as a defense's block and never as a response.
  function checkFirstCard(def: ThreatEvent) {
    const card = q('section[data-night-card="hit"]')!
    expect(card, 'a block met for the first time has no card to file').not.toBeNull()
    expect(card.getAttribute('aria-label')).toBe(`${shortName(def)}: BLOCKED`)
    expect(card.querySelector('[data-result]')!.getAttribute('data-result')).toBe('blocked')
    expect(card.querySelector('[data-response-taken]'), 'a defense\'s block is said as a response').toBeNull()
    expect(card.querySelector('[data-outcome]')!.getAttribute('data-outcome')).toBe('held')
    expect(card.querySelector(`details[data-dossier-row="${def.id}"][data-fresh]`)).not.toBeNull()
    expect(card.querySelector('[data-collect]')?.textContent).toBe('FILE TO DOSSIER')
  }

  it('(e) shows BLOCKED, the move, the streak and a status line, and moves on by itself after BLOCK_MS', async () => {
    reduced = false
    const state = blocked()
    render(state)
    await execute()
    expect(stage()).toBe('moving')
    await pass(760)
    const { def } = checkMoment(state)
    const el = moment()
    expect(el!.className).toContain('dc-banner-in')
    // It stands for its time, the lock-on and the landing, and no longer:
    // under a second in all.
    expect(BLOCK_MS).toBeLessThan(1000)
    await pass(BLOCK_MS - 30)
    expect(moment(), 'the block moment left before BLOCK_MS').toBe(el)
    await pass(60)
    expect(moment(), 'the block moment did not move on by itself').toBeNull()
    checkFirstCard(def)
  })

  it('(e) goes straight on to the next move, with no card, once the threat is in the Dossier', async () => {
    reduced = false
    const state = blocked()
    const events = eventsOf(resolve(state))
    localStorage.setItem('dc-dossier', JSON.stringify([events[0].eventId]))
    render(state)
    await execute()
    await pass(760)
    const { def } = checkMoment(state)
    const el = moment()
    await pass(BLOCK_MS + 30)
    expect(moment(), 'the block moment stayed').not.toBe(el)
    // No result for the move that was blocked, and nothing more to file
    // for it: whatever is up is the next event's.
    expect(['respond', 'hit', 'block', 'call', 'debris', 'opportunity', 'end'], 'the night stopped after a filed block').toContain(stage())
    expect(label(), 'a filed block still got a card').not.toBe(`${shortName(def)}: BLOCKED`)
    expect(q(`details[data-dossier-row="${def.id}"]`), 'a filed block still showed its Dossier row').toBeNull()
    expect(q('[data-block-moment] [data-strike-name]')?.textContent ?? q('[data-move-name]')?.textContent ?? '', 'the night is still on the blocked move').not.toBe(shortName(def))
  })

  it('(e) a tap ends it at once', async () => {
    reduced = false
    const state = blocked()
    render(state)
    await execute()
    await pass(760)
    const { def } = checkMoment(state)
    // Early in the lock-on, long before either of its clocks.
    await pass(100)
    expect(moment()).not.toBeNull()
    await tap(q('button[data-strike-tap]'))
    expect(moment(), 'the tap did not end the block moment').toBeNull()
    checkFirstCard(def)
    // And its clocks are done with: a minute on, the card is still the
    // card, since nothing but the player moves a card on.
    const at = label()
    await pass(60_000, 1000)
    expect(label()).toBe(at)
  })

  it('(e) stands still for BLOCK_MS under reduced motion, and then moves on by itself', async () => {
    reduced = true
    const state = blocked()
    render(state)
    await execute()
    // No overlay with motion off: the moment is the night's first stage.
    expect(q('[data-moving]')).toBeNull()
    const { def } = checkMoment(state)
    const el = moment()!
    expect(el.className, 'the block moment makes its entrance with motion off').not.toContain('dc-banner-in')
    expect(el.querySelector('.dc-stamp-pop'), 'the shield pops with motion off').toBeNull()
    await pass(BLOCK_MS - 30)
    expect(moment(), 'the block moment left before BLOCK_MS under reduced motion').toBe(el)
    await pass(60)
    expect(moment(), 'the block moment did not move on by itself under reduced motion').toBeNull()
    checkFirstCard(def)
  })
})
