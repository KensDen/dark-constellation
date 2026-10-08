// @vitest-environment jsdom
//
// Hits land on the board, and the game starts teaching (v1.2 R3, brief
// 4.5 and 4.8). The round's DOM guards:
//   (a) every hit a playback shows locks on and strobes on the tile of
//       the asset the engine named and actually hit, and on no other (the
//       engine half, that every asset-damaging event names its asset, is
//       in engine.spec.ts). Since v1.3 Round 0 the engine names the AIMED
//       tile even when a defense held, so a tile was hit only when its
//       integrity after is under its integrity before;
//   (c) the REAL WORLD line on an event card is the event's own technique
//       and source (the content half is in real-world.spec.ts);
//   (d) the banner's intel card with no intel brief names no event, vector
//       or technique (the intel levels left with v1.3 Round 0: the brief
//       is on or off);
//   (e) under reduced motion nothing shakes, strobes or floats.
// And the intel card behaves as a dialog: a real button opens it, focus
// comes back to that button, and Escape closes it without skipping the
// playback behind it.
//
// For (e), jsdom runs the real cascade over the real src/index.css but
// evaluates no media feature, so the two reduced-motion conditions are
// stated by rewriting them, as tests/sprites.dom.spec.tsx does and says
// why at length.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/ui/Constellation', () => ({ default: () => null }))

import Game from '../src/ui/Game'
import IntelCard from '../src/ui/board/IntelCard'
import { DEFAULT_SCENARIO } from '../src/content'
import { deriveBeats } from '../src/director'
import { briefFree, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { FORECAST_DARK, briefCopy, forecastLead } from '../src/ui/brief'
import { techniqueLabel, vectorLabels } from '../src/ui/labels'
import { realWorldFor } from '../src/ui/realWorldLine'
import { assetRole } from '../src/ui/board/ProcureSheet'
import { STRIKE_MS } from '../src/ui/board/strike'
import { FIRST_TURN_DONE_KEY } from '../src/ui/firstTurn'
import { installGestureUnlock, resetAudioEngineForTests } from '../src/audio'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const INDEX_CSS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css')

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

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', memoryStorage())
  localStorage.setItem(FIRST_TURN_DONE_KEY, '1')
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

// The first turn of the prepared line whose resolution, with the empty
// cart the tests commit, shows what `wanted` looks for, found from the
// engine's own beats rather than pinned. Pinning broke once already: the
// deck stream of v1.2 R5a moved which events every turn draws.
function firstTurnWhere(wanted: (beats: ReturnType<typeof deriveBeats>) => boolean): number {
  for (let turn = 1; turn <= DEFAULT_SCENARIO.totalTurns; turn += 1) {
    const state = gameAt(turn)
    if (state.status !== 'playing' || state.turn !== turn) break
    if (wanted(deriveBeats(state, resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))))) return turn
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
const step = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const settle = () =>
  act(async () => {
    await vi.dynamicImportSettled()
  })
const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}
// EXECUTE is a plain button since v1.3 Round 0 (the hold went with the
// dwell), and a synthetic Enter does not click a button in jsdom, so the
// tests click it.
const execute = () => {
  const button = container.querySelector('nav[aria-label="Actions"] button[data-execute]')
  expect(button, 'EXECUTE is not on screen').not.toBeNull()
  click(button!)
}
const tiles = () => [...container.querySelectorAll('button[data-asset-id]')]
const inTiles = (selector: string) => tiles().filter((t) => t.querySelector(selector)).map((t) => t.getAttribute('data-asset-id'))
const playingOut = () => !![...container.querySelectorAll('button')].find((b) => /^Skip/.test(b.textContent ?? ''))
// The playback as a player taps through it. Every beat waits for a tap
// since v1.3 Round 0; only a hit's strike plays on its own, so on each beat
// the clock runs a strike's length in steps of `every` ms, `look` reads the
// board at each, and then Next moves on. It stops as soon as `look` says it
// has what it came for.
function tapThrough(look: () => boolean | void, every: number) {
  for (let beat = 0; beat < 60 && playingOut(); beat += 1) {
    for (let t = 0; t <= STRIKE_MS; t += every) {
      if (look()) return
      step(every)
    }
    const next = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Next')
    expect(next, 'the playback has no Next').toBeDefined()
    click(next!)
  }
}

