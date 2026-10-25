// @vitest-environment jsdom
//
// Hits land on the board, and the game starts teaching (v1.2 R3, brief
// 4.5 and 4.8). Since v1.3 R3 (brief 5.5) the hit plays in the night's
// strike, motion on, between COLDVEIL IS MOVING and the hit card, in place
// of the retired director's beat. The round's DOM guards:
//   (a) every hit the night strikes locks on and strobes on the tile of
//       the asset the engine named, and on no other (the engine half, that
//       every asset-damaging event names its asset, is in engine.spec.ts).
//       Since v1.3 Round 0 the engine names the AIMED tile even when a
//       defense held, and since R3 a block shows on that tile as a shield
//       rather than a lock-on, so a strike is a hit when anything got
//       through;
//   (c) each card carries its own event's technique and source: the intel
//       card a first meeting opens, and the IN YOUR DOSSIER row of a repeat
//       meeting (the REAL WORLD line rode the director's event card; the
//       content half is in real-world.spec.ts);
//   (d) COLDVEIL's intel card with no intel brief names no event, vector
//       or technique (the intel levels left with v1.3 Round 0: the brief
//       is on or off). Since v1.3 R2 that card opens from the TONIGHT
//       card's full brief, where the threat banner's button used to be;
//   (e) under reduced motion nothing strobes, bursts, pops or floats: the
//       night skips the strike, and the stylesheet stops its treatment.
// And the intel card behaves as a dialog: a real button opens it, focus
// comes back to that button, and Escape closes it without ending the night
// behind it.
//
// For (e), jsdom runs the real cascade over the real src/index.css and
// src/ui/night/night.css but evaluates no media feature, so the two
// reduced-motion conditions are stated by rewriting them, as
// tests/sprites.dom.spec.tsx does and says why at length.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import IntelCard from '../src/ui/board/IntelCard'
import { DEFAULT_SCENARIO } from '../src/content'
import { briefFree, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, ResolvedEvent } from '../src/engine/types'
import { FORECAST_DARK, briefCopy, forecastLead } from '../src/ui/brief'
import { techniqueLabel, vectorLabels } from '../src/ui/labels'
import { realWorldFor } from '../src/ui/realWorldLine'
import { assetRole, pipsFor } from '../src/ui/board/board'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const INDEX_CSS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css')
const NIGHT_CSS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui', 'night', 'night.css')

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

// The night's chunks, loaded once, so the night renders its cards from
// the loaded modules at once.
beforeAll(async () => {
  await import('../src/ui/night/Night')
  await import('../src/ui/night/cards')
  await import('../src/ui/night/closeCards')
})

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
  document.head.querySelectorAll('style[data-test-css]').forEach((s) => s.remove())
  resetAudioEngineForTests()
  removeFakeAudioContext()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function gameAt(turn: number, seed = 20260712, script = WIN_SCRIPT): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
  while (state.status === 'playing' && state.turn < turn) {
    state = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
  }
  return state
}

// The engine's record of a night played with the empty cart the tests
// commit (EXECUTE with no orders, and HOLD on the debris call).
const recordOf = (state: GameState): ResolvedEvent[] => resolveTurn(state, NO_OP, turnRng(state.seed, state.turn)).history.at(-1)!.events
const isThreat = (e: ResolvedEvent) => !e.debris && (DEFAULT_SCENARIO.events.find((d) => d.id === e.eventId)?.kind ?? 'threat') === 'threat'

// The first turn of the prepared line whose resolution, with the empty
// cart the tests commit, shows what `wanted` looks for, found from the
// engine's own record rather than pinned. Pinning broke once already: the
// deck stream of v1.2 R5a moved which events every turn draws.
function firstTurnWhere(wanted: (events: ResolvedEvent[]) => boolean): number {
  for (let turn = 1; turn <= DEFAULT_SCENARIO.totalTurns; turn += 1) {
    const state = gameAt(turn)
    if (state.status !== 'playing' || state.turn !== turn) break
    if (wanted(recordOf(state))) return turn
  }
  throw new Error('no turn of the prepared line shows what this test needs')
}

// A night of the prepared line, past turn 1, on which the intel brief is
// free and names a fixed move: an allied data share (benefit.briefTurns)
// covering a turn with a fixed slot. Found in v1.3 play by search over
// seeds rather than set by hand; the empty cart the tests commit orders
// nothing, so only a free brief is on for them.
function briefedWithLead(): GameState {
  for (let seed = 1; seed <= 100; seed += 1) {
    for (let turn = 2; turn <= DEFAULT_SCENARIO.totalTurns; turn += 1) {
      const state = gameAt(turn, seed)
      if (state.status === 'playing' && state.turn === turn && briefFree(state) && forecastLead(state)) return state
    }
  }
  throw new Error('no seed searched gives a free intel brief on a turn with a fixed move')
}

