// @vitest-environment jsdom
//
// What would have helped, where the player looks (critique row M3). The
// sentence naming the missing defense used to render only inside the
// aftermath's collapsed ledger, open by default only at INSTANT; then the
// short form was a line on the director's hit card and the verdict's
// second line. v1.3 R3 (brief 5.5) retired the director and the aftermath
// card, and the promise moved onto the night's hit card, the card the
// player taps through for every move: an UNDEFENDED block says "What
// would have helped: <defense>, n CR. It stops <threats met>. It is in
// PROCURE next turn." (cut by Ken from the brief's longer sentence, 22
// October 2026; left off
// on the last turn), and a REDUCED block "Would have finished it:
// <defense>, n CR." The retainer advice (critique row M8) is on END OF
// TURN, and the SSA service's on the debris result. Rendered in the real
// game over real play, the night tapped through as a player does.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, ResolvedEvent, ThreatEvent, TurnActions } from '../src/engine/types'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { shortName, stopVerb } from '../src/ui/board/boardModel'
import { damaged } from '../src/ui/night/closeModel'
import * as copy from '../src/ui/night/nightCopy'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { POLICIES } from './policies'
import { LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, WIN_SCRIPT, a } from './scripts'

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
  // Reduced motion: the cards arrive at once, with no overlay and no
  // strike to wait out.
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

const q = (sel: string) => container.querySelector(sel)
const line = () => q('section[data-night-card="hit"] [data-would-have-helped]')
const defOf = (id: string) => DEFAULT_SCENARIO.events.find((e) => e.id === id)!
const isThreat = (ev: ResolvedEvent) => !ev.debris && (defOf(ev.eventId).kind ?? 'threat') === 'threat'
const nameOf = (id: string) => DEFAULT_SCENARIO.countermeasures.find((c) => c.id === id)!.name
const costOf = (id: string) => DEFAULT_SCENARIO.countermeasures.find((c) => c.id === id)!.cost

// The boards of real play, over a few seeds and the scripted lines, then
// the sweep gate's policies (tests/policies.ts). The policies come after
// the scripts, so a shape the scripts reach is found where it always was.
// Each test plays the night of the board it finds with the empty cart
// (EXECUTE with no orders), and the engine's resolution of that night is
// what it looks in.
const scripted = (script: Record<number, TurnActions>) => (state: GameState) => script[state.turn] ?? NO_OP
const LINES: ((state: GameState) => TurnActions)[] = [scripted(LOSS_SCRIPT), scripted(WIN_SCRIPT), scripted(MIXED_SCRIPT), ...POLICIES.map((p) => p.policy)]
const tonight = (state: GameState) => resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
function find<T>(pick: (state: GameState, after: GameState) => T | undefined): T {
  for (const play of LINES) {
    for (const seed of [20260712, 4041, 1, 2, 3, 7]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const found = pick(state, tonight(state))
        if (found) return found
        state = resolveTurn(state, play(state), turnRng(state.seed, state.turn))
      }
    }
  }
  throw new Error('no turn in the sweep has the shape this test needs')
}
// The first threat of a night that matches, with the board it met.
const threatWhere = (match: (ev: ResolvedEvent, def: ThreatEvent, state: GameState, after: GameState) => boolean) =>
  find((state, after) => {
    const ev = after.history.at(-1)!.events.find((e) => isThreat(e) && match(e, defOf(e.eventId), state, after))
    return ev ? { state, after, ev, def: defOf(ev.eventId) } : undefined
  })

