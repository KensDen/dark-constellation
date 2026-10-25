// @vitest-environment jsdom
//
// THE NIGHT'S GUARDS (v1.3 brief 5.5 and section 4), each mutated once
// when it was written (files/*_v1.3_R3_Report_v1.0.md):
//   GUARD R3 (a), NOTHING ADVANCES WITHOUT A TAP but the 750ms overlay and
//   the strike: a card, the intel card and END OF TURN wait a minute and
//   are still there; one tap moves each on.
//   GUARD R3 (b), A FIRST MEETING SHOWS COLLECT INTEL CARD, a repeat shows
//   CONTINUE (and the IN YOUR DOSSIER row).
//   GUARD R3 (c), FILE IT RAISES THE DOSSIER BY ONE AND SURVIVES A RELOAD:
//   the device's dossier, and GOAL 2's count of it, read again from
//   storage.
//   GUARD R3 (d), END OF TURN'S ROWS ADD UP TO THE NEXT BUDGET THE ENGINE
//   REPORTS, live and from a reload, on every turn of seeded games.
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
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { dossier } from '../src/persistence'
import { dossierCount } from '../src/ui/titleStatus'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { LOCK_SHARE, STRIKE_MS } from '../src/ui/board/strike'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { NO_OP, WIN_SCRIPT, a } from './scripts'

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
const stage = () =>
  q('[data-intel-file]') ? 'intel' : (q('[data-night-card]')?.getAttribute('data-night-card') ?? (q('[data-moving]') ? 'moving' : q('[data-strike-banner]') ? 'strike' : q('[data-dock]') ? 'board' : 'none'))
async function order(ids: string[]) {
  if (!ids.length) return
  await tap(q('[data-action="procure"]'))
  for (const id of ids) await tap(q(`[data-procure-defense="${id}"]`))
  await tap(q('[data-confirm]'))
}
// The tap a card asks for: FILE IT, the call, COLLECT or CONTINUE, BEGIN.
const way = () => q('[data-file-it]') ?? q(`[data-call="${callChoice}"]`) ?? q('[data-collect]') ?? q('[data-continue]') ?? q('[data-begin]')
let callChoice: 'burn' | 'hold' = 'hold'

describe('GUARD R3 (a): nothing in the night advances without a tap but the overlay and the strike', () => {
  it('plays the overlay and the strike on their own, then waits on every card', async () => {
    reduced = false
    vi.useFakeTimers()
    render(gameAt(1))
    await tap(q('[data-execute]'))
    expect(stage(), 'EXECUTE did not open COLDVEIL IS MOVING').toBe('moving')
    await act(async () => void vi.advanceTimersByTime(749))
    expect(stage()).toBe('moving')
    await act(async () => void vi.advanceTimersByTime(2))
    await act(async () => {})
    expect(stage(), 'the overlay did not give way to the strike').toBe('strike')
    // The strike's two clocks: the lock-on, then the landing.
    await act(async () => void vi.advanceTimersByTime(STRIKE_MS * LOCK_SHARE + 1))
    await act(async () => {})
    expect(stage()).toBe('strike')
    await act(async () => void vi.advanceTimersByTime(STRIKE_MS * (1 - LOCK_SHARE) + 1))
    await act(async () => {})
    expect(stage(), 'the strike did not give way to the hit card').toBe('hit')
    // From here every card waits: a minute passes and the same one is up.
    const seen: string[] = []
    for (let i = 0; i < 12 && stage() !== 'board'; i += 1) {
      const before = stage()
      const label = (q('[data-intel-file]') ?? q('[data-night-card]'))?.getAttribute('aria-label') ?? q('[data-intel-file]')?.getAttribute('data-intel-file')
      await act(async () => void vi.advanceTimersByTime(60_000))
      await act(async () => {})
      expect(stage(), `${before} moved on without a tap`).toBe(before)
      expect((q('[data-intel-file]') ?? q('[data-night-card]'))?.getAttribute('aria-label') ?? q('[data-intel-file]')?.getAttribute('data-intel-file')).toBe(label)
      seen.push(before)
      await tap(way())
    }
    expect(seen, 'the night met no card, intel card or END OF TURN').toEqual(expect.arrayContaining(['hit', 'intel', 'end']))
    expect(stage(), 'BEGIN TURN 2 did not reach the board').toBe('board')
  })
})