let mounts = 0
function render(state: GameState) {
  mounts += 1
  act(() => {
    root.render(<Game key={`m${mounts}`} initial={{ state, phase: 'brief' }} onExit={() => {}} />)
  })
}
const q = (sel: string) => container.querySelector(sel)
const settle = () =>
  act(async () => {
    await vi.dynamicImportSettled()
  })
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
// A tap, and the lazy cards and effects it sets off, settled.
async function tap(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
  await act(async () => {})
}
// The clock, and what it sets off in the night, settled.
async function step(ms: number) {
  await act(async () => void vi.advanceTimersByTime(ms))
  await act(async () => {})
}
// EXECUTE is a plain button since v1.3 Round 0 (the hold went with the
// dwell), and a synthetic Enter does not click a button in jsdom, so the
// tests click it.
async function execute() {
  const button = q('nav[aria-label="Actions"] button[data-execute]')
  expect(button, 'EXECUTE is not on screen').not.toBeNull()
  await tap(button!)
}
// The TONIGHT card's full brief, opened if it is not, and its chunk let
// in: COLDVEIL's intel button and the technique tag live there (v1.3 R2).
async function openFullBrief() {
  const toggle = q('button[data-full-brief]')
  expect(toggle, 'the TONIGHT card is not on screen').not.toBeNull()
  if (toggle!.getAttribute('aria-expanded') !== 'true') click(toggle!)
  await settle()
  expect(q('button[aria-label="COLDVEIL intel"]'), 'the full brief has no intel button').not.toBeNull()
}
const tiles = () => [...container.querySelectorAll('button[data-asset-id]')]
const inTiles = (selector: string) => tiles().filter((t) => t.querySelector(selector)).map((t) => t.getAttribute('data-asset-id'))
// The night is on: its overlay, a strike's banner, a card or the intel card.
const inNight = () => !!(q('[data-moving]') || q('[data-strike-banner]') || q('[data-night-card]') || q('[data-intel-file]'))
// The tap a card asks for: FILE IT, HOLD on the call, COLLECT or CONTINUE,
// BEGIN TURN.
const wayOn = () => q('[data-file-it]') ?? q('[data-call="hold"]') ?? q('[data-collect]') ?? q('[data-continue]') ?? q('[data-begin]')
// The night as a player taps through it. Every card waits for a tap; only
// the overlay and each strike play on their own (brief 5.5), so while one
// of those is up the clock runs in steps of `every` ms and `look` reads the
// board at each, and a card is tapped on by its way on. It stops as soon
// as `look` says it has what it came for, or the night is over.
async function tapThrough(look: () => boolean | void, every: number) {
  for (let i = 0; i < 2000 && inNight(); i += 1) {
    if (look()) return
    const way = wayOn()
    if (way) await tap(way)
    else await step(every)
  }
}

// The hits a night strikes, in order, from the ENGINE's record of the
// turn, not from the night's model: the board follows the model, so a
// model that named the wrong asset would move the expectation with the
// board if it were the oracle. Since v1.3 Round 0 the engine's
// targetAssetId is the AIMED tile, set even when the move was fully held,
// so a hit is a threat that got anything through at a tile; the debris
// call is not struck.
const hitsOf = (state: GameState): string[] => recordOf(state).filter((e) => isThreat(e) && e.effectiveSeverity > 0 && e.targetAssetId !== undefined).map((e) => e.targetAssetId!)
const blocksOf = (state: GameState): string[] => recordOf(state).filter((e) => isThreat(e) && e.effectiveSeverity === 0 && e.targetAssetId !== undefined).map((e) => e.targetAssetId!)