let mounts = 0
function render(state: GameState, phase: 'brief' | 'aftermath' = 'brief') {
  mounts += 1
  act(() => {
    root.render(<Game key={`m${mounts}`} initial={{ state, phase }} onExit={() => {}} />)
  })
}
// A tap, and the cards and effects it sets off, settled.
async function tap(el: Element | null) {
  if (!el) throw new Error('nothing to tap')
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
  await act(async () => {})
}
// The tap a card asks for: FILE IT, HOLD on the call, COLLECT or CONTINUE.
const way = () => q('[data-file-it]') ?? q('[data-call="hold"]') ?? q('[data-collect]') ?? q('[data-continue]')
// EXECUTE with the empty cart, then on through the night until the hit
// card for `def` is up.
async function toHitCard(state: GameState, def: ThreatEvent) {
  render(state)
  await tap(q('[data-execute]'))
  const wanted = () => q('section[data-night-card="hit"] [data-move-name]')?.textContent === shortName(def)
  for (let i = 0; i < 20 && !wanted() && !q('[data-night-card="end"]'); i += 1) await tap(way())
  expect(wanted(), `the night never showed ${def.id}'s hit card`).toBe(true)
  return q('section[data-night-card="hit"]')!
}
// The second block's line exactly as the card should say it, from the
// content: the first of the threat's defenses not owned, its price, every
// threat it stops that the player can name (met or named: this device has
// met tonight's moves, and the brief named tonight's candidates), and
// PROCURE unless it is the last turn.
function expectedLine(def: ThreatEvent, state: GameState, after: GameState): string {
  const missing = def.counters.find((c) => !state.counters.includes(c))!
  const record = after.history.at(-1)!
  const known = new Set([...record.events.map((e) => e.eventId), ...record.named])
  const all = [def, ...DEFAULT_SCENARIO.events.filter((e) => e.id !== def.id && e.counters.includes(missing) && known.has(e.id))]
  // What it stops alone and what it only blunts (R6 question 2), this
  // move's group first.
  const group = (stops: boolean) => all.filter((e) => (stopVerb(missing, e) === 'stops') === stops).map(shortName)
  const mine = stopVerb(missing, def) === 'stops'
  const said = [
    [mine ? 'stops' : 'blunts', group(mine)],
    [mine ? 'blunts' : 'stops', group(!mine)],
  ]
    .filter(([, names]) => names.length)
  const total = all.length
  const told =
    total > 2
      ? `${said[0][0]} ${shortName(def)} and answers ${total - 1} more threats you have met`
      : said.map(([verb, names]) => `${verb} ${(names as string[]).join(' and ')}`).join(' and ')
  const last = record.turn >= DEFAULT_SCENARIO.totalTurns
  return `What would have helped: ${nameOf(missing)}, ${costOf(missing)} CR. It ${told}.${last ? '' : ' It is in PROCURE next turn.'}`
}

describe('the hit card (critique row M3)', () => {
  it('names the missing defense on the UNDEFENDED block, with its price, what it stops and where to find it', async () => {
    const f = threatWhere((ev, def, state) => ev.outcome === 'open' && ev.effectiveSeverity > 0 && def.counters.length > 0 && state.turn < DEFAULT_SCENARIO.totalTurns)
    const card = await toHitCard(f.state, f.def)
    expect(card.getAttribute('aria-label')).toBe(`${shortName(f.def)}: HIT`)
    const block = card.querySelector('[data-outcome="open"]')
    expect(block, 'the hit card has no UNDEFENDED block').not.toBeNull()
    expect(block!.textContent).toMatch(/^UNDEFENDED/)
    expect(line(), 'the hit card names nothing that would have helped').not.toBeNull()
    expect(line()!.closest('[data-outcome="open"]'), 'the line is not on the UNDEFENDED block').toBe(block)
    // Where the player is looking: on the card, not behind a disclosure.
    expect(line()!.closest('details'), 'the line is inside a collapsed disclosure').toBeNull()
    expect(line()!.textContent).toBe(expectedLine(f.def, f.state, f.after))
  })

  it('leaves PROCURE off on the last turn, when there is no next turn to order it in', async () => {
    const f = threatWhere((ev, def, state) => ev.outcome === 'open' && ev.effectiveSeverity > 0 && def.counters.length > 0 && state.turn === DEFAULT_SCENARIO.totalTurns)
    await toHitCard(f.state, f.def)
    expect(line(), 'the last turn names nothing that would have helped').not.toBeNull()
    expect(line()!.textContent).toBe(expectedLine(f.def, f.state, f.after))
    expect(line()!.textContent).not.toContain('PROCURE')
  })

  it('names the defense that would have finished a partial, on the REDUCED block', async () => {
    const f = threatWhere((ev, def, state) => ev.outcome === 'reduced' && def.counters.some((c) => !state.counters.includes(c)))
    const card = await toHitCard(f.state, f.def)
    const block = card.querySelector('[data-outcome="reduced"]')
    expect(block, 'the hit card has no REDUCED block').not.toBeNull()
    const missing = f.def.counters.find((c) => !f.state.counters.includes(c))!
    const held = f.def.counters.find((c) => f.state.counters.includes(c))!
    expect(block!.textContent).toContain(`PARTIAL · ${nameOf(held).toUpperCase()}`)
    expect(block!.textContent).toContain(`Would have finished it: ${nameOf(missing)}, ${costOf(missing)} CR.`)
    // The UNDEFENDED line is for a move nothing answered.
    expect(line()).toBeNull()
  })

  it('says nothing on a move that was held, or once every applicable defense was owned', async () => {
    // A held move. Since the engine round of R6 (Decisions Q1) no move is
    // held while one of its defenses is missing (the rogue ground station,
    // the one move with two, needs both), so the card has nothing to name.
    const held = threatWhere((ev) => ev.outcome === 'held')
    let card = await toHitCard(held.state, held.def)
    expect(card.querySelector('[data-outcome="held"]'), 'the control: the HELD block did not render').not.toBeNull()
    expect(card.querySelector('[data-can-say]')!.textContent).toBe(`You can now say it: ${nameOf(held.def.counters.find((c) => held.state.counters.includes(c))!)} blocked ${shortName(held.def)} tonight.`)
    expect(line(), 'a held move claims something would have helped').toBeNull()
    expect(card.textContent, 'a held move says what would have finished it').not.toMatch(/Would have finished it/)

    // A move that got through every applicable defense: a board of real
    // play with every defense against one of the deck's threats added, so
    // the night has a move with nothing left to name.
    const f = find((state) => {
      for (const def of DEFAULT_SCENARIO.events.filter((e) => e.kind !== 'opportunity' && e.counters.length > 0 && e.effect.special !== 'debrisStrike')) {
        const owned = { ...state, counters: [...new Set([...state.counters, ...def.counters])] }
        const ev = tonight(owned).history.at(-1)!.events.find((e) => e.eventId === def.id && e.effectiveSeverity > 0)
        if (ev) return { state: owned, def }
      }
      return undefined
    })
    card = await toHitCard(f.state, f.def)
    expect(card.querySelector('[data-outcome="reduced"]'), 'the control: the REDUCED block did not render').not.toBeNull()
    expect(line(), 'with everything owned the card still names a defense').toBeNull()
    expect(card.textContent, 'with everything owned the card says what would have finished it').not.toMatch(/Would have finished it|What would have helped/)
  })
})