describe('GUARD R3 (b): a first meeting shows COLLECT INTEL CARD and a repeat shows CONTINUE', () => {
  it('offers COLLECT for a threat not yet filed, and CONTINUE with the dossier row for one that is', async () => {
    render(gameAt(1))
    await tap(q('[data-execute]'))
    expect(stage()).toBe('hit')
    expect(q('[data-collect]')?.textContent).toBe('COLLECT INTEL CARD')
    expect(q('[data-continue]')).toBeNull()
    expect(q('[data-dossier-row]')).toBeNull()
    // The same night, with both of turn 1's moves already filed.
    localStorage.setItem('dc-dossier', JSON.stringify(['gnss-spoofing', 'uplink-jamming']))
    render(gameAt(1))
    await tap(q('[data-execute]'))
    expect(stage()).toBe('hit')
    expect(q('[data-continue]')?.textContent).toBe('CONTINUE')
    expect(q('[data-collect]')).toBeNull()
    expect(q('[data-dossier-row]')).not.toBeNull()
  })
})

describe('GUARD R3 (c): FILE IT raises the dossier by one and survives a reload', () => {
  it('files the card on the device at once, where GOAL 2 counts it after a reload', async () => {
    render(gameAt(1))
    const before = dossierCount().filed
    await tap(q('[data-execute]'))
    await tap(q('[data-collect]'))
    expect(stage()).toBe('intel')
    const id = q('[data-intel-file]')!.getAttribute('data-intel-file')!
    // The counter ticks up as the card arrives, before it is filed.
    expect(q('[data-dossier-count]')!.textContent).toBe(`${before + 1} / ${dossierCount().total}`)
    expect(dossier().has(id), 'filed before FILE IT').toBe(false)
    await tap(q('[data-file-it]'))
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
    for (let i = 0; i < 12 && stage() !== 'end'; i += 1) await tap(way())
    expect(stage()).toBe('end')
    check(resolveTurn(state, { ...NO_OP, debris: 'hold' }, turnRng(state.seed, state.turn)), 'turn 2, live')
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
      const state = gameAt(4, 20260712, { 1: a({}), 2: a({}), 3: a({ buyCounters: ssa ? ['ssaManeuver'] : [] }) })
      render(state)
      await tap(q('[data-execute]'))
      for (let i = 0; i < 6 && stage() !== 'call'; i += 1) await tap(way())
      expect(stage(), 'turn 4 never made the call').toBe('call')
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
  it('finds none on a hit, a block, a partial, an opportunity, the debris call and its result, the intel card and every END OF TURN', async () => {
    // Seed 1 on STANDARD, with these orders, meets every kind of card
    // (scripts/phone-layout.mjs, NIGHT_PLAN, plays the same operation). One
    // new defense a night since v1.4: seed 24, with three on turn 2, until
    // then.
    const plan: Record<number, string[]> = { 1: ['antiJam'], 2: ['encryptedBackhaul'], 3: ['linkAuth'], 4: ['pntAuth'], 5: ['sensorFusion'], 6: ['groundZeroTrust'] }
    render(newGame(DEFAULT_SCENARIO, 1, 'standard'))
    const seen = new Set<string>()
    for (let turn = 1; turn <= 6; turn += 1) {
      await order(plan[turn] ?? [])
      await tap(q('[data-execute]'))
      for (let i = 0; i < 20 && stage() !== 'board'; i += 1) {
        const s = stage()
        const card = q('[data-intel-file]') ?? q('[data-night-card]')
        if (!card) break
        seen.add(s === 'hit' ? `hit:${q('[data-result]')!.getAttribute('data-result')}` : s)
        const text = words(card)
        for (const [word, re] of RETIRED) expect(re.test(text), `${word} on ${s}, turn ${turn}: "${text.match(re)?.[0]}"`).toBe(false)
        const last = s === 'end' && q('[data-begin]')!.textContent === 'DEBRIEF'
        await tap(way())
        if (last) break
      }
    }
    expect([...seen].sort()).toEqual(['call', 'debris', 'end', 'hit:blocked', 'hit:hit', 'hit:partial', 'intel', 'opportunity'])
  })
})