describe('hits land on their tiles (v1.2 R3, the night since v1.3 R3)', () => {
  // A whole night with motion on, on fake timers: seconds of work, so it
  // has a timeout of its own rather than the default 5s under load.
  it('GUARD R3 (a): the lock-on and the strobe land on the tile the engine named, and on no other', async () => {
    // Two turns of the prepared line, played with an empty cart, found from
    // the engine rather than pinned (the deck stream of v1.2 R5a moved
    // them): one with two hits in one night, and one with a hit beside a
    // held move, which must lock onto nothing even though the engine names
    // the tile it was aimed at (v1.3 Round 0).
    const hitsIn = (events: ResolvedEvent[]) => events.filter((e) => isThreat(e) && e.effectiveSeverity > 0 && e.targetAssetId).length
    const heldIn = (events: ResolvedEvent[]) => events.some((e) => isThreat(e) && e.effectiveSeverity === 0 && e.targetAssetId)
    const turns = [firstTurnWhere((events) => hitsIn(events) >= 2), firstTurnWhere((events) => hitsIn(events) >= 1 && heldIn(events))]
    let checked = 0
    for (const [i, turn] of turns.entries()) {
      const state = gameAt(turn)
      const expected = hitsOf(state)
      expect(expected.length, `turn ${turn} has no hit to check`).toBeGreaterThan(0)
      // The held move is aimed at a tile it never hit, so a lock-on that
      // followed the engine's aim rather than the hit would show here.
      if (i === 1) expect(blocksOf(state).length, `turn ${turn}: no held move is aimed at a tile, so the held half proves nothing`).toBeGreaterThan(0)
      render(state)
      await execute()
      const locked: string[] = []
      const struck: string[] = []
      await tapThrough(() => {
        const lock = inTiles('svg[data-sprite="lock-on"]')
        const strobe = inTiles('span[data-strobe]')
        expect(lock.length, 'the lock-on is on more than one tile').toBeLessThanOrEqual(1)
        expect(strobe.length, 'the strobe is on more than one tile').toBeLessThanOrEqual(1)
        if (lock[0] && locked[locked.length - 1] !== lock[0]) locked.push(lock[0]!)
        if (strobe[0] && struck[struck.length - 1] !== strobe[0]) struck.push(strobe[0]!)
      }, 20)
      expect(inNight(), 'the night never finished').toBe(false)
      expect(locked, `turn ${turn}: the lock-on went to other tiles`).toEqual(expected)
      expect(struck, `turn ${turn}: the strobe went to other tiles`).toEqual(expected)
      checked += expected.length
    }
    expect(checked).toBeGreaterThanOrEqual(3)
  }, 30_000)

  it('bursts on the struck tile as the hit lands, and floats the score it cost off the HUD', async () => {
    // The rest of the hit's treatment (v1.2 R3), in the strike's second
    // part: the burst's frames on the tile and the "-n" the score fell by.
    const turn = firstTurnWhere((events) => events.some((e) => isThreat(e) && e.effectiveSeverity > 0 && e.targetAssetId))
    const state = gameAt(turn)
    const first = hitsOf(state)[0]
    render(state)
    await execute()
    let burst: string[] = []
    let drop = ''
    await tapThrough(() => {
      burst = inTiles('svg[data-sprite="hit-burst-0"]') as string[]
      drop = q('span[data-mai-drop]')?.textContent ?? ''
      return burst.length > 0
    }, 20)
    expect(burst, 'the burst is not on the struck tile alone').toEqual([first])
    expect(drop, 'the score did not float its fall as the hit landed').toMatch(/^-\d+(\.\d)?$/)
  })

  it('flashes the shield on the tile a held move was aimed at, and nowhere else', async () => {
    // Since v1.3 R3 a block shows where it was aimed: a green reticle and
    // the shield on the tile (data-shield, lock then held). HELD on a
    // layer's header is only for a block with no tile to shield, so a
    // block aimed at a tile leaves every header alone.
    const state = gameAt(firstTurnWhere((events) => events.some((e) => isThreat(e) && e.effectiveSeverity === 0 && e.targetAssetId)))
    const expected = blocksOf(state)
    expect(expected.length, `turn ${state.turn} no longer holds a move at a tile`).toBeGreaterThan(0)
    render(state)
    await execute()
    const shielded: string[] = []
    let landed = false
    let headers = 0
    await tapThrough(() => {
      const on = [...container.querySelectorAll('button[data-shield]')].map((t) => t.getAttribute('data-asset-id')!)
      expect(on.length, 'the shield is on more than one tile').toBeLessThanOrEqual(1)
      if (on[0] && shielded[shielded.length - 1] !== on[0]) shielded.push(on[0])
      if (q('button[data-shield="held"]')) landed = true
      headers += container.querySelectorAll('span[data-held]').length
    }, 20)
    expect(shielded, 'the shield went to other tiles').toEqual(expected)
    expect(landed, 'the shield locked on and never landed').toBe(true)
    expect(headers, 'a block aimed at a tile flashed HELD on a header').toBe(0)
  })

  it('turns the score and its bar green while a block floats NO LOSS, and only then (v1.3 R7)', async () => {
    // R5's question 6: "nothing in the game state reacts" to a block. The
    // score's digits and its bar take the go colour while the HUD floats
    // NO LOSS, and never while it floats a fall.
    const state = gameAt(firstTurnWhere((events) => events.some((e) => isThreat(e) && e.effectiveSeverity === 0) && events.some((e) => isThreat(e) && e.effectiveSeverity > 0)))
    render(state)
    await execute()
    let greenOnBlock = false
    let greenOnFall = false
    await tapThrough(() => {
      const drop = q('span[data-mai-drop]')?.getAttribute('data-mai-drop')
      const green = !!q('[data-hud] [data-score-held].dc-score-held') && !!q('[data-hud] i[data-bar-held].bg-dc-go')
      if (drop === 'held' && green) greenOnBlock = true
      if (drop === 'fall' && (q('[data-score-held]') || q('[data-bar-held]'))) greenOnFall = true
      if (!drop) expect(q('[data-score-held]'), 'the score stayed green after the block').toBeNull()
    }, 20)
    expect(greenOnBlock, 'the score and its bar did not go green as the block landed').toBe(true)
    expect(greenOnFall, 'the score went green on a fall').toBe(false)
  })
})

describe('a lost pip pops out of the row (v1.2 R3)', () => {
  it('pops the pips a hit takes, on the struck tile', async () => {
    // The first night of the prepared line where a hit takes a pip (turn 4
    // since the six-turn campaign of v1.3 Round 0: the implant takes
    // start-sat-1 from 100 to 64, four pips to three, after the debris
    // call on the same night).
    const takesPip = (e: ResolvedEvent) => e.integrityBefore !== undefined && e.integrityAfter !== undefined && pipsFor(e.integrityAfter) < pipsFor(e.integrityBefore)
    const state = gameAt(firstTurnWhere((events) => events.some((e) => isThreat(e) && takesPip(e))))
    const target = recordOf(state).find((e) => isThreat(e) && takesPip(e))!.targetAssetId!
    render(state)
    await execute()
    let popped: string[] = []
    await tapThrough(() => {
      popped = inTiles('span[data-pip-pop]') as string[]
      return popped.length > 0
    }, 10)
    expect(popped).toEqual([target])
  })
})