// RETIRED in v1.3 R3: "the verdict (critique row M3)", four cases on the
// aftermath card's verdict and its second line (the short form for the
// first threat that landed, outside the collapsed ledger, which kept the
// full sentence). The aftermath card, its verdict and its ledger
// disclosure are gone; END OF TURN states the budget's lines, and each
// move that landed carries its own line on its own hit card, above.

describe('the retainer at the close (critique row M8)', () => {
  // A board of real play the turn closed on damaged, where the one
  // purchase left that would have helped is the retainer's faster repair.
  const closed = () =>
    find((_, after) => {
      const r = after.history.at(-1)!
      return after.status === 'playing' && !r.ledger.insolvent && damaged(after) && !after.counters.includes('irRetainer') ? after : undefined
    })

  it('names the IR retainer on END OF TURN over a damaged board when it is not owned, and says it is working when it is', () => {
    // A reload onto END OF TURN for the turn the save closed on, which is
    // the same card the night ends on.
    const state = closed()
    render(state, 'aftermath')
    const end = q('[data-night-card="end"]')
    expect(end, 'the reload did not open END OF TURN').not.toBeNull()
    const faster = copy.pace(state.scenario.recovery.base, state.scenario.recovery.withIrRetainer)
    expect(end!.textContent).toContain(copy.recoverySlow(faster))
    render({ ...state, counters: [...state.counters, 'irRetainer'] }, 'aftermath')
    expect(q('[data-night-card="end"]')!.textContent).toContain(copy.recoveryFast(faster))
    expect(q('[data-night-card="end"]')!.textContent).not.toContain(copy.recoverySlow(faster))
  })
})

describe('the debris result', () => {
  // Turn 4 of the anchor seed makes the debris call (tests/night-r3.dom
  // .spec.tsx, GUARD R3 (e)), with the SSA service ordered on turn 3 or not.
  const callNight = (ssa: boolean) => {
    let state = newGame(DEFAULT_SCENARIO, 20260712, 'standard')
    const script: Record<number, TurnActions> = { 3: a({ buyCounters: ssa ? ['ssaManeuver'] : [] }) }
    while (state.turn < 4) state = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    return state
  }
  const ssa = DEFAULT_SCENARIO.countermeasures.find((c) => c.id === 'ssaManeuver')!

  for (const owned of [false, true]) {
    it(`${owned ? 'says nothing of the SSA service once it is owned' : 'names the SSA service and its price when it was not owned'}`, async () => {
      render(callNight(owned))
      await tap(q('[data-execute]'))
      for (let i = 0; i < 10 && !q('[data-night-card="debris"]'); i += 1) await tap(way())
      const card = q('[data-night-card="debris"]')
      expect(card, 'the night never showed the debris result').not.toBeNull()
      const lost = card!.querySelector('[data-outcome]')!.getAttribute('data-outcome') === 'open'
      const help = copy.debrisHelp(lost, ssa.name, ssa.cost).join('')
      if (owned) {
        expect(card!.textContent).not.toContain(help)
        expect(card!.textContent).not.toMatch(/What would have helped|Would have made this a budgeted call/)
      } else {
        expect(card!.textContent).toContain(help)
      }
    })
  }
})
