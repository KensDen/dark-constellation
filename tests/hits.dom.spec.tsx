// @vitest-environment jsdom
//
// Hits land on the board, and the game starts teaching (v1.2 R3, brief
// 4.5 and 4.8). The round's DOM guards:
//   (a) every hit a playback shows locks on and strobes on the tile of
//       the asset the engine named, and on no other (the engine half, that
//       every asset-damaging event names its asset, is in engine.spec.ts);
//   (c) the REAL WORLD line on an event card is the event's own technique
//       and source (the content half is in real-world.spec.ts);
//   (d) the banner's intel card at intel 0 names no event, vector or
//       technique;
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
import { effectiveIntel, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { FORECAST_DARK } from '../src/ui/brief'
import { techniqueLabel, vectorLabels } from '../src/ui/labels'
import { realWorldFor } from '../src/ui/realWorldLine'
import { assetRole } from '../src/ui/board/ProcureSheet'
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
const resolveNow = () => {
  const hold = container.querySelector('nav[aria-label="Actions"] button.dc-hold') as HTMLButtonElement
  act(() => {
    hold.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}
const tiles = () => [...container.querySelectorAll('button[data-asset-id]')]
const inTiles = (selector: string) => tiles().filter((t) => t.querySelector(selector)).map((t) => t.getAttribute('data-asset-id'))
const playingOut = () => !![...container.querySelectorAll('button')].find((b) => /^Skip/.test(b.textContent ?? ''))

// The hits a turn's playback shows, in order, from the ENGINE's record of
// the turn, not from the director's beats: the board follows the beats, so
// a director that named the wrong asset would move the expectation with
// the board if the beats were the oracle.
function hitsOf(state: GameState): string[] {
  const after = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
  return after.history[after.history.length - 1].events.filter((e) => e.targetAssetId !== undefined).map((e) => e.targetAssetId!)
}

describe('hits land on their tiles (v1.2 R3)', () => {
  it('GUARD R3 (a): the lock-on and the strobe land on the tile the engine named, and on no other', () => {
    // Two turns of the prepared line, played with an empty cart: turn 6
    // brings two hits in one playback, turn 11 a hit beside a held event
    // and a new condition.
    let checked = 0
    for (const turn of [6, 11]) {
      const state = gameAt(turn)
      const expected = hitsOf(state)
      expect(expected.length, `turn ${turn} has no hit to check`).toBeGreaterThan(0)
      render(state)
      resolveNow()
      const locked: string[] = []
      const struck: string[] = []
      for (let i = 0; i < 1500 && playingOut(); i += 1) {
        const lock = inTiles('svg[data-sprite="lock-on"]')
        const strobe = inTiles('span[data-strobe]')
        expect(lock.length, 'the lock-on is on more than one tile').toBeLessThanOrEqual(1)
        expect(strobe.length, 'the strobe is on more than one tile').toBeLessThanOrEqual(1)
        if (lock[0] && locked[locked.length - 1] !== lock[0]) locked.push(lock[0]!)
        if (strobe[0] && struck[struck.length - 1] !== strobe[0]) struck.push(strobe[0]!)
        step(20)
      }
      expect(playingOut(), 'the playback never finished').toBe(false)
      expect(locked, `turn ${turn}: the lock-on went to other tiles`).toEqual(expected)
      expect(struck, `turn ${turn}: the strobe went to other tiles`).toEqual(expected)
      checked += expected.length
    }
    expect(checked).toBeGreaterThanOrEqual(3)
  })

  it('flashes the shield and HELD on the headers of a held event, and nowhere else', () => {
    const state = gameAt(11)
    const after = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
    const held = deriveBeats(state, after).find((b) => b.kind === 'threat' && b.severity?.effective === 0)
    expect(held, 'turn 11 no longer holds an event').toBeDefined()
    render(state)
    resolveNow()
    let seen: string[] = []
    for (let i = 0; i < 1500 && playingOut() && seen.length === 0; i += 1) {
      seen = [...container.querySelectorAll('span[data-held]')].map((el) => el.closest('section')!.getAttribute('aria-labelledby')!.replace('layer-', ''))
      step(20)
    }
    expect(seen.sort()).toEqual([...(held!.layers ?? [])].sort())
  })
})

describe('a lost pip pops out of the row (v1.2 R3)', () => {
  it('pops the pips a hit takes, on the struck tile', () => {
    // Turn 5 of the prepared line: the implant takes start-sat-1 from 100
    // to 64, four pips to three.
    const state = gameAt(5)
    expect(hitsOf(state)).toContain('start-sat-1')
    render(state)
    resolveNow()
    let popped: string[] = []
    for (let i = 0; i < 1500 && playingOut() && popped.length === 0; i += 1) {
      popped = inTiles('span[data-pip-pop]') as string[]
      step(10)
    }
    expect(popped).toEqual(['start-sat-1'])
  })
})

describe('the REAL WORLD line on the event card (v1.2 R3)', () => {
  it('GUARD R3 (c): each card carries its own event technique and source, one tap from the card and its link', () => {
    const state = gameAt(11)
    render(state)
    resolveNow()
    const seen = new Map<string, string>()
    const titles = new Set<string>()
    for (let i = 0; i < 1500 && playingOut(); i += 1) {
      const card = container.querySelector('div[data-beat-card]')
      const line = card?.querySelector('[data-real-world-line]')
      const title = card?.querySelector('p.font-bold')?.textContent ?? ''
      // The event a card is about, by its full name (a threat card) or its
      // short name (a condition card, "PNT jamming: now an active
      // condition"), from the content rather than from the line.
      const def = DEFAULT_SCENARIO.events.find((e) => title.startsWith(e.name) || title.startsWith(`${e.name.split(' (')[0]}:`))
      if (line && def && !titles.has(title)) {
        titles.add(title)
        const own = realWorldFor(def)!
        expect(line.textContent, `${def.id}'s card`).toBe(`${techniqueLabel(def.techniqueRefs[0])} · ${own.source}`)
        expect(own.first.title.startsWith(own.source), `${def.id}: the short name is not its source's`).toBe(true)
        const links = [...card!.querySelectorAll('details[data-real-world] a')].map((a) => a.getAttribute('href'))
        expect(links, `${def.id}: the card does not link its source`).toContain(def.learnMoreCards[0].sources[0].url)
        expect(card!.querySelector('details[data-real-world] summary'), 'the line is not one tap from the card').not.toBeNull()
        seen.set(def.id, line.textContent!)
      }
      step(20)
    }
    // Two different events, so a line written for one cannot pass as both,
    // and a condition card among the cards checked.
    expect(seen.size, 'the turn showed fewer than two threat cards').toBeGreaterThanOrEqual(2)
    expect(new Set(seen.values()).size).toBe(seen.size)
    expect([...titles].some((t) => t.includes('active condition')), 'no condition card was checked').toBe(true)
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

  it('GUARD R3 (d): the banner card at intel 0 says the forecast is dark and names nothing', () => {
    // The do-nothing line never buys intel, so it sits at intel 0 except
    // where an opportunity lends a turn of boost; the card follows the
    // effective level, as the banner does, and those turns are skipped.
    let checked = 0
    for (const seed of [4041, 20260712, 1]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const current = state
        state = resolveTurn(state, LOSS_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
        if (effectiveIntel(current) > 0) continue
        act(() => {
          root.render(<IntelCard key={`${seed}-${current.turn}`} subject={{ kind: 'banner' }} state={current} onClose={() => {}} />)
        })
        const text = container.textContent ?? ''
        expect(text, `seed ${seed}, turn ${current.turn}`).toContain(FORECAST_DARK.headline)
        const leaks = FORBIDDEN.filter((word) => text.includes(word))
        expect(leaks, `seed ${seed}, turn ${current.turn}: the intel 0 card names ${leaks.join(', ')}`).toEqual([])
        if (DEFAULT_SCENARIO.campaign.some((p) => p.turn === current.turn && p.slots.length > 0)) checked += 1
      }
    }
    expect(checked, 'too few turns with events ahead to mean anything').toBeGreaterThan(10)
  })

  it('opens from the banner by a real button, and at top intel carries the named event REAL WORLD line', async () => {
    // Turn 3's only slot is fixed, so top intel names it, and the card
    // carries that event's line and no other.
    const state = { ...gameAt(3), intelLevel: 3 }
    const named = DEFAULT_SCENARIO.events.find((e) => e.id === DEFAULT_SCENARIO.campaign.find((p) => p.turn === 3)!.slots[0].fixed)!
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

  it('names no event at top intel when every slot this turn is a draw', async () => {
    // Turn 9's slots are all draws: the banner reports the shape, and the
    // card carries no event's REAL WORLD line.
    expect(DEFAULT_SCENARIO.campaign.find((p) => p.turn === 9)!.slots.every((s) => !s.fixed)).toBe(true)
    render({ ...gameAt(9), intelLevel: 3 })
    click(container.querySelector('button[aria-label="Threat intel"]')!)
    await settle()
    expect(container.querySelector('section[data-intel-card="banner"]')).not.toBeNull()
    expect(container.querySelector('section[data-intel-card] [data-real-world-line]')).toBeNull()
  })

  it('opens a tile card with what the asset is, its tier, integrity and its layer conditions with sources', async () => {
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
    expect(card.textContent).toContain(`TIER ${asset.tier}`)
    expect(card.textContent).toContain(`${asset.integrity}%`)
    for (const c of onLayer) {
      const item = card.querySelector(`li[data-intel-condition="${c.eventId}"]`)
      expect(item, `${c.name} is not on the card`).not.toBeNull()
      expect(item!.textContent).toContain(`T+${base.turn - c.startedTurn}`)
      expect(item!.querySelector('[data-real-world-line]'), `${c.name} has no source`).not.toBeNull()
    }
    // The span left shows only at top intel, as on the chips.
    expect(effectiveIntel(base), 'the fixture is already at top intel').toBeLessThan(3)
    expect(card.textContent).not.toMatch(/~\d+ left/)
    const top = await open({ ...base, intelLevel: 3 })
    expect(top.textContent).toMatch(/~\d+ left/)
    // The game behind is inert while the card is open.
    expect(container.querySelector('main')!.hasAttribute('inert')).toBe(true)
  })

  it('closes on Escape during playback without skipping the playback', async () => {
    render(gameAt(11))
    resolveNow()
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
  function toTheHit(reduced: boolean) {
    setReducedMotion(reduced)
    render(gameAt(11))
    resolveNow()
    for (let i = 0; i < 1500; i += 1) {
      if (container.querySelector('span[data-strobe]') && container.querySelector('span[data-mai-drop]')) return
      step(10)
    }
    throw new Error('the hit never landed')
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