describe("each card carries its own event's technique and source (v1.2 R3, the night's cards since v1.3 R3)", () => {
  it("GUARD R3 (c): the intel card and the dossier row name the event's own technique and source, one tap from the card", async () => {
    // A night with two different threats, so a line written for one cannot
    // pass as both. Played twice: once with nothing filed, where each first
    // meeting opens its intel card (COLLECT INTEL CARD), and once with both
    // filed, where each hit card carries the IN YOUR DOSSIER row closed.
    setReducedMotion(true)
    const state = gameAt(firstTurnWhere((events) => new Set(events.filter(isThreat).map((e) => e.eventId)).size >= 2))
    const ids = [...new Set(recordOf(state).filter(isThreat).map((e) => e.eventId))]
    const own = (id: string) => {
      const def = DEFAULT_SCENARIO.events.find((e) => e.id === id)!
      const ref = def.techniqueRefs[0]
      return { technique: `${techniqueLabel(ref)} ${ref.name}`, source: realWorldFor(def)!.first.title }
    }
    const rows = (el: Element) => {
      const dl = [...el.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent ?? ''])
      return { technique: dl.find(([k]) => k === 'TECHNIQUE')?.[1], source: dl.find(([k]) => k === 'SOURCE')?.[1] }
    }

    const onIntel = new Map<string, { technique?: string; source?: string }>()
    render(state)
    await execute()
    await tapThrough(() => {
      const card = q('[data-intel-file]')
      if (card) onIntel.set(card.getAttribute('data-intel-file')!, rows(card))
    }, 50)
    expect([...onIntel.keys()].sort(), 'not every first meeting opened its intel card').toEqual([...ids].sort())
    for (const id of ids) expect(onIntel.get(id), `${id}'s intel card`).toEqual(own(id))

    // A repeat meeting: the same night with both filed.
    localStorage.setItem('dc-dossier', JSON.stringify(ids))
    const onRow = new Map<string, { technique?: string; source?: string }>()
    render(state)
    await execute()
    await tapThrough(() => {
      const row = q('section[data-night-card="hit"] details[data-dossier-row]') as HTMLDetailsElement | null
      if (!row) return
      // Closed on the card, and one tap opens it.
      expect(row.open, 'the dossier row arrived open').toBe(false)
      expect(row.querySelector('summary'), 'the row is not one tap from the card').not.toBeNull()
      onRow.set(row.getAttribute('data-dossier-row')!, rows(row))
    }, 50)
    expect([...onRow.keys()].sort(), 'not every repeat meeting carried its dossier row').toEqual([...ids].sort())
    for (const id of ids) expect(onRow.get(id), `${id}'s dossier row`).toEqual(own(id))
  }, 30_000)
})

