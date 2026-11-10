// @vitest-environment jsdom
//
// THE NIGHT'S GUARDS (v1.3 brief 5.5 and section 4), each mutated once
// when it was written (files/*_v1.3_R3_Report_v1.0.md), and re-pointed in
// v1.7 R1 at the night with a decision in it (THE RESPONSE, THE BLOCK
// MOMENT, no full-screen Dossier card, no strike before a hit's card):
//   GUARD R3 (a), NOTHING ADVANCES WITHOUT A TAP but the 750ms overlay,
//   the block moment and the FILED stamp's beat: the response card, a
//   result, the call and END OF TURN wait a minute and are still there;
//   one tap moves each on.
//   GUARD R3 (b), A FIRST MEETING SHOWS FILE TO DOSSIER (COLLECT INTEL CARD
//   until v1.6 R3, Ken's playtest item 4) and the NEW DOSSIER CARD row, a
//   repeat shows CONTINUE and the IN YOUR DOSSIER row.
//   GUARD R3 (c), FILE TO DOSSIER RAISES THE DOSSIER BY ONE AND SURVIVES A
//   RELOAD: filed at the tap since v1.6 R3, the button becoming its FILED
//   stamp with the Dossier's count since v1.7 R1; the device's dossier,
//   and GOAL 2's count of it, read again from storage.
//   GUARD R3 (d), END OF TURN'S ROWS ADD UP TO THE NEXT BUDGET THE ENGINE
//   REPORTS, live (with every move ridden out, and with a response paid
//   for) and from a reload, on every turn of seeded games.
//   GUARD R3 (e), BURN AND HOLD STATE THE SAME ODDS AS THE ODDS LINE, in
//   its words, with the SSA service and without.
//   GUARD R3 (f), NO RETIRED WORD IN ANY NIGHT CARD (section 4), over a
//   seeded operation that meets every kind of card.
// GUARD R3 (fit), that every label fits 375 in DC Display and a wide
// fallback, needs a layout engine and lives in scripts/phone-layout.mjs.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { planFor } from '../src/engine/campaign'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { playNight } from '../src/engine/responses'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { dossier } from '../src/persistence'
import { dossierCount } from '../src/ui/titleStatus'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { BLOCK_MS } from '../src/ui/board/strike'
import { FILED_BEAT_MS } from '../src/ui/night/cards'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { sensible } from './policies'
import { NO_OP, WIN_SCRIPT, a, debrisTurnOf } from './scripts'

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

