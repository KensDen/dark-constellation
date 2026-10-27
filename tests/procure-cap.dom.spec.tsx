// @vitest-environment jsdom
//
// ONE NEW DEFENSE A NIGHT, AS THE PLAYER SEES IT (v1.4, Ken's ruling of 24
// October 2026): PROCURE says the rule, with its reason, before tonight's
// defense is ordered; once one is, the others read 1 A TURN with the
// reason (NOT TONIGHT until v1.5 R1), never as unaffordable, and taking the order back opens them
// again. TONIGHT stops offering "defend ›" once the night's defense is in,
// since a tap can no longer add one. The engine half is tests/flag-cap.spec.ts.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import { DEFAULT_SCENARIO } from '../src/content'
import { NEW_DEFENSES_PER_NIGHT, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { DEFENSE_IN, NOT_THIS_TURN, capLabel, defenseCount, defenseOrderIn, defenseRule, tapHint } from '../src/ui/board/boardModel'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'

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

beforeAll(async () => {
  await import('../src/ui/night/Night')
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('localStorage', memoryStorage())
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

// Seed 2, which plays the campaign as written (v1.6 R1: uplink jamming
// against GNSS spoofing on turn 1); seed 3 until then.
const SEED = 2

let mounts = 0
function render(state: GameState) {
  mounts += 1
  act(() => {
    root.render(<Game key={`m${mounts}`} initial={{ state, phase: 'brief' }} onExit={() => {}} />)
  })
}
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
const q = (sel: string) => container.querySelector(sel)
const defense = (id: string) => q(`button[data-procure-defense="${id}"]`) as HTMLButtonElement
const defenses = () => [...container.querySelectorAll<HTMLButtonElement>('button[data-procure-defense]')]
const pressed = (b: Element) => b.getAttribute('aria-pressed') === 'true'
const rule = () => q('[data-defense-rule]')
const openProcure = () => click(q('button[data-action="procure"]')!)

describe('PROCURE under one new defense a turn (v1.4; in turns since v1.5 R1)', () => {
  it('says the rule and its reason before the night has a defense, and caps none', () => {
    render(newGame(DEFAULT_SCENARIO, SEED, 'standard'))
    openProcure()
    expect(rule()?.getAttribute('data-defense-rule')).toBe('open')
    expect(rule()?.textContent).toBe(defenseRule(NEW_DEFENSES_PER_NIGHT))
    expect(rule()?.textContent).toContain('1 new defense a turn')
    // A limit with its reason, and not on the fleet (the v1.4 fresh-eyes review).
    expect(rule()?.textContent).toContain('can bring only 1 online')
    expect(rule()?.textContent).toContain('Assets skip integration, so the limit does not apply to them.')
    expect(q('[data-procure-defenses]')!.previousElementSibling!.textContent).toContain('1 a turn')
    // The planned line leads with the turn's one defense (v1.4 finding 3).
    expect(q('[data-planned]')!.textContent).toContain(defenseCount(0, 1))
    expect(defenses().filter((b) => b.hasAttribute('data-capped'))).toEqual([])
    expect(container.textContent).not.toContain('1 A TURN')
  })

  it('once one is ordered, reads the rest 1 A TURN with the reason, not as unaffordable, and the order can be taken back', () => {
    // Owned PNT authentication beside it, which stays OWNED and is not new.
    render({ ...newGame(DEFAULT_SCENARIO, SEED, 'standard'), counters: ['pntAuth'] })
    openProcure()
    click(defense('antiJam'))
    expect(pressed(defense('antiJam')), 'the tap did not order anti-jam').toBe(true)
    expect(rule()?.getAttribute('data-defense-rule')).toBe('in')
    const antiJam = DEFAULT_SCENARIO.countermeasures.find((c) => c.id === 'antiJam')!.name
    expect(rule()?.textContent).toBe(defenseOrderIn(antiJam))
    // It names the defense ordered, so a sheet opened from another move
    // says what to cancel (v1.4 round 2, finding 1), after the reason
    // Ken's ruling of 26 October 2026 names (v1.6 R1).
    expect(rule()?.textContent).toContain(`Tonight's order is in: ${antiJam}.`)
    expect(q('[data-planned]')!.textContent).toContain(defenseCount(1, 1))
    // Why, and how to change it (the v1.4 fresh-eyes review).
    expect(rule()?.textContent).toContain('1 new defense a turn.')
    expect(rule()?.textContent).toContain('To swap, cancel it first.')
    const others = defenses().filter((b) => !['antiJam', 'pntAuth'].includes(b.getAttribute('data-procure-defense')!))
    expect(others.length).toBe(DEFAULT_SCENARIO.countermeasures.length - 2)
    for (const b of others) {
      const id = b.getAttribute('data-procure-defense')
      expect(b.disabled, `${id} is still offered`).toBe(true)
      expect(b.hasAttribute('data-capped'), `${id} is not marked capped`).toBe(true)
      // One label on every turn (the R1 re-review: NEXT TURN and 1 A TURN
      // for the same state).
      expect(b.textContent, `${id} does not say why`).toContain(capLabel(NEW_DEFENSES_PER_NIGHT))
      expect(capLabel(NEW_DEFENSES_PER_NIGHT)).toBe('1 A TURN')
      // Not read as unaffordable: no price to add, and the reason is the rule line.
      expect(b.textContent, `${id} still offers itself`).not.toContain('+ ADD')
      expect(b.getAttribute('aria-describedby')).toBe(rule()!.id)
    }
    // Every one of them fits the budget: the cap, not the price, is the reason.
    const left = Number(q('[data-sheet="procure"] h2 b')!.textContent)
    for (const b of others) {
      const cost = DEFAULT_SCENARIO.countermeasures.find((c) => c.id === b.getAttribute('data-procure-defense'))!.cost
      expect(cost, `${b.getAttribute('data-procure-defense')} would be off for its price anyway, so this proves nothing`).toBeLessThanOrEqual(left)
    }
    expect(defense('pntAuth').textContent).toContain('OWNED')
    expect(defense('pntAuth').hasAttribute('data-capped')).toBe(false)
    // A tap on a capped line orders nothing.
    click(others[0])
    expect(pressed(others[0])).toBe(false)
    expect(defenses().filter(pressed).map((b) => b.getAttribute('data-procure-defense')).sort()).toEqual(['antiJam', 'pntAuth'])
    // Taking tonight's order back opens them again.
    expect(defense('antiJam').disabled, 'the ordered defense cannot be taken back').toBe(false)
    click(defense('antiJam'))
    expect(rule()?.getAttribute('data-defense-rule')).toBe('open')
    expect(defenses().filter((b) => b.hasAttribute('data-capped'))).toEqual([])
  })

  it('reads the rule on the last turn, where there is no next one', () => {
    let s = newGame(DEFAULT_SCENARIO, SEED, 'standard')
    while (s.turn < DEFAULT_SCENARIO.totalTurns) s = resolveTurn(s, { buyAssets: [], buyCounters: [], intelBrief: false, debris: 'burn' }, turnRng(s.seed, s.turn))
    render(s)
    openProcure()
    click(defense('antiJam'))
    const capped = defenses().filter((b) => b.hasAttribute('data-capped'))
    expect(capped.length).toBeGreaterThan(0)
    for (const b of capped) expect(b.textContent).toContain('1 A TURN')
    // The last turn has no next one to be booked until (the R1 re-review).
    expect(rule()?.textContent).toContain("the operation's last new defense")
    expect(rule()?.textContent).not.toContain('next turn')
  })

  it('says, on a move whose defenses must wait, that it is not this turn', () => {
    render({ ...newGame(DEFAULT_SCENARIO, SEED, 'standard') })
    openProcure()
    click(defense('antiJam'))
    click(q('button[data-confirm]')!)
    click(q('[data-move="gnss-spoofing"]')!)
    expect(q('[data-match-note]')!.textContent).toContain(NOT_THIS_TURN)
    // Not on the move tonight's defense answers.
    click(q('[aria-label="Close PROCURE"]')!)
    click(q('[data-move="uplink-jamming"]')!)
    expect(q('[data-match-note]')!.textContent).not.toContain(NOT_THIS_TURN)
  })

  it('says nothing of the rule once every defense is owned', () => {
    render({ ...newGame(DEFAULT_SCENARIO, SEED, 'standard'), counters: DEFAULT_SCENARIO.countermeasures.map((c) => c.id) })
    openProcure()
    expect(rule()).toBeNull()
  })
})

describe('TONIGHT under one new defense a turn (v1.4)', () => {
  it('offers "defend ›" on an exposed move only while tonight can take a defense', () => {
    render(newGame(DEFAULT_SCENARIO, SEED, 'standard'))
    const hints = () => [...container.querySelectorAll('[data-move]')].map((m) => m.lastElementChild?.lastElementChild?.textContent)
    expect(hints().every((h) => h === tapHint('exposed')), `turn 1 reads ${hints().join(', ')}`).toBe(true)
    expect(tapHint('exposed')).toBe('defend ›')
    expect(container.querySelector('[data-tonight]')!.textContent).not.toContain(DEFENSE_IN)
    // FIRST ORDERS asks for the one order and says the rule.
    expect(container.textContent).toContain('1 new defense a turn, so they hit the other one.')
    // Order a defense for one of the two moves, from its card.
    click(q('[data-move="uplink-jamming"]')!)
    click(defense('antiJam'))
    click(q('button[data-confirm]')!)
    const after = Object.fromEntries([...container.querySelectorAll('[data-move]')].map((m) => [m.getAttribute('data-move'), m.lastElementChild?.lastElementChild?.textContent]))
    expect(after['uplink-jamming'], 'the blocked move').toBe('details ›')
    expect(after['gnss-spoofing'], 'the exposed move still offers a defense the night cannot take').toBe('details ›')
    // Turn 1's FIRST ORDERS says the rule and ticks the order, so the rule
    // line keeps its length there (the board fits 375x667)...
    expect(container.querySelector('[data-tonight]')!.textContent).not.toContain(DEFENSE_IN)
  })

  it('says tonight\'s defense is in on the rule line from turn 2, once it is ordered', () => {
    let s = newGame(DEFAULT_SCENARIO, SEED, 'standard')
    s = resolveTurn(s, { buyAssets: [], buyCounters: ['antiJam'], intelBrief: false }, turnRng(s.seed, s.turn))
    render(s)
    // The brief names the moves, so the rule line shows; ordered in
    // PROCURE, where the TONIGHT card's row opens (v1.5 R2).
    click(q('button[data-brief-order]')!)
    click(q('[data-sheet="procure"] button[data-procure-intel]')!)
    click(q('[data-sheet="procure"] button[data-confirm]')!)
    expect(container.querySelector('[data-tonight]')!.textContent).toContain('They go for the move')
    expect(container.querySelector('[data-tonight]')!.textContent).not.toContain(DEFENSE_IN)
    openProcure()
    click(defense('pntAuth'))
    click(q('button[data-confirm]')!)
    expect(container.querySelector('[data-tonight]')!.textContent).toContain(DEFENSE_IN)
    const hints = [...container.querySelectorAll('[data-move]')].map((m) => m.lastElementChild?.lastElementChild?.textContent)
    expect(hints.every((h) => h === 'details ›'), `turn 2 reads ${hints.join(', ')}`).toBe(true)
  })
})