// The hits a turn's playback shows, in order, from the ENGINE's record of
// the turn, not from the director's beats: the board follows the beats, so
// a director that named the wrong asset would move the expectation with
// the board if the beats were the oracle. Since v1.3 Round 0 the engine's
// targetAssetId is the AIMED tile, set even when the hit was fully held,
// so a hit is an event whose target lost integrity.
function hitsOf(state: GameState): string[] {
  const after = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
  return after.history[after.history.length - 1].events
    .filter((e) => e.targetAssetId !== undefined && e.integrityBefore !== undefined && e.integrityAfter !== undefined && e.integrityAfter < e.integrityBefore)
    .map((e) => e.targetAssetId!)
}

describe('hits land on their tiles (v1.2 R3)', () => {
  it('GUARD R3 (a): the lock-on and the strobe land on the tile the engine named, and on no other', () => {
    // Two turns of the prepared line, played with an empty cart, found from
    // the engine rather than pinned (the deck stream of v1.2 R5a moved
    // them): one with two hits in one playback, and one with a hit beside a
    // held event, which must lock onto nothing even though the engine names
    // the tile it was aimed at (v1.3 Round 0).
    const hitsIn = (beats: ReturnType<typeof deriveBeats>) => beats.filter((b) => b.kind === 'threat' && b.targetAssetId).length
    const heldIn = (beats: ReturnType<typeof deriveBeats>) => beats.some((b) => b.kind === 'threat' && b.severity?.effective === 0)
    const turns = [firstTurnWhere((beats) => hitsIn(beats) >= 2), firstTurnWhere((beats) => hitsIn(beats) >= 1 && heldIn(beats))]
    let checked = 0
    for (const [i, turn] of turns.entries()) {
      const state = gameAt(turn)
      const expected = hitsOf(state)
      expect(expected.length, `turn ${turn} has no hit to check`).toBeGreaterThan(0)
      if (i === 1) {
        // The held event is aimed at a tile it never hit, so a lock-on that
        // followed the engine's aim rather than the hit would show here.
        const events = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn)).history.at(-1)!.events
        const aimedOnly = events.filter((e) => e.effectiveSeverity === 0 && e.targetAssetId !== undefined)
        expect(aimedOnly.length, `turn ${turn}: no held event is aimed at a tile, so the held half proves nothing`).toBeGreaterThan(0)
      }
      render(state)
      execute()
      const locked: string[] = []
      const struck: string[] = []
      tapThrough(() => {
        const lock = inTiles('svg[data-sprite="lock-on"]')
        const strobe = inTiles('span[data-strobe]')
        expect(lock.length, 'the lock-on is on more than one tile').toBeLessThanOrEqual(1)
        expect(strobe.length, 'the strobe is on more than one tile').toBeLessThanOrEqual(1)
        if (lock[0] && locked[locked.length - 1] !== lock[0]) locked.push(lock[0]!)
        if (strobe[0] && struck[struck.length - 1] !== strobe[0]) struck.push(strobe[0]!)
      }, 20)
      expect(playingOut(), 'the playback never finished').toBe(false)
      expect(locked, `turn ${turn}: the lock-on went to other tiles`).toEqual(expected)
      expect(struck, `turn ${turn}: the strobe went to other tiles`).toEqual(expected)
      checked += expected.length
    }
    expect(checked).toBeGreaterThanOrEqual(3)
  })

  it('flashes the shield and HELD on the headers of a held event, and nowhere else', () => {
    const isHeld = (b: ReturnType<typeof deriveBeats>[number]) => b.kind === 'threat' && b.severity?.effective === 0
    const state = gameAt(firstTurnWhere((beats) => beats.some(isHeld)))
    const after = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
    const held = deriveBeats(state, after).find(isHeld)
    expect(held, `turn ${state.turn} no longer holds an event`).toBeDefined()
    render(state)
    execute()
    let seen: string[] = []
    tapThrough(() => {
      seen = [...container.querySelectorAll('span[data-held]')].map((el) => el.closest('section')!.getAttribute('aria-labelledby')!.replace('layer-', ''))
      return seen.length > 0
    }, 20)
    expect(seen.sort()).toEqual([...(held!.layers ?? [])].sort())
  })
})