// The night's chunks, loaded once, so React.lazy resolves on a microtask.
beforeAll(async () => {
  await import('../src/ui/night/Night')
  await import('../src/ui/night/cards')
  await import('../src/ui/night/closeCards')
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  reduced = true
  callChoice = 'hold'
  // The night's clocks (the overlay, the block moment, the FILED stamp)
  // run on the fake one, so each guard says when they pass (v1.7 R1).
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

function gameAt(turn: number, seed = 20260712, script: Record<number, TurnActions> = WIN_SCRIPT): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing' && state.turn < turn) state = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
  return state
}

let mounts = 0
function render(state: GameState, phase: 'brief' | 'aftermath' = 'brief') {
  mounts += 1
  act(() => {
    root.render(<Game key={`m${mounts}`} initial={{ state, phase }} onExit={() => {}} />)
  })
}
const q = (sel: string) => container.querySelector(sel)
// A tap, and the lazy cards and effects it sets off, settled.
async function tap(el: Element | null) {
  if (!el) throw new Error('nothing to tap')
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
  await act(async () => {})
}
// An element's words, each text node apart: textContent runs one
// element's last word into the next one's first ("creditsCOLLECT"), where
// a word-boundary check finds nothing.
function words(el: Element): string {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const out: string[] = []
  while (walk.nextNode()) out.push(walk.currentNode.textContent ?? '')
  return out.join(' ')
}
// Where the night is: a card by its kind (respond, hit, call, debris,
// opportunity, end), the overlay, the block moment, or back on the board.
const stage = () => q('[data-night-card]')?.getAttribute('data-night-card') ?? (q('[data-moving]') ? 'moving' : q('[data-block-moment]') ? 'block' : q('[data-dock]') ? 'board' : 'none')
async function order(ids: string[]) {
  if (!ids.length) return
  await tap(q('[data-action="procure"]'))
  for (const id of ids) await tap(q(`[data-procure-defense="${id}"]`))
  await tap(q('[data-confirm]'))
}
// The clock, in steps short enough that a stage's second timer starts when
// its first ends, and what it sets off, settled.
async function pass(ms: number, every = 10) {
  for (let left = ms; left > 0; left -= every) await act(async () => void vi.advanceTimersByTime(Math.min(every, left)))
  await act(async () => {})
}
// The answer these guards give a move that would land: ride it out, which
// is the night the engine resolves from the orders alone, unless a guard
// says otherwise.
let respond: () => Element | null = () => q('button[data-response="ride"]')
const strongest = () => q('button[data-response][data-effect]:not([disabled])') ?? q('button[data-response="ride"]')
// The tap a card asks for: the response, the call, FILE TO DOSSIER or
// CONTINUE, BEGIN.
const way = () => (q('[data-responses]') ? respond() : null) ?? q(`[data-call="${callChoice}"]`) ?? q('[data-collect]') ?? q('[data-continue]') ?? q('[data-begin]')
let callChoice: 'burn' | 'hold' = 'hold'
// One step on through the night: the block moment by its tap, a card by
// its way on, and the FILED stamp's beat after FILE TO DOSSIER.
async function onward() {
  if (q('[data-block-moment]')) return tap(q('[data-strike-tap]'))
  const el = way()
  const filing = !!el?.hasAttribute('data-collect')
  await tap(el)
  if (filing) await pass(FILED_BEAT_MS + 1, FILED_BEAT_MS + 1)
}

describe('GUARD R3 (a): nothing in the night advances without a tap but the overlay, the block moment and the FILED stamp', () => {
  it('plays the overlay, the block moment and the stamp on their own, then waits on every card', async () => {
    reduced = false
    // The first night of the prepared line with a move a defense stops and
    // a move that would land, so both the moment that plays by itself and
    // the card that waits for an answer are met. Until v1.7 R1 this was
    // turn 1 and its strike, which stood STRIKE_HOLD_MS before a hit's
    // card; a hit has no strike now, and waits on THE RESPONSE instead.
    const state = (() => {
      for (let turn = 1; turn <= DEFAULT_SCENARIO.totalTurns; turn += 1) {
        const s = gameAt(turn)
        if (s.status !== 'playing' || s.turn !== turn) break
        const events = resolveTurn(s, NO_OP, turnRng(s.seed, s.turn)).history.at(-1)!.events
        const threats = events.filter((e) => !e.debris && (DEFAULT_SCENARIO.events.find((d) => d.id === e.eventId)!.kind ?? 'threat') === 'threat')
        if (threats.some((e) => e.effectiveSeverity === 0) && threats.some((e) => e.room !== undefined)) return s
      }
      throw new Error('no night of the prepared line has both a block and a move that would land')
    })()
    render(state)
    await tap(q('[data-execute]'))
    expect(stage(), 'EXECUTE did not open COLDVEIL IS MOVING').toBe('moving')
    await pass(749, 749)
    expect(stage()).toBe('moving')
    await pass(2, 2)
    expect(stage(), 'the overlay did not give way to the first move').not.toBe('moving')
    const label = () => q('[data-night-card]')?.getAttribute('aria-label')
    const seen: string[] = []
    for (let i = 0; i < 40 && stage() !== 'board'; i += 1) {
      const before = stage()
      seen.push(before)
      if (before === 'block') {
        // The block moment: on its own, inside a second, and no sooner
        // than its BLOCK_MS.
        const moment = q('[data-block-moment]')
        await pass(BLOCK_MS - 20)
        expect(q('[data-block-moment]'), 'the block moment left before its time').toBe(moment)
        await pass(40)
        expect(q('[data-block-moment]'), 'the block moment did not move on by itself').not.toBe(moment)
        continue
      }
      // Every card waits: a minute passes and the same one is up.
      const at = label()
      await pass(60_000, 1000)
      expect(stage(), `${before} moved on without a tap`).toBe(before)
      expect(label()).toBe(at)
      const el = way()
      const filing = !!el?.hasAttribute('data-collect')
      await tap(el)
      if (!filing) continue
      // FILE TO DOSSIER: the stamp stands on the same card for its beat,
      // and then the night goes on with no second tap.
      seen.push('filed')
      expect(q('[data-filed-stamp]'), 'FILE TO DOSSIER left no stamp').not.toBeNull()
      expect(label()).toBe(at)
      await pass(FILED_BEAT_MS - 20)
      expect(q('[data-filed-stamp]'), 'the FILED stamp left before its beat').not.toBeNull()
      expect(label()).toBe(at)
      await pass(40)
      expect(q('[data-filed-stamp]'), 'the night did not go on after the FILED stamp').toBeNull()
    }
    expect(seen, 'the night met no response, result, block moment, FILED stamp or END OF TURN').toEqual(expect.arrayContaining(['respond', 'hit', 'block', 'filed', 'end']))
    // The response's result is the same screen: the answer brings the
    // result up at once, with nothing between them.
    seen.forEach((at, i) => {
      if (at === 'respond') expect(seen[i + 1], 'an answer did not bring up its result').toBe('hit')
    })
    expect(stage(), `BEGIN TURN ${state.turn + 1} did not reach the board`).toBe('board')
  }, 30_000)
})

describe('GUARD R3 (b): a first meeting shows FILE TO DOSSIER and a repeat shows CONTINUE', () => {
  it('offers FILE TO DOSSIER and the NEW DOSSIER CARD row for a threat not yet filed, and CONTINUE with the IN YOUR DOSSIER row for one that is', async () => {
    render(gameAt(1))
    await tap(q('[data-execute]'))
    // Turn 1 owns no defense, so its first move would land: the night
    // stops on THE RESPONSE, and the result follows the answer (v1.7 R1).
    expect(stage()).toBe('respond')
    expect(q('[data-collect]') ?? q('[data-continue]'), 'the response card has a way on besides an answer').toBeNull()
    await tap(respond())
    expect(stage()).toBe('hit')
    expect(q('[data-collect]')?.textContent).toBe('FILE TO DOSSIER')
    expect(q('[data-continue]')).toBeNull()
    // The row is on every result since v1.7 R1 (a first meeting had none,
    // and opened the full-screen Dossier card instead): here it says the
    // card is new.
    const fresh = q('[data-night-card="hit"] details[data-dossier-row]')!
    expect(fresh, 'a first meeting has no dossier row').not.toBeNull()
    expect(fresh.hasAttribute('data-fresh')).toBe(true)
    expect(fresh.querySelector('summary')!.textContent).toContain('NEW DOSSIER CARD')
    // The same night, with both of turn 1's moves already filed: the seed's
    // own two (v1.6 R1, its opening).
    localStorage.setItem('dc-dossier', JSON.stringify(planFor(gameAt(1), 1)!.slots[0].drawFrom))
    render(gameAt(1))
    await tap(q('[data-execute]'))
    expect(stage()).toBe('respond')
    await tap(respond())
    expect(stage()).toBe('hit')
    expect(q('[data-continue]')?.textContent).toBe('CONTINUE')
    expect(q('[data-collect]')).toBeNull()
    const row = q('[data-night-card="hit"] details[data-dossier-row]')!
    expect(row).not.toBeNull()
    expect(row.hasAttribute('data-fresh')).toBe(false)
    expect(row.querySelector('summary')!.textContent).toContain('IN YOUR DOSSIER')
  })
})

describe('GUARD R3 (c): FILE TO DOSSIER raises the dossier by one and survives a reload', () => {
  it('files the card on the device at the tap, stamps it FILED with the count, goes on by itself, and GOAL 2 counts it after a reload', async () => {
    render(gameAt(1))
    const before = dossierCount().filed
    await tap(q('[data-execute]'))
    await tap(respond())
    const id = q('[data-night-card="hit"] [data-dossier-row]')!.getAttribute('data-dossier-row')!
    const card = q('[data-night-card]')!.getAttribute('aria-label')
    expect(dossier().has(id), 'filed before FILE TO DOSSIER').toBe(false)
    await tap(q('[data-collect]'))
    // Filed at the tap that names it (Ken's playtest item 4: no second
    // FILE IT). Since v1.7 R1 the button itself becomes the stamp, with
    // the Dossier's count, on the same card; the full-screen Dossier card
    // and its CONTINUE are gone.
    expect(dossier().has(id), 'not filed at FILE TO DOSSIER').toBe(true)
    expect(dossierCount().filed).toBe(before + 1)
    expect(stage()).toBe('hit')
    expect(q('[data-night-card]')!.getAttribute('aria-label')).toBe(card)
    const stamp = q('[data-filed-stamp]')
    expect(stamp?.textContent).toBe(`FILED · ${before + 1} / ${dossierCount().total}`)
    expect(stamp!.getAttribute('role')).toBe('status')
    expect(q('[data-collect]') ?? q('[data-continue]'), 'a second tap is asked for after FILE TO DOSSIER').toBeNull()
    // Then the night goes on by itself, and nothing is filed twice.
    await pass(FILED_BEAT_MS + 1)
    expect(q('[data-filed-stamp]'), 'the night stood on the FILED stamp').toBeNull()
    expect(q('[data-night-card]')?.getAttribute('aria-label'), 'the night did not go on to its next stage').not.toBe(card)
    expect(dossierCount().filed).toBe(before + 1)
    // A reload: nothing held in memory, only what storage kept.
    act(() => root.unmount())
    root = createRoot(container)
    expect(JSON.parse(localStorage.getItem('dc-dossier') ?? '[]')).toContain(id)
    expect(dossierCount().filed).toBe(before + 1)
  })
})

describe("GUARD R3 (d): END OF TURN's rows add up to the next budget the engine reports", () => {
  const rows = () => [...container.querySelectorAll('[data-ledger-row]')].map((r) => ({ key: r.getAttribute('data-ledger-row')!, value: Number(r.getAttribute('data-value')) }))
  const check = (next: GameState, where: string) => {
    const r = rows()
    expect(r.length, `${where}: no ledger`).toBeGreaterThanOrEqual(5)
    const total = r.find((x) => x.key === 'total')!.value
    const sum = r.filter((x) => x.key !== 'total').reduce((n, x) => n + x.value, 0)
    expect(sum, `${where}: the rows do not add up to the total`).toBe(total)
    expect(total, `${where}: the total is not the engine's next budget`).toBe(next.credits)
    // And the card prints the number it says.
    expect(q('[data-ledger-row="total"]')!.textContent).toContain(String(next.credits))
  }
  it('adds up live, at the end of a night', async () => {
    const state = gameAt(2)
    render(state)
    await tap(q('[data-execute]'))
    for (let i = 0; i < 30 && stage() !== 'end'; i += 1) await onward()
    expect(stage()).toBe('end')
    check(resolveTurn(state, { ...NO_OP, debris: 'hold' }, turnRng(state.seed, state.turn)), 'turn 2, live')
    // Every move was ridden out, so nothing was spent in the night.
    expect(q('[data-ledger-row="responses"]'), 'a night of moves ridden out bills a response').toBeNull()
  })
  it('adds up live with a response paid for in the night (v1.7 R1)', async () => {
    // The same night answered as the sweep's sensible line answers it: the
    // strongest response the budget can meet, which the card lists first
    // among those it does not disable. The engine's own night with that
    // responder is the oracle, and the ledger has a row for what it spent.
    const state = gameAt(2)
    const next = playNight(state, { ...NO_OP, debris: 'hold' }, sensible)
    const spent = next.history.at(-1)!.ledger.responses ?? 0
    expect(spent, 'the fixture answers nothing, so the row proves nothing').toBeGreaterThan(0)
    respond = strongest
    try {
      render(state)
      await tap(q('[data-execute]'))
      for (let i = 0; i < 30 && stage() !== 'end'; i += 1) await onward()
    } finally {
      respond = () => q('button[data-response="ride"]')
    }
    expect(stage()).toBe('end')
    check(next, 'turn 2, live, answered')
    expect(Number(q('[data-ledger-row="responses"]')?.getAttribute('data-value')), 'the ledger does not bill the response').toBe(-spent)
  })
  it('adds up from a reload, on every turn of three seeded games', () => {
    for (const [seed, script] of [
      [20260712, WIN_SCRIPT],
      [24, {} as Record<number, TurnActions>],
      // One new defense a night since v1.4: seed 4 ordered three on turn 2
      // until then.
      [4, { 2: a({ buyCounters: ['antiJam'] }), 3: a({ buyCounters: ['linkAuth'] }) }],
    ] as const) {
      let s = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (s.status === 'playing') {
        s = resolveTurn(s, script[s.turn] ?? NO_OP, turnRng(s.seed, s.turn))
        render(s, 'aftermath')
        check(s, `seed ${seed} turn ${s.history.length}`)
      }
    }
  })
})

describe('GUARD R3 (e): BURN and HOLD state the same odds as the odds line', () => {
  for (const ssa of [false, true]) {
    it(`says the odds in the odds line's words on both buttons, ${ssa ? 'with' : 'without'} the SSA service`, async () => {
      // The night of the call: turn 5 on this seed (v1.6 R1).
      const state = gameAt(debrisTurnOf(20260712), 20260712, { 1: a({}), 2: a({}), 3: a({ buyCounters: ssa ? ['ssaManeuver'] : [] }) })
      render(state)
      await tap(q('[data-execute]'))
      for (let i = 0; i < 20 && stage() !== 'call'; i += 1) await onward()
      expect(stage(), 'the night never made the call').toBe('call')
      const odds = q('[data-odds]')!.textContent!
      expect(odds).toBe(ssa ? '35 percent' : '20 to 60 percent')
      for (const choice of ['burn', 'hold']) expect(q(`[data-call="${choice}"]`)!.textContent, `${choice.toUpperCase()} does not say the odds line's odds`).toContain(odds)
    })
  }
})

describe('GUARD R3 (f): no retired word in any night card', () => {
  const RETIRED: [string, RegExp][] = [
    ['buy', /\b(buy|buys|bought)\b/i],
    ['purchase', /\bpurchas\w*/i],
    ['money', /\bmoney\b/i],
    ['cart', /\bcart\b/i],
    ['credits', /\bcredits?\b/i],
    ['MAI', /\bMAI\b/],
    ['Mission Assurance Index', /Mission Assurance Index/i],
    ['RESOLVE', /\bRESOLVE\b/],
    ['END TURN', /\bEND TURN\b/i],
    ['forecast', /\bforecast\b/i],
    ['mitigated', /\bmitigated\b/i],
    ['severity', /\bseverity\b/i],
    ['aftermath', /\baftermath\b/i],
    ['verdict', /\bverdict\b/i],
    ['commendation', /\bcommendation\b/i],
    ['INTEL ARCHIVE', /INTEL ARCHIVE/i],
    ['seed', /\bseed\b/i],
    ['slot', /\bslot\b/i],
    ['in this build', /in this build/i],
  ]
  it('finds none on the response, a hit, a block and its moment, a partial, a halved move, an opportunity, the debris call and its result, and every END OF TURN', async () => {
    // Seed 32 on STANDARD, with these orders, meets every kind of card
    // (scripts/phone-layout.mjs, NIGHT_PLAN, plays the same operation), on
    // the campaign's other order. Seed 1 until v1.6 R1, when each seed
    // began to play its own order; seed 24, with three on turn 2, until
    // v1.4's one new defense a night.
    //
    // v1.7 R1: the full-screen Dossier card is gone (its words are in each
    // result's Dossier row, which is read with the card), and the night
    // now has the response card, the block moment and three ways a result
    // can read after an answer. So the walk answers too: it halves the
    // first move it can, blocks the next, and rides the rest out.
    const plan: Record<number, string[]> = { 1: ['antiJam'], 2: ['encryptedBackhaul'], 3: ['linkAuth'], 4: ['pntAuth'], 5: ['sensorFusion'], 6: ['groundZeroTrust'] }
    render(newGame(DEFAULT_SCENARIO, 32, 'standard'))
    const seen = new Set<string>()
    const took = new Set<string>()
    respond = () => {
      for (const effect of ['halve', 'block']) {
        const button = took.has(effect) ? null : q(`button[data-response][data-effect="${effect}"]:not([disabled])`)
        if (button) {
          took.add(effect)
          return button
        }
      }
      return q('button[data-response="ride"]')
    }
    try {
      for (let turn = 1; turn <= 6; turn += 1) {
        await order(plan[turn] ?? [])
        await tap(q('[data-execute]'))
        for (let i = 0; i < 40 && stage() !== 'board'; i += 1) {
          const s = stage()
          const card = q('[data-night-card]') ?? q('[data-block-moment]')
          if (!card) break
          seen.add(s === 'hit' ? `hit:${q('[data-result]')!.getAttribute('data-result')}${q('[data-response-taken]') && q('[data-response-taken]')!.getAttribute('data-response-taken') !== 'ride' ? ':answered' : ''}` : s)
          // Everything the card says, the closed Dossier row and END OF
          // TURN's DETAILS with it, and each response button's spoken name.
          const text = [words(card), ...[...card.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'))].join(' ')
          for (const [word, re] of RETIRED) expect(re.test(text), `${word} on ${s}, turn ${turn}: "${text.match(re)?.[0]}"`).toBe(false)
          const last = s === 'end' && q('[data-begin]')!.textContent === 'DEBRIEF'
          await onward()
          if (last) break
        }
      }
    } finally {
      respond = () => q('button[data-response="ride"]')
    }
    expect([...seen].sort()).toEqual(['block', 'call', 'debris', 'end', 'hit:blocked', 'hit:blocked:answered', 'hit:halved:answered', 'hit:hit', 'hit:partial', 'opportunity', 'respond'])
  })
})