describe('the intel cards (v1.2 R3)', () => {
  // Every word that would say what is coming: each event's name and short
  // name, each vector's label, and each technique's label and id.
  const FORBIDDEN = [
    ...DEFAULT_SCENARIO.events.flatMap((e) => [e.name, e.name.split(' (')[0]]),
    ...Object.values(vectorLabels),
    ...DEFAULT_SCENARIO.events.flatMap((e) => e.techniqueRefs.flatMap((r) => [techniqueLabel(r), r.id])),
  ]

  it('GUARD R3 (d): the banner card with no intel brief says the moves are unnamed and names nothing', () => {
    // The do-nothing line never orders the brief, so it has none except
    // where it is free: turn 1, and the turns an allied data share covers.
    // The card follows the free brief, as the banner does, and those turns
    // are skipped.
    let checked = 0
    for (const seed of [4041, 20260712, 1]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const current = state
        state = resolveTurn(state, LOSS_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
        if (briefFree(current)) continue
        act(() => {
          root.render(<IntelCard key={`${seed}-${current.turn}`} subject={{ kind: 'banner' }} state={current} turn={current.turn} onClose={() => {}} />)
        })
        const text = container.textContent ?? ''
        expect(text, `seed ${seed}, turn ${current.turn}`).toContain(FORECAST_DARK.headline)
        const leaks = FORBIDDEN.filter((word) => text.includes(word))
        expect(leaks, `seed ${seed}, turn ${current.turn}: the card with no brief names ${leaks.join(', ')}`).toEqual([])
        if (DEFAULT_SCENARIO.campaign.some((p) => p.turn === current.turn && p.slots.length > 0)) checked += 1
      }
    }
    // 13 of the 18 turns the three seeds play (each seed's turn 1 is free,
    // and seed 1 draws the data share that frees its turns 5 and 6).
    expect(checked, 'too few turns with events ahead to mean anything').toBeGreaterThan(10)
  })

  it('opens from the banner by a real button, and under the intel brief carries the named event REAL WORLD line', async () => {
    // A night the brief is free and a slot is fixed, so the brief names
    // that move, and the card carries that event's line and no other.
    const state = briefedWithLead()
    const fixed = DEFAULT_SCENARIO.campaign.find((p) => p.turn === state.turn)!.slots.find((s) => s.fixed)!.fixed
    const named = DEFAULT_SCENARIO.events.find((e) => e.id === fixed)!
    render(state)
    await openFullBrief()
    const opener = container.querySelector('button[aria-label="COLDVEIL intel"]') as HTMLButtonElement
    expect(opener).not.toBeNull()
    act(() => opener.focus())
    click(opener)
    await settle()
    const card = container.querySelector('section[data-intel-card="banner"]')
    expect(card, 'no banner card').not.toBeNull()
    const line = realWorldFor(named)!
    expect(card!.querySelector('[data-real-world-line]')?.textContent).toBe(`${line.technique} · ${line.source}`)
    // Escape closes it, and focus goes back to the button.
    act(() => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('section[data-intel-card]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('names no event under the intel brief when every slot this turn is a draw', async () => {
    // Turn 1's slots are all draws and its brief is free: the banner
    // reports the shape, and the card carries no event's REAL WORLD line.
    const state = gameAt(1)
    expect(DEFAULT_SCENARIO.campaign.find((p) => p.turn === 1)!.slots.every((s) => !s.fixed)).toBe(true)
    expect(briefFree(state), 'the fixture has no brief, so the dark card would pass for the wrong reason').toBe(true)
    render(state)
    await openFullBrief()
    click(container.querySelector('button[aria-label="COLDVEIL intel"]')!)
    await settle()
    const card = container.querySelector('section[data-intel-card="banner"]')
    expect(card).not.toBeNull()
    expect(card!.textContent).toContain('BRIEFED')
    expect(container.querySelector('section[data-intel-card] [data-real-world-line]')).toBeNull()
  })

  it('opens a tile card with what the asset is, its integrity and its layer conditions with sources', async () => {
    // The first turn of the prepared line with a condition pressing, and a
    // live asset on that condition's layer, so the list is not empty.
    let turn = 2
    while (gameAt(turn).conditions.length === 0) turn += 1
    const base = gameAt(turn)
    const def = DEFAULT_SCENARIO.events.find((e) => e.id === base.conditions[0].eventId)!
    const asset = base.assets.find((a) => def.layers.includes(a.layer) && a.integrity > 0)!
    const onLayer = base.conditions.filter((c) => DEFAULT_SCENARIO.events.find((e) => e.id === c.eventId)!.layers.includes(asset.layer))
    expect(onLayer.length, 'the fixture has no condition on the tapped layer').toBeGreaterThan(0)
    const open = async (state: GameState) => {
      render(state)
      click(container.querySelector(`button[data-asset-id="${asset.id}"]`)!)
      await settle()
      return container.querySelector('section[data-intel-card="tile"]')!
    }
    const card = await open(base)
    expect(card.textContent).toContain(assetRole(asset.kind))
    // Tiers left the game in v1.3 Round 0 (D2): the card has no TIER line.
    expect(card.textContent).not.toMatch(/\bTIER\b/)
    expect(card.textContent).toContain(`${asset.integrity}%`)
    for (const c of onLayer) {
      const item = card.querySelector(`li[data-intel-condition="${c.eventId}"]`)
      expect(item, `${c.name} is not on the card`).not.toBeNull()
      expect(item!.textContent).toContain(`T+${base.turn - c.startedTurn}`)
      expect(item!.querySelector('[data-real-world-line]'), `${c.name} has no source`).not.toBeNull()
    }
    // The turns left are exact and always shown since v1.3 (brief 6.5),
    // as on the chips: the same clock with the brief or without it, and
    // never an estimate.
    const clocks = (el: Element) => onLayer.map((c) => el.querySelector(`li[data-intel-condition="${c.eventId}"] p`)!.textContent!.replace(/\s+/g, ' ').trim())
    const exact = onLayer.map((c) => `${c.name} T+${base.turn - c.startedTurn} ${c.remainingTurns} left`)
    expect(briefFree(base), 'the fixture already has the brief').toBe(false)
    expect(clocks(card)).toEqual(exact)
    expect(card.textContent).not.toMatch(/~\d+ left/)
    const briefed = await open({ ...base, briefFreeThrough: base.turn })
    expect(clocks(briefed)).toEqual(exact)
    expect(briefed.textContent).not.toMatch(/~\d+ left/)
    // The game behind is inert while the card is open.
    expect(container.querySelector('main')!.hasAttribute('inert')).toBe(true)
  })

  // THE CARD AND THE TONIGHT CARD GIVE ONE ANSWER (v1.3 Round 0, re-pointed
  // in R2). Whether tonight's moves are named is the cart's brief while the
  // player decides (src/ui/Game.tsx briefedTonight for the intel card, the
  // TONIGHT card's own brief state for its full brief). Before the Round 0
  // fix the card read the free brief alone, so a brief ordered in the cart
  // left it saying NO BRIEF beside a banner that named the move. The
  // playback half of that fix (the banner going dark once EXECUTE was
  // pressed) has no surface since R2: the TONIGHT card, and the intel
  // button in its full brief, are off the board while the night plays.
  //
  // The fixture is the first turn of the prepared line, before the last,
  // whose brief is NOT free and which has a fixed slot, so the brief names
  // one event and the card carries that event's REAL WORLD line. Found from
  // the engine rather than pinned.
  function paidNightWithLead(): GameState {
    for (let turn = 2; turn < DEFAULT_SCENARIO.totalTurns; turn += 1) {
      const state = gameAt(turn)
      if (state.status === 'playing' && state.turn === turn && !briefFree(state) && forecastLead(state, true)) return state
    }
    throw new Error('no turn of the prepared line before the last has a paid brief and a fixed move')
  }
  // What the TONIGHT card's full brief says: its lines and its technique
  // tag, both read from briefCopy with the card's brief state.
  const tonightLines = () => [...container.querySelectorAll('[data-brief-scroll] li')].map((li) => li.textContent)
  const tonightTag = () => container.querySelector('[data-brief-scroll] [data-technique-tag]')?.getAttribute('data-technique-tag') ?? null
  const intelOrder = () => container.querySelector<HTMLButtonElement>('[data-sheet="procure"] button[data-procure-intel]')
  const toggleProcure = () => {
    const step = container.querySelector('nav[aria-label="Actions"] button[data-action="procure"]')
    expect(step, 'PROCURE is not on the dock').not.toBeNull()
    click(step!)
  }
  // Orders the brief in PROCURE's INTEL section, by its button as a player
  // does, and closes the sheet again. Since v1.5 R2 the order locks: the
  // row is a LOCKED status after it, with nothing to take it back out.
  function orderBrief() {
    toggleProcure()
    const order = intelOrder()
    expect(order, 'PROCURE has no INTEL order: the brief is free tonight, so ordering it proves nothing').not.toBeNull()
    expect(order!.textContent, 'the INTEL order does not price the brief').toContain(`${DEFAULT_SCENARIO.prices.intelBrief} CR`)
    click(order!)
    expect(intelOrder(), 'the ordered brief is still a control').toBeNull()
    expect(container.querySelector('[data-sheet="procure"] [data-procure-intel][data-locked]'), 'the ordered brief does not say it is locked').not.toBeNull()
    toggleProcure()
    expect(container.querySelector('[data-sheet="procure"]'), 'PROCURE did not close').toBeNull()
  }
  // Opens COLDVEIL's card by its button in the full brief, reads it, and
  // closes it on Escape (which does not end the night, as the test below
  // pins).
  async function readCard() {
    await openFullBrief()
    click(container.querySelector('button[aria-label="COLDVEIL intel"]')!)
    await settle()
    const card = container.querySelector('section[data-intel-card="banner"]')
    expect(card, 'no banner card').not.toBeNull()
    const read = {
      heading: card!.querySelector('#intel-title')?.textContent ?? '',
      headline: card!.querySelector('#intel-title + p')?.textContent ?? '',
      line: card!.querySelector('[data-real-world-line]')?.textContent ?? null,
    }
    act(() => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('section[data-intel-card]'), 'Escape did not close the card').toBeNull()
    return read
  }

  it('reads THREAT INTEL · BRIEFED and names what the TONIGHT card names once the brief is ordered in the cart, and NO BRIEF without it', async () => {
    const state = paidNightWithLead()
    const named = briefCopy(state, true)
    const dark = briefCopy(state, false)
    const lead = realWorldFor(forecastLead(state, true)!)!
    expect(named.headline, 'the briefed headline is the dark one, so the two readings cannot be told apart').not.toBe(FORECAST_DARK.headline)
    expect(named.full, 'the briefed lines are the dark ones, so the two readings cannot be told apart').not.toEqual(dark.full)
    expect(named.tag, 'the brief names no technique tonight').toBeDefined()
    render(state)
    // Not ordered: the TONIGHT card and the intel card are both dark.
    await openFullBrief()
    expect(tonightLines()).toEqual(dark.full)
    expect(tonightTag()).toBeNull()
    let card = await readCard()
    expect(card.heading, `turn ${state.turn}: the card claims a brief nobody ordered`).toBe('THREAT INTEL · NO BRIEF')
    expect(card.headline).toBe(FORECAST_DARK.headline)
    expect(card.line, 'the card with no brief carries an event line').toBeNull()
    // Ordered, before EXECUTE: the TONIGHT card names the move, and the
    // intel card names exactly what it names.
    orderBrief()
    expect(tonightLines(), 'the TONIGHT card ignored the brief ordered in the cart').toEqual(named.full)
    expect(tonightTag()).toBe(named.tag!)
    card = await readCard()
    expect(card.heading, `turn ${state.turn}: the card ignored the brief ordered in the cart`).toBe('THREAT INTEL · BRIEFED')
    expect(card.headline, 'the card does not name what the brief names').toBe(named.headline)
    expect(card.line, 'the card does not carry the named event REAL WORLD line').toBe(`${lead.technique} · ${lead.source}`)
    // Locked for the turn (v1.5 R2): the autosave carries the lock, so a
    // reload keeps the names too.
    const saved = JSON.parse(localStorage.getItem('dc-autosave') ?? 'null')
    expect(saved?.state.briefRevealed, 'the autosave does not carry the locked brief').toBe(state.turn)
  })

  it('leaves the night after a briefed one dark when it is played without the brief', async () => {
    const state = paidNightWithLead()
    render(state)
    orderBrief()
    await execute()
    expect(inNight(), 'the night did not start').toBe(true)
    // Tapped through to its END OF TURN, and BEGIN TURN n+1 (v1.3 R3: the
    // dock's NEXT TURN went with the director).
    let begin = ''
    await tapThrough(() => void (begin = q('button[data-begin]')?.textContent ?? begin), 100)
    expect(begin, 'the night did not end on BEGIN TURN').toBe(`BEGIN TURN ${state.turn + 1}`)
    expect(inNight(), 'the night never finished').toBe(false)

    // The next night, decided WITHOUT the brief, after a night played with
    // it: the cart decides, not any earlier night's record.
    expect(q('nav[aria-label="Actions"] button[data-execute]'), 'BEGIN TURN did not reach the board').not.toBeNull()
    const next = state.turn + 1
    await openFullBrief()
    // Ordering the brief would name something tonight (so dark is a real
    // reading), and the INTEL order prices it (so tonight is not free).
    // Read from the model, since an order would lock (v1.5 R2).
    const saved = JSON.parse(localStorage.getItem('dc-autosave') ?? 'null')
    const now = { ...saved.state, scenario: DEFAULT_SCENARIO } as GameState
    expect(now.turn).toBe(next)
    expect(briefFree(now), `turn ${next}: the brief is free, so dark proves nothing`).toBe(false)
    expect(tonightLines()).toEqual(briefCopy(now, false).full)
    expect(tonightLines(), `turn ${next}: the brief names nothing, so the dark reading proves nothing`).not.toEqual(briefCopy(now, true).full)
    const card = await readCard()
    expect(card.heading, 'the card named a night with no brief ordered').toBe('THREAT INTEL · NO BRIEF')
    expect(card.line).toBeNull()
  })

  it('closes on Escape during the night without ending the night', async () => {
    // The penultimate turn, as turn 11 of 12 was before the six-turn
    // campaign of v1.3 Round 0. COLDVEIL's card is off the board during the
    // night since v1.3 R2 (it opens from the TONIGHT card), so a tile's card
    // is the one a player can open here, and since R3 the strike is when
    // the strip is in reach: each card dims the board under it.
    render(gameAt(DEFAULT_SCENARIO.totalTurns - 1))
    await execute()
    await tapThrough(() => !!q('[data-strike-banner]'), 50)
    expect(q('[data-strike-banner]'), 'the night struck nothing').not.toBeNull()
    const tile = tiles()[0]
    click(tile)
    await settle()
    expect(q('section[data-intel-card]')).not.toBeNull()
    act(() => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(q('section[data-intel-card]')).toBeNull()
    expect(inNight(), 'Escape on the card ended the night').toBe(true)
    expect(q('nav[aria-label="Actions"]'), 'Escape on the card put the dock back mid-night').toBeNull()
  })
})

describe('GUARD R3 (e): under reduced motion nothing strobes, bursts, pops or floats', () => {
  const CSS = readFileSync(INDEX_CSS, 'utf8')
  const NIGHT = readFileSync(NIGHT_CSS, 'utf8')

  // Both stylesheets the night plays under, with the reduced-motion
  // conditions stated. The index sheet is returned on its own for the
  // keyframes the hit added there.
  function applyCss(reduced: boolean) {
    document.head.querySelectorAll('style[data-test-css]').forEach((s) => s.remove())
    const noPreference = '(prefers-reduced-motion: no-preference)'
    const reduce = '(prefers-reduced-motion: reduce)'
    const sheets = [CSS, NIGHT].map((text) => {
      const css = text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/@import[^;]*;/g, '')
        .replaceAll(noPreference, reduced ? 'not all' : 'all')
        .replaceAll(reduce, reduced ? 'all' : 'not all')
      expect(css.includes('prefers-reduced-motion'), 'a form of the reduced-motion query this test does not state').toBe(false)
      const style = document.createElement('style')
      style.setAttribute('data-test-css', '')
      style.textContent = css
      document.head.appendChild(style)
      return style.sheet!
    })
    return { index: sheets[0], all: sheets }
  }
  const keyframeNames = (sheets: CSSStyleSheet[]) =>
    new Set(sheets.flatMap((sheet) => [...sheet.cssRules].filter((r): r is CSSKeyframesRule => r instanceof CSSKeyframesRule).map((r) => r.name)))
  function running(board: Element, names: Set<string>): string[] {
    const out: string[] = []
    for (const el of [board, ...board.querySelectorAll('*')]) {
      const cs = getComputedStyle(el)
      let name = cs.getPropertyValue('animation-name').trim()
      if (!name || name === 'none') name = cs.getPropertyValue('animation').split(/[\s,]+/).find((t) => names.has(t)) ?? 'none'
      if (name !== 'none' && !cs.getPropertyValue('animation-play-state').includes('paused')) out.push(name)
    }
    return out
  }
  // The night of the prepared line's first turn where a hit takes a pip,
  // found from the engine's record (turn 11 of the twelve-turn campaign
  // was pinned before v1.3 Round 0 cut it to six), so the strobe, the
  // burst, the pip pop and the float all have something to do.
  const takesPip = (e: ResolvedEvent) => e.integrityBefore !== undefined && e.integrityAfter !== undefined && pipsFor(e.integrityAfter) < pipsFor(e.integrityBefore)
  const fixture = () => gameAt(firstTurnWhere((events) => events.some((e) => isThreat(e) && takesPip(e))))
  // The first moment the hit has landed, with its whole treatment on the
  // board: the strobe and the burst on the tile, the pip pop, the float on
  // the score.
  async function toTheHit() {
    setReducedMotion(false)
    render(fixture())
    await execute()
    let landed = false
    await tapThrough(() => (landed = !!(q('span[data-strobe]') && q('span[data-pip-pop]') && q('span[data-mai-drop]'))), 10)
    if (!landed) throw new Error('the hit never landed')
  }
  const HIT = ['dc-hit-strobe', 'dc-burst', 'dc-pip-pop', 'dc-mai-float']

  it('runs the strobe, the burst, the pop and the float with no preference (the positive control), on transform and opacity only', async () => {
    await toTheHit()
    const board = q('[data-board]')!
    const sheets = applyCss(false)
    const names = running(board, keyframeNames(sheets.all))
    for (const name of HIT) expect(names, `${name} is not running`).toContain(name)
    // Every keyframes rule the hit added to the index sheet, from the
    // stylesheet itself rather than from what happens to be running at
    // this moment. The shake, the beam and the stamp left with the
    // director in v1.3 R3; the lock-on, the strobe, the burst, the pip, the
    // float, the odometer and the shield flash remain.
    const frames = [...sheets.index.cssRules].filter((r): r is CSSKeyframesRule => r instanceof CSSKeyframesRule)
    const r3 = frames.filter((f) => /^dc-(hit|lock|burst|pip|mai|odo|shield)/.test(f.name))
    expect(r3.length, 'the R3 keyframes were not found').toBeGreaterThanOrEqual(7)
    const layout = r3
      .flatMap((f) => ([...f.cssRules] as CSSKeyframeRule[]).flatMap((k) => [...Array(k.style.length).keys()].map((i) => `${f.name}: ${k.style.item(i)}`)))
      .filter((t) => !/: (transform|opacity)$/.test(t))
    expect(layout).toEqual([])
  })

  it("turns the score green while a block's card is up under reduced motion, where no strike floats NO LOSS (v1.3 R7)", async () => {
    // R5's rule: a colour cue carries meaning, so it stays with motion off.
    setReducedMotion(true)
    const state = gameAt(firstTurnWhere((events) => events.some((e) => isThreat(e) && e.effectiveSeverity === 0) && events.some((e) => isThreat(e) && e.effectiveSeverity > 0)))
    render(state)
    await execute()
    let onBlock = 0
    let onHit = 0
    await tapThrough(() => {
      const result = q('[data-night-card="hit"] [data-result]')?.getAttribute('data-result')
      const green = !!q('[data-hud] [data-score-held].dc-score-held') && !!q('[data-hud] i[data-bar-held].bg-dc-go')
      if (result === 'blocked') {
        expect(green, "a block's card under reduced motion left the score its own colour").toBe(true)
        onBlock += 1
      } else if (result) {
        expect(q('[data-score-held]'), `the score was green on a ${result} card`).toBeNull()
        onHit += 1
      }
    }, 20)
    expect(onBlock, 'no block card was seen').toBeGreaterThan(0)
    expect(onHit, 'no hit card was seen').toBeGreaterThan(0)
  })

  it('skips the strike under reduced motion: the card arrives with the board changed and nothing running', async () => {
    // Brief 5.5: under reduced motion the overlay and the strike are
    // skipped and the cards arrive at once, so the strike's treatment is
    // never put on the board at all.
    setReducedMotion(true)
    const state = fixture()
    const hit = recordOf(state).find((e) => isThreat(e) && takesPip(e))!
    render(state)
    await execute()
    let seen = false
    await tapThrough(() => {
      for (const sel of ['[data-moving]', '[data-strike-banner]', 'span[data-strobe]', 'svg[data-sprite^="hit-burst"]', 'span[data-pip-pop]', 'span[data-mai-drop]']) {
        expect(q(sel), `${sel} is on screen under reduced motion`).toBeNull()
      }
      // The lock-on's brackets rest still on the card's tile (v1.3 R3
      // fresh-eyes review: under reduced motion nothing marked it), with
      // none of the strike's motion on them.
      for (const mark of container.querySelectorAll('svg[data-sprite="lock-on"]')) {
        expect(mark.closest('button')?.getAttribute('data-struck'), 'a lock-on under reduced motion that is not the still mark').toBe('rest')
        expect(mark.getAttribute('class') ?? '', 'the still mark animates').not.toMatch(/dc-lock-on/)
      }
      const card = q('section[data-night-card="hit"]')
      if (!card || q('[data-move-name]')?.textContent !== DEFAULT_SCENARIO.events.find((e) => e.id === hit.eventId)!.name.split(' (')[0]) return
      // The hit's card is up, and the tile under it already shows the hit.
      const tile = q(`button[data-asset-id="${hit.targetAssetId}"]`)!
      expect(tile.getAttribute('aria-label'), 'the tile did not change before its card').toContain(`integrity ${hit.integrityAfter}%`)
      expect(tile.getAttribute('data-struck'), 'the card\'s tile carries no still mark').toBe('rest')
      const names = running(q('[data-board]')!, keyframeNames(applyCss(true).all))
      expect(names, 'animations running on the board under reduced motion').toEqual([])
      seen = true
      return true
    }, 10)
    expect(seen, 'the hit card never arrived').toBe(true)
  })

  it('stops the treatment in the stylesheet too, should it ever be rendered under reduced motion', async () => {
    // The second line: the strike's elements, put on the board with motion
    // on, run nothing under the reduced-motion rules. The classes are
    // there; only the stylesheet can stop them, which is what this checks.
    await toTheHit()
    expect(q('span[data-strobe]')!.className).toMatch(/dc-hit-strobe/)
    const names = running(q('[data-board]')!, keyframeNames(applyCss(true).all))
    expect(names, 'animations running on the board under reduced motion').toEqual([])
  })
})