describe('a lost pip pops out of the row (v1.2 R3)', () => {
  it('pops the pips a hit takes, on the struck tile', () => {
    // Turn 4 of the prepared line since the six-turn campaign of v1.3
    // Round 0: the implant takes start-sat-1 from 100 to 64, four pips to
    // three, while the debris on the same night is held.
    const state = gameAt(4)
    expect(hitsOf(state)).toContain('start-sat-1')
    render(state)
    execute()
    let popped: string[] = []
    tapThrough(() => {
      popped = inTiles('span[data-pip-pop]') as string[]
      return popped.length > 0
    }, 10)
    expect(popped).toEqual(['start-sat-1'])
  })
})

describe('the REAL WORLD line on the event card (v1.2 R3)', () => {
  it('GUARD R3 (c): each card carries its own event technique and source, one tap from the card and its link', () => {
    // A turn with two different threat cards and a condition card among
    // them, so the checks below have all three to read.
    const state = gameAt(
      firstTurnWhere(
        (beats) =>
          new Set(beats.filter((b) => b.kind === 'threat').map((b) => b.subjectId)).size >= 2 &&
          beats.some((b) => b.kind === 'condition-applied'),
      ),
    )
    render(state)
    execute()
    const seen = new Map<string, string>()
    const titles = new Set<string>()
    const conditionCards: string[] = []
    // Read once as each card arrives and once after its strike: what the
    // card carries does not wait on the clock.
    tapThrough(() => {
      const card = container.querySelector('div[data-beat-card]')
      const line = card?.querySelector('[data-real-world-line]')
      const title = card?.querySelector('p.font-bold')?.textContent ?? ''
      // The event a card is about, by its full name (a threat card) or by
      // the condition it leaves (a condition card, "LEAKING for 2 turns"
      // since v1.3 Round 0), from the content rather than from the line.
      const applied = (e: (typeof DEFAULT_SCENARIO.events)[number]) => !!e.condition && title === `${e.condition.name} for ${e.condition.turns} turns`
      const def = DEFAULT_SCENARIO.events.find((e) => title.startsWith(e.name) || applied(e))
      if (line && def && !titles.has(title)) {
        titles.add(title)
        if (applied(def)) conditionCards.push(title)
        const own = realWorldFor(def)!
        expect(line.textContent, `${def.id}'s card`).toBe(`${techniqueLabel(def.techniqueRefs[0])} · ${own.source}`)
        expect(own.first.title.startsWith(own.source), `${def.id}: the short name is not its source's`).toBe(true)
        const links = [...card!.querySelectorAll('details[data-real-world] a')].map((a) => a.getAttribute('href'))
        expect(links, `${def.id}: the card does not link its source`).toContain(def.learnMoreCards[0].sources[0].url)
        expect(card!.querySelector('details[data-real-world] summary'), 'the line is not one tap from the card').not.toBeNull()
        seen.set(def.id, line.textContent!)
      }
    }, STRIKE_MS)
    // Two different events, so a line written for one cannot pass as both,
    // and a condition card among the cards checked.
    expect(seen.size, 'the turn showed fewer than two threat cards').toBeGreaterThanOrEqual(2)
    expect(new Set(seen.values()).size).toBe(seen.size)
    expect(conditionCards.length > 0, 'no condition card was checked').toBe(true)
  })
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
    const opener = container.querySelector('button[aria-label="Threat intel"]') as HTMLButtonElement
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
    click(container.querySelector('button[aria-label="Threat intel"]')!)
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

  // THE CARD AND THE BANNER GIVE ONE ANSWER (v1.3 Round 0). Whether
  // tonight's moves are named is the cart's brief while the player decides
  // and the record of the night during its playback (src/ui/Game.tsx
  // briefedTonight, passed to the banner and to the card). Before that fix
  // the card read the free brief alone, so a brief ordered in the cart left
  // it saying NO BRIEF beside a banner that named the move; and the banner
  // fell back to the free brief during playback, so a night the player
  // paid to name went dark the moment EXECUTE was pressed.
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
  const banner = () => container.querySelector('section[aria-label="Threat forecast"]')!
  // The whole headline, from the line the teletype keeps for screen
  // readers, so the reading does not wait on the typing.
  const bannerHeadline = () => banner().querySelector('span.sr-only')?.textContent ?? ''
  const bannerTag = () => banner().querySelector('[data-technique-tag]')?.getAttribute('data-technique-tag') ?? null
  const intelRow = () => container.querySelector('p[data-procure-intel]')
  const intelBox = () => intelRow()?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null
  const toggleProcure = () => {
    const step = container.querySelector('nav[aria-label="Actions"] button[data-action="procure"]')
    expect(step, 'PROCURE is not on the action bar').not.toBeNull()
    click(step!)
  }
  // Orders the brief in PROCURE's INTEL section (or takes it back out),
  // through its checkbox as a player does, and closes the sheet again.
  function setBrief(on: boolean) {
    toggleProcure()
    const box = intelBox()
    expect(box, 'PROCURE has no INTEL row').not.toBeNull()
    expect(box!.disabled, 'the brief is free tonight, so ordering it proves nothing').toBe(false)
    expect(intelRow()!.textContent, 'the INTEL row does not price the brief').toContain(`${DEFAULT_SCENARIO.prices.intelBrief} CR`)
    if (box!.checked !== on) act(() => box!.click())
    expect(box!.checked, `the brief could not be ${on ? 'ordered' : 'taken out of the cart'}`).toBe(on)
    toggleProcure()
    expect(container.querySelector('[data-sheet="procure"]'), 'PROCURE did not close').toBeNull()
  }
  // Opens the banner's card by its button, reads it, and closes it on
  // Escape (which does not skip a playback, as the test below pins).
  async function readCard() {
    click(container.querySelector('button[aria-label="Threat intel"]')!)
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
  const nextTurn = () => {
    const button = [...container.querySelectorAll('nav[aria-label="Actions"] button')].find((b) => b.querySelector('[data-label]')?.textContent === 'NEXT TURN')
    expect(button, 'no NEXT TURN after the playback').toBeDefined()
    click(button!)
  }

  it('reads THREAT INTEL · BRIEFED and names what the banner names once the brief is ordered in the cart, and NO BRIEF without it', async () => {
    const state = paidNightWithLead()
    const named = briefCopy(state, true)
    const lead = realWorldFor(forecastLead(state, true)!)!
    expect(named.headline, 'the briefed headline is the dark one, so the two readings cannot be told apart').not.toBe(FORECAST_DARK.headline)
    expect(named.tag, 'the brief names no technique tonight').toBeDefined()
    render(state)
    // Not ordered: the banner and the card are both dark.
    expect(bannerHeadline()).toBe(FORECAST_DARK.headline)
    let card = await readCard()
    expect(card.heading, `turn ${state.turn}: the card claims a brief nobody ordered`).toBe('THREAT INTEL · NO BRIEF')
    expect(card.headline).toBe(FORECAST_DARK.headline)
    expect(card.line, 'the card with no brief carries an event line').toBeNull()
    // Ordered in the cart, before EXECUTE: the banner names the move, and
    // the card names exactly what the banner names.
    setBrief(true)
    expect(bannerHeadline(), 'the banner ignored the brief ordered in the cart').toBe(named.headline)
    expect(bannerTag()).toBe(named.tag!)
    card = await readCard()
    expect(card.heading, `turn ${state.turn}: the card ignored the brief ordered in the cart`).toBe('THREAT INTEL · BRIEFED')
    expect(card.headline, 'the card does not name what the banner names').toBe(bannerHeadline())
    expect(card.line, 'the card does not carry the named event REAL WORLD line').toBe(`${lead.technique} · ${lead.source}`)
    // Taken back out of the cart: both dark again.
    setBrief(false)
    expect(bannerHeadline()).toBe(FORECAST_DARK.headline)
    card = await readCard()
    expect(card.heading, 'the card kept a brief taken out of the cart').toBe('THREAT INTEL · NO BRIEF')
    expect(card.line).toBeNull()
  })

  it('keeps a briefed night named through its playback, from the record, and a night played without the brief dark', async () => {
    const state = paidNightWithLead()
    const named = briefCopy(state, true)
    const lead = realWorldFor(forecastLead(state, true)!)!
    render(state)
    setBrief(true)
    execute()
    step(100)
    expect(playingOut(), 'the playback did not start').toBe(true)
    // The engine's turn has moved on (and its brief is not free), so only
    // the record of the night being played back can say it was briefed.
    let card = await readCard()
    expect(card.heading, `turn ${state.turn}: the card went dark during the playback of a briefed night`).toBe('THREAT INTEL · BRIEFED')
    expect(card.headline).toBe(named.headline)
    expect(card.line).toBe(`${lead.technique} · ${lead.source}`)
    let looks = 0
    tapThrough(() => {
      expect(bannerHeadline(), `turn ${state.turn}, look ${looks}: the banner went dark during the playback of a briefed night`).toBe(named.headline)
      looks += 1
    }, STRIKE_MS)
    expect(playingOut(), 'the playback never finished').toBe(false)
    expect(looks, 'the playback was too short to mean anything').toBeGreaterThan(4)

    // The next night, played WITHOUT the brief, after a night played with
    // it: the record of the night being shown decides, not any night's.
    nextTurn()
    expect(playingOut()).toBe(false)
    // Ordering the brief would name something tonight (so dark is a real
    // reading), and the INTEL row prices it (so tonight is not free).
    setBrief(true)
    const wouldName = bannerHeadline()
    expect(wouldName, 'the brief names nothing tonight, so the dark banner proves nothing').not.toBe(FORECAST_DARK.headline)
    setBrief(false)
    expect(bannerHeadline()).toBe(FORECAST_DARK.headline)
    execute()
    step(100)
    expect(playingOut(), 'the second playback did not start').toBe(true)
    card = await readCard()
    expect(card.heading, 'the card named a night played without the brief').toBe('THREAT INTEL · NO BRIEF')
    expect(card.line).toBeNull()
    let darkLooks = 0
    tapThrough(() => {
      expect(bannerHeadline(), `look ${darkLooks}: the banner named a night played without the brief`).toBe(FORECAST_DARK.headline)
      darkLooks += 1
    }, STRIKE_MS)
    expect(playingOut(), 'the second playback never finished').toBe(false)
    expect(darkLooks, 'the second playback was too short to mean anything').toBeGreaterThan(4)
  })

  it('closes on Escape during playback without skipping the playback', async () => {
    // The penultimate turn, as turn 11 of 12 was before the six-turn
    // campaign of v1.3 Round 0.
    render(gameAt(DEFAULT_SCENARIO.totalTurns - 1))
    execute()
    step(100)
    expect(playingOut()).toBe(true)
    click(container.querySelector('button[aria-label="Threat intel"]')!)
    await settle()
    expect(container.querySelector('section[data-intel-card]')).not.toBeNull()
    act(() => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('section[data-intel-card]')).toBeNull()
    expect(playingOut(), 'Escape on the card skipped the playback').toBe(true)
  })
})

describe('GUARD R3 (e): under reduced motion nothing shakes, strobes or floats', () => {
  const CSS = readFileSync(INDEX_CSS, 'utf8')

  function applyCss(reduced: boolean) {
    document.head.querySelectorAll('style[data-test-css]').forEach((s) => s.remove())
    const noPreference = '(prefers-reduced-motion: no-preference)'
    const reduce = '(prefers-reduced-motion: reduce)'
    const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@import[^;]*;/g, '')
      .replaceAll(noPreference, reduced ? 'not all' : 'all')
      .replaceAll(reduce, reduced ? 'all' : 'not all')
    expect(css.includes('prefers-reduced-motion'), 'a form of the reduced-motion query this test does not state').toBe(false)
    const style = document.createElement('style')
    style.setAttribute('data-test-css', '')
    style.textContent = css
    document.head.appendChild(style)
    return style.sheet!
  }
  const keyframeNames = (sheet: CSSStyleSheet) =>
    new Set([...sheet.cssRules].filter((r): r is CSSKeyframesRule => r instanceof CSSKeyframesRule).map((r) => r.name))
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
  // The first moment the hit has landed, with its whole treatment on the
  // board: the shake on the root, the strobe on the tile, the float on MAI.
  // The turn is the prepared line's first with a hit on a tile, found from
  // the engine's beats (turn 11 of the twelve-turn campaign was pinned
  // before v1.3 Round 0 cut it to six).
  function toTheHit(reduced: boolean) {
    setReducedMotion(reduced)
    render(gameAt(firstTurnWhere((beats) => beats.some((b) => b.kind === 'threat' && b.targetAssetId))))
    execute()
    let landed = false
    tapThrough(() => (landed = !!(container.querySelector('span[data-strobe]') && container.querySelector('span[data-mai-drop]'))), 10)
    if (!landed) throw new Error('the hit never landed')
  }
  const HIT = ['dc-hit-shake', 'dc-hit-strobe', 'dc-mai-float']

  it('runs the shake, the strobe and the float with no preference (the positive control), on transform and opacity only', () => {
    toTheHit(false)
    const board = container.querySelector('[data-board]')!
    expect(board.className, 'the shake class is not on the board').toMatch(/dc-hit-shake/)
    const sheet = applyCss(false)
    const names = running(board, keyframeNames(sheet))
    for (const name of HIT) expect(names, `${name} is not running`).toContain(name)
    // Every keyframes rule the round added, from the stylesheet itself
    // rather than from what happens to be running at this moment (the beam
    // is gone by now, and nothing here is held or pops).
    const frames = [...sheet.cssRules].filter((r): r is CSSKeyframesRule => r instanceof CSSKeyframesRule)
    const r3 = frames.filter((f) => /^dc-(hit|lock|beam|burst|pip|mai|odo|shield|stamp)/.test(f.name))
    expect(r3.length, 'the R3 keyframes were not found').toBeGreaterThanOrEqual(10)
    const layout = r3
      .flatMap((f) => ([...f.cssRules] as CSSKeyframeRule[]).flatMap((k) => [...Array(k.style.length).keys()].map((i) => `${f.name}: ${k.style.item(i)}`)))
      .filter((t) => !/: (transform|opacity)$/.test(t))
    expect(layout).toEqual([])
  })

  it('runs none of it under reduced motion', () => {
    toTheHit(true)
    const board = container.querySelector('[data-board]')!
    // The classes are there; only the stylesheet can stop them, which is
    // what this checks.
    expect(board.className).toMatch(/dc-hit-shake/)
    expect(container.querySelector('span[data-strobe]')!.className).toMatch(/dc-hit-strobe/)
    const names = running(board, keyframeNames(applyCss(true)))
    expect(names, 'animations running on the board under reduced motion').toEqual([])
  })
})
